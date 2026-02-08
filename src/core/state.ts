/**
 * 全局状态管理模块（单例模式）
 *
 * 封装插件的配置持久化和运行时状态
 */

import fs from 'fs';
import path from 'path';
import type { NapCatPluginContext, PluginLogger } from 'napcat-types/napcat-onebot/network/plugin/types';
import { DEFAULT_CONFIG } from '../config';
import type { PluginConfig, SchedulerData, SubscriptionData, PushHistoryData } from '../types';

// ==================== 配置清洗工具 ====================

function isObject(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** 配置清洗函数 */
function sanitizeConfig(raw: unknown): PluginConfig {
    if (!isObject(raw)) return { ...DEFAULT_CONFIG };

    const out: PluginConfig = { ...DEFAULT_CONFIG };

    if (typeof raw.enabled === 'boolean') out.enabled = raw.enabled;
    if (typeof raw.debug === 'boolean') out.debug = raw.debug;
    if (typeof raw.proxyType === 'string') out.proxyType = raw.proxyType;
    if (typeof raw.proxyHost === 'string') out.proxyHost = raw.proxyHost;
    if (typeof raw.proxyPort === 'number') out.proxyPort = raw.proxyPort;
    if (typeof raw.proxyUsername === 'string') out.proxyUsername = raw.proxyUsername;
    if (typeof raw.proxyPassword === 'string') out.proxyPassword = raw.proxyPassword;

    return out;
}

// ==================== 插件全局状态类 ====================

class PluginState {
    private _ctx: NapCatPluginContext | null = null;
    config: PluginConfig = { ...DEFAULT_CONFIG };
    startTime: number = 0;

    /** 机器人自身 QQ 号 */
    selfId: string = '';

    /** 活跃的定时器 Map: jobId -> NodeJS.Timeout */
    timers: Map<string, ReturnType<typeof setInterval>> = new Map();

    /** 运行时统计数据 */
    stats: { processed: number; todayProcessed: number; lastUpdateDay: string } = {
        processed: 0,
        todayProcessed: 0,
        lastUpdateDay: '',
    };

    /** 递增处理计数 */
    incrementProcessed(): void {
        const today = new Date().toISOString().slice(0, 10);
        if (this.stats.lastUpdateDay !== today) {
            this.stats.todayProcessed = 0;
            this.stats.lastUpdateDay = today;
        }
        this.stats.processed++;
        this.stats.todayProcessed++;
    }

    /** 获取上下文 */
    get ctx(): NapCatPluginContext {
        if (!this._ctx) throw new Error('PluginState 尚未初始化，请先调用 init()');
        return this._ctx;
    }

    /** 获取日志器 */
    get logger(): PluginLogger {
        return this.ctx.logger;
    }

    // ==================== 生命周期 ====================

    init(ctx: NapCatPluginContext): void {
        this._ctx = ctx;
        this.startTime = Date.now();
        this.loadConfig();
        // 确保数据目录存在
        this.ensureDataDir();
        // 异步获取机器人 QQ 号
        this.fetchSelfId();
    }

    /** 获取机器人自身 QQ 号 */
    private async fetchSelfId(): Promise<void> {
        try {
            const res = await this.ctx.actions.call(
                'get_login_info', void 0, this.ctx.adapterName, this.ctx.pluginManager.config
            ) as { user_id?: number | string };
            if (res?.user_id) {
                this.selfId = String(res.user_id);
                this.logger.debug("(｡·ω·｡) 机器人 QQ: " + this.selfId);
            }
        } catch (e) {
            this.logger.warn("(；′⌒`) 获取机器人 QQ 号失败:", e);
        }
    }

    cleanup(): void {
        // 清理所有定时器
        for (const [jobId, timer] of this.timers) {
            clearInterval(timer);
            this.logger.debug(`(｡-ω-) 清理定时器: ${jobId}`);
        }
        this.timers.clear();
        this.saveConfig();
        this._ctx = null;
    }

    // ==================== 数据目录 ====================

    private ensureDataDir(): void {
        const dataPath = this.ctx.dataPath;
        if (!fs.existsSync(dataPath)) {
            fs.mkdirSync(dataPath, { recursive: true });
        }
    }

    private getDataFilePath(filename: string): string {
        return path.join(this.ctx.dataPath, filename);
    }

    // ==================== 配置管理 ====================

    loadConfig(): void {
        const configPath = this.ctx.configPath;
        try {
            if (configPath && fs.existsSync(configPath)) {
                const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                this.config = sanitizeConfig(raw);
                this.ctx.logger.debug('(｡·ω·｡) 已加载本地配置');
            } else {
                this.config = { ...DEFAULT_CONFIG };
                this.saveConfig();
                this.ctx.logger.debug('(｡·ω·｡) 配置文件不存在，已创建默认配置');
            }
        } catch (error) {
            this.ctx.logger.error('(╥﹏╥) 加载配置失败，使用默认配置:', error);
            this.config = { ...DEFAULT_CONFIG };
        }
    }

    saveConfig(): void {
        if (!this._ctx) return;
        const configPath = this._ctx.configPath;
        try {
            const configDir = path.dirname(configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), 'utf-8');
        } catch (error) {
            this._ctx.logger.error('(╥﹏╥) 保存配置失败:', error);
        }
    }

    updateConfig(partial: Partial<PluginConfig>): void {
        this.config = { ...this.config, ...partial };
        this.saveConfig();
    }

    replaceConfig(config: PluginConfig): void {
        this.config = sanitizeConfig(config);
        this.saveConfig();
    }

    // ==================== 订阅数据管理 ====================

    /** 读取订阅数据 */
    loadSubscriptions(): SubscriptionData {
        const filePath = this.getDataFilePath('subscriptions.json');
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch (e) {
            this.logger.warn('(；′⌒`) 读取订阅数据失败:', e);
        }
        return { 群聊: [], 私聊: [] };
    }

    /** 保存订阅数据 */
    saveSubscriptions(data: SubscriptionData): void {
        const filePath = this.getDataFilePath('subscriptions.json');
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        } catch (e) {
            this.logger.error('(╥﹏╥) 保存订阅数据失败:', e);
        }
    }

    // ==================== 定时任务配置管理 ====================

    /** 读取定时任务配置 */
    loadSchedulerData(): SchedulerData {
        const filePath = this.getDataFilePath('scheduler.json');
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch (e) {
            this.logger.warn('(；′⌒`) 读取定时任务配置失败:', e);
        }
        return {};
    }

    /** 保存定时任务配置 */
    saveSchedulerData(data: SchedulerData): void {
        const filePath = this.getDataFilePath('scheduler.json');
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        } catch (e) {
            this.logger.error('(╥﹏╥) 保存定时任务配置失败:', e);
        }
    }

    // ==================== 推送历史管理 ====================

    /** 读取推送历史 */
    loadPushHistory(): PushHistoryData {
        const filePath = this.getDataFilePath('push_history.json');
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            }
        } catch (e) {
            this.logger.warn('(；′⌒`) 读取推送历史失败:', e);
        }
        return {};
    }

    /** 保存推送历史 */
    savePushHistory(data: PushHistoryData): void {
        const filePath = this.getDataFilePath('push_history.json');
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        } catch (e) {
            this.logger.error('(╥﹏╥) 保存推送历史失败:', e);
        }
    }

    // ==================== 代理 ====================

    /** 获取代理 URL（用于 fetch） */
    getProxyUrl(): string | undefined {
        const { proxyType, proxyHost, proxyPort, proxyUsername, proxyPassword } = this.config;
        if (!proxyType || !proxyHost) return undefined;

        const scheme = proxyType.toLowerCase();
        if (scheme !== 'http' && scheme !== 'socks5') {
            this.logger.warn('(;\u2032\u2312\u0060) 无效的代理类型: ' + proxyType);
            return undefined;
        }

        const hostPort = proxyHost + ':' + proxyPort;
        if (proxyUsername && proxyPassword) {
            return scheme + '://' + proxyUsername + ':' + proxyPassword + '@' + hostPort;
        }
        return scheme + '://' + hostPort;
    }

    // ==================== 工具方法 ====================

    getUptime(): number {
        return Date.now() - this.startTime;
    }

    getUptimeFormatted(): string {
        const ms = this.getUptime();
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const d = Math.floor(h / 24);

        if (d > 0) return `${d}天${h % 24}小时`;
        if (h > 0) return `${h}小时${m % 60}分钟`;
        if (m > 0) return `${m}分钟${s % 60}秒`;
        return `${s}秒`;
    }
}

/** 导出全局单例 */
export const pluginState = new PluginState();

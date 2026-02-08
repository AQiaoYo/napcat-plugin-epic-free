/**
 * API 服务模块
 * 注册 WebUI API 路由
 */

import type {
    NapCatPluginContext,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import { subscribeHelper } from './subscription';

/**
 * 注册 API 路由
 */
export function registerApiRoutes(ctx: NapCatPluginContext): void {
    const router = ctx.router;

    // ==================== 插件状态 ====================

    router.getNoAuth('/status', (_req, res) => {
        res.json({
            code: 0,
            data: {
                pluginName: ctx.pluginName,
                uptime: pluginState.getUptime(),
                uptimeFormatted: pluginState.getUptimeFormatted(),
                config: pluginState.config,
                activeTimers: pluginState.timers.size,
            },
        });
    });

    // ==================== 配置管理 ====================

    router.getNoAuth('/config', (_req, res) => {
        res.json({ code: 0, data: pluginState.config });
    });

    router.postNoAuth('/config', async (req, res) => {
        try {
            const body = req.body as Record<string, unknown> | undefined;
            if (!body) {
                return res.status(400).json({ code: -1, message: '请求体为空' });
            }
            pluginState.updateConfig(body as Partial<import('../types').PluginConfig>);
            ctx.logger.info('(｡·ω·｡) 配置已保存');
            res.json({ code: 0, message: 'ok' });
        } catch (err) {
            ctx.logger.error('(╥﹏╥) 保存配置失败:', err);
            res.status(500).json({ code: -1, message: String(err) });
        }
    });

    // ==================== 订阅管理 ====================

    /** 获取订阅列表 */
    router.getNoAuth('/subscriptions', (_req, res) => {
        try {
            const subs = subscribeHelper('读取');
            const schedulerData = pluginState.loadSchedulerData();
            res.json({ code: 0, data: { subscriptions: subs, scheduler: schedulerData } });
        } catch (e) {
            ctx.logger.error('(╥﹏╥) 获取订阅列表失败:', e);
            res.status(500).json({ code: -1, message: String(e) });
        }
    });

    ctx.logger.debug('(｡·ω·｡) API 路由注册完成');
}

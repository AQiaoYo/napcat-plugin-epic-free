/**
 * NapCat Epic 喜加一插件 - 主入口
 *
 * 提供 Epic Games Store 每周免费游戏查询与定时推送功能。
 *
 * 指令：
 *   喜加一 / epic喜加一  → 手动查询免费游戏
 *   epic订阅 HH:MM      → 开启每日定时推送
 *   epic取消订阅         → 取消推送
 *   epic订阅状态         → 查看订阅状态
 */

import type {
    PluginModule,
    PluginConfigSchema,
    NapCatPluginContext,
} from 'napcat-types/napcat-onebot/network/plugin/types';
import { EventType } from 'napcat-types/napcat-onebot/event/index';

import { buildConfigSchema } from './config';
import { pluginState } from './core/state';
import { handleMessage } from './handlers/message-handler';
import { registerApiRoutes } from './services/api-service';
import { loadAllScheduledJobs } from './services/scheduler';
import type { PluginConfig } from './types';

// ==================== 配置 UI Schema ====================

export let plugin_config_ui: PluginConfigSchema = [];

// ==================== 生命周期函数 ====================

/** 插件初始化 */
export const plugin_init: PluginModule['plugin_init'] = async (ctx) => {
    try {
        // 1. 初始化全局状态（加载配置）
        pluginState.init(ctx);

        ctx.logger.info('(｡·ω·｡) 插件初始化中...');

        // 2. 生成配置 Schema
        plugin_config_ui = buildConfigSchema(ctx);

        // 3. 注册 WebUI 页面和静态资源
        registerWebUI(ctx);

        // 4. 注册 API 路由
        registerApiRoutes(ctx);

        // 5. 加载定时推送任务
        loadAllScheduledJobs();

        ctx.logger.info('(* ^ ω ^) 插件初始化完成');
    } catch (error) {
        ctx.logger.error('(╥﹏╥) 插件初始化失败:', error);
    }
};

/** 消息/事件处理 */
export const plugin_onmessage: PluginModule['plugin_onmessage'] = async (ctx, event) => {
    if (event.post_type !== EventType.MESSAGE) return;
    if (!pluginState.config.enabled) return;
    await handleMessage(ctx, event);
};

/** 事件处理 */
export const plugin_onevent: PluginModule['plugin_onevent'] = async (_ctx, _event) => {
    // 暂无需要处理的非消息事件
};

/** 插件卸载/重载 */
export const plugin_cleanup: PluginModule['plugin_cleanup'] = async (ctx) => {
    try {
        pluginState.cleanup();
        ctx.logger.info('(｡-ω-) 插件已卸载');
    } catch (e) {
        ctx.logger.warn('(；′⌒`) 插件卸载时出错:', e);
    }
};

// ==================== 配置管理钩子 ====================

export const plugin_get_config: PluginModule['plugin_get_config'] = async (_ctx) => {
    return pluginState.config;
};

export const plugin_set_config: PluginModule['plugin_set_config'] = async (ctx, config) => {
    pluginState.replaceConfig(config as PluginConfig);
    ctx.logger.info('(｡·ω·｡) 配置已通过 WebUI 更新');
};

export const plugin_on_config_change: PluginModule['plugin_on_config_change'] = async (
    ctx, _ui, key, value, _currentConfig
) => {
    try {
        pluginState.updateConfig({ [key]: value });
        ctx.logger.debug(`(｡·ω·｡) 配置项 ${key} 已更新`);
    } catch (err) {
        ctx.logger.error(`(╥﹏╥) 更新配置项 ${key} 失败:`, err);
    }
};

// ==================== 内部函数 ====================

function registerWebUI(ctx: NapCatPluginContext): void {
    const router = ctx.router;

    router.static('/static', 'webui');

    router.page({
        path: 'dashboard',
        title: 'Epic 喜加一',
        htmlFile: 'webui/index.html',
        description: 'Epic 喜加一管理控制台',
    });

    ctx.logger.debug('(｡·ω·｡) WebUI 路由注册完成');
}


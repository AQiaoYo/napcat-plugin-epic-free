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
                stats: {
                    processed: pluginState.stats.processed,
                    todayProcessed: pluginState.stats.todayProcessed,
                    lastUpdateDay: pluginState.stats.lastUpdateDay,
                },
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

    // ==================== 群管理 ====================

    /** 获取群列表（合并订阅状态） */
    router.getNoAuth('/groups', async (_req, res) => {
        try {
            const result = await ctx.actions.call(
                'get_group_list',
                {},
                ctx.adapterName,
                ctx.pluginManager.config,
            ) as Array<{ group_id: number; group_name: string; member_count: number; max_member_count: number }>;

            const subs = pluginState.loadSubscriptions();
            const subscribedGroups = new Set(subs['群聊']);

            const groups = (result || []).map((g) => ({
                group_id: g.group_id,
                group_name: g.group_name,
                member_count: g.member_count,
                max_member_count: g.max_member_count,
                enabled: subscribedGroups.has(String(g.group_id)),
            }));

            res.json({ code: 0, data: groups });
        } catch (e) {
            ctx.logger.error('(╥﹏╥) 获取群列表失败:', e);
            res.status(500).json({ code: -1, message: String(e) });
        }
    });

    /** 单群启用/禁用订阅 */
    router.postNoAuth('/groups/:groupId/config', async (req, res) => {
        try {
            const groupId = req.params.groupId;
            const body = req.body as { enabled?: boolean } | undefined;
            if (!body || typeof body.enabled !== 'boolean') {
                return res.status(400).json({ code: -1, message: '参数错误' });
            }
            if (body.enabled) {
                subscribeHelper('启用', '群聊', groupId);
            } else {
                subscribeHelper('删除', '群聊', groupId);
            }
            res.json({ code: 0, message: 'ok' });
        } catch (e) {
            ctx.logger.error('(╥﹏╥) 群配置更新失败:', e);
            res.status(500).json({ code: -1, message: String(e) });
        }
    });

    /** 批量启用/禁用订阅 */
    router.postNoAuth('/groups/bulk-config', async (req, res) => {
        try {
            const body = req.body as { enabled?: boolean; groupIds?: number[] } | undefined;
            if (!body || typeof body.enabled !== 'boolean' || !Array.isArray(body.groupIds)) {
                return res.status(400).json({ code: -1, message: '参数错误' });
            }
            for (const gid of body.groupIds) {
                if (body.enabled) {
                    subscribeHelper('启用', '群聊', String(gid));
                } else {
                    subscribeHelper('删除', '群聊', String(gid));
                }
            }
            res.json({ code: 0, message: 'ok' });
        } catch (e) {
            ctx.logger.error('(╥﹏╥) 批量群配置更新失败:', e);
            res.status(500).json({ code: -1, message: String(e) });
        }
    });

    ctx.logger.debug('(｡·ω·｡) API 路由注册完成');
}

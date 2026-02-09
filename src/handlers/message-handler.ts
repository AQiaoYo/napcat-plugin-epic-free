/**
 * 消息处理器
 *
 * 处理 Epic 喜加一相关命令：
 * - 喜加一 / epic喜加一  → 查询当前免费游戏
 * - epic订阅 HH:MM      → 开启每日定时推送
 * - epic取消订阅         → 取消推送
 * - epic订阅状态         → 查看订阅状态
 */

import type { OB11Message, OB11PostSendMsg } from 'napcat-types/napcat-onebot';
import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import { pluginState } from '../core/state';
import { getJobId, getSubInfo, subscribeHelper } from '../services/subscription';
import { addScheduledJob, removeScheduledJob, schedulerManage, sendEpicFreeToTarget } from '../services/scheduler';
import type { SubscriptionData } from '../types';

// ==================== 消息发送工具 ====================

/** 发送回复（自动判断群/私聊） */
async function sendReply(
    ctx: NapCatPluginContext,
    event: OB11Message,
    message: string,
): Promise<void> {
    try {
        const params: OB11PostSendMsg = {
            message,
            message_type: event.message_type,
            ...(event.message_type === 'group' && event.group_id
                ? { group_id: String(event.group_id) }
                : {}),
            ...(event.message_type === 'private' && event.user_id
                ? { user_id: String(event.user_id) }
                : {}),
        };
        await ctx.actions.call('send_msg', params, ctx.adapterName, ctx.pluginManager.config);
    } catch (error) {
        pluginState.logger.error('(╥﹏╥) 发送消息失败:', error);
    }
}

// ==================== 权限检查 ====================

/** 检查群聊中是否有管理员权限 */
function isAdmin(event: OB11Message): boolean {
    if (event.message_type !== 'group') return true; // 私聊不需要检查权限
    const role = (event.sender as Record<string, unknown>)?.role;
    return role === 'admin' || role === 'owner';
}

// ==================== 消息处理主函数 ====================

export async function handleMessage(ctx: NapCatPluginContext, event: OB11Message): Promise<void> {
    try {
        const rawMessage = (event.raw_message || '').trim();
        const messageType = event.message_type;
        const groupId = event.group_id as number | undefined;
        const userId = event.user_id as number | undefined;

        // 群聊消息：检查该群是否已启用（在订阅列表中）
        // 未启用的群仅允许 epic订阅 命令（用于首次开启）
        if (messageType === 'group' && groupId) {
            const subs = subscribeHelper('读取') as SubscriptionData;
            const isGroupEnabled = subs['群聊']?.includes(String(groupId));
            if (!isGroupEnabled) {
                // 未启用的群只放行订阅命令，其他一律忽略
                if (!/^epic订阅\s/.test(rawMessage)) {
                    return;
                }
            }
        }


        // (epic)喜加一 / 喜+1 等
        if (/^(epic)?喜(\+|＋|加)(一|1)$/.test(rawMessage)) {
            pluginState.logger.info(`(｡·ω·｡) 收到喜加一查询请求 | 类型: ${messageType}`);

            const subInfo = getSubInfo(messageType, groupId, userId);
            try {
                await sendEpicFreeToTarget(subInfo);
            } catch (e) {
                pluginState.logger.error('(╥﹏╥) 查询 Epic 免费游戏失败:', e);
                await sendReply(ctx, event, 'Epic 免费游戏查询失败了..请稍后再试 (；′⌒`)');
            }
            return;
        }

        // epic订阅 HH:MM
        if (/^epic订阅\s/.test(rawMessage)) {
            if (!isAdmin(event)) {
                await sendReply(ctx, event, '只有群管理员才能操作订阅哦~');
                return;
            }

            const timeStr = rawMessage.replace(/^epic订阅\s*/, '').trim();
            if (!timeStr) {
                await sendReply(ctx, event, '请提供订阅时间，格式为 HH:MM，例如 epic订阅 8:30');
                return;
            }

            const timeParts = timeStr.split(':');
            if (timeParts.length !== 2) {
                await sendReply(ctx, event, '时间格式不正确~ 请使用 HH:MM 格式，例如 epic订阅 8:30');
                return;
            }

            const hour = parseInt(timeParts[0], 10);
            const minute = parseInt(timeParts[1], 10);

            if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
                await sendReply(ctx, event, '时间格式不正确~ 请使用 HH:MM 格式，例如 epic订阅 8:30');
                return;
            }

            const subInfo = getSubInfo(messageType, groupId, userId);
            const jobId = getJobId(messageType, groupId, userId);

            // 1. 更新订阅者列表
            subscribeHelper('启用', subInfo.sub_type, subInfo.subject);
            // 2. 添加定时任务
            addScheduledJob(jobId, hour, minute, subInfo);

            await sendReply(ctx, event,
                `已成功为本${subInfo.sub_type}开启 Epic 每日推送，时间: ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
            );
            return;
        }

        // epic取消订阅
        if (/^(epic取消订阅|取消epic订阅)$/.test(rawMessage)) {
            if (!isAdmin(event)) {
                await sendReply(ctx, event, '只有群管理员才能操作订阅哦~');
                return;
            }

            const subInfo = getSubInfo(messageType, groupId, userId);
            const jobId = getJobId(messageType, groupId, userId);

            // 1. 从订阅者列表删除
            subscribeHelper('删除', subInfo.sub_type, subInfo.subject);
            // 2. 移除定时任务
            removeScheduledJob(jobId);

            await sendReply(ctx, event, `已为本${subInfo.sub_type}取消 Epic 每日推送`);
            return;
        }

        // epic订阅状态
        if (/^(epic订阅状态|epic推送状态)$/.test(rawMessage)) {
            const subInfo = getSubInfo(messageType, groupId, userId);
            const jobId = getJobId(messageType, groupId, userId);

            // 检查是否在订阅列表中
            const allSubs = subscribeHelper('读取') as SubscriptionData;
            if (!allSubs[subInfo.sub_type]?.includes(subInfo.subject)) {
                await sendReply(ctx, event, `本${subInfo.sub_type}当前未订阅 Epic 推送`);
                return;
            }

            // 获取定时任务配置
            const schedInfo = schedulerManage(jobId, 'get');
            if (schedInfo) {
                const [minuteStr, hourStr] = schedInfo.split(' ');
                const hour = parseInt(hourStr, 10);
                const minute = parseInt(minuteStr, 10);
                await sendReply(ctx, event,
                    `本${subInfo.sub_type}已订阅 Epic 推送，每日推送时间为: ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
                );
            } else {
                await sendReply(ctx, event,
                    `本${subInfo.sub_type}已订阅，但未找到推送时间设置。请使用 epic取消订阅 后重新订阅`
                );
            }
            return;
        }
    } catch (error) {
        pluginState.logger.error('(╥﹏╥) 处理消息时出错:', error);
    }
}

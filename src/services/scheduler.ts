/**
 * 定时推送任务管理服务
 *
 * 使用 setInterval 实现每分钟检查一次是否到达推送时间，
 * 到达时调用 Epic API 获取免费游戏并推送。
 */

import crypto from 'crypto';
import { pluginState } from '../core/state';
import { getEpicFree } from './epic-api';
import { subscribeHelper } from './subscription';
import type { ForwardNode, SubInfo } from '../types';

/**
 * 管理定时任务配置文件
 */
export function schedulerManage(
    jobId: string,
    action: 'get' | 'set' | 'delete',
    time?: string,
): string | undefined {
    const schedData = pluginState.loadSchedulerData();

    if (action === 'get') {
        return schedData[jobId];
    }

    if (action === 'set') {
        if (!time) throw new Error("设置定时任务时必须提供时间参数 'time'!");
        schedData[jobId] = time;
    } else if (action === 'delete') {
        delete schedData[jobId];
    }

    pluginState.saveSchedulerData(schedData);
    return action === 'set' ? time : undefined;
}

/**
 * 计算消息列表的 MD5 指纹
 */
function getMessageFingerprint(msgList: ForwardNode[]): string {
    const contentStr = JSON.stringify(msgList);
    return crypto.createHash('md5').update(contentStr).digest('hex');
}

/**
 * 检查并更新推送历史，返回 true 表示需要推送
 */
function checkAndUpdateHistory(jobId: string, msgList: ForwardNode[]): boolean {
    const currentFingerprint = getMessageFingerprint(msgList);
    const historyData = pluginState.loadPushHistory();
    const lastFingerprint = historyData[jobId];

    if (lastFingerprint === currentFingerprint) {
        return false; // 内容相同，跳过推送
    }

    historyData[jobId] = currentFingerprint;
    pluginState.savePushHistory(historyData);
    return true; // 内容变化，需要推送
}

/**
 * 发送合并转发消息
 */
async function sendForwardMsg(
    subInfo: SubInfo,
    msgList: ForwardNode[],
): Promise<void> {
    const ctx = pluginState.ctx;

    const actionName = subInfo.sub_type === '群聊'
        ? 'send_group_forward_msg'
        : 'send_private_forward_msg';

    const params: Record<string, unknown> = {
        message: msgList,
    };

    if (subInfo.sub_type === '群聊') {
        params.group_id = subInfo.subject;
    } else {
        params.user_id = subInfo.subject;
    }

    await ctx.actions.call(
        actionName as 'send_group_forward_msg',
        params as never,
        ctx.adapterName,
        ctx.pluginManager.config,
    );
}

/**
 * 执行推送任务
 */
async function executePush(jobId: string, subInfo: SubInfo): Promise<void> {
    pluginState.logger.info(`(｡·ω·｡) 开始执行 Epic 推送任务: ${jobId}`);

    // 检查订阅状态
    const allSubs = subscribeHelper('读取') as import('../types').SubscriptionData;
    if (!allSubs[subInfo.sub_type]?.includes(subInfo.subject)) {
        pluginState.logger.warn("(；′⌒`) 任务 " + jobId + " 目标已不在订阅列表，自动移除");
        removeScheduledJob(jobId);
        return;
    }

    // 获取游戏信息
    const msgList = await getEpicFree();

    // 检查是否需要推送（去重）
    if (!checkAndUpdateHistory(jobId, msgList)) {
        pluginState.logger.info(`(｡-ω-) 任务 ${jobId}: 游戏内容未变，已跳过推送`);
        return;
    }

    try {
        await sendForwardMsg(subInfo, msgList);
        pluginState.logger.info(`(*^ω^) Epic 推送任务 ${jobId} 执行成功`);
    } catch (e) {
        pluginState.logger.error(`(╥﹏╥) Epic 推送任务 ${jobId} 失败: `, e);
    }
}

/**
 * 添加定时推送任务
 */
export function addScheduledJob(
    jobId: string,
    hour: number,
    minute: number,
    subInfo: SubInfo,
): void {
    // 如果已存在则先移除
    removeScheduledJob(jobId);

    // 保存到配置文件
    schedulerManage(jobId, 'set', `${minute} ${hour}`);

    // 创建每分钟检查一次的定时器
    const timer = setInterval(() => {
        const now = new Date();
        // 转换为 UTC+8
        const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const currentHour = utc8.getUTCHours();
        const currentMinute = utc8.getUTCMinutes();

        if (currentHour === hour && currentMinute === minute) {
            executePush(jobId, subInfo).catch(e => {
                pluginState.logger.error(`(╥﹏╥) 定时推送执行异常: `, e);
            });
        }
    }, 60 * 1000); // 每60秒检查一次

    pluginState.timers.set(jobId, timer);
    pluginState.logger.info(`(*^ω^) 已添加定时推送任务: ${jobId}, 时间: ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
}

/**
 * 移除定时推送任务
 */
export function removeScheduledJob(jobId: string): void {
    const timer = pluginState.timers.get(jobId);
    if (timer) {
        clearInterval(timer);
        pluginState.timers.delete(jobId);
    }
    schedulerManage(jobId, 'delete');
}

/**
 * 从配置文件恢复所有定时任务
 */
export function loadAllScheduledJobs(): void {
    const schedData = pluginState.loadSchedulerData();
    let jobCount = 0;

    for (const [jobId, cronTime] of Object.entries(schedData)) {
        try {
            const parts = jobId.split('_');
            if (parts.length < 3) {
                pluginState.logger.warn("(；′⌒`) 无效的任务 ID: " + jobId);
                continue;
            }
            const subType = parts[1]; // group 或 private
            const subjectId = parts.slice(2).join('_');
            const subTypeCn = subType === 'group' ? '群聊' : '私聊';
            const subInfo: SubInfo = { sub_type: subTypeCn as '群聊' | '私聊', subject: subjectId };

            const [minuteStr, hourStr] = cronTime.split(' ');
            const minute = parseInt(minuteStr, 10);
            const hour = parseInt(hourStr, 10);

            if (isNaN(minute) || isNaN(hour)) {
                pluginState.logger.warn("(；′⌒`) 无效的定时配置: " + jobId + " -> " + cronTime);
                continue;
            }

            // 直接创建定时器（不重复保存到文件）
            const timer = setInterval(() => {
                const now = new Date();
                const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                const currentHour = utc8.getUTCHours();
                const currentMinute = utc8.getUTCMinutes();

                if (currentHour === hour && currentMinute === minute) {
                    executePush(jobId, subInfo).catch(e => {
                        pluginState.logger.error(`(╥﹏╥) 定时推送执行异常: `, e);
                    });
                }
            }, 60 * 1000);

            pluginState.timers.set(jobId, timer);
            jobCount++;
        } catch (e) {
            pluginState.logger.error(`(╥﹏╥) 加载 Epic 任务 ${jobId} 失败: `, e);
        }
    }

    if (jobCount > 0) {
        pluginState.logger.info(`(*^ω^) 成功加载 ${jobCount} 个 Epic 推送任务`);
    }
}

/**
 * 手动发送 Epic 免费游戏信息到指定目标
 */
export async function sendEpicFreeToTarget(subInfo: SubInfo): Promise<void> {
    const msgList = await getEpicFree();
    await sendForwardMsg(subInfo, msgList);
}
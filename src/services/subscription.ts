/**
 * 订阅管理服务
 *
 * 管理群聊/私聊的 Epic 免费游戏推送订阅。
 */

import { pluginState } from '../core/state';
import type { SubInfo, SubscriptionData } from '../types';

/**
 * 订阅操作
 */
export function subscribeHelper(
    method: '读取' | '启用' | '删除',
    subType?: '群聊' | '私聊',
    subject?: string,
): string | SubscriptionData {
    const statusData = pluginState.loadSubscriptions();

    if (method === '读取') {
        return statusData;
    }

    if (!subType || !subject) {
        return '参数缺失';
    }

    if (method === '启用') {
        if (statusData[subType].includes(subject)) {
            return `${subType}${subject} 已经订阅过 Epic 限免游戏资讯了哦~`;
        }
        statusData[subType].push(subject);
    } else if (method === '删除') {
        if (!statusData[subType].includes(subject)) {
            return `${subType}${subject} 未曾订阅过 Epic 限免游戏资讯~`;
        }
        statusData[subType] = statusData[subType].filter(s => s !== subject);
    }

    try {
        pluginState.saveSubscriptions(statusData);
        return `${subType}${subject} Epic 限免游戏资讯订阅已${method}~`;
    } catch (e) {
        pluginState.logger.error(`(╥﹏╥) 写入 Epic 订阅数据错误:`, e);
        return `${subType}${subject} Epic 限免游戏资讯订阅${method}失败了..`;
    }
}

/**
 * 从事件中提取 job_id
 */
export function getJobId(messageType: string, groupId?: number, userId?: number): string {
    if (messageType === 'group' && groupId) {
        return `epic_group_${groupId}`;
    }
    return `epic_private_${userId}`;
}

/**
 * 从事件中提取订阅信息
 */
export function getSubInfo(messageType: string, groupId?: number, userId?: number): SubInfo {
    if (messageType === 'group' && groupId) {
        return { sub_type: '群聊', subject: String(groupId) };
    }
    return { sub_type: '私聊', subject: String(userId) };
}

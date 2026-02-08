/**
 * 类型定义文件
 * 定义插件内部使用的接口和类型
 */

// ==================== 插件配置 ====================

/** 插件主配置接口 */
export interface PluginConfig {
    /** 全局开关：是否启用插件功能 */
    enabled: boolean;
    /** 调试模式：启用后输出详细日志 */
    debug: boolean;
    /** 代理类型：http / socks5 / 空表示不使用代理 */
    proxyType: string;
    /** 代理服务器地址 */
    proxyHost: string;
    /** 代理服务器端口 */
    proxyPort: number;
    /** 代理用户名（可选） */
    proxyUsername: string;
    /** 代理密码（可选） */
    proxyPassword: string;
}

// ==================== Epic 游戏数据 ====================

/** Epic API 返回的游戏数据 */
export interface EpicGameRaw {
    title: string;
    description: string;
    seller: { name: string };
    keyImages: Array<{ type: string; url: string }>;
    customAttributes: Array<{ key: string; value: string }>;
    promotions?: {
        promotionalOffers: Array<{
            promotionalOffers: Array<{ endDate: string }>;
        }>;
        upcomingPromotionalOffers: Array<{
            promotionalOffers: Array<{ endDate: string }>;
        }>;
    };
    price: {
        totalPrice: {
            fmtPrice: {
                originalPrice: string;
                discountPrice: string;
            };
        };
    };
    url?: string;
    offerMappings?: Array<{ pageSlug: string; pageType: string }>;
    catalogNs?: { mappings?: Array<{ pageSlug: string; pageType: string }> };
}

/** 合并转发消息节点 */
export interface ForwardNode {
    type: 'node';
    data: {
        nickname: string;
        user_id?: string;
        content: Array<{ type: string; data: Record<string, unknown> }>;
    };
}

// ==================== 订阅相关 ====================

/** 订阅数据 */
export interface SubscriptionData {
    群聊: string[];
    私聊: string[];
}

/** 定时任务配置 { jobId: "minute hour" } */
export type SchedulerData = Record<string, string>;

/** 推送历史指纹 { jobId: md5Hash } */
export type PushHistoryData = Record<string, string>;

/** 订阅信息 */
export interface SubInfo {
    sub_type: '群聊' | '私聊';
    subject: string;
}

// ==================== API 响应 ====================

/** 统一 API 响应格式 */
export interface ApiResponse<T = unknown> {
    code: number;
    message?: string;
    data?: T;
}

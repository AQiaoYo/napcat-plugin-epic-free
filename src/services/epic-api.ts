/**
 * Epic Games Store API 服务
 *
 * 调用 Epic Store 促销 API 获取免费游戏数据，
 * 构建合并转发消息节点列表。
 */

import { pluginState } from '../core/state';
import type { EpicGameRaw, ForwardNode } from '../types';

const EPIC_API_URL = 'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions';
const EPIC_NICKNAME = 'EpicGameStore';

/**
 * 创建一个合并转发消息节点
 */
function createNode(content: Array<{ type: string; data: Record<string, unknown> }>): ForwardNode {
    return {
        type: 'node',
        data: {
            nickname: EPIC_NICKNAME,
            user_id: '2854196320',
            content,
        },
    };
}

/** 创建纯文本节点 */
function textNode(text: string): ForwardNode {
    return createNode([{ type: 'text', data: { text } }]);
}

/** 创建图片节点 */
function imageNode(url: string): ForwardNode {
    return createNode([{ type: 'image', data: { file: url } }]);
}

/**
 * 请求 Epic Store 促销 API
 */
async function queryEpicApi(): Promise<EpicGameRaw[]> {
    const proxyUrl = pluginState.getProxyUrl();
    if (proxyUrl) {
        pluginState.logger.info(`(｡·ω·｡) 使用代理: ${proxyUrl}`);
    }

    try {
        // Node.js 原生 fetch 不支持代理，这里直接使用 fetch
        // 如果需要代理支持，用户需要配置系统级代理或使用 HTTPS_PROXY 环境变量
        const url = new URL(EPIC_API_URL);
        url.searchParams.set('locale', 'zh-CN');
        url.searchParams.set('country', 'CN');
        url.searchParams.set('allowCountries', 'CN');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(url.toString(), {
            headers: {
                'Referer': 'https://www.epicgames.com/store/zh-CN/',
                'Content-Type': 'application/json; charset=utf-8',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.80 Safari/537.36',
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            pluginState.logger.error(`(╥﹏╥) Epic API HTTP 错误: ${res.status}`);
            return [];
        }

        const json = await res.json() as {
            data: { Catalog: { searchStore: { elements: EpicGameRaw[] } } }
        };
        return json.data.Catalog.searchStore.elements;
    } catch (e) {
        pluginState.logger.error('(╥﹏╥) 请求 Epic Store API 失败:', e);
        return [];
    }
}

/**
 * 获取 Epic 免费游戏信息，返回合并转发消息节点列表
 */
export async function getEpicFree(): Promise<ForwardNode[]> {
    const games = await queryEpicApi();

    if (!games || games.length === 0) {
        return [textNode('Epic 可能又抽风啦，请稍后再试 (；′⌒`)')];
    }

    pluginState.logger.debug(`(｡·ω·｡) 获取到 ${games.length} 个游戏数据: ${games.map(g => g.title).join(', ')}`);

    let gameCnt = 0;
    const msgList: ForwardNode[] = [];

    for (const game of games) {
        const gameName = game.title || '未知';
        try {
            if (!game.promotions) continue;

            const gamePromotions = game.promotions.promotionalOffers;
            const upcomingPromotions = game.promotions.upcomingPromotionalOffers;
            const originalPrice = game.price?.totalPrice?.fmtPrice?.originalPrice ?? '未知';
            const discountPrice = game.price?.totalPrice?.fmtPrice?.discountPrice ?? '未知';

            if (!gamePromotions || gamePromotions.length === 0) {
                if (upcomingPromotions && upcomingPromotions.length > 0) {
                    pluginState.logger.info(`(｡-ω-) 跳过即将推出免费游玩的游戏: ${gameName}(${discountPrice})`);
                }
                continue;
            }

            if (discountPrice !== '0') {
                pluginState.logger.info(`(｡-ω-) 跳过促销但不免费的游戏: ${gameName}(${discountPrice})`);
                continue;
            }

            // 处理游戏预览图
            for (const image of game.keyImages) {
                if (image.url && ['Thumbnail', 'VaultOpened', 'DieselStoreFrontWide', 'OfferImageWide'].includes(image.type)) {
                    msgList.push(imageNode(image.url));
                    break;
                }
            }

            // 处理游戏发行信息
            let gameDev = game.seller?.name || '未知';
            let gamePub = game.seller?.name || '未知';
            for (const pair of game.customAttributes || []) {
                if (pair.key === 'developerName') gameDev = pair.value;
                else if (pair.key === 'publisherName') gamePub = pair.value;
            }
            const devCom = gameDev !== gamePub ? `${gameDev} 开发、` : '';
            const companies = gamePub !== 'Epic Dev Test Account'
                ? `由 ${devCom}${gamePub} 发行，`
                : '';

            // 处理游戏限免结束时间
            const dateRfc3339 = gamePromotions[0]?.promotionalOffers?.[0]?.endDate;
            let endDate = '未知';
            if (dateRfc3339) {
                const dt = new Date(dateRfc3339);
                // 转换为北京时间
                const month = dt.getMonth() + 1;
                const day = dt.getDate();
                const hour = dt.getHours().toString().padStart(2, '0');
                const minute = dt.getMinutes().toString().padStart(2, '0');
                // 使用 UTC+8 手动计算
                const utc8 = new Date(dt.getTime() + 8 * 60 * 60 * 1000);
                endDate = `${utc8.getUTCMonth() + 1} 月 ${utc8.getUTCDate()} 日 ${utc8.getUTCHours().toString().padStart(2, '0')}:${utc8.getUTCMinutes().toString().padStart(2, '0')}`;
            }

            // 拼接游戏商城链接
            let gameUrl: string;
            if (game.url) {
                gameUrl = game.url;
            } else {
                const slugs = [
                    ...(game.offerMappings || []).filter(x => x.pageType === 'productHome').map(x => x.pageSlug),
                    ...((game.catalogNs?.mappings) || []).filter(x => x.pageType === 'productHome').map(x => x.pageSlug),
                    ...(game.customAttributes || []).filter(x => x.key.includes('productSlug')).map(x => x.value),
                ];
                gameUrl = slugs.length > 0
                    ? `https://store.epicgames.com/zh-CN/p/${slugs[0]}`
                    : 'https://store.epicgames.com/zh-CN';
            }

            gameCnt++;

            // 添加链接节点
            msgList.push(textNode(gameUrl));
            // 添加游戏信息节点
            msgList.push(textNode(
                `${gameName} (${originalPrice})\n\n${game.description}\n\n游戏${companies}将在 ${endDate} 结束免费游玩，戳上方链接领取吧~`
            ));
        } catch (e) {
            pluginState.logger.debug('(>_<) 处理游戏 ' + gameName + ' 时遇到错误: ' + e);
        }
    }

    // 插入头部信息
    msgList.unshift(textNode(
        gameCnt > 0
            ? gameCnt + ' 款游戏现在免费!'
            : '暂未找到正在促销的游戏...'
    ));

    return msgList;
}

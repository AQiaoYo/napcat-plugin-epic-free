/**
 * 插件配置模块
 * 定义默认配置值和 WebUI 配置 Schema
 */

import type { NapCatPluginContext, PluginConfigSchema } from 'napcat-types/napcat-onebot/network/plugin/types';
import type { PluginConfig } from './types';

/** 默认配置 */
export const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
    debug: false,
    proxyType: '',
    proxyHost: '127.0.0.1',
    proxyPort: 7890,
    proxyUsername: '',
    proxyPassword: '',
};

/**
 * 构建 WebUI 配置 Schema
 */
export function buildConfigSchema(ctx: NapCatPluginContext): PluginConfigSchema {
    return ctx.NapCatConfig.combine(
        ctx.NapCatConfig.html(`
            <div style="padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; margin-bottom: 20px; color: white;">
                <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: bold;">Epic 喜加一</h3>
                <p style="margin: 0; font-size: 14px; opacity: 0.9;">Epic Games Store 每周免费游戏订阅推送插件</p>
            </div>
        `),
        ctx.NapCatConfig.boolean('enabled', '启用插件', true, '是否启用此插件的功能'),
        ctx.NapCatConfig.boolean('debug', '调试模式', false, '启用后将输出详细的调试日志'),
        ctx.NapCatConfig.html('<p style="margin: 16px 0 8px 0; font-weight: bold; color: #666;">代理设置（中国大陆用户可能需要配置）</p>'),
        ctx.NapCatConfig.select('proxyType', '代理类型', [
            { label: '不使用代理', value: '' },
            { label: 'HTTP 代理', value: 'http' },
            { label: 'SOCKS5 代理', value: 'socks5' },
        ], ''),
        ctx.NapCatConfig.text('proxyHost', '代理地址', '127.0.0.1', '代理服务器地址'),
        ctx.NapCatConfig.number('proxyPort', '代理端口', 7890, '代理服务器端口'),
        ctx.NapCatConfig.text('proxyUsername', '代理用户名', '', '代理认证用户名（可选）'),
        ctx.NapCatConfig.text('proxyPassword', '代理密码', '', '代理认证密码（可选）'),
    );
}

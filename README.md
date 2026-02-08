# napcat-plugin-epic-free

<div align="center">

一个用于订阅和推送 Epic Games Store 每周免费游戏的 NapCat 插件。

[![LICENSE](https://img.shields.io/github/license/AQiaoYo/napcat-plugin-epic-free.svg)](./LICENSE)

</div>

## 功能特色

- **指令查询**：随时使用指令查询当前免费游戏，以合并转发消息发送（封面图 + 介绍 + 链接 + 截止时间）
- **定时推送**：按群/私聊粒度订阅每日定时推送，可自定义推送时间
- **灵活订阅**：支持群聊和私聊分别订阅，命令式管理
- **去重推送**：基于内容指纹（MD5 Hash）避免重复推送同一批游戏
- **代理支持**：内置 HTTP/SOCKS5 代理配置，方便在网络受限的环境下使用
- **权限管理**：订阅/取消订阅等操作限群管理员使用
- **WebUI 管理**：React 前端面板，可视化管理配置、订阅和状态

## 安装

从 [Releases](https://github.com/AQiaoYo/napcat-plugin-epic-free/releases) 下载最新构建包，解压到 NapCat 的 `plugins` 目录即可。

## 配置

### 代理配置（可选）

如果服务器无法直接访问 Epic Games API（例如在中国大陆），需要在 WebUI 配置面板中设置代理。

| 配置项 | 默认值 | 说明 |
|:---:|:---:|:---|
| 代理类型 | (无) | 可选 `http` 或 `socks5`，留空不使用代理 |
| 代理地址 | `127.0.0.1` | 代理服务器地址 |
| 代理端口 | `7890` | 代理服务器端口 |
| 代理用户名 | (无) | 代理认证用户名（可选） |
| 代理密码 | (无) | 代理认证密码（可选） |

## 使用

### 指令表

| 指令 | 权限 | 说明 |
|:---:|:---:|:---|
| `epic喜加一` / `喜加一` | 所有用户 | 获取当前 Epic 免费游戏信息 |
| `epic订阅 HH:MM` | 群管理员 | 为当前群/私聊开启每日定时推送，例如 `epic订阅 8:30` |
| `epic取消订阅` | 群管理员 | 取消当前群/私聊的推送 |
| `epic订阅状态` | 所有用户 | 查看当前群/私聊的订阅状态和推送时间 |

## 项目结构

```
napcat-plugin-epic-free/
├── src/
│   ├── index.ts                # 插件入口：生命周期钩子、定时任务加载、路由注册
│   ├── config.ts               # 默认配置 + WebUI 配置 Schema（含代理配置项）
│   ├── types.ts                # TypeScript 类型定义
│   ├── core/
│   │   └── state.ts            # 全局状态单例 + 配置/订阅/定时器管理
│   ├── handlers/
│   │   └── message-handler.ts  # 消息命令处理：喜加一、订阅管理、权限检查
│   ├── services/
│   │   ├── api-service.ts      # WebUI API 路由
│   │   ├── epic-api.ts         # Epic Store 促销 API 调用 + 消息构建
│   │   ├── scheduler.ts        # 定时推送任务管理 + 去重检查
│   │   └── subscription.ts     # 订阅数据持久化（JSON 文件存储）
│   └── webui/                  # React SPA 前端（独立构建）
│       └── src/
│           ├── pages/
│           │   ├── StatusPage.tsx    # 仪表盘
│           │   ├── ConfigPage.tsx    # 配置管理
│           │   └── GroupsPage.tsx    # 订阅管理
│           └── ...
├── .github/
│   ├── workflows/
│   │   ├── release.yml         # 自动构建发布
│   │   └── update-index.yml    # 自动更新插件索引
│   └── copilot-instructions.md
├── package.json
├── vite.config.ts
└── README.md
```

## 开发

### 环境准备

```bash
pnpm install
```

### 构建

```bash
# 完整构建（前端 + 后端）
pnpm run build

# 前端开发服务器
pnpm run dev:webui

# 类型检查
pnpm run typecheck
```

### 热重载开发

需要在 NapCat 端安装 `napcat-plugin-debug` 插件：

```bash
# 一键部署：构建 → 自动复制 → 自动重载
pnpm run deploy

# 开发模式：watch 构建 + 自动部署 + 热重载
pnpm run dev
```

### 数据文件

| 文件 | 位置 | 说明 |
|------|------|------|
| 插件配置 | `ctx.configPath` | 代理、权限等配置 |
| `scheduler.json` | `ctx.dataPath` | 定时推送任务配置 |
| `subscriptions.json` | `ctx.dataPath` | 订阅列表 |
| `push_history.json` | `ctx.dataPath` | 推送历史指纹（去重用） |

## 致谢

- [nonebot-plugin-epicfree](https://github.com/FlanChanXwO/nonebot-plugin-epicfree) - 本项目参考了该 NoneBot2 插件的设计与实现（MIT License）
- [NapCat](https://github.com/NapNeko/NapCatQQ) - QQ Bot 框架
- [Epic Games Store API](https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions) - 免费游戏数据源

## 许可证

MIT License

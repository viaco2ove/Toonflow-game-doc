# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## 项目概述

Toonflow 是一个 AI 短剧/互动故事游戏一站式工具平台，包含两条核心业务线：
1. **AI 短剧制作流水线**：小说 → 大纲 → 剧本 → 分镜 → 视频
2. **多角色 AI 故事游戏**：世界观创建 → 章节设计 → 游戏会话 → AI 叙事驱动

这是一个**文档仓库**，存放项目的架构设计、API 文档、数据库设计、游戏引擎设计等文档。源码分布在多个独立仓库中。

## 相关仓库路径
[system.yml](system/system.yml)

**注意**：当前仓库 (`Toonflow-game-doc`) 是文档仓库，不存放源码。后端构建产物位于 `toonflow-game-app/scripts/web/`。

## 后端架构 (toonflow-game-app)

### 技术栈
- **运行时**：Node.js 23+ / Electron 40
- **语言**：TypeScript (strict 模式)
- **Web 框架**：Express 5
- **数据库**：SQLite3 (better-sqlite3) + Knex.js
- **AI SDK**：Vercel AI SDK (ai) + 多厂商 Provider

### 后端服务的目录结构
```
src/
├── app.ts                    # Express 启动入口
├── core.ts                   # 路由自动发现 (glob 扫描 routes/**/*.ts)
├── router.ts                 # 自动生成的路由注册
├── routes/                   # 路由/控制器层 (144+ 接口)
│   ├── game/                 # AI 游戏接口 (33+)
│   ├── novel/ outline/ script/ storyboard/ video/  # 短剧流水线
│   ├── assets/ setting/ user/ prompt/ project/ voice/
│   └── other/ index/ task/
├── modules/
│   └── game-runtime/         # 游戏运行时模块
│       ├── engines/          # 纯逻辑计算层 (无副作用)
│       │   ├── NarrativeOrchestrator      # 叙事编排
│       │   ├── ChapterProgressEngine      # 章节进度状态机
│       │   ├── TriggerEngine              # 条件触发器
│       │   ├── TaskProgressEngine         # 任务进度跟踪
│       │   ├── MiniGameController         # 小游戏控制
│       │   ├── SpeakerRouteEngine         # 发言角色路由
│       │   ├── RuleOrchestrator           # 规则执行器
│       │   └── ChapterOutcomeEngine       # 章节结局判定
│       ├── services/         # 服务层 (DB 读写)
│       │   ├── SessionService
│       │   ├── ChapterRuntimeService
│       │   ├── SnapshotService
│       │   └── SessionMemoryWorker
│       └── types/
├── agents/                   # AI Agent 层
├── lib/                      # 公共库层 (gameEngine.ts ~1900行)
├── middleware/               # 中间件层
└── utils/
```

### 路由自动发现机制

新增路由文件无需修改其他代码。文件命名规范：`routes/{模块}/{操作}{资源}.ts`

### 请求处理中间件链

```
Request → logger (morgan) → cors → express.json() (100MB limit)
  → express.static (uploads/) → JWT 鉴权 → 资源隔离 → 路由处理器
```

### JWT 鉴权

- Token 从 `Authorization` header 或 `?token=` 查询参数获取
- 白名单：`/other/login`, `/other/register` 等无需 Token
- 所有数据库查询自动附加 `userId` 条件实现资源隔离

## 游戏运行时引擎 (game-runtime)

这是项目最复杂的模块，驱动多角色 AI 互动故事。

### 分层设计

| 层级 | 位置 | 职责 |
|------|------|------|
| Engines | `modules/game-runtime/engines/` | 纯逻辑计算，输入输出确定，不操作 DB |
| Services | `modules/game-runtime/services/` | 有副作用的操作，DB 读写和外部调用 |
| Types | `modules/game-runtime/types/` | 运行时类型定义 |
| 核心数据结构 | `lib/gameEngine.ts` (~1900行) | 状态读写工具、条件表达式求值、章节进度管理 |

### 核心概念

- **StoryWorld**：故事世界容器，包含世界观设定、角色定义、章节列表
- **Chapter**：章节，包含内容、任务、触发器、进入/完成条件
- **Session**：会话，用户与 AI 的一次完整互动
- **RuntimeState**：运行时状态（核心数据结构），包含 player/npcs/vars/flags/chapterProgress

### 事件类型 (EventKind)

| 类型 | 说明 | 流程阶段 |
|------|------|----------|
| `opening` | 开场事件 | introduction |
| `scene` | 场景叙事 | chapter_content |
| `user` | 用户互动节点 | chapter_content |
| `fixed` | 固定结局检查 | chapter_ending_check |
| `ending` | 章节结局 | chapter_ending_check |

### 叙事回合流程

```
用户输入 → 决定发言角色 (SpeakerRouteEngine) → 规则叙事计划 (RuleOrchestrator)
  → 构建 AI Prompt → 调用 AI 生成回复 → 解析响应 → 更新状态 → 检查触发器
```

## 前端架构 (Toonflow-game-web)

- 前端为独立的 Vue3 SPA 项目
- 构建产物放置在 `scripts/web/` 目录，由 Electron 加载
- **开发模式**：直接修改前端源码，运行 `yarn dev` 查看效果
- **不要**在开发时执行 `yarn build`，以免影响开发效率
- 发行版才使用构建后的 `scripts/web/index.html`

## 多环境配置

| 环境 | 配置文件 | 用途 | Git |
|------|----------|------|-----|
| `dev` | `env/.env.dev` | 快速启动、快速测试 | 上传 |
| `local` | `env/.env.local` | 本机调试 | 不上传 |
| `prod` | `env/.env.prod` | 生产发布 | 上传 |

- 后端 API 服务默认端口：`60002`

## 数据库

使用 SQLite3 作为本地数据库，Knex.js 作为查询构建器。

### 核心表

| 表名 | 用途 |
|------|------|
| `t_user` | 用户信息 |
| `t_project` | 项目信息 |
| `t_novel` | 小说章节 |
| `t_outline` | 剧情大纲 |
| `t_script / t_scriptSegment` | 剧本及片段 |
| `t_assets` | 素材库 |
| `t_video / t_videoConfig` | 视频及配置 |
| `t_storyWorld / t_storyChapter` | 故事世界/章节 |
| `t_gameSession` | 游戏会话 |
| `t_sessionMessage` | 会话消息 |
| `t_sessionStateSnapshot` | 会话状态快照 |
| `t_entityStateDelta` | 实体状态变更 |
| `t_chapterTask / t_chapterTrigger` | 章节任务/触发器 |
| `t_config` | AI 模型配置 |
| `t_prompts` | 提示词模板 |
| `t_aiTokenUsageLog` | AI Token 使用日志 |

## 开发命令速查 (后端)

| 命令 | 说明 |
|------|------|
| `yarn install` | 安装依赖 |
| `yarn dev` | 后端开发模式（热重载），端口 60002 |
| `yarn dev:gui` | Electron 桌面客户端开发 |
| `yarn local:gui` | 本机环境 GUI 启动 |
| `yarn lint` | TypeScript 类型检查 |
| `yarn build` | 编译到 build/ 目录 |
| `yarn dist:win` | 打包 Windows 版本 |
| `yarn dist:mac` | 打包 macOS 版本 |
| `yarn dist:linux` | 打包 Linux 版本 |

### 前端开发命令

| 命令 | 说明 |
|------|------|
| `cd Toonflow-game-web && yarn dev` | 前端开发服务器 |
| `cd Toonflow-game-web && yarn build` | 前端构建 |

## AI 模型支持

- **文本大模型**：OpenAI、Anthropic、Google、DeepSeek、智谱、Qwen、xAI 等
- **视频生成**：豆包、Sora 等
- **图像生成**：Nano Banana Pro 等
- **语音合成**：阿里云 CosyVoice

## 测试

### Playwright 测试

位于 `test/playwright/playwright-demo/` 目录：
- 使用 Playwright 进行 E2E 测试
- 测试报告位于 `test/playwright/playwright-demo/playwright-report/`
- 测试结果位于 `test/playwright/playwright-demo/test-results/`

### 测试用例

位于 `test/testcase/` 目录，分为：
- `web/`：Web 端测试用例
- `android/`：Android 端测试用例

## 重要文档位置

本仓库 (`Toonflow-game-doc`) 中的关键文档：
- `项目概览.md`：项目整体介绍
- `架构设计.md`：详细架构设计文档
- `数据库设计.md`：数据库表结构详情
- `游戏引擎设计.md`：游戏运行时引擎详解
- `API接口文档.md`：144+ 接口详细说明
- `部署指南.md`：部署和运维指南
- `md/plan/`：各功能模块的设计文档和迭代记录

## 默认账号

首次登录默认账号：`admin / admin123`，首次登录后请立即修改密码。

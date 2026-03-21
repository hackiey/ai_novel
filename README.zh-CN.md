# AI Novel — AI 辅助小说创作工作台

[English](./README.md)

AI Novel 是一个面向长篇小说创作的跨平台工作台。项目按 `世界观 -> 小说（Project）-> 章节` 组织，提供 Web 写作界面、移动端伴随应用和 Electron 桌面壳。内置 AI Agent 可以管理设定数据、续写章节、导入参考资料，并在你的创作知识库中做语义搜索。

## 亮点

- 世界观优先：先创建世界观，再在其下管理多部小说，最后按章节写作。
- 结构化资料：角色、世界观条目、草稿都支持摘要和重要性字段。
- 写作工作区：章节侧栏 + TipTap 编辑器 + 流式 AI 对话三栏布局。
- Agent 自动化：内置 24 个 MCP 工具，覆盖 CRUD、语义搜索、记忆、摘要生成和续写。
- 文件导入：支持上传 `.txt`、`.md`、`.docx`、`.pdf`，由 Agent 抽取为结构化设定。
- 多端共享：Web、Electron、Expo Mobile 共用同一套后端和类型定义。

## 技术栈

| 层级 | 技术 |
|------|------|
| Monorepo | Turborepo + pnpm workspaces |
| Web | React 19 + Vite + Tailwind CSS v4 + TanStack Router / Query |
| 移动端 | Expo Router + React Native + TanStack Query |
| 桌面端 | Electron |
| 编辑器 | TipTap 富文本编辑器，支持自动保存 |
| 后端 | Fastify + tRPC v11 |
| 数据库 | MongoDB 原生驱动 |
| AI Agent | Anthropic Claude Agent SDK + 自定义 MCP 工具 |
| Embedding | OpenAI 兼容的 embedding 服务，模型和维度可配置 |
| 共享类型 | `packages/types` 中的 Zod Schema |

## 仓库结构

```text
ai_novel/
├── apps/
│   ├── server/     # Fastify + tRPC 后端、SSE 路由、鉴权、embedding
│   ├── web/        # React Web 应用，主写作工作区
│   ├── desktop/    # Web 应用的 Electron 外壳
│   └── mobile/     # Expo 移动端
└── packages/
    ├── agent/      # NovelAgentSession、i18n 提示词、MCP 工具
    ├── core/       # Embedding 服务与文本分块工具
    ├── editor/     # 可复用的 TipTap 编辑器包
    └── types/      # 共享 Zod Schema 与 TypeScript 类型
```

## 快速开始

### 环境要求

- Node.js >= 20
- pnpm >= 9
- MongoDB（本地或 Atlas）

### 安装与运行

```bash
pnpm install
cp apps/server/.env.example apps/server/.env

# 首次开发前先构建所有 workspace
pnpm build

# 启动后端（3001）和 Web（5173）
pnpm dev:all
```

启动后访问：

- Web：`http://localhost:5173`
- API：`http://localhost:3001`
- 健康检查：`http://localhost:3001/health`

### 必填环境变量

在 `apps/server/.env` 中至少配置：

- `MONGODB_URI`
- `ANTHROPIC_API_KEY`
- `JWT_SECRET`

常用可选变量：

- `OPENAI_API_KEY` 或 `EMBEDDING_API_KEY`
- `EMBEDDING_BASE_URL`
- `EMBEDDING_MODEL`
- `EMBEDDING_DIMENSIONS`
- `ANTHROPIC_BASE_URL`
- `AVAILABLE_MODELS`
- `DEFAULT_MODEL`
- `PORT`
- `JWT_EXPIRES_IN`

### 桌面端与移动端

```bash
# 桌面端：先启动 Web dev server，再启动 Electron
pnpm dev:web
pnpm --filter @ai-novel/desktop dev

# 移动端：启动 Expo
pnpm --filter @ai-novel/mobile dev
```

## 核心流程

### 世界观工作区

- 创建世界观并填写描述，每个用户的数据彼此隔离。
- 在世界观下管理角色、世界观设定和草稿。
- 在世界观页面里按当前标签页执行语义搜索或正则回退搜索。

### 写作工作区

- 一个世界观下可以挂多部小说 / Project。
- 每部小说包含有序章节，在主写作界面中编辑。
- 编辑器采用防抖自动保存，并在请求进行中保留本地未落盘内容。
- AI 续写结果可以直接追加到当前章节。

### Agent 与流式响应

- `POST /api/agent/chat` 通过 SSE 流式返回 Agent 事件。
- 会话历史保存在 MongoDB 中，并按 `sessionId` 复用。
- Agent 记忆按世界观存储，世界摘要在过期后按 locale 重建。
- 可通过权限组限制用户可选的模型。

### 文件导入

- `POST /api/world/import-file` 支持 `.txt`、`.md`、`.docx`、`.pdf`。
- 大文件会先分块，再由 Agent 逐块处理，并流式返回进度事件。
- 导入目标是把参考资料整理成结构化设定，而不是简单塞入原文。

### 鉴权与管理

- Web 和移动端都使用 JWT 登录 / 注册。
- 管理后台支持用户角色和权限组管理。
- 权限组可限制用户能选择的 Claude 模型列表。

### 国际化

- Web 端通过 `i18next` 支持中英文。
- Agent 提示词、工具描述、世界摘要都会跟随 locale。
- 移动端内置简体中文文案。

## 开发命令

```bash
pnpm dev:all
pnpm dev:server
pnpm dev:web
pnpm build
```

当前没有单独的自动化测试套件，建议用 `pnpm build` 验证 TypeScript 和各包构建是否正常。

## Atlas Vector Search

如果启用 embedding 语义搜索，请在下面这些 collection 的 `embedding` 字段上创建名为 `vector_index` 的向量索引：

- `characters`
- `world_settings`
- `drafts`
- `chapters`
- `embedding_chunks`

索引维度需要与 `EMBEDDING_DIMENSIONS`（或你的 embedding 服务默认维度）保持一致。如果你依赖元数据过滤，也请把对应 collection 使用的归属字段一并加入索引过滤能力，通常是 `worldId` 或 `projectId`。

## License

MIT

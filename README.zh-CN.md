# AI Novel — AI 辅助小说写作应用

[English](./README.md)

一个跨平台的 AI 辅助小说创作工具。核心交互模式为 **写作编辑器 + AI 对话面板** 两栏布局，用户通过自然语言与 AI Agent 交互，驱动角色管理、世界观设定、续写、语义搜索等操作。

## 技术栈

| 层级 | 技术 |
|------|------|
| Monorepo | Turborepo + pnpm workspaces |
| 前端 | React 19 + Vite + TailwindCSS v4 + TanStack Router / Query |
| 编辑器 | TipTap (富文本, 自动保存, AI 续写插入) |
| 后端 | Fastify + tRPC v11 (端到端类型安全) |
| 数据库 | MongoDB (原生驱动, Atlas Vector Search) |
| AI Agent | Anthropic Claude API + 自定义 tool use 循环 (24 个工具) |
| Embedding | OpenAI `text-embedding-3-small` (1536 维) |
| 桌面端 | Electron |
| 移动端 | Expo / React Native |

## 项目结构

```
ai_novel/
├── apps/
│   ├── server/          # Fastify + tRPC 后端
│   ├── web/             # Vite + React 前端
│   ├── desktop/         # Electron 桌面端
│   └── mobile/          # Expo 移动端
└── packages/
    ├── types/           # Zod schemas + TypeScript 类型
    ├── agent/           # AI Agent 核心 (工具定义 + 会话管理)
    ├── editor/          # TipTap 富文本编辑器组件
    └── core/            # Embedding 工具 (OpenAI)
```

## 快速开始

### 前置要求

- Node.js >= 20
- pnpm >= 9
- MongoDB (本地或 Atlas)

### 安装与启动

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp apps/server/.env.example apps/server/.env
# 编辑 .env，填入：
#   MONGODB_URI      — MongoDB 连接字符串
#   ANTHROPIC_API_KEY — Claude API 密钥 (Agent 对话)
#   OPENAI_API_KEY    — OpenAI 密钥 (可选, 用于 embedding 语义搜索)

# 构建所有包
pnpm build

# 同时启动后端 + 前端
pnpm dev:all
```

启动后访问：
- 前端：http://localhost:5173
- 后端：http://localhost:3001

### 桌面端 (Electron)

```bash
# 先启动 web dev server，再启动 Electron
pnpm dev:web &
cd apps/desktop && pnpm dev
```

### 移动端 (Expo)

```bash
cd apps/mobile && pnpm dev
```

## 功能概览

### 项目管理
创建小说项目，设置类型和目标字数。

### 角色人设
管理角色的外貌、性格、背景、目标、人物关系等信息，支持自定义字段。

### 世界观设定
按分类（地理、魔法体系、历史等）管理世界观条目，支持标签。

### 章节管理
创建章节、排序、追踪字数和状态（草稿/修订/定稿）。

### 富文本编辑器
基于 TipTap 的写作编辑器，支持：
- 格式化：加粗、斜体、下划线、删除线、标题 (H1-H3)、列表、引用
- 自动保存（防抖 2 秒）
- AI 续写内容自动插入
- 实时字数/字符统计

### 草稿笔记
记录创作灵感、草稿构思，可关联角色和世界观条目。

### AI Agent 对话
在写作页面右侧与 AI 助手对话。Agent 内置 24 个工具：

| 类别 | 工具 | 说明 |
|------|------|------|
| 搜索 | `semantic_search` | 语义/关键词搜索角色、世界观、草稿、章节 |
| 角色 | `list_characters` / `get_character` | 查询角色信息 |
| | `create_character` / `update_character` | 创建或修改角色 |
| | `delete_character` | 删除角色 |
| 世界观 | `list_world_settings` / `get_world_setting` | 查询世界观 |
| | `create_world_setting` / `update_world_setting` | 创建或修改世界观 |
| | `delete_world_setting` | 删除世界观条目 |
| 章节 | `list_chapters` / `get_chapter` | 查询章节 |
| | `create_chapter` / `update_chapter` | 创建或修改章节 |
| | `continue_writing` | AI 续写章节内容 |
| | `delete_chapter` | 删除章节 |
| | `generate_synopsis` | 为章节生成摘要 |
| 草稿 | `get_draft` / `create_draft` | 查询或创建草稿 |
| | `delete_draft` | 删除草稿 |
| 记忆 | `get_memory` / `update_memory` | 读取/保存用户偏好记忆 |

Agent 会自动调用工具获取上下文，确保回答和续写内容符合已有设定。续写结果自动同步到左侧编辑器。

### 语义搜索
- 基于 OpenAI embedding 的向量搜索（需配置 OPENAI_API_KEY 和 Atlas Vector Search 索引）
- 未配置时自动降级为正则文本搜索
- 支持按范围筛选（角色/世界观/草稿/章节）

### Embedding 管线
- 文档创建/更新时自动入队生成 embedding（去抖 3 秒）
- 长文档自动分块（chunk=1000, overlap=200）
- 变更检测：embeddingText 未变化则跳过
- 支持全量重建索引

## 开发命令

```bash
pnpm dev:all        # 同时启动 server + web
pnpm dev:server     # 仅启动后端
pnpm dev:web        # 仅启动前端
pnpm build          # 构建所有包
```

## Atlas Vector Search 索引配置

在 MongoDB Atlas 中为以下 collection 创建 vector search 索引（索引名 `vector_index`）：

- `characters` — path: `embedding`, dimensions: 1536, similarity: cosine
- `world_settings` — path: `embedding`, dimensions: 1536, similarity: cosine
- `drafts` — path: `embedding`, dimensions: 1536, similarity: cosine
- `chapters` — path: `embedding`, dimensions: 1536, similarity: cosine
- `embedding_chunks` — path: `embedding`, dimensions: 1536, similarity: cosine

每个索引添加 `projectId` 字段作为 filter。

## License

MIT

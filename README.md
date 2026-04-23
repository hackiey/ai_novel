<p align="center">
  <h1 align="center">AI Creator</h1>
  <p align="center">
    <sub>AI 驱动的长篇小说创作工作台 · 世界观管理 · 智能续写 · 多端协作</sub>
  </p>
</p>

<p align="center">
  <a href="./README.en.md">English</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" />
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/platform-Web%20%7C%20Mobile-blueviolet" alt="Platform" />
</p>

---

> **AI Creator** 内置一位真正理解你故事的 AI 写作搭档：通过工具按需查阅设定库与历史章节，从根上**克服 LLM 的失忆与前后不一致**，几十万字之后人物、伏笔、世界观依旧自洽。配套 **391+ 内置写作 Skill**（开篇钩子、反派塑造、爽点设计等网文方法论）按需调用——像一个经验丰富的编辑伙伴，而不是只会接话的聊天机器人。

---

## 核心特性

### 🔧 AI Agent 创作搭档

AI Creator 的核心是一个拥有丰富专用工具的 AI Agent。它不只是生成文字——它理解你的世界观、记住你的偏好、主动查阅已有设定，确保每一次创作都前后一致。

| 能力 | 说明 |
|------|------|
| **设定管理** | 通过对话创建、编辑、查询角色和世界观条目，支持重要性分级和多维度描写 |
| **智能续写** | 自动获取当前章节 + 前两章上下文，分析叙事风格，保持风格一致地续写，支持指定字数和剧情方向 |
| **语义搜索** | 向量语义匹配 + 正则回退，跨角色、世界观、草稿、章节全库检索 |
| **双层记忆** | 世界观级（跨小说共享）+ 小说级（单部作品）记忆，自动注入对话上下文 |
| **章节摘要** | 章节变更后自动生成摘要，参考前序 5 万字内容保持连贯，保留关键剧情细节 |
| **文件导入** | 上传 txt / md / docx / pdf，AI 自动分块提取人物、地点、势力等为结构化设定 |
| **Skill 调用** | 391+ 内置写作方法论（开篇钩子、反派塑造、爽点设计等），任务匹配时 AI 自动 invoke 拿到完整指导再执行 |
| **上下文压缩** | 对话过长时自动压缩历史，保留最近 2 轮完整对话 + AI 生成的高质量摘要 |
| **用量透明** | 每轮实时显示 Token 用量与费用，区分输入 / 输出 / 缓存 |

> **举个例子**：你说"帮我创建一个住在北城的铁匠，性格暴躁但心地善良"，AI 直接写入数据库。下次续写时，这个角色会被自动引用——不需要你反复提醒。

### 🎯 Skill 系统：可复用的写作方法论

Skill 是一段经过打磨的 prompt 模板，把"如何写好开篇钩子""如何设计反派""如何设计打脸爽点"这类网文方法论沉淀成可调用的指令。当任务匹配某个 Skill 时，AI 先 `invoke_skill` 拿到完整方法论，再按其步骤执行——比凭直觉答更靠谱。

| 能力 | 说明 |
|------|------|
| **内置库** | 已沉淀 **391+ 个内置 Skill**，覆盖情节、节奏、人物、世界观、文风、爽点、伏笔等维度 |
| **自定义启用** | 每个项目独立挑选启用哪些 Skill，避免 prompt 噪音 |
| **智能推荐** | 独立的推荐 agent 在每次主对话结束后异步运行，基于最近上下文匹配 3-8 个相关 Skill 弹出卡片，用户勾选即加 |
| **再次搜索** | 在 Skill 设置或 SKILLS 页面按描述触发推荐 agent 即时找 Skill |
| **从文档提取** | 上传网文论坛帖子/教程文档，专门的 skill-extract agent 自动识别可复用方法论并落库 |

> **设计要点**：主创作 agent 不带 `search_skills`/`propose_skills` 工具，避免它在创作中分心；推荐由独立 agent 单独完成，互不打扰。

### ✍️ 沉浸式写作体验

| 特性 | 说明 |
|------|------|
| **动态背景** | 全屏 WebGL 着色器——雨夜玻璃、星空动效 |
| **毛玻璃界面** | 半透明面板搭配动态背景，沉浸创作氛围 |
| **精选字体** | 霞鹜文楷、龙藏体、马善政楷书等 11 种中文 / 艺术字体，一键切换 |
| **浮动控制** | 章节导航、AI 聊天、主题切换，不打断写作心流 |
| **智能统计** | 中文自动显示「字」数，英文显示词数 |

### 📱 多端同步

- **Web 端** —— 左侧编辑器 + 右侧 AI 对话，双栏并行的完整工作台
- **移动端** —— Expo 原生应用，章节编辑 + AI 对话 + 设定管理。外出记录灵感，回来无缝继续

### 🤖 灵活的模型接入

支持 OpenAI、Anthropic、Google 等多家模型供应商。可配置模型列表、默认模型和推理强度级别，不同用户组可设置不同的模型权限。

---

## 工作原理

```
世界观 → 小说 → 章节
  │         │       │
  │         │       └─ 编辑器实时编辑 + AI 续写追加
  │         └─ 有序章节列表，AI 自动生成摘要
  └─ 角色 / 世界观设定 / 草稿 / 记忆
       ↕
    AI Agent（语义搜索 · 设定管理 · 续写 · 记忆）
       ↕
    多模型供应商（OpenAI / Anthropic / Google / ...）
```

**数据层级**：一个世界观下挂载多部小说，每部小说包含有序章节。角色、世界观设定、草稿和记忆归属于世界观层，跨小说共享。

**Agent 工作流**：每次对话时，Agent 自动加载世界观概览（角色 + 设定摘要）、当前章节列表、用户记忆作为上下文，然后根据用户指令调用相应工具完成任务。

**流式响应**：所有 Agent 输出通过 SSE 流式返回，前端实时渲染文字、工具调用状态和结果。

---

## 在线体验

不想自己部署？可以直接访问我搭建好的公共实例：

**👉 [https://words.toagi.life](https://words.toagi.life)**

- 需要自行配置 API Key（支持 OpenAI / Anthropic / OpenRouter / 任意 OpenAI 兼容服务）
- 你的 API Key 仅用于代理请求，**不会被服务端保存**
- 小说内容、角色设定等数据存储在服务器上
- 本实例为个人业余维护，服务可能不稳定，不保证数据持久性
- 如需稳定使用，建议自行部署

---

## 快速开始

### 环境要求

- Node.js >= 20、pnpm >= 9、MongoDB

### 安装与运行

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
# 编辑 .env，填写 MONGODB_URI、JWT_SECRET 和至少一个 LLM API Key

pnpm build        # 首次运行前构建
pnpm dev:all      # 启动后端 (3001) + Web (5173)
```

```bash
# 移动端
pnpm --filter @ai-creator/mobile dev
```

### 环境变量

在 `apps/server/.env` 中配置：

| 变量 | 说明 |
|------|------|
| `MONGODB_URI` | MongoDB 连接字符串（必填） |
| `JWT_SECRET` | JWT 签名密钥（必填） |
| `LLM_API_KEY` | 通用 API Key，或 `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY`（至少填一个） |
| `AVAILABLE_MODELS` | 可选模型列表，格式 `provider:modelId`，逗号分隔 |
| `DEFAULT_MODEL` | 默认模型，格式 `provider:modelId` |
| `EMBEDDING_*` | Embedding 服务配置（可选，启用语义搜索） |

---

## Roadmap

- [x] AI Agent 辅助创作（设定管理、智能续写、语义搜索、记忆系统、文件导入）
- [x] 沉浸式多端写作体验（Web / Mobile）
- [x] **Skill 系统** —— 391+ 内置 Skill，按项目自定义启用，独立推荐 agent 自动匹配相关 Skill，主 agent 创作时按需 invoke
- [ ] **自动化写作流水线** —— AI 按大纲自动生成章节初稿 → 自我审核（一致性、逻辑、风格）→ 自动修改 → 人工终审，实现"挂机写小说"
- [ ] **交互式小说体验** —— 读者进入一个完整的世界观，以角色身份沉浸其中，与世界中的人物对话、做出选择、推动剧情发展，获得个人化的故事体验

---

## 开源协议

MIT

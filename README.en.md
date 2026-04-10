<p align="center">
  <h1 align="center">AI Creator</h1>
  <p align="center">
    <sub>AI-Powered Novel Writing Studio · World Building · Intelligent Continuation · Multi-Platform</sub>
  </p>
</p>

<p align="center">
  <a href="./README.md">中文文档</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" />
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/platform-Web%20%7C%20Mobile-blueviolet" alt="Platform" />
</p>

---

> **AI Creator** is not just another "AI chat + editor." It ships with a purpose-built AI writing partner that manages your characters and settings, intelligently continues chapters, searches your creative knowledge base, and remembers your preferences — like an experienced co-editor, not a generic chatbot.

---

## Core Features

### 🔧 AI Agent Writing Partner

At the heart of AI Creator is an AI Agent with a rich set of specialized tools. It doesn't just generate text — it understands your world, remembers your preferences, and proactively consults existing lore to keep every piece of writing consistent.

| Capability | Description |
|------------|-------------|
| **Data Management** | Create, edit, and query characters and world settings through conversation, with importance levels and multi-dimensional profiles |
| **Smart Continuation** | Automatically retrieves current chapter + two preceding chapters, analyzes narrative style, continues with consistent voice; supports custom word count and plot direction |
| **Semantic Search** | Vector semantic matching + regex fallback, searching across characters, world settings, drafts, and chapters |
| **Dual-Layer Memory** | World-level (shared across novels) + project-level (single novel) memory, automatically injected into context |
| **Chapter Synopsis** | Auto-generates summaries after chapter changes, referencing up to 50K words of preceding content for continuity |
| **File Import** | Upload txt / md / docx / pdf; AI chunks and extracts characters, locations, factions into structured data |
| **Context Compaction** | Auto-compresses history when context grows long, preserving last 2 turns + AI-generated high-quality summary |
| **Usage Transparency** | Real-time token usage and cost per turn, broken down by input / output / cache |

> **Example**: Say "create a hot-tempered but kind-hearted blacksmith living in the northern city" and the AI writes it to the database. Next time it continues a chapter, this character is automatically referenced — no need to remind it.

### ✍️ Immersive Writing Experience

| Feature | Description |
|---------|-------------|
| **Dynamic Backgrounds** | Full-screen WebGL shaders — rain on glass, starfield animations |
| **Glassmorphism UI** | Translucent panels over animated backgrounds for a distraction-free space |
| **Curated Fonts** | 11 Chinese/artistic typefaces including LXGW WenKai, Long Cang, Ma Shan Zheng, one-click switching |
| **Floating Controls** | Chapter navigation, AI chat, theme switching without breaking flow |
| **Smart Stats** | Auto character count for Chinese, word count for English |

### 📱 Multi-Platform Sync

- **Web** — Side-by-side editor + AI chat, the full writing workspace
- **Mobile** — Native Expo app with chapter editing, AI chat, and data management. Capture ideas on the go, continue seamlessly at your desk

### 🤖 Flexible Model Support

Connect to OpenAI, Anthropic, Google, and other providers. Configure available models, defaults, and reasoning intensity levels, with per-group model permissions for team setups.

---

## How It Works

```
World → Novel → Chapter
  │       │       │
  │       │       └─ Real-time editing + AI continuation appended to editor
  │       └─ Ordered chapter list, AI auto-generates synopses
  └─ Characters / World Settings / Drafts / Memory
       ↕
    AI Agent (semantic search · data management · continuation · memory)
       ↕
    Multi-Provider LLM (OpenAI / Anthropic / Google / ...)
```

**Data Hierarchy**: A world contains multiple novels, each with ordered chapters. Characters, world settings, drafts, and memory belong to the world level, shared across novels.

**Agent Workflow**: On each conversation turn, the Agent automatically loads the world overview (character + setting summaries), current chapter list, and user memory as context, then invokes the appropriate tools based on user instructions.

**Streaming**: All Agent output is streamed via SSE — the frontend renders text, tool call status, and results in real time.

---

## Try It Online

Don't want to self-host? Try the public instance I maintain:

**👉 [https://words.toagi.life](https://words.toagi.life)**

- You need to configure your own API Key (supports OpenAI / Anthropic / OpenRouter / any OpenAI-compatible service)
- Your API Key is only used to proxy requests and is **never stored on the server**
- Novel content, character settings, and other data are stored on the server
- This instance is maintained as a personal side project — service may be unstable, and data persistence is not guaranteed
- For production use, self-hosting is recommended

---

## Quick Start

### Requirements

- Node.js >= 20, pnpm >= 9, MongoDB

### Install & Run

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
# Edit .env: set MONGODB_URI, JWT_SECRET, and at least one LLM API key

pnpm build        # Build once before first run
pnpm dev:all      # Start backend (3001) + web app (5173)
```

```bash
# Mobile
pnpm --filter @ai-creator/mobile dev
```

### Environment Variables

Configure in `apps/server/.env`:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string (required) |
| `JWT_SECRET` | JWT signing secret (required) |
| `LLM_API_KEY` | Generic API key, or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` (at least one required) |
| `AVAILABLE_MODELS` | Allowed models, format `provider:modelId`, comma-separated |
| `DEFAULT_MODEL` | Default model, format `provider:modelId` |
| `EMBEDDING_*` | Embedding service config (optional, enables semantic search) |

---

## Roadmap

- [x] AI Agent-assisted writing (data management, smart continuation, semantic search, memory, file import)
- [x] Immersive multi-platform writing experience (Web / Mobile)
- [ ] **Automated Writing Pipeline** — AI generates chapter drafts from outlines → self-reviews for consistency, logic, and style → auto-revises → human final review. Hands-free novel production.
- [ ] **Interactive Fiction Experience** — Readers step into a fully realized world as a character, converse with inhabitants, make choices, and drive the plot forward for a personalized story experience.

---

## License

MIT

# AI Creator — Your AI-Powered Novel Writing Studio

[中文文档](./README.md)

> Build worlds, manage characters, and write long-form fiction with an AI that understands your story.
> Available on Web, Desktop, and Mobile — write anywhere, anytime.

---

## Why AI Creator?

### World-Driven Writing

Stop staring at a blank document. AI Creator organizes your work as **World → Novel → Chapter** — build your world, populate it with characters and settings, then tell your stories within a fully fleshed-out universe. Multiple novels can share the same world, keeping your characters and lore consistent across stories.

### An AI That Knows Your Story

The built-in AI Agent comes with 18 specialized tools — it's far more than a chatbot:

- **Continue chapters**: Generate the next passage based on existing plot and character traits.
- **Manage story data**: Create, edit, and query characters and world settings through conversation.
- **Semantic search**: Intelligently search across your entire knowledge base — "What's the name of that blacksmith in the northern city?"
- **Memory system**: The AI remembers key discussion points and maintains context across conversations.
- **Chapter synopsis**: Auto-generate chapter summaries to help you track plot threads.
- **Import files**: Upload `.txt`, `.md`, `.docx`, or `.pdf` reference material and let the AI extract characters, locations, and factions into structured data.

### Immersive Writing Experience

Novel writing demands atmosphere. AI Creator delivers:

- **Dynamic backgrounds**: Full-screen WebGL shader effects — rain on glass and starfield animations.
- **Glassmorphism UI**: Translucent panels layered over animated backgrounds for a distraction-free creative space.
- **11 curated fonts**: LXGW WenKai, Long Cang, Ma Shan Zheng, and more Chinese/artistic typefaces, all open-source.
- **Floating controls**: Chapter navigation, AI chat toggle, and theme switching — never break your writing flow.
- **Smart word count**: Automatically shows character count for Chinese text and word count for English.

### Write Anywhere

- **Web**: Full writing workspace with side-by-side editor and AI chat.
- **Desktop**: Standalone Electron app for focused, immersive sessions.
- **Mobile**: Native Expo app with chapter editing, AI chat, and story data management. Capture ideas on your phone, continue seamlessly on your computer.

### Structured Story Knowledge Base

- Every character and world-setting entry has an **importance level** (core / major / minor) and a **summary** field.
- A drafts notebook for loose ideas, outlines, and reference notes.
- All data is isolated per user — your creative universe belongs to you alone.

### Flexible Model Support

Connect to OpenAI, Anthropic, Google, and other LLM providers. Admins can configure available model lists and defaults, with per-group model permissions for team setups.

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

Mobile and Desktop:

```bash
# Desktop
pnpm dev:web && pnpm --filter @ai-creator/desktop dev

# Mobile
pnpm --filter @ai-creator/mobile dev
```

### Environment Variables

Configure in `apps/server/.env`:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string (required) |
| `JWT_SECRET` | JWT signing secret (required) |
| `LLM_API_KEY` | Generic LLM API key, or use `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` (at least one required) |
| `AVAILABLE_MODELS` | Allowed models, format `provider:modelId`, comma-separated |
| `DEFAULT_MODEL` | Default model, format `provider:modelId` |
| `EMBEDDING_*` | Embedding service config (optional, enables semantic search) |

---

## License

MIT

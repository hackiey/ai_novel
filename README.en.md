# AI Creator — Your AI-Powered Novel Writing Studio

[中文文档](./README.md)

> Not just another "AI chat + editor."
> AI Creator ships with a purpose-built AI writing partner that manages your characters and settings, continues chapters, imports reference material, and searches your creative knowledge base — like an experienced co-editor, not a generic chatbot.

---

## Core: Your AI Writing Partner

At the heart of AI Creator is an AI Agent with **18 specialized tools**. It doesn't just generate text — it understands your world, remembers your preferences, and proactively consults existing lore to keep every piece of writing consistent.

### Character & World Management

Operate your creative database through conversation:

- **Create / edit / delete characters** — multi-dimensional profiles covering appearance, personality, background, goals, and relationships, organized by importance (core / major / minor).
- **Create / edit / delete world settings** — geography, history, magic systems, politics, technology, culture, factions — clearly categorized and easily searchable.
- **Create / edit / delete drafts** — idea fragments, outline notes, reference material, with links to specific characters or settings.

> Say "create a hot-tempered but kind-hearted blacksmith living in the northern city" and the AI writes it to your database — automatically referenced the next time it continues a chapter.

### Intelligent Continuation

Far more than "keep writing":

- **Context-aware** — automatically retrieves the current chapter plus the two preceding chapters before continuing.
- **Stylistically consistent** — analyzes existing narrative voice, word choice, and pacing to match your style.
- **Steerable** — specify word count targets, plot direction, and special instructions.
- **Seamless insertion** — generated text appends directly into the editor, WYSIWYG.

### Semantic Search

Intelligent retrieval across your entire creative knowledge base:

- Searches across characters, world settings, drafts, and chapters.
- Vector-based semantic matching (with optional Embedding service) with regex fallback.
- "What was the general's name who clashed with the protagonist in chapter three?" — the AI searches and tells you.

### Dual-Layer Memory

The AI doesn't forget between conversations:

- **World-level memory** — preferences and rules shared across all novels (e.g., "no firearms exist in this world").
- **Project-level memory** — instructions specific to a single novel (e.g., "the protagonist's narration is always first-person").
- Memory is automatically injected into every conversation context, and can be manually edited in the UI.

### Auto-Generated Chapter Synopses

- Chapter content changes automatically trigger synopsis regeneration in the background.
- Synopsis generation references preceding chapters (up to 50K words of full text + historical summaries) for plot continuity.
- Generated summaries preserve character names, goals, conflicts, turning points, and key reveals — essential for tracking long-form plot threads.

### File Import & Knowledge Extraction

Turn existing reference material into structured creative data:

- Supports `.txt`, `.md`, `.docx`, and `.pdf` formats.
- Large files are automatically chunked; the AI extracts characters, locations, and factions chunk by chunk.
- Automatic deduplication via semantic search against existing entries.
- Real-time streaming progress with resumable uploads.

### Conversation Compaction

Long creative sessions without context overflow:

- Automatically compresses conversation history when approaching the model's context window limit.
- Preserves the last 2 complete turns; earlier history is replaced with AI-generated summaries.
- Summaries retain: working goals, key constraints, completed work, pending issues, referenced characters and settings — no important context is lost.

### Usage Transparency

- Real-time token usage and cost display per turn.
- Breakdown of input / output / cache read / cache write for clear cost tracking.

---

## Immersive Writing Experience

Novel writing demands atmosphere:

- **Dynamic backgrounds** — full-screen WebGL shader effects: rain on glass and starfield animations.
- **Glassmorphism UI** — translucent panels over animated backgrounds for a distraction-free creative space.
- **11 curated fonts** — LXGW WenKai, Long Cang, Ma Shan Zheng, and more, all open-source.
- **Floating controls** — chapter navigation, AI chat toggle, and theme switching without breaking your flow.
- **Smart word count** — automatically shows character count for Chinese and word count for English.

## Write Anywhere

- **Web** — side-by-side editor and AI chat, the full writing workspace.
- **Desktop** — standalone Electron app for focused, immersive sessions.
- **Mobile** — native Expo app with chapter editing, AI chat, and story data management. Capture ideas on the go, continue seamlessly at your desk.

## Flexible Model Support

Connect to OpenAI, Anthropic, Google, and other providers. Configure available models, defaults, and reasoning intensity levels, with per-group model permissions for team setups.

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

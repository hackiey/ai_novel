# AI Novel — AI-Assisted Novel Studio

[中文文档](./README.zh-CN.md)

AI Novel is a cross-platform writing studio for long-form fiction. It organizes work as `World -> Novel (Project) -> Chapter`, with a web editor/chat workspace, a mobile companion, and an Electron desktop shell. The built-in AI agent can manage story data, continue chapters, import reference files, and search across your world knowledge.

## Highlights

- World-first workflow: create a world, attach one or more novels to it, then write chapter by chapter.
- Structured story data: manage characters, world settings, and loose drafts with summaries and importance levels.
- Immersive writing workspace: full-screen WebGL shader backgrounds (rain / starfield), glassmorphism panels, floating controls, and 11 Chinese font choices.
- Agent automation: 18 built-in tools for CRUD, semantic search, memory, synopsis generation, and continuation.
- Import pipeline: upload `.txt`, `.md`, `.docx`, or `.pdf` files and let the agent extract structured knowledge into a world.
- Multi-platform access: web, Electron desktop, and Expo mobile clients share the same backend and types.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Monorepo | Turborepo + pnpm workspaces |
| Web | React 19 + Vite + Tailwind CSS v4 + TanStack Router / Query |
| Mobile | Expo Router + React Native + TanStack Query |
| Desktop | Electron |
| Editor | TipTap rich text editor with auto-save, CJK-aware word/char counting |
| Shader | WebGL2 full-screen fragment shaders (rain on glass, starfield) |
| Fonts | LXGW WenKai, Long Cang, Ma Shan Zheng, ZCOOL XiaoWei, Xiaolai SC, and more (all SIL OFL) |
| Backend | Fastify + tRPC v11 |
| Database | MongoDB native driver |
| AI Agent | Multi-provider LLM (OpenAI, Anthropic, Google, etc.) via pi-ai + pi-agent-core |
| Embeddings | OpenAI-compatible embedding service (configurable model / dimensions) |
| Shared Types | Zod schemas in `packages/types` |

## Repository Layout

```text
ai_novel/
├── apps/
│   ├── server/     # Fastify + tRPC backend, SSE routes, auth, embeddings
│   ├── web/        # React web app, main writing workspace
│   ├── desktop/    # Electron shell for the web app
│   └── mobile/     # Expo mobile app
└── packages/
    ├── agent/      # NovelAgentSession, i18n prompts, MCP tools
    ├── core/       # Embedding service and chunking utilities
    ├── editor/     # Reusable TipTap-based editor package
    └── types/      # Shared Zod schemas and TypeScript types
```

## Quick Start

### Requirements

- Node.js >= 20
- pnpm >= 9
- MongoDB (local or Atlas)

### Install and Run

```bash
pnpm install
cp apps/server/.env.example apps/server/.env

# Build all workspaces once before the first dev run
pnpm build

# Start backend (3001) and web app (5173)
pnpm dev:all
```

Open:

- Web: `http://localhost:5173`
- API: `http://localhost:3001`
- Health check: `http://localhost:3001/health`

### Required Environment Variables

Set these in `apps/server/.env`:

- `MONGODB_URI`
- `JWT_SECRET`
- At least one LLM API key: `LLM_API_KEY` (generic fallback), or provider-specific: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`

Useful optional variables:

- `AVAILABLE_MODELS` — comma-separated list in `provider:modelId` format (e.g. `openai:gpt-4o,anthropic:claude-sonnet-4-6`)
- `DEFAULT_MODEL` — default model in `provider:modelId` format
- `DEFAULT_REASONING` — reasoning level: `minimal`, `low`, `medium`, `high`, `xhigh`
- `EMBEDDING_API_KEY`, `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`
- `PORT`
- `JWT_EXPIRES_IN`

### Desktop and Mobile

```bash
# Desktop: start the web dev server first, then Electron
pnpm dev:web
pnpm --filter @ai-novel/desktop dev

# Mobile: start Expo
pnpm --filter @ai-novel/mobile dev
```

## Core Flows

### World Workspace

- Create worlds, add descriptions, and keep each story universe isolated per user.
- Inside a world, manage characters, world settings, and drafts.
- Use semantic or regex search across the active tab from the world page.

### Writing Workspace

- Each world can contain multiple novels/projects.
- Each novel contains ordered chapters edited in the main writing view.
- The editor auto-saves with a debounce and preserves unsaved content while requests are in flight.
- AI continuation can append generated text directly into the active chapter.
- Immersive mode: full-screen WebGL2 shader backgrounds (rain on glass / starfield) with glassmorphism UI panels.
- Floating control bar at the bottom for chapter list, AI chat toggle, and theme switching.
- 11 built-in Chinese/artistic fonts selectable from the editor toolbar, all open-source (SIL OFL).
- CJK-aware statistics: automatically shows character count (字) for Chinese text and word count for English.

### Agent and Streaming

- `POST /api/agent/chat` streams agent events over SSE.
- Session history is stored in MongoDB and reused per `sessionId`.
- Agent memory is stored per world, and world summaries are rebuilt per locale when stale.
- Model access can be restricted by permission groups.

### File Import

- `POST /api/world/import-file` accepts `.txt`, `.md`, `.docx`, and `.pdf` uploads.
- Large files are chunked, then each chunk is processed by the agent with streaming progress events.
- Import is designed to turn reference material into structured world data instead of plain text dumps.

### Authentication and Admin

- JWT-based login and registration for web and mobile.
- Admin page for user roles and permission-group management.
- Permission groups can limit which LLM models a user may select.

### Localization

- Web supports Chinese and English via `i18next`.
- Agent prompts, tool descriptions, and world summaries are locale-aware.
- Mobile ships with Simplified Chinese strings.

## Development

```bash
pnpm dev:all
pnpm dev:server
pnpm dev:web
pnpm build
```

There is no dedicated automated test suite yet. Use `pnpm build` to verify TypeScript and package builds.

## Atlas Vector Search

If you enable embedding-based search, create a `vector_index` on the `embedding` field for these collections:

- `characters`
- `world_settings`
- `drafts`
- `chapters`
- `embedding_chunks`

Set the index dimensions to match `EMBEDDING_DIMENSIONS` (or your embedding provider's default). If you rely on metadata filters, include the ownership field used by that collection, typically `worldId` or `projectId`.

## License

MIT

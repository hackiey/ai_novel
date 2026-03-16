# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages (required before first dev run)
pnpm dev:all          # Start server (3001) + web (5173) concurrently
pnpm dev:server       # Backend only
pnpm dev:web          # Frontend only
```

No test suite is configured. Verify changes by running `pnpm build` and checking for TypeScript errors.

## Architecture

Turborepo + pnpm workspaces monorepo. Four apps, four shared packages.

**Apps:**
- `apps/server` — Fastify + tRPC v11 backend (port 3001). MongoDB native driver. REST endpoint `POST /api/agent/chat` streams agent responses via SSE.
- `apps/web` — React 19 + Vite + TailwindCSS v4 SPA. TanStack Router (file-based) + TanStack Query. Main page is WritePage: two-panel layout with editor (left) and AI chat (right).
- `apps/desktop` — Electron wrapper loading the web app.
- `apps/mobile` — Expo 52 + React Native + NativeWind.

**Packages:**
- `packages/types` — Zod schemas defining all domain models (Project, Character, World, WorldSetting, Draft, Chapter, AgentSession, AgentMessage). Single source of truth for types used by both server and clients.
- `packages/agent` — `NovelAgentSession` class using Anthropic Claude Agent SDK. Defines 24 MCP tools for character/world/chapter/draft CRUD + semantic_search + memory. Streams events via AsyncGenerator.
- `packages/editor` — `NovelEditor` TipTap rich text component with auto-save (2s debounce), word/character counting, CJK support.
- `packages/core` — `EmbeddingService` wrapping OpenAI `text-embedding-3-small` (1536 dims). Handles text chunking (1000 chars, 200 overlap) with CJK-aware token estimation.

## Key Patterns

- **End-to-end type safety**: tRPC routers in `apps/server/src/routers/` share types with the frontend via `packages/types`.
- **Agent tool loop**: The agent runs up to 20 tool-use turns per request. Tools are defined as MCP tools in `packages/agent/src/tools/`.
- **Embedding pipeline**: Server-side `EmbeddingService` (in `apps/server/src/services/`) auto-generates embeddings on document create/update with 3s debounce queue and change detection.
- **Vector search fallback**: If OpenAI embedding is unavailable, search falls back to regex matching.
- **Content caching**: WritePage uses `useRef` contentCache to prevent losing edits during concurrent saves.

## Environment Variables (apps/server/.env)

Required: `MONGODB_URI`, `ANTHROPIC_API_KEY`
Optional: `OPENAI_API_KEY` (embeddings), `ANTHROPIC_BASE_URL`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `AVAILABLE_MODELS`, `DEFAULT_MODEL`, `PORT`

## Language

README and UI text are in Chinese (简体中文). Code, comments, and variable names are in English.

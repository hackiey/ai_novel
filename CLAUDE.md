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
- `apps/server` — Fastify + tRPC v11 backend (port 3001). MongoDB native driver. REST endpoint `POST /api/agent/chat` streams agent responses via SSE. JWT auth with permission groups.
- `apps/web` — React 19 + Vite + TailwindCSS v4 SPA. TanStack Router (file-based) + TanStack Query. Main page is WritePage: two-panel layout with editor (left) and AI chat (right).
- `apps/desktop` — Electron wrapper loading the web app.
- `apps/mobile` — Expo 52 + React Native + NativeWind. Expo Router (file-based). tRPC client + TanStack Query. i18next for i18n (zh-CN). Auth via AsyncStorage JWT tokens.

**Packages:**
- `packages/types` — Zod schemas defining all domain models (World, Character, WorldSetting, Draft, Chapter, AgentSession, AgentMessage). Single source of truth for types used by both server and clients. Character and WorldSetting have `importance` (core/major/minor) and `summary` fields.
- `packages/agent` — `NovelAgentSession` class using Anthropic Claude Agent SDK. Defines 24 MCP tools for character/world/chapter/draft CRUD + semantic_search + memory. Streams events via AsyncGenerator. Supports locale-aware system prompts and tool descriptions (zh/en).
- `packages/editor` — `NovelEditor` TipTap rich text component with auto-save (2s debounce), word/character counting, CJK support.
- `packages/core` — `EmbeddingService` wrapping OpenAI-compatible embedding API (configurable model/dimensions). Handles text chunking (1000 chars, 200 overlap) with CJK-aware token estimation.

## Mobile App Structure

Expo Router file-based routing:
- `app/(auth)/` — Login and register screens.
- `app/(tabs)/` — Tab layout: Home (world list) + Settings (server URL, user info, logout).
- `app/world/[worldId].tsx` — World detail with tabs: Characters, WorldSettings, Drafts.
- `app/chat/[worldId].tsx` — AI chat with SSE streaming, tool call display, message history modal.
- `components/` — CharactersTab, DraftsTab, WorldSettingsTab, ToolCallBlock.
- `contexts/AuthContext.tsx` — Auth state management (login/register/logout).
- `lib/` — trpc client, auth token management, useAgentChat hook, theme, config.
- `i18n/` — i18next config with zh-CN locale.

## Key Patterns

- **End-to-end type safety**: tRPC routers in `apps/server/src/routers/` share types with the frontend via `packages/types`.
- **Agent tool loop**: The agent runs up to 20 tool-use turns per request. Tools are defined as MCP tools in `packages/agent/src/tools/`.
- **Locale flow**: Client sends `locale` in `/api/agent/chat` request → server resolves to `"zh"` or `"en"` → world summary, system prompt, and tool descriptions are all locale-aware via `packages/agent/src/i18n.ts`.
- **World summary caching**: Raw summary data (characters/settings) is cached on the World document. Formatted text is rebuilt per locale on demand. `world.summaryStale` flag triggers re-query on next access.
- **Embedding pipeline**: Server-side `EmbeddingService` (in `apps/server/src/services/`) auto-generates embeddings on document create/update with 3s debounce queue and change detection. Falls back to regex matching if unavailable.
- **Content caching**: WritePage uses `useRef` contentCache to prevent losing edits during concurrent saves.
- **Data access control**: All queries filter by `userIdFilter(ctx.user.userId)` for tenant isolation. Permission groups can restrict allowed models.

## Environment Variables (apps/server/.env)

Required: `MONGODB_URI`, `ANTHROPIC_API_KEY`, `JWT_SECRET`
Optional: `OPENAI_API_KEY`, `ANTHROPIC_BASE_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `AVAILABLE_MODELS`, `DEFAULT_MODEL`, `PORT`, `JWT_EXPIRES_IN`

## Language

README and UI text are in Chinese (简体中文). Code, comments, and variable names are in English.

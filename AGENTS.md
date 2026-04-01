# AGENTS.md

This file provides guidance to coding agents working in this repository.

## Build & Dev Commands

```bash
pnpm install                          # Install all dependencies
pnpm build                            # Build all workspaces / check TypeScript
pnpm dev:all                          # Start server (3001) + web (5173)
pnpm dev:server                       # Backend only
pnpm dev:web                          # Web only
pnpm --filter @ai-creator/mobile dev  # Expo mobile app
pnpm --filter @ai-creator/desktop dev # Electron shell (start web first)
```

No dedicated automated test suite is configured. Validate changes with `pnpm build`.
`apps/mobile` and `apps/desktop` currently have placeholder `build` scripts, so `pnpm build` is mainly useful as a TypeScript/package build check for the server, web app, and shared packages.

## Architecture

Turborepo + pnpm workspaces monorepo. Four apps and four shared packages.

Core content hierarchy: `World -> Project (Novel) -> Chapter`.
Characters and world settings live at the world level. Drafts can belong to either a world or a project.

**Apps:**
- `apps/server` — Fastify + tRPC v11 backend with MongoDB native driver. Registers `/trpc`, `POST /api/agent/chat` for SSE streaming, `POST /api/world/import-file` plus `DELETE /api/world/import-file/:fileHash` for resumable file import, and `/health`. JWT auth and permission groups control access.
- `apps/web` — React 19 + Vite + TailwindCSS v4 SPA. Uses TanStack Router with an explicit route tree in `src/router.tsx`, TanStack Query, and `i18next` (`zh-CN` + `en`). Main routes cover auth, home, world workspace, immersive writing, and admin.
- `apps/desktop` — Electron shell that loads the web app.
- `apps/mobile` — Expo 54 + React Native 0.81 + Expo Router. Uses tRPC + TanStack Query, AsyncStorage-backed auth/config/theme state, StyleSheet-based UI, markdown rendering for assistant output, and themed rain/starfield backgrounds.

**Packages:**
- `packages/types` — Shared Zod schemas for users, permission groups, worlds, projects, characters, world settings, drafts, chapters, file imports, agent sessions, and search results.
- `packages/agent` — `CreatorAgentSession` built on `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core`. Exposes 19 tools across semantic search, CRUD, continuation, synopsis generation, and world/project memory. Supports locale-aware prompts/tool descriptions and model specs in `provider:modelId[/reasoning]` format.
- `packages/editor` — Reusable `CreatorEditor` TipTap package for the web writer. Includes 2s auto-save debounce, append/delete hooks, font controls, immersive mode, and CJK-aware stats.
- `packages/core` — OpenAI-compatible embedding wrapper and chunking utilities. Default chunking is 1000 characters with 200-character overlap.

## Web App Structure

- `src/router.tsx` — Route tree, auth gate, global shell, theme switching, and breadcrumb/immersive state wiring.
- `src/pages/HomePage.tsx` — World list and entry point after login.
- `src/pages/WorldPage.tsx` — World workspace with project strip, semantic search, character/world-setting/draft tabs, import dialog, and inline AI chat.
- `src/pages/WritePage.tsx` — Immersive project writer with `CreatorEditor`, chapter selection, diff review for conflicting edits, and floating chat/theme controls.
- `src/pages/AdminPage.tsx` — Admin-only permission-group management and user role assignment.
- `src/components/FileImportDialog.tsx` — Web UI for streaming file import progress and chunk-level tool activity.
- `src/contexts/WriteThemeContext.tsx` — Shared immersive theme/font state for the writing experience.

## Mobile App Structure

Expo Router file-based routing:
- `app/_layout.tsx` — Providers, auth guard, tRPC client wiring, theme provider, and app-level stack configuration.
- `app/(auth)/` — Login and register screens.
- `app/(tabs)/` — Home (world list) and Settings (server URL, theme, user info, logout).
- `app/world/[worldId].tsx` — World detail with project strip, search, and tabs for characters, world settings, and drafts.
- `app/project/[projectId].tsx` — Block-based mobile chapter editor with inline markdown formatting, font selection, stats, and auto-save.
- `app/chat/[worldId].tsx` — AI chat screen with streaming messages, tool-call display, session history, model picker, and memory editor.
- `components/backgrounds/` — Rain/starfield visual backgrounds driven by theme selection.
- `contexts/ThemeContext.tsx` — Mobile theme + font persistence.
- `lib/useAgentChat.ts` — React Native SSE client built on `XMLHttpRequest` because RN `fetch` does not expose a readable stream.

## Key Patterns

- **End-to-end type safety**: tRPC routers in `apps/server/src/routers/` share Zod-backed types from `packages/types` with the clients.
- **Model access control**: Available models come from `AVAILABLE_MODELS`, are filtered by permission groups, and may include optional reasoning suffixes like `openai:gpt-5.4/medium`.
- **Agent streaming + persistence**: `/api/agent/chat` streams incremental text/tool events over SSE while persisting `agent_sessions` and `agent_messages` in MongoDB.
- **Locale flow**: Web can run in Chinese or English, mobile currently ships Simplified Chinese only, and the server resolves client locales to `zh` or `en` for prompts/tool descriptions/world summaries.
- **World summary caching**: Raw summary data is cached on the world document and rebuilt per locale when `summaryStale` is set.
- **Embedding/search pipeline**: `apps/server/src/services/embeddingService.ts` debounces document re-embedding, stores chunk embeddings in `embedding_chunks`, and falls back to regex search when embeddings are unavailable.
- **File import pipeline**: The import route accepts `.txt`, `.md`, `.docx`, and `.pdf`, chunks text with CJK-aware limits, resumes by file hash, and streams chunk-level agent activity back to the client.
- **Write-page safety**: `apps/web/src/pages/WritePage.tsx` uses an in-memory `contentCache` to avoid losing unsaved edits during auto-save and concurrent refetches.
- **Tenant isolation**: Server queries consistently scope data by `userId`, with admin-only flows layered on top for role and permission-group management.

## Environment Variables (apps/server/.env)

Required:
- `MONGODB_URI`
- `JWT_SECRET`
- At least one LLM API key

LLM/model config:
- `LLM_API_KEY` generic fallback
- Provider-specific keys like `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, or other `<PROVIDER>_API_KEY`
- Optional provider overrides via `<PROVIDER>_BASE_URL`
- `AVAILABLE_MODELS`, `DEFAULT_MODEL`, `DEFAULT_REASONING`
- Model format: `provider:modelId[/reasoning]`

Embedding config:
- `EMBEDDING_API_KEY`, `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`

Import tuning:
- `IMPORT_CHUNK_SIZE_CHARS`, `IMPORT_CHUNK_SIZE_WORDS`

Misc:
- `PORT`, `JWT_EXPIRES_IN`

## Language

README and most UI copy are in Chinese (Simplified). Web also ships English translations, while mobile currently ships `zh-CN` only. Code, comments, and variable names are in English.

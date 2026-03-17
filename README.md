# AI Novel — AI-Powered Novel Writing App

[中文文档](./README.zh-CN.md)

A cross-platform AI-assisted novel writing tool. The core interaction model is a **writing editor + AI chat panel** two-column layout, where users interact with an AI Agent through natural language to drive character management, world-building, continuation writing, semantic search, and more.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm workspaces |
| Frontend | React 19 + Vite + TailwindCSS v4 + TanStack Router / Query |
| Editor | TipTap (rich text, auto-save, AI continuation insertion) |
| Backend | Fastify + tRPC v11 (end-to-end type safety) |
| Database | MongoDB (native driver, Atlas Vector Search) |
| AI Agent | Anthropic Claude API + custom tool use loop (24 tools) |
| Embedding | OpenAI `text-embedding-3-small` (1536 dims) |
| Desktop | Electron |
| Mobile | Expo / React Native |

## Project Structure

```
ai_novel/
├── apps/
│   ├── server/          # Fastify + tRPC backend
│   ├── web/             # Vite + React frontend
│   ├── desktop/         # Electron desktop app
│   └── mobile/          # Expo mobile app
└── packages/
    ├── types/           # Zod schemas + TypeScript types
    ├── agent/           # AI Agent core (tool definitions + session management)
    ├── editor/          # TipTap rich text editor component
    └── core/            # Embedding utilities (OpenAI)
```

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- MongoDB (local or Atlas)

### Installation & Launch

```bash
# Install dependencies
pnpm install

# Configure environment variables
cp apps/server/.env.example apps/server/.env
# Edit .env and fill in:
#   MONGODB_URI      — MongoDB connection string
#   ANTHROPIC_API_KEY — Claude API key (Agent chat)
#   OPENAI_API_KEY    — OpenAI key (optional, for embedding semantic search)

# Build all packages
pnpm build

# Start backend + frontend concurrently
pnpm dev:all
```

After starting:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

### Desktop (Electron)

```bash
# Start web dev server first, then launch Electron
pnpm dev:web &
cd apps/desktop && pnpm dev
```

### Mobile (Expo)

```bash
cd apps/mobile && pnpm dev
```

## Features

### Project Management
Create novel projects with genre and target word count settings.

### Character Profiles
Manage character appearance, personality, background, goals, relationships, and more. Supports custom fields.

### World Settings
Organize world-building entries by category (geography, magic systems, history, etc.) with tag support.

### Chapter Management
Create chapters, reorder them, and track word count and status (draft / revision / final).

### Rich Text Editor
TipTap-based writing editor with:
- Formatting: bold, italic, underline, strikethrough, headings (H1-H3), lists, blockquotes
- Auto-save (2-second debounce)
- Automatic AI continuation insertion
- Real-time word/character count

### Draft Notes
Capture creative inspiration and draft ideas, linkable to characters and world-building entries.

### AI Agent Chat
Chat with the AI assistant in the right panel of the writing page. The Agent has 24 built-in tools:

| Category | Tool | Description |
|----------|------|-------------|
| Search | `semantic_search` | Semantic/keyword search across characters, world settings, drafts, chapters |
| Characters | `list_characters` / `get_character` | Query character information |
| | `create_character` / `update_character` | Create or modify characters |
| | `delete_character` | Delete a character |
| World | `list_world_settings` / `get_world_setting` | Query world settings |
| | `create_world_setting` / `update_world_setting` | Create or modify world settings |
| | `delete_world_setting` | Delete a world setting entry |
| Chapters | `list_chapters` / `get_chapter` | Query chapters |
| | `create_chapter` / `update_chapter` | Create or modify chapters |
| | `continue_writing` | AI continuation of chapter content |
| | `delete_chapter` | Delete a chapter |
| | `generate_synopsis` | Generate a chapter synopsis |
| Drafts | `get_draft` / `create_draft` | Query or create drafts |
| | `delete_draft` | Delete a draft |
| Memory | `get_memory` / `update_memory` | Read/save user preference memory |

The Agent automatically invokes tools to gather context, ensuring responses and continuations are consistent with existing settings. Continuation results are automatically synced to the left-side editor.

### Semantic Search
- Vector search powered by OpenAI embeddings (requires `OPENAI_API_KEY` and Atlas Vector Search index)
- Automatically falls back to regex text search when not configured
- Supports filtering by scope (characters / world settings / drafts / chapters)

### Embedding Pipeline
- Automatically queues embedding generation on document create/update (3-second debounce)
- Long documents are auto-chunked (chunk=1000, overlap=200)
- Change detection: skips if embeddingText is unchanged
- Supports full index rebuild

## Development Commands

```bash
pnpm dev:all        # Start server + web concurrently
pnpm dev:server     # Backend only
pnpm dev:web        # Frontend only
pnpm build          # Build all packages
```

## Atlas Vector Search Index Configuration

Create vector search indexes (index name: `vector_index`) for the following collections in MongoDB Atlas:

- `characters` — path: `embedding`, dimensions: 1536, similarity: cosine
- `world_settings` — path: `embedding`, dimensions: 1536, similarity: cosine
- `drafts` — path: `embedding`, dimensions: 1536, similarity: cosine
- `chapters` — path: `embedding`, dimensions: 1536, similarity: cosine
- `embedding_chunks` — path: `embedding`, dimensions: 1536, similarity: cosine

Add a `projectId` field as a filter for each index.

## License

MIT

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mini ChatGPT — a teaching project for an AI application development course. Fullstack Vue 3 + Express app that wraps the Anthropic Messages API into a chat interface with both simple chat and agent (tool-use) modes.

## Commands

```bash
# Development (runs both client and server concurrently)
npm run dev

# Client only (Vite dev server, port 5173 by default)
npm run dev:client

# Server only (Express via tsx watch, port from CHAT_API_PORT env)
npm run dev:server

# Type-check and build for production
npm run build

# Preview production build
npm run preview
```

No test framework is configured. No linter is configured.

## Architecture

Two separate processes in development, connected via Vite's proxy:

- **Client** (`src/`): Vue 3 SPA with Composition API, Tailwind CSS v4, TypeScript. Vite dev server proxies `/api/*` to the backend.
- **Server** (`server/`): Express 5 app using `tsx watch` for hot-reload. Calls Anthropic Messages API via `@anthropic-ai/sdk`.

### Server Structure

- `server/index.ts` — Express app with 4 endpoints: `POST /api/chat`, `POST /api/chat/stream`, `POST /api/agent`, `POST /api/agent/stream`. All stream endpoints use SSE.
- `server/config.ts` — Loads `.env` from both the repo root (`../../.env`) and local `.env`. Defines all config via `ModelConfig` interface.
- `server/model.ts` — Direct Anthropic SDK calls for plain chat (non-tool). Both one-shot and streaming.
- `server/agent/` — Agent loop with tool calling:
  - `types.ts` — `ToolDefinition`, `ToolCall`, `ToolResult`, `AgentStep`, `AgentStreamEvent` types
  - `registry.ts` — Tool registry (`Map<string, ToolDefinition>`). Registers default tools at import time.
  - `executor.ts` — Validates tool args via Zod, calls `tool.execute()`, wraps results in `ToolResult`
  - `runAgent.ts` — Multi-round agent loop (up to `AGENT_MAX_STEPS`). Both `runAgent()` (one-shot) and `streamAgent()` (async generator yielding thinking/step/delta/structured events).
- `server/tools/` — Tool implementations, each satisfying `ToolDefinition`:
  - `time.ts` — `get_current_time` using `Intl.DateTimeFormat`
  - `weather.ts` — `get_weather` via QWeather API (needs `QWEATHER_API_TOKEN`)
  - `news.ts` — `search_news` via BigModel/Zhipu web search API (needs `BIGMODEL_API_KEY`)
  - `http.ts` — Shared `fetchJson<T>()` helper

### Client Structure

- `src/composables/useChat.ts` — Central state management composable. Handles conversations (persisted to localStorage), SSE parsing, both chat and agent streaming modes. All components interact with chat state through this composable.
- `src/types/chat.ts` — Frontend types: `ChatMessage`, `ChatConversation`, `ChatMode` ("chat" | "agent"), agent step/thought types.
- `src/components/` — UI components:
  - `ChatShell.vue` — Layout shell, hosts sidebar + main area
  - `ConversationSidebar.vue` — Multi-conversation management
  - `MessageList.vue`, `ChatMessage.vue` — Message rendering with markdown
  - `ChatInput.vue` — Input with mode toggle (chat/agent)
  - `AgentTracePanel.vue` — Displays agent execution steps/thoughts
  - `SystemPromptDialog.vue` — Editable system prompt per conversation
- `src/utils/markdown.ts`, `format.ts` — Markdown rendering (markdown-it + highlight.js) and formatting utilities

### Key Design Patterns

- **Agent loop**: The server-side agent runs multi-round conversations with the model, feeding tool results back as `user` messages until the model stops requesting tools or hits `AGENT_MAX_STEPS`.
- **SSE streaming**: Both chat and agent modes stream via SSE with typed events (`delta`, `step`, `thinking`, `structured`, `done`, `error`). Client parses SSE manually from `ReadableStream`.
- **Tool schema pattern**: Each tool defines a Zod schema for validation alongside a plain JSON schema for the Anthropic API's `input_schema` field. The Zod schema is the source of truth at execution time.
- **Conversation persistence**: `useChat` composable reads/writes conversations to `localStorage` under key `mini-chatgpt.conversations.v1`.

## Environment Variables

Copy `.env.example` to `.env` and fill in values. Required: `ANTHROPIC_API_KEY`, `MODEL_ID`. Optional: `ANTHROPIC_BASE_URL` (for Anthropic-compatible API proxies), `QWEATHER_API_TOKEN`, `BIGMODEL_API_KEY`.

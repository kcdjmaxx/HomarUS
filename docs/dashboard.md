# Dashboard

The HomarUS dashboard is a single-page web application served by an Express + WebSocket backend. It provides real-time visibility into the agent's event loop, memory, channels, and installed apps.

**Default port:** `3120` (configurable via `config.json`)

## Architecture

```
Browser (React SPA)
    |  WebSocket (ws://host:3120)
Express Server (DashboardServer)
    |
HomarUS core (event loop, memory, channels, timers)
```

The backend lives in `src/dashboard-server.ts`. The frontend is a Vite-built React app under `dashboard/`. At startup, the compiled frontend is served as static files from `dashboard/dist/`.

### Two communication paths

| Path | Protocol | Purpose |
|------|----------|---------|
| REST API | HTTP | Status polling, tool calls, app data, config |
| WebSocket | WS | Real-time events, chat messages, search, status pushes |

## WebSocket protocol

Messages are JSON with a `type` and `payload`:

**Inbound (browser to server):**

| Type | Payload | Effect |
|------|---------|--------|
| `chat` | `{ text }` | Routes message through the dashboard channel adapter into the event loop |
| `search` | `{ query, limit? }` | Runs hybrid vector + FTS memory search, pushes `search_results` back |
| `status` | `{}` | Returns current system status (channels, queue, timers, memory) |
| `events` | `{}` | Returns recent event history |
| `agent-chat` | `{ text }` | Inter-agent chat message |

**Outbound (server to browser):**

| Type | Payload | Description |
|------|---------|-------------|
| `chat` | `{ from, text, timestamp }` | Chat message (from user or agent) |
| `event` | `{ id, type, source, timestamp, payload }` | Real-time event broadcast |
| `status` | Full status object | System status snapshot |
| `search_results` | `SearchResult[]` | Memory search results |
| `error` | `{ message }` | Error notification |
| `agent-chat` | `{ id, from, text, timestamp }` | Inter-agent message |

Every event that passes through the event loop is broadcast to all connected WebSocket clients via `broadcastEvent()`.

## REST API

Key endpoints exposed by the dashboard server:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | System status (loop state, channels, queue, compaction) |
| GET | `/api/events?limit=N` | Recent event history |
| POST | `/api/events` | Inject external event (requires `type`, `source`, `payload`) |
| GET | `/api/timers` | List all scheduled timers |
| GET | `/api/memory/stats` | Memory index statistics |
| GET | `/api/identity/soul` | Soul.md content (text/markdown) |
| GET | `/api/identity/user` | User.md content |
| GET | `/api/identity/state` | State.md content |
| GET | `/api/wait?timeout=N` | Long-poll for new events (used by MCP proxy) |
| GET | `/api/health` | Health check (`{ ok: true }`) |
| GET | `/api/tool-list` | List all registered MCP tools |
| POST | `/api/tool-call` | Execute MCP tool (`{ name, args }`) |
| GET | `/api/apps` | List registered apps |
| GET | `/api/apps/:slug/data` | Read app data.json |
| PUT | `/api/apps/:slug/data` | Write app data.json |
| POST | `/api/apps/:slug/invoke` | Invoke app hook (`{ hook, data? }`) |
| GET | `/api/agents` | List background agents |
| POST | `/api/agents` | Register a background agent |
| POST | `/api/agents/:id/complete` | Agent completion callback |
| GET | `/api/pre-compact` | Pre-compaction hook |
| GET | `/api/post-compact` | Post-compaction hook |
| GET | `/api/compaction-stats` | Compaction counter and history |

## Frontend views

The dashboard uses a **skills registry** pattern for its views. Each view component self-registers at import time.

### Built-in views

| View | ID | Core | Description |
|------|----|------|-------------|
| Chat | `chat` | yes | Send/receive messages through the dashboard channel |
| Agent Chat | `agent-chat` | yes | Inter-agent messaging |
| Events | `events` | yes | Real-time event log with type badges and payloads |
| Status | `status` | yes | System overview (loop state, queue, channels, memory, timers) |
| Memory | `memory` | no | Hybrid vector + FTS search over the memory index |
| Apps | `apps` | no | Grid of installed apps with data inspection |

Core views cannot be disabled. Non-core views can be toggled via the `dashboard.skills` config key.

### Chat

The chat view provides a message interface to the agent. Messages are sent as WebSocket `chat` type and routed through the `DashboardAdapter` channel into the event loop.

### Event log

The event log displays all events flowing through the system in reverse chronological order. Each event shows a color-coded type badge, the source, timestamp, and a truncated JSON payload.

### Status panel

The status panel polls the server every 5 seconds and displays:

- **Loop state** (running/stopped)
- **Event queue** depth
- **Timer** count
- **Channels** with health indicators
- **Memory** stats (file count, chunk count, indexed paths)
- **Docs** domains and their stats
- **Fact extractor** status

### Memory browser

The memory browser provides a search interface for the agent's memory index. Queries run hybrid vector + FTS search and display results with file paths, relevance scores, and content previews.

## Dashboard adapter

The `DashboardAdapter` is a channel adapter that bridges the web dashboard to the event loop. When a user sends a message from the dashboard chat, the adapter wraps the message and delivers it into the event loop. Outbound messages from the agent are forwarded to all connected WebSocket clients.

## Theming

The frontend supports dark and light themes via a `ThemeProvider` context. The toggle appears in the sidebar footer. Theme preference is persisted in `localStorage`.

## Mobile support

The dashboard is responsive. On viewports narrower than 768px:
- The sidebar collapses into an overlay drawer
- A hamburger button appears in the top-left corner
- Selecting a view closes the drawer automatically

## Startup behavior

On startup, `DashboardServer` will:

1. Scan `~/.homarus/apps/` for app manifests
2. Serve the built dashboard SPA from `dashboard/dist/`
3. If the port is in use, attempt to kill the stale process and retry once
4. If the port is still unavailable, continue without the dashboard (degraded mode)

See also: [Identity](identity.md) for the identity files served via `/api/identity/*`, [MCP Tools](mcp-tools.md) for tool details.

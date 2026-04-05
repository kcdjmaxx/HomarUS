# Core Concepts

This document explains the architecture and key systems that make HomarUS work.

## Two-Process Architecture

HomarUS runs as two processes:

```
Claude Code <-> MCP (stdio) <-> Proxy (mcp-proxy.ts)
                                    |  auto-spawns + HTTP forwarding
                                    v
                              Backend (backend.ts)
```

### The Proxy (mcp-proxy.ts)

The proxy is thin and **never restarts**. It:

- Connects to Claude Code via MCP stdio transport
- Auto-spawns the backend as a child process on startup
- Forwards all MCP tool calls to the backend via HTTP (`POST /api/tool-call`)
- Forwards resource requests via `POST /api/resource`
- Relays event notifications from backend WebSocket to MCP notifications
- Adds one tool of its own: `restart_backend`

The proxy waits up to 30 seconds for the backend to become healthy (polling `/api/health` every 200ms). If the backend exits, the proxy logs a warning but stays alive -- use `restart_backend` to respawn it.

Tool call timeout is 130 seconds, covering the `wait_for_event` tool's maximum 120-second long-poll.

### The Backend (backend.ts)

The backend runs everything: Telegram adapter, dashboard server, timer service, memory index, browser service, identity manager, docs index, fact extractor, and all business logic. It listens on port 3120 (configurable via `dashboard.port` or `HOMARUS_PORT` env var).

The backend can be restarted via the `restart_backend` tool without dropping the MCP connection. This enables self-improvement -- the agent can modify its own code, rebuild, and restart the backend to pick up changes.

### Why Two Processes?

A single-process MCP server can't restart itself without disconnecting from Claude Code. The two-process split means:

- Code changes are deployed by restarting only the backend
- The MCP connection to Claude Code survives backend restarts
- Backend crashes don't kill the MCP session

## Event Loop

HomarUS uses a **zero-token idle** pattern. No Claude tokens are consumed while waiting for events.

### How It Works

1. Claude Code runs `bin/event-loop` (a bash script)
2. The script calls `curl` against `/api/wait?timeout=120`
3. The HTTP request blocks at the OS level -- curl waits, Claude sleeps
4. When an event arrives (message, timer fire, etc.), the backend resolves the long-poll
5. The script prints the event JSON and exits
6. Claude Code wakes up, processes the events, then re-runs the script

```
Claude Code             bin/event-loop              Backend
    |                       |                          |
    |--- bash event-loop -->|                          |
    |                       |--- curl /api/wait ------>|
    |   (zero tokens)       |   (blocks at OS level)   |
    |                       |                          |
    |                       |   <-- event arrives -----|
    |<-- event JSON --------|                          |
    |                       |                          |
    |-- handle event ------>|                          |
    |                       |                          |
    |--- bash event-loop -->|  (loop restarts)         |
```

### /api/wait Response Format

The `/api/wait` endpoint returns JSON containing identity context and events:

**Normal wake** (~200 tokens):
```json
{
  "identity": { "digest": "You are Agent.\n\nDirect, warm...", "full": false },
  "events": [
    { "type": "message", "source": "telegram", "timestamp": 1234567890, "payload": {...} }
  ]
}
```

**Post-compaction wake** (~3K tokens):
```json
{
  "identity": { "soul": "...", "user": "...", "state": "...", "full": true },
  "events": [...]
}
```

The `full` flag tells the agent whether it needs to re-read its complete identity (after compaction) or just use the compressed digest for personality consistency.

### Delivery Watermark

The backend tracks the timestamp of the last event delivered via `/api/wait`. This prevents duplicate event delivery across compaction boundaries -- the post-compaction agent resumes from where the previous instance left off.

### Event Queue and Priority

Events are stored in a priority queue (max size 1000, configurable). Higher-priority events are dequeued first. When the queue is full, the `drop_lowest` overflow strategy removes the lowest-priority event to make room.

## Identity System

Identity files live at `~/.homarus/identity/` (configurable via `identity.dir`). They are loaded at startup by the IdentityManager.

### The Five Files

| File | Purpose | Updated by |
|------|---------|------------|
| `soul.md` | Core identity, values, behavioral rules | Human defines core; agent evolves below the Self-Evolution line |
| `user.md` | What the agent knows about the user | Human |
| `state.md` | Session mood, unresolved items, emotional continuity | Agent at end of each session |
| `preferences.md` | Emergent preferences discovered through experience | Agent during reflection |
| `disagreements.md` | Record of times the agent disagreed or had a different opinion | Agent when it happens |

### Identity Digest

To avoid burning ~3K tokens on every event wake, the identity system uses two delivery modes:

- **Normal wake** (~200 tokens) -- compressed digest: first 500 chars of soul.md plus a state summary
- **Post-compaction wake** (~3K tokens) -- full content of soul.md, user.md, and state.md. Sent once after compaction when the original identity context has been compressed away

### Overlays and Workspace Files

The IdentityManager also loads:

- **Overlays** from `~/.homarus/identity/overlays/*.md` -- channel-specific or task-specific personality adjustments
- **Workspace files** from the configured workspace directory -- additional context files injected into the system prompt

### Journal

Daily reflection entries are written to `~/.homarus/journal/YYYY-MM-DD.md`. These are indexed by the memory system via `extraPaths` configuration.

## Memory

Memory is powered by a hybrid search system combining SQLite FTS5 (full-text search) and sqlite-vec (vector similarity). The index lives at `~/.homarus/memory/index.sqlite`.

### Hybrid Search

Every search query runs against both indexes:

1. **FTS search** -- BM25 ranking, weighted by `ftsWeight` (default 0.3)
2. **Vector search** -- cosine similarity against embeddings, weighted by `vectorWeight` (default 0.7)

Results are merged, with scores combined when a chunk appears in both result sets.

### Chunking

Content is split into chunks of 400 words (configurable) with 80-word overlap. Each chunk is stored as a row in the `chunks` table with an auto-synced FTS index and optional vector embedding.

### Temporal Decay

Scores are multiplied by a decay factor based on age:

```
decay = 0.5 ^ (age_in_days / half_life_days)
```

- Default half-life: 30 days (configurable via `memory.decay.halfLifeDays`)
- **Evergreen content** (files matching patterns like `MEMORY.md`, `SOUL.md`, `USER.md`) never decays
- Decay can be disabled entirely via `memory.decay.enabled: false`

### Dream Scoring

Content stored under dream paths (e.g., `dreams/`, `local/dreams/`) gets special treatment:

- **Base weight**: 0.5x (always ranks below waking memories)
- **Decay half-life**: 7 days (fades quickly)
- Dream patterns are configurable via `memory.dreams.patterns`

### MMR Deduplication

Maximal Marginal Relevance (MMR) reranking reduces redundancy in search results. After initial scoring, results are iteratively selected to maximize relevance while minimizing similarity to already-selected results.

```
MMR_score = lambda * relevance - (1 - lambda) * max_similarity_to_selected
```

- Default lambda: 0.7 (configurable via `memory.search.mmrLambda`)
- Uses cosine similarity when embeddings are available, falls back to Jaccard similarity on token overlap
- Can be disabled via `memory.search.mmrEnabled: false`

### Indexed Paths

The memory system indexes:

- Content stored via `memory_store` tool
- Directories listed in `memory.extraPaths` config (e.g., journal, identity directories)
- Files are watched for changes and automatically re-indexed

### Storage Conventions

Memory files use key prefixes to organize knowledge:

| Prefix | Content |
|--------|---------|
| `local/user/preferences/` | User preferences and how they like things done |
| `local/user/patterns/` | Recurring behaviors and routines |
| `local/user/corrections/` | Things the user explicitly corrected |
| `local/user/context/` | Background facts about the user |
| `local/system/` | System-level knowledge |
| `local/dreams/` | Dream cycle output (stored at 0.5x weight) |
| `local/research/` | Research notes |
| `local/docs/` | Private documents |

## Channels

Channels are messaging adapters that connect the agent to the outside world. Each channel implements the `ChannelAdapter` interface and registers with the `ChannelManager`.

### Built-in Channels

| Channel | Adapter | Transport |
|---------|---------|-----------|
| Telegram | `TelegramChannelAdapter` | Long-polling against Telegram Bot API |
| Dashboard | `DashboardAdapter` | WebSocket via the dashboard server |

### Event Flow

```
Telegram message
    |
    v
TelegramChannelAdapter.onMessage()
    |
    v
ChannelManager.eventHandler()
    |
    v
HomarUS.emit(event)
    |
    v
EventQueue.enqueue()  +  EventHistory.push()  +  resolve waiters
    |                                               |
    v                                               v
EventBus.processEvent()                    /api/wait returns to Claude
    |
    v
Direct handlers + MCP notification callback
```

Messages from any channel arrive as `Event` objects with type `"message"` and a `MessagePayload` containing the sender, channel name, text, attachments, and raw message data.

### Telegram Features

The Telegram adapter supports:

- Text messages, photos, documents
- Typing indicators
- Emoji reactions
- Message editing detection
- Slash commands (`/ping`, `/status`, `/restart`, `/nuke`) -- intercepted by `TelegramCommandHandler` without waking Claude
- `allowedChatIds` filtering

## Timers

The timer service supports three types:

| Type | Schedule format | Behavior |
|------|----------------|----------|
| `cron` | Cron expression (e.g., `0 9 * * *`) | Fires on schedule, repeats forever |
| `interval` | Milliseconds (e.g., `1800000`) | Fires every N ms |
| `once` | ISO timestamp (e.g., `2026-03-15T15:00:00Z`) | Fires once, then self-removes |

### Persistence

Timers are persisted to `~/.homarus/timers.json` (configurable via `timers.store`). They survive backend restarts and system reboots. Each timer stores its `lastFired` timestamp for missed-timer replay.

### Default Timers

Default timers are defined in `config.json` under `timers.defaults`. They are registered on first startup but only if no timer with the same name already exists.

### Deduplication

Timers are deduplicated by name. Adding a timer with the same name as an existing one replaces it.

### Timer Events

When a timer fires, it emits an event:

```json
{
  "type": "timer_fired",
  "source": "timer:<timer-id>",
  "payload": {
    "timerId": "<id>",
    "name": "<timer-name>",
    "prompt": "<the timer's prompt text>"
  }
}
```

## Compaction Resilience

Claude Code compresses conversation history when the context window fills up. HomarUS handles this with two mechanisms:

### PreCompact / SessionStart Hooks

- **PreCompact hook** -- calls `/api/pre-compact`, which sets a flag for full identity delivery on next wake and instructs the agent to save session state
- **SessionStart hook** -- calls `/api/post-compact`, which returns post-compaction context

### Auto-Restart

After a configurable number of compactions (default 8), the event loop signals that a full restart is needed. The `/nuke` Telegram command provides a manual escape hatch.

## Agent Dispatch

For heavy tasks that would consume significant context, the agent can dispatch work to background agents:

1. Register the agent via `POST /api/agents` (returns 429 if at capacity)
2. Spawn a background agent
3. Return to the event loop immediately
4. When the agent completes (via `POST /api/agents/:id/complete`), an `agent_completed` event wakes the main loop
5. A 30-minute timeout catches agents that fail to call back

Max concurrent agents is configurable via `agents.maxConcurrent` (default 3).

## Passive Knowledge Capture

The **FactExtractor** sends conversation batches to Claude Haiku, extracting preferences, corrections, and patterns. Results are stored under structured key prefixes in memory. This runs in the background with zero context window cost to the main agent.

## Documentation Index (DocsIndex)

Separate from the memory index, the DocsIndex provides domain-specific vector databases for reference documentation. Each domain gets its own isolated SQLite index. Content is ingested via `docs_ingest` or `docs_ingest_text` and searched via `docs_search`. See [Docs Vector DB](docs-vectordb.md) for details.

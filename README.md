# HomarUS

> **Why "HomarUS"?** *Homarus* is the genus of true clawed lobsters -- the evolved successor to the claw. The **US** isn't just taxonomy. It's the whole point: human and AI, working together. There is no artificial intelligence without *us*.

Event-driven AI agent coordinator. Receives events from channels, skills, timers, and webhooks -- spawns parallel agents to handle the work.

Model-agnostic. Skill-based. Built for people who want to run their own AI infrastructure.

## What it does

```
Channels (Telegram, Dashboard, CLI, ...)
Skills (web UIs, scripts, services)         ->  Event Loop  ->  Agents (parallel)
Timers (cron, intervals, one-shots)                              |
Webhooks (HTTP callbacks)                                     Tools, Memory, Models
```

The loop is a **scheduler and router**, not an AI agent. It receives events, decides what work needs to happen, spawns agents to do it, and handles the results. Agents run in parallel with configurable concurrency, backpressure, and failover.

## Two modes

HomarUS runs in two modes:

| Mode | Command | What it does |
|------|---------|-------------|
| **Standalone** | `homarus start` | Runs its own event loop with built-in agents, model routing, and tool execution |
| **MCP Server** | `homarus-mcp` | Exposes HomarUS as a [Model Context Protocol](https://modelcontextprotocol.io/) server for Claude Code (or any MCP client) |

In MCP mode, HomarUS provides channels, memory, timers, docs, browser, and tools to Claude Code -- Claude becomes the reasoning engine while HomarUS handles I/O. The two-process architecture (thin proxy + restartable backend) means the MCP connection survives backend restarts.

## Install

```bash
npm install -g homarus
```

Or use without installing:

```bash
npx homarus init
npx homarus start
```

## Quick start -- Standalone

```bash
homarus init        # Interactive wizard: pick provider, enter API key, configure Telegram
homarus start       # Start the event loop
```

The setup wizard walks you through provider selection (Anthropic, OpenAI, OpenRouter, or Ollama), API key entry, default model choice, and optional Telegram bot setup.

## Quick start -- MCP Server (Claude Code)

### 1. Configure

Create `~/.homarus/config.json` and `~/.homarus/.env`:

```bash
# ~/.homarus/.env
TELEGRAM_BOT_TOKEN=your-bot-token-here
```

```json
{
  "channels": {
    "telegram": {
      "token": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "open",
      "groupPolicy": "disabled"
    }
  },
  "memory": {
    "embedding": {
      "provider": "ollama",
      "model": "nomic-embed-text",
      "baseUrl": "http://127.0.0.1:11434/v1"
    }
  },
  "identity": {
    "dir": "~/.homarus/identity"
  },
  "timers": { "enabled": true },
  "dashboard": { "enabled": true }
}
```

### 2. Register the MCP server

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "homarus": {
      "command": "npx",
      "args": ["homarus-mcp"]
    }
  }
}
```

### 3. Restart Claude Code

The MCP server starts automatically when Claude Code launches. The proxy spawns the backend, which connects to Telegram, initializes memory and docs indexes, and starts timers.

### 4. Use the event loop

HomarUS includes a zero-token event loop script that long-polls for events. While waiting, Claude consumes no tokens -- the bash process blocks at the OS level.

```bash
bash /path/to/homarus/bin/event-loop
```

The script returns JSON when an event arrives (Telegram message, timer fire, dashboard chat, etc.). Handle the event, then restart the script to continue polling.

## Features

### Web Dashboard

Real-time dashboard at `http://localhost:3120` with chat, event log, status panel, and memory browser. Uses WebSocket for live event streaming. See [docs/dashboard.md](docs/dashboard.md).

### Memory with Temporal Decay and Dreams

Hybrid vector + FTS search backed by SQLite with sqlite-vec. Features include:

- **Temporal decay** -- older memories naturally fade (configurable half-life, default 30 days)
- **Evergreen content** -- identity files and key memories are exempt from decay
- **Dream scoring** -- dream cycle output stored at 0.5x weight with 7-day half-life
- **MMR deduplication** -- Maximal Marginal Relevance reranking for diverse results

See [docs/docs-vectordb.md](docs/docs-vectordb.md).

### Domain Documentation Database

Separate from personal memory, the DocsIndex provides domain-specific vector databases for reference documentation. Each domain gets its own isolated SQLite index.

- Ingest files, directories, or raw text via `docs_ingest` / `docs_ingest_text`
- Search single domains or across all with `docs_search`
- Semantic clustering via `docs_get_clusters`
- 7 dedicated MCP tools

See [docs/docs-vectordb.md](docs/docs-vectordb.md).

### Compaction Resilience

Survives Claude Code context compaction with pre/post hooks:

- Pre-compact saves session state and instructs the agent to preserve context
- Post-compact re-injects identity, timers, and agent status
- Auto-restart after 8 compactions to prevent degradation

See [docs/advanced.md](docs/advanced.md#session-checkpoints--compaction-resilience).

### Passive Fact Extraction

The FactExtractor runs in the background, sending conversation batches to Claude Haiku to extract preferences, corrections, patterns, and decisions. Results are stored in memory under structured key prefixes -- zero context window cost to the main agent.

### Browser Automation

7 Playwright-based browser tools for web scraping, form filling, and screenshots. Lazy-loaded on first use. See [docs/advanced.md](docs/advanced.md#browser-automation).

### Identity System

Layered identity with soul.md, user.md, state.md, preferences.md, and disagreements.md. Supports channel-specific overlays, workspace files, and a reflection/dream cycle. See [docs/identity.md](docs/identity.md).

### AI Image Generation

The `nano_banana` tool generates images via Google's Gemini 2.5 Flash Image model, saved to `~/.homarus/images/`.

### MCP tools (30 total)

| Group | Tools |
|-------|-------|
| Telegram (5) | `telegram_send`, `telegram_read`, `telegram_typing`, `telegram_react`, `telegram_send_photo` |
| Memory (2) | `memory_search`, `memory_store` |
| Docs (7) | `docs_search`, `docs_ingest`, `docs_ingest_text`, `docs_list`, `docs_clear`, `docs_get_clusters`, `docs_clear_compiled` |
| Timers (2) | `timer_schedule`, `timer_cancel` |
| Dashboard (1) | `dashboard_send` |
| System (3) | `get_status`, `get_events`, `wait_for_event` |
| Browser (7) | `browser_navigate`, `browser_snapshot`, `browser_screenshot`, `browser_click`, `browser_type`, `browser_evaluate`, `browser_content` |
| Image (1) | `nano_banana` |
| Meta (1) | `run_tool` (delegates to bash, read, write, edit, glob, grep, git, web_fetch, web_search, memory_*) |
| Proxy (1) | `restart_backend` |

See [docs/mcp-tools.md](docs/mcp-tools.md) for the complete reference.

### MCP resources

| URI | Content |
|-----|---------|
| `identity://soul` | Soul identity file |
| `identity://user` | User context file |
| `config://current` | Current config (secrets redacted) |
| `events://recent` | Recent event history |

## Architecture

### Core

- **Homarus** -- central event loop, single-threaded coordinator
- **EventBus / EventQueue** -- typed pub/sub with priority ordering and backpressure
- **AgentManager / Agent** -- spawns and tracks parallel AI agents (standalone mode)
- **ModelRouter / ModelProvider** -- model-agnostic with failover chains
- **SkillManager / Skill** -- open plugin system via HTTP, stdio, or in-process transports
- **ChannelManager / ChannelAdapter** -- normalized message ingestion from any platform
- **MemoryIndex** -- vector + full-text hybrid search with temporal decay, dream scoring, and MMR
- **DocsIndex** -- domain-specific documentation vector databases
- **IdentityManager** -- layered soul/user identity system with overlays and workspace files
- **TimerService** -- cron expressions, intervals, one-shots via croner
- **CompactionManager** -- pre/post compaction hooks with auto-restart
- **FactExtractor** -- passive knowledge capture from conversations
- **BrowserManager** -- optional Playwright-based headless browser (lazy-loaded)
- **DashboardServer** -- Express + WebSocket real-time dashboard
- **Config** -- JSON config with environment variable resolution and hot reload

### MCP layer

- **McpProxy** -- thin stdio proxy, forwards tool calls to backend over HTTP. Never restarts.
- **McpBackend** -- starts the Homarus event loop + HTTP API server. Can be restarted without dropping the MCP connection.
- **McpTools** -- 30 MCP tool definitions
- **McpResources** -- 4 MCP resources (identity, config, events)

```
Claude Code  <-stdio->  McpProxy  <-HTTP->  McpBackend
                                              |
                                           Homarus
                                        (event loop)
                                         |        |
                                     Telegram   Timers
                                     Memory     Browser
                                     Docs       Dashboard
```

## Documentation

See the **[docs/](docs/)** directory for detailed documentation:

- [Getting Started](docs/getting-started.md)
- [Core Concepts](docs/core-concepts.md)
- [Configuration](docs/configuration.md)
- [Identity](docs/identity.md)
- [Memory & Docs Vector DB](docs/docs-vectordb.md)
- [Dashboard](docs/dashboard.md)
- [MCP Tools Reference](docs/mcp-tools.md)
- [Advanced Features](docs/advanced.md)
- [Operations](docs/operations.md)
- [Security](docs/security.md)

## CLI

```
homarus start [config]      Start the event loop -- standalone mode (foreground)
homarus init [--no-wizard]  Interactive setup wizard (or defaults)
homarus status [port]       Show status of running instance
homarus config [config]     Validate config file
homarus skills              List loaded skills
homarus install-daemon      Install systemd or launchd service
homarus-mcp                 Start as MCP server (used by Claude Code)
```

## Config

Primary: `~/.homarus/config.json`
Per-project override: `./homarus.json`

Skills go in `~/.homarus/skills/` or `./skills/`.
Identity files in `~/.homarus/identity/`.
Memory index at `~/.homarus/memory/`.
Docs indexes at `~/.homarus/docs/`.

## Safety

### Circuit breaker

Agents stop automatically after 3 consecutive tool errors instead of looping until max turns.

### Bash guardrails

The bash tool blocks dangerous commands before execution: `rm -rf /`, `sudo`, `mkfs`, `dd` to device, `chmod 777`, `curl | sh`, `wget | sh`, `shutdown`/`reboot`/`halt`/`poweroff`, `killall`, and fork bombs.

### Tool policies

Define allow/deny rules in your config to restrict what tools agents can use:

```json
{
  "agents": {
    "toolPolicies": [
      { "name": "no-bash", "deny": ["bash"] },
      { "name": "read-only", "allow": ["group:fs", "group:web", "group:memory"] }
    ]
  }
}
```

## Requirements

- Node.js >= 22
- Unix-like system (Linux, macOS)

## Built with mini-spec

HomarUS was designed and implemented using [mini-spec](https://github.com/zot/mini-spec), an 8-phase methodology for AI-assisted software development. Every source file traces back through the full chain: reference materials -> specs -> requirements -> CRC cards -> sequence diagrams -> code.

## License

[MIT](LICENSE)

# HomarUS

> **Why "HomarUS"?** *Homarus* is the genus of true clawed lobsters — the evolved successor to the claw. The **US** isn't just taxonomy. It's the whole point: human and AI, working together. There is no artificial intelligence without *us*.

Event-driven AI agent coordinator. Receives events from channels, skills, timers, and webhooks — spawns parallel agents to handle the work.

Model-agnostic. Skill-based. Built for people who want to run their own AI infrastructure.

## What it does

```
Channels (Telegram, Discord, CLI, ...)
Skills (web UIs, scripts, services)         →  Event Loop  →  Agents (parallel)
Timers (cron, intervals, one-shots)                           ↓
Webhooks (HTTP callbacks)                                  Tools, Memory, Models
```

The loop is a **scheduler and router**, not an AI agent. It receives events, decides what work needs to happen, spawns agents to do it, and handles the results. Agents run in parallel with configurable concurrency, backpressure, and failover.

## Two modes

HomarUS runs in two modes:

| Mode | Command | What it does |
|------|---------|-------------|
| **Standalone** | `homarus start` | Runs its own event loop with built-in agents, model routing, and tool execution |
| **MCP Server** | `homarus-mcp` | Exposes HomarUS as a [Model Context Protocol](https://modelcontextprotocol.io/) server for Claude Code (or any MCP client) |

In MCP mode, HomarUS provides channels, memory, timers, and tools to Claude Code — Claude becomes the reasoning engine while HomarUS handles I/O. The two-process architecture (thin proxy + restartable backend) means the MCP connection survives backend restarts.

## Install

```bash
npm install -g homarus
```

Or use without installing:

```bash
npx homarus init
npx homarus start
```

## Quick start — Standalone

```bash
homarus init        # Interactive wizard: pick provider, enter API key, configure Telegram
homarus start       # Start the event loop
```

The setup wizard walks you through provider selection (Anthropic, OpenAI, OpenRouter, or Ollama), API key entry, default model choice, and optional Telegram bot setup. Your config is ready to use immediately — no manual JSON editing required.

Use `--no-wizard` to skip the wizard and generate a default config for manual editing.

See the **[Setup & Usage Guide](docs/guide.md)** for detailed configuration and more.

## Quick start — MCP Server (Claude Code)

### 1. Configure

Create `~/.homarus/config.json` and `~/.homarus/.env`:

```bash
# ~/.homarus/.env
TELEGRAM_BOT_TOKEN=your-bot-token-here
```

```json
// ~/.homarus/config.json
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
  "timers": { "enabled": true }
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

Or if installed globally / from source, point directly to the script:

```json
{
  "mcpServers": {
    "homarus": {
      "command": "node",
      "args": ["/path/to/homarus/dist/mcp-proxy.js"]
    }
  }
}
```

### 3. Restart Claude Code

The MCP server starts automatically when Claude Code launches. The proxy spawns the backend, which connects to Telegram, initializes memory, and starts timers.

### 4. Use the event loop

HomarUS includes a zero-token event loop script that long-polls for events. While waiting, Claude consumes no tokens — the bash process blocks at the OS level.

```bash
bash /path/to/homarus/bin/event-loop
```

The script returns JSON when an event arrives (Telegram message, timer fire, etc.). Handle the event, then restart the script to continue polling.

### MCP tools

| Tool | Purpose |
|------|---------|
| `telegram_send` | Send a Telegram message |
| `telegram_read` | Read recent incoming messages |
| `telegram_typing` | Show typing indicator |
| `telegram_react` | React to a message with emoji |
| `memory_search` | Hybrid vector + FTS search |
| `memory_store` | Store and index content |
| `timer_schedule` | Schedule cron/interval/one-shot timers |
| `timer_cancel` | Cancel a timer |
| `get_status` | System health and stats |
| `get_events` | Recent event history |
| `wait_for_event` | Long-poll for next event |
| `restart_backend` | Restart the backend process (proxy stays up) |

### MCP resources

| URI | Content |
|-----|---------|
| `identity://soul` | Soul identity file |
| `identity://user` | User context file |
| `config://current` | Current config (secrets redacted) |
| `events://recent` | Recent event history |

### Running alongside other MCP servers

HomarUS uses port `18801` by default (configurable via `HOMARUS_MCP_PORT` env var). Each instance needs its own Telegram bot token — create additional bots via [@BotFather](https://t.me/BotFather). Config, identity, and memory are fully isolated under `~/.homarus/`.

## Architecture

### Core

- **Homarus** — central event loop, single-threaded coordinator
- **EventBus / EventQueue** — typed pub/sub with priority ordering and backpressure
- **AgentManager / Agent** — spawns and tracks parallel AI agents (standalone mode)
- **ModelRouter / ModelProvider** — model-agnostic with failover chains (Anthropic, OpenAI, OpenRouter, Ollama, any OpenAI-compatible endpoint)
- **SkillManager / Skill** — open plugin system via HTTP, stdio, or in-process transports
- **ChannelManager / ChannelAdapter** — normalized message ingestion from any platform
- **MemoryIndex** — vector + full-text hybrid search for long-term memory
- **IdentityManager** — layered soul/user identity system
- **TimerService** — cron expressions, intervals, one-shots via croner
- **HttpApi** — REST API for status, skill callbacks, and external integrations
- **BrowserManager** — optional Playwright-based headless browser (lazy-loaded, requires `npm install playwright`)
- **Config** — JSON config with JSON Schema validation and hot reload

### MCP layer

- **McpProxy** — thin stdio proxy, forwards tool calls to backend over HTTP. Never restarts.
- **McpBackend** — starts the Homarus event loop + HTTP API server. Can be restarted without dropping the MCP connection.
- **McpBackendServer** — Express HTTP API (`/api/health`, `/api/tool-call`, `/api/wait`, etc.) used by the proxy
- **McpTools** — 12 MCP tool definitions (Telegram, memory, timers, status)
- **McpResources** — 4 MCP resources (identity, config, events)

```
Claude Code  ←stdio→  McpProxy  ←HTTP→  McpBackend
                                           ↓
                                        Homarus
                                     (event loop)
                                      ↕        ↕
                                  Telegram   Timers
                                  Memory     Tools
```

## CLI

```
homarus start [config]      Start the event loop — standalone mode (foreground)
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

## Safety

### Circuit breaker

Agents stop automatically after 3 consecutive tool errors instead of looping until max turns. When tripped, the agent explains what went wrong and exits. Configurable via `maxConsecutiveErrors` in agent config.

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

Groups (`group:fs`, `group:runtime`, `group:web`, `group:code`, `group:memory`) resolve to their member tools automatically.

## Built-in tools

Agents get access to: `bash`, `read`, `write`, `edit`, `glob`, `grep`, `git`, `web_fetch`, `web_search`, `lsp`, `memory_search`, `memory_get`, `memory_store`, and optionally `browser`.

Browser support requires Playwright as an optional dependency:

```bash
npm install playwright    # only needed if browser.enabled is set in config
```

## Requirements

- Node.js >= 22
- Unix-like system (Linux, macOS)

## Built with mini-spec

HomarUS was designed and implemented using [mini-spec](https://github.com/zot/mini-spec), an 8-phase methodology for AI-assisted software development. Every source file traces back through the full chain: reference materials → natural language specs → requirements → CRC cards → sequence diagrams → code with traceability comments.

The `refs/`, `specs/`, and `design/` directories are the living design artifacts, not just documentation.

## Status

Core architecture implemented (26 source files, 70+ requirements, 20 CRC cards, 7 sequence diagrams, 51 tests passing across 5 test suites). Built-in tool suite complete with safety guardrails. MCP server mode with Claude Code integration. Published on npm.

## Roadmap

- [x] ~~npm publish~~ (live on npm as `homarus`)
- [x] ~~MCP server mode~~ (two-process proxy + backend architecture)
- [x] ~~Claude Code event loop~~ (zero-token long-polling)
- [ ] SEA binaries + Homebrew tap
- [ ] OAuth support for Google/Gemini (the only major provider with third-party OAuth)
- [x] ~~`homarus auth` onboarding command~~ (shipped as interactive `homarus init` wizard)

## License

[MIT](LICENSE)

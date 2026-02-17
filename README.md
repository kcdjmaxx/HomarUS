# HomarUS

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

## Quick start

```bash
npm install
npm run build
homarus init        # Create ~/.homarus/ with default config
homarus start       # Start the event loop
```

Edit `~/.homarus/config.json` to add your API keys and configure models, channels, and skills.

## Architecture

- **Homarus** — central event loop, single-threaded coordinator
- **EventBus / EventQueue** — typed pub/sub with priority ordering and backpressure
- **AgentManager / Agent** — spawns and tracks parallel AI agents
- **ModelRouter / ModelProvider** — model-agnostic with failover chains (Anthropic, OpenAI, OpenRouter, Ollama, any OpenAI-compatible endpoint)
- **SkillManager / Skill** — open plugin system via HTTP, stdio, or in-process transports
- **ChannelManager / ChannelAdapter** — normalized message ingestion from any platform
- **MemoryIndex** — vector + full-text hybrid search for long-term memory
- **IdentityManager** — layered soul/user/overlay identity system
- **TimerService** — cron expressions, intervals, one-shots via croner
- **HttpApi** — REST API for status, skill callbacks, and external integrations
- **Config** — JSON config with JSON Schema validation and hot reload

## CLI

```
homarus start [config]      Start the event loop (foreground)
homarus init                Create default config and directories
homarus status [port]       Show status of running instance
homarus config [config]     Validate config file
homarus skills              List loaded skills
homarus install-daemon      Install systemd or launchd service
```

## Config

Primary: `~/.homarus/config.json`
Per-project override: `./homarus.json`

Skills go in `~/.homarus/skills/` or `./skills/`.
Identity files in `~/.homarus/identity/`.
Memory index at `~/.homarus/memory/`.

## Requirements

- Node.js >= 22
- Unix-like system (Linux, macOS)

## Status

Core architecture implemented (19 source files, 70 requirements, 19 CRC cards, 6 sequence diagrams). Currently pre-release — channel adapters, built-in tools, and tests are in progress.

## License

[MIT](LICENSE)

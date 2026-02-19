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

## Install

```bash
npm install -g homarus
```

Or use without installing:

```bash
npx homarus init
npx homarus start
```

## Quick start

```bash
homarus init        # Interactive wizard: pick provider, enter API key, configure Telegram
homarus start       # Start the event loop
```

The setup wizard walks you through provider selection (Anthropic, OpenAI, OpenRouter, or Ollama), API key entry, default model choice, and optional Telegram bot setup. Your config is ready to use immediately — no manual JSON editing required.

Use `--no-wizard` to skip the wizard and generate a default config for manual editing.

See the **[Setup & Usage Guide](docs/guide.md)** for detailed configuration and more.

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
- **BrowserManager** — optional Playwright-based headless browser (lazy-loaded, requires `npm install playwright`)
- **Config** — JSON config with JSON Schema validation and hot reload

## CLI

```
homarus start [config]      Start the event loop (foreground)
homarus init [--no-wizard]  Interactive setup wizard (or defaults)
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

Core architecture implemented (21 source files, 70 requirements, 20 CRC cards, 7 sequence diagrams, 51 tests passing across 5 test suites). Built-in tool suite complete with safety guardrails. Published on npm.

## Roadmap

- [x] ~~npm publish~~ (live on npm as `homarus`)
- [ ] SEA binaries + Homebrew tap
- [ ] OAuth support for Google/Gemini (the only major provider with third-party OAuth)
- [x] ~~`homarus auth` onboarding command~~ (shipped as interactive `homarus init` wizard)

## License

[MIT](LICENSE)

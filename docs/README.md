# HomarUS Documentation

HomarUS is an MCP server that gives Claude Code a persistent body: identity, memory, messaging (Telegram + web dashboard), timers, browser automation, documentation databases, and extensible tools. It runs as a two-process architecture -- a thin MCP proxy that never restarts, and a backend that can be restarted on the fly for self-improvement.

---

## Documentation Index

### Getting Started

1. **[Getting Started](getting-started.md)** -- Installation, initial setup, first run, and verifying everything works.

### Core Documentation

2. **[Core Concepts](core-concepts.md)** -- The event loop, two-process architecture, channels, timers, and the handle-then-poll cycle.

3. **[Identity](identity.md)** -- The Who Track: soul.md, user.md, state.md, preferences, disagreements, journals, and how identity survives compaction.

4. **[Memory & Vector Database](docs-vectordb.md)** -- Hybrid vector + FTS memory system, storage patterns, key conventions, and search tuning.

5. **[Configuration](configuration.md)** -- Config file reference, environment variables, channel setup, and all configurable options.

### Features

6. **[Dashboard](dashboard.md)** -- Web dashboard: chat, event log, status, memory browser, and WebSocket protocol.

7. **[MCP Tools](mcp-tools.md)** -- Complete reference for all 30 MCP tools.

8. **[Advanced Features](advanced.md)** -- Agent dispatch, compaction resilience, hot-loadable skills, browser automation, and external API integration.

### Operations

9. **[Operations](operations.md)** -- Monitoring, health checks, troubleshooting, logs, backup/recovery, and updating.

10. **[Security](security.md)** -- Permission boundaries, destructive command protection, secrets management, and channel trust.

---

## Quick Reference

| I want to... | Read |
|--------------|------|
| Install and run HomarUS for the first time | [Getting Started](getting-started.md) |
| Understand how the event loop works | [Core Concepts](core-concepts.md) |
| Configure Telegram or other channels | [Configuration](configuration.md) |
| Set up the agent's personality and identity | [Identity](identity.md) |
| Store and search memories | [Memory & Vector Database](docs-vectordb.md) |
| Use the web dashboard | [Dashboard](dashboard.md) |
| Browse the full tool reference | [MCP Tools](mcp-tools.md) |
| Offload work to background agents | [Advanced](advanced.md#agent-dispatch-system) |
| Understand what happens during compaction | [Advanced](advanced.md#session-checkpoints--compaction-resilience) |
| Add browser automation | [Advanced](advanced.md#browser-automation) |
| Add a new external API | [Advanced](advanced.md#external-api-integration-patterns) |
| Create a hot-loadable skill | [Advanced](advanced.md#skill-system) |
| Debug why Telegram isn't connecting | [Operations](operations.md#troubleshooting) |
| Check system health | [Operations](operations.md#monitoring--health-checks) |
| Back up my data | [Operations](operations.md#backup--recovery) |
| Update to a new version | [Operations](operations.md#updating-homarus) |
| Understand what the agent can do without asking | [Security](security.md#permission-boundaries) |
| Manage secrets and tokens | [Security](security.md#secrets-management) |

---

## Key Paths

| Path | Contents |
|------|----------|
| `~/.homarus/config.json` | System configuration |
| `~/.homarus/.env` | Secrets (API tokens) |
| `~/.homarus/identity/` | Soul, user, state, preferences, disagreements |
| `~/.homarus/memory/` | SQLite memory index |
| `~/.homarus/journal/` | Daily reflection entries |
| `~/.homarus/timers.json` | Persisted timer definitions |
| `~/.homarus/docs/` | Domain-specific documentation indexes |
| `~/.homarus/secrets/` | OAuth tokens and credentials |

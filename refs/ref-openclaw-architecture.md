# ref-openclaw-architecture
- **Source:** https://docs.openclaw.ai, https://github.com/openclaw/openclaw
- **Summary:** OpenClaw is an open-source personal AI assistant (TypeScript/Node.js) with multi-channel messaging, plugin system, memory, and cron-based scheduling. Architecture patterns to borrow and improve upon.

## Architecture Overview

Hub-and-spoke model centered on a Gateway (single long-lived Node.js process):

```
Messaging Platforms → Channel Adapters → Gateway → Agent Runtime
                                                     ├── Model Inference
                                                     ├── Tool Execution
                                                     ├── Memory System
                                                     └── Session Persistence
```

**Tech stack:** Node.js >= 22, TypeScript, pnpm. Channel libs: Baileys (WhatsApp), grammY (Telegram), Bolt (Slack), discord.js, signal-cli.

## Execution Model (What We're Replacing)

**Serial lane queues:** Every session gets its own queue. Tasks execute one at a time. Messages arriving mid-run handled via: `steer` (inject after tool call), `followup` (queue for next turn), `collect` (batch).

**Cron/Heartbeat:** Gateway's built-in scheduler. Three schedule types: one-shot (`at`), fixed interval (`every`), cron expression. Two execution modes: main session (conversational context) or isolated session (fresh per run). Retry with exponential backoff.

## Agent Runtime

Core entry: `runEmbeddedPiAgent` wrapping Pi Agent Core (`@mariozechner/pi-agent-core`).

Flow: message arrives → session key resolved → queued → `runEmbeddedAttempt` → `buildAgentSystemPrompt` (full/minimal/none) → model call → tool execution → response persisted.

## Plugin/Extension System

Plugins register additional tools and CLI commands. Live in `extensions/` directory. Examples: kanban (port 8880), liquor inventory (port 8881) — each runs Express server, registers tools the agent can call.

## Skills System

Three tiers: bundled (default), managed (auto-installed), workspace (user-custom). Skills define capabilities via `SKILL.md` manifests. Loaded from `~/.openclaw/workspace/skills/`.

## Tool Policy (Access Control)

Multi-layer chain: subagent restrictions → sandbox policy → group policy → provider policy → tool profile → global allow/deny. Tool groups: `group:fs`, `group:runtime`, `group:sessions`, `group:memory`.

## Memory System

Two levels:
1. **Workspace files** (bootstrap context): AGENTS.md, SOUL.md, TOOLS.md, HEARTBEAT.md, etc. Injected on first turn.
2. **Semantic memory** (hybrid search): SQLite + sqlite-vec, 400-token chunks with 80-token overlap, 70% vector + 30% BM25/FTS5. Tools: `memory_search()`, `memory_get()`.

Retain/Recall/Reflect loop for persistent knowledge.

## Model Failover

Resolution: primary → fallback models, with auth profile rotation. Handles: auth failures (rotate), rate limits (cooldown), context overflow (auto-compact), timeouts (retry next profile).

## Session Management

JSONL files at `~/.openclaw/agents/{agentId}/sessions/`. Per-session overrides for model, thinking level. Compaction on context overflow. Reset policies: idle-based, daily, manual.

## Multi-Agent Routing

`bindings` array routes channels/accounts to isolated agents with separate workspaces, sessions, auth profiles, and tool policies.

## Key Patterns to Adopt
- Channel adapter abstraction (normalize inbound/outbound)
- Tool schema + policy chain
- Hybrid memory (vector + FTS)
- Model failover with profile rotation
- Workspace files for bootstrap context
- Plugin tool registration pattern

## Key Patterns to Replace
- Serial lane queues → event loop with parallel dispatch
- Cron/heartbeat polling → event-driven scheduling
- Single agent per session → coordinator spawning multiple agents
- One-at-a-time execution → concurrent agent work with result aggregation

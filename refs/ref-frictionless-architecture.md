# ref-frictionless-architecture
- **Source:** https://github.com/zot/frictionless (local copy at vault `frictionless/`)
- **Summary:** Frictionless is an app ecosystem for Claude — event-driven, hot-loadable Lua apps with declarative UI bindings. Provides the event loop and coordinator patterns we're adopting.

## Core Concept

"An app ecosystem for Claude" — users chat with Claude to build apps, use them together, evolve them live. Apps are fully hot-loadable (frontend + backend changes without restart). Structural data changes persist across reloads.

## Architecture

Apps use three components:
1. **Lua backend** — application logic and state management via `session:prototype()` / `session:create()`
2. **HTML viewdefs** — UI templates with `ui-*` attribute bindings (Shoelace web components)
3. **Interactive runtime** — automatic sync between state and interface

No API endpoints, no DTOs, no manual frontend code, no sync wiring.

## Event System (Key Pattern)

Events flow bidirectionally via `mcp.pushState()`:

```
UI Actions → pushState({event, app, ...}) → Claude/Coordinator
Claude → mcp:run("lua code") → App State → Auto-sync to UI
```

Events include: `chat`, `build_request`, `test_request`, `fix_request`, `app_created`, `consolidate_request`, `review_gaps_request`, `analyze_request`.

Each event carries: `app` (source), `event` (type), custom payload fields, `note` (context hint).

## Background Agent Spawning (Key Pattern)

For long-running tasks like builds, the coordinator spawns background agents:

```
build_request event → Coordinator spawns background agent
                      Agent reports progress via mcp:appProgress(name, percent, stage)
                      Coordinator continues handling other events
                      Agent completes → mcp:appUpdated(name)
```

This is the pattern we want to generalize: event arrives → spawn agent(s) → they work in parallel → report back.

## App Console (Coordinator UI)

The app-console acts as a command center:
- Discovers apps by scanning filesystem
- Shows build progress (0-100% with stage labels)
- Dispatches events to Claude
- Manages app lifecycle (create, build, test, fix, delete)

## MCP Integration

Apps communicate via MCP (Model Context Protocol) server:
- `mcp:status()` — get runtime state (base_dir, mcp_port)
- `mcp:appProgress(name, progress, stage)` — update progress
- `mcp:appUpdated(name)` — trigger rescan
- `mcp:addAgentMessage(text)` — send response to UI
- `mcp:addAgentThinking(text)` — send progress update to UI
- `mcp:app(name)` — load app global for embedding

## Build Pipeline

Multi-phase with progress reporting:
1. Reading requirements (5%)
2. Updating requirements (10%)
3. Designing (20%)
4. Writing code (40%)
5. Writing viewdefs (60%)
6. Linking (80%)
7. Auditing (90%)
8. Simplifying (95%)
9. Complete (100%)

## Key Patterns to Adopt
- **Event loop dispatch** — events from multiple sources, single coordinator
- **Background agent spawning** — long tasks delegated to parallel agents
- **Progress reporting** — agents report back with structured progress
- **pushState/event contract** — standard event format between components
- **Hot-loading** — live updates without restart
- **Bidirectional skill communication** — skills emit events back to the loop

## Key Patterns to Adapt
- Lua → TypeScript (different runtime)
- Frictionless-specific MCP → generic event bus
- Browser-based viewdefs → skill-defined frontends (open to any implementation)
- Single Claude model → model-agnostic multi-provider support

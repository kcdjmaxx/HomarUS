# Advanced Features

This document covers HomarUS's advanced subsystems: agent dispatch, compaction resilience, hot-loadable skills, browser automation, and external API integration patterns.

---

## Agent Dispatch System

The agent dispatch system offloads heavy or long-running tasks to background agents while keeping the main event loop responsive.

### Architecture

The `AgentRegistry` (`src/agent-registry.ts`) tracks background agents in-memory. Each agent has:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique task identifier |
| `description` | string | Human-readable description of the task |
| `status` | `running` / `completed` / `failed` / `timeout` | Current state |
| `startTime` | number | Epoch ms when the agent was registered |
| `result` | string? | Completion result (set on success) |
| `error` | string? | Error message (set on failure/timeout) |

Default concurrency limit: **3** agents. Default timeout: **30 minutes**. A background checker runs every 60 seconds to mark timed-out agents.

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents` | List all agents and their statuses |
| `POST` | `/api/agents` | Register a new agent (`{id, description}`) |
| `PATCH` | `/api/agents/:id` | Update agent status (`{status, result?, error?}`) |
| `DELETE` | `/api/agents/:id` | Clean up a finished agent |
| `POST` | `/api/agents/:id/complete` | Completion callback (`{result}` or `{error}`) |

### Dispatch Pattern

1. **Check capacity** -- `GET /api/agents` and verify fewer than `maxConcurrent` agents are running.
2. **Register the agent** with the backend.
3. **Spawn a background agent** via Claude Code's Task tool with `run_in_background=true`.
4. **Resume the event loop** immediately -- don't wait for the agent to finish.
5. **Agent reports completion** by calling the callback URL.
6. The registry emits an `agent_completed` event, which arrives in the next `/api/wait` response.
7. **Clean up** the agent entry.

### Dispatch Heuristics

| Handle inline | Dispatch to agent |
|---------------|-------------------|
| Quick replies and simple lookups | Research tasks (web search + synthesis) |
| Memory searches | Multi-file reading/processing |
| Short messages | Any task requiring 3+ tool calls |
| Timer acknowledgments | Long-running analysis |

---

## Session Checkpoints & Compaction Resilience

### What Compaction Is

Claude Code compacts context when the conversation grows too long, compressing earlier turns into a summary. This loses detailed state. HomarUS provides mechanisms to preserve critical state across compaction boundaries.

### Compaction Manager

The `CompactionManager` (`src/compaction-manager.ts`) handles the pre- and post-compaction hooks that Claude Code calls.

**Pre-compaction hook** (`GET /api/pre-compact`):
- Fires once per compaction cycle (idempotent guard)
- Increments and persists the compaction counter
- Returns a prompt instructing Claude to save session state
- If the event loop was active, includes a critical instruction to restart it after compaction

**Post-compaction hook** (`GET /api/post-compact`):
- Returns post-compaction context
- If the event loop was active, instructs immediate restart

### Identity Re-injection

The `/api/wait` endpoint adjusts its response based on whether compaction has occurred:

- **Normal wake** (`full: false`): Returns a compact identity digest (~200 tokens)
- **Post-compaction wake** (`full: true`): Returns full soul.md, user.md, and state.md (~3K tokens) so the agent can fully re-adopt its persona

The `consumeCompactionFlag()` method is consume-once: it returns `true` only on the first `/api/wait` call after compaction, then resets.

### Auto-Restart

The compaction counter persists across backend restarts at `~/.homarus/compaction-count.json`. After **8 compactions** (`MAX_COMPACTIONS`), the system signals `shouldRestart: true` in the `/api/wait` response. The event loop script detects this and instructs a fresh Claude Code session.

---

## Skill System

Skills are hot-loadable extensions that register tools and handle events, managed by `SkillManager` (`src/skill-manager.ts`).

### Skill Structure

Each skill is a directory containing a `skill.json` manifest:

```
~/.homarus/skills/my-skill/
  skill.json
  (optional: main.js, handler.ts, etc.)
```

### Skill Manifest (`skill.json`)

```json
{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "What this skill does",
  "emits": ["custom_event_type"],
  "handles": ["telegram_message", "timer_fired"],
  "tools": [
    {
      "name": "my_custom_tool",
      "description": "Does something useful",
      "parameters": {
        "type": "object",
        "properties": {
          "input": { "type": "string" }
        },
        "required": ["input"]
      }
    }
  ],
  "process": {
    "command": "node",
    "args": ["main.js"],
    "port": 8900,
    "healthCheck": "/health"
  }
}
```

### Transport Types

Skills communicate with the backend via one of three transports (`src/skill-transport.ts`):

| Transport | When used | Communication |
|-----------|-----------|---------------|
| `HttpSkillTransport` | `process.port` is set | HTTP POST to `localhost:{port}` |
| `StdioSkillTransport` | `process.command` is set (no port) | JSON lines over stdin/stdout |
| `DirectSkillTransport` | No `process` config | In-process function calls |

### Lifecycle

1. **Loading**: `SkillManager.loadAll()` scans configured `skills.paths` directories for subdirectories with `skill.json`.
2. **Registration**: Each skill's tools are registered with the `ToolRegistry`. Event handlers are wired to the `EventBus`.
3. **Hot-reload**: `startWatching()` uses `fs.watch` on search paths. When a skill directory changes, it unloads and reloads automatically.
4. **Unloading**: `unload()` removes tools from the registry and stops the skill process.

### Configuration

In `~/.homarus/config.json`:

```json
{
  "skills": {
    "paths": ["~/.homarus/skills"]
  }
}
```

---

## Browser Automation

HomarUS integrates Playwright for browser automation via `BrowserManager` (`src/browser-manager.ts`) and seven MCP tools.

### Setup

1. Install Playwright: `npx playwright install chromium`

2. Enable in config:
```json
{
  "browser": {
    "enabled": true,
    "headless": true,
    "viewport": { "width": 1280, "height": 720 },
    "timeout": 30000
  }
}
```

### Lazy Launch

The browser is not started until the first tool call. `launch()` starts Chromium on first use and reuses the same page for subsequent calls.

### Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `browser_navigate` | Navigate to a URL | `url` |
| `browser_snapshot` | Get text content of current page | (none) |
| `browser_screenshot` | Take PNG screenshot (base64) | (none) |
| `browser_click` | Click element by CSS selector | `selector` |
| `browser_type` | Type text into input by CSS selector | `selector`, `text` |
| `browser_evaluate` | Execute JavaScript in page | `script` |
| `browser_content` | Get text content of current page | (none) |

### Usage Pattern

```
browser_navigate: url="https://example.com"
browser_snapshot                        # Read page content
browser_click: selector="#login-btn"    # Interact with elements
browser_type: selector="#email", text="user@example.com"
browser_evaluate: script="document.title"
browser_screenshot                      # Visual verification
```

---

## External API Integration Patterns

### The `run_tool` Pattern

The `run_tool` MCP tool delegates execution to any registered backend tool. This is the primary mechanism for extending HomarUS with new capabilities without modifying the MCP protocol layer.

```
run_tool: name="bash", params={"command": "curl -s https://api.example.com/data"}
run_tool: name="web_fetch", params={"url": "https://example.com"}
run_tool: name="web_search", params={"query": "latest news"}
```

### Adding a New API Integration

The recommended pattern for adding external APIs:

1. **Create a tool file** in `src/tools/`:

```typescript
import type { ToolDefinition, ToolResult } from "../types.js";

export function createMyApiTools(config: MyApiConfig): ToolDefinition[] {
  return [{
    name: "my_api_fetch",
    description: "Fetch data from My API",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" }
      },
      required: ["query"]
    },
    source: "builtin",
    async execute(params: unknown): Promise<ToolResult> {
      const { query } = params as { query: string };
      // API call logic here
      return { output: JSON.stringify(result) };
    }
  }];
}
```

2. **Register the tools** in the MCP tools list (via `src/mcp-tools.ts` or as a skill).

3. **Store credentials** in `~/.homarus/.env`:
```
MY_API_KEY=your-key-here
```

4. **Reference secrets in config** using `${VAR}` interpolation:
```json
{
  "myApi": {
    "apiKey": "${MY_API_KEY}"
  }
}
```

### Config Environment Variable Resolution

Config values can reference environment variables. The `resolveEnvVars()` method recursively replaces `${VAR_NAME}` patterns in all string values throughout the config tree.

---

## Passive Fact Extraction

The `FactExtractor` (`src/fact-extractor.ts`) runs in the background, extracting knowledge from conversations without consuming context window tokens.

### How It Works

1. Conversation turns are buffered as they flow through the event loop
2. After a quiet period (default 60 seconds) or when the buffer hits batch size (default 5 turns), extraction triggers
3. The turns are sent to Claude Haiku for analysis
4. Extracted facts are categorized and stored in memory under structured prefixes

### Fact Categories

| Category | Storage prefix | What it captures |
|----------|---------------|-----------------|
| `preference` | `local/user/preferences/` | User preferences and style |
| `correction` | `local/user/corrections/` | Explicit corrections to behavior |
| `pattern` | `local/user/patterns/` | Recurring behaviors and routines |
| `fact` | `local/user/context/` | Background facts about the user |
| `decision` | `local/user/decisions/` | Decisions made during sessions |

### Deduplication

Before storing a fact, the extractor searches existing memory for similar content (score threshold 0.8). Duplicates are skipped.

### Configuration

```json
{
  "factExtractor": {
    "enabled": true,
    "batchSize": 5,
    "extractionDelayMs": 60000,
    "model": "claude-haiku-4-5-20251001"
  }
}
```

Requires `ANTHROPIC_API_KEY` in `.env`. If the key is not set, the extractor disables itself.

---

## Related Documentation

- [Configuration](configuration.md) -- config file reference
- [Operations](operations.md) -- monitoring, troubleshooting, and maintenance
- [Security](security.md) -- permission boundaries and safety rules
- [Docs Vector DB](docs-vectordb.md) -- domain-specific documentation indexes

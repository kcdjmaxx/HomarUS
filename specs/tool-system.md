# Tool System

**Language:** TypeScript
**Environment:** Node.js >= 22, Unix-like systems

## Overview

Tools are the capabilities that agents can use during execution. The tool system manages registration, access control, and execution of tools. Tools come from three sources: built-in, skills, and user-defined.

## Tool Definition

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;       // JSON Schema for input validation
  execute(params: unknown): Promise<ToolResult>;
  source: string;               // "builtin", skill name, or "user"
}
```

## Built-in Tools

Core tools available to all agents (subject to policy):

- **bash** — execute shell commands with timeout
- **read** — read file contents
- **write** — write file contents
- **edit** — patch/replace in files
- **web_fetch** — HTTP requests
- **web_search** — web search
- **browser** — headless Chrome automation (navigate, screenshot, interact)
- **memory_search** — semantic memory search
- **memory_get** — direct memory file access
- **memory_store** — persist to memory
- **emit_event** — emit an event to the loop (for agent-to-loop communication)

## Skill-Provided Tools

Skills register tools via their manifest. These tools are available to agents when the skill is loaded. Examples: `liquor_search_items`, `kanban_get_tasks`, `git_commit`.

## Tool Policy

Multi-layer access control (evaluated in order, most restrictive wins):

1. **Agent-level** — per-agent tool allow/deny lists
2. **Sandbox policy** — restrictions for sandboxed execution
3. **Skill policy** — what tools a skill's agents can access
4. **Global policy** — system-wide allow/deny

Tool groups for convenience: `group:fs` (read, write, edit), `group:runtime` (bash), `group:web` (web_fetch, web_search, browser), `group:memory` (memory_*).

## Execution

Tools execute in the context of the calling agent. Results are returned to the model for the next inference step. Tool execution respects:
- Timeouts (configurable per-tool)
- Output size limits (truncate large outputs)
- Sandboxing (when agent runs in sandbox mode)

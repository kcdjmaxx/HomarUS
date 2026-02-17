# Skill System

**Language:** TypeScript
**Environment:** Node.js >= 22, Unix-like systems

## Overview

Skills are the extensibility mechanism. A skill is anything that adds capability to the system — it could be a web app with a frontend, a background service, a CLI tool, a bash script, or just a set of tool definitions. The system doesn't dictate how skills are implemented; it only cares about the event contract.

## Skill Contract

Every skill must define:

1. **Manifest** (`skill.json`) — metadata, event types it emits and handles, tools it provides
2. **Event interface** — what events it sends to the loop and what events it listens for
3. **Lifecycle hooks** — optional start/stop/health functions

```typescript
interface SkillManifest {
  name: string;
  version: string;
  description: string;

  // Events this skill emits to the loop
  emits?: string[];

  // Events this skill wants to handle
  handles?: string[];

  // Tools this skill provides to agents
  tools?: ToolDefinition[];

  // How to start the skill (if it's a long-running process)
  process?: {
    command: string;
    args?: string[];
    port?: number;          // if it serves HTTP
    healthCheck?: string;   // URL path for health check
  };

  // Lifecycle hooks (TypeScript functions)
  hooks?: {
    onStart?: string;       // function to call on startup
    onStop?: string;        // function to call on shutdown
    onHealth?: string;      // function for health check
  };
}
```

## Skill Types

### Tool-only Skills
Simplest type. Just registers tools that agents can call. No long-running process.

Example: A "git" skill that adds `git_status`, `git_commit`, `git_push` tools.

### Service Skills
Long-running processes (Express servers, etc.) that serve web UIs and/or APIs. They communicate with the loop via events.

Example: Liquor inventory — Express server on port 8881, web UI, emits `order_submitted` events, handles `send_orders` events.

### Script Skills
One-shot scripts triggered by events. No persistent state.

Example: A "deploy" skill that runs a deployment script when triggered.

### Composite Skills
Combine multiple sub-skills. Can define workflows that chain skill calls.

## Skill Communication

Skills communicate with the loop through a standard transport:

- **HTTP** — skill registers a callback URL, loop POSTs events to it; skill POSTs events to loop's API
- **Stdio** — for subprocess skills, events sent via stdin/stdout JSON lines
- **Direct** — for in-process skills, direct function calls

The loop provides a local API endpoint that skills can call to emit events:

```
POST /events
{
  "type": "skill_callback",
  "source": "liquor-inventory",
  "payload": { "action": "order_submitted", "items": [...] }
}
```

## Skill Discovery and Loading

Skills are loaded from:
1. **Built-in** — bundled with the system
2. **User directory** — `~/.homarus/skills/`
3. **Project directory** — `./skills/` (per-project)

On startup, the loop scans skill directories, reads manifests, registers event handlers and tools, and starts any service skills.

## Skill Isolation

Skills can optionally run in sandboxed mode:
- Subprocess with limited filesystem access
- Network restrictions
- Resource limits (CPU, memory)
- Tool policy restrictions (which tools the skill's agents can use)

## Hot Reloading

When a skill's files change:
1. Loop detects change via filesystem watcher
2. Gracefully stops the old skill instance
3. Reloads manifest and re-registers handlers/tools
4. Starts new instance
5. No system restart needed

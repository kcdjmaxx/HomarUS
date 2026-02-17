# Agent Spawning

**Language:** TypeScript
**Environment:** Node.js >= 22, Unix-like systems

## Overview

When the event loop determines that work requires AI reasoning, it spawns one or more agents. Agents are independent units of work — they get a prompt, tools, and a model, and they run until they produce a result. The loop is the manager; agents are the workers.

## Agent Lifecycle

1. **Spawn** — loop creates agent with: prompt, model config, available tools, timeout, and a result callback
2. **Running** — agent makes model API calls, executes tools, streams progress back to the loop
3. **Complete** — agent finishes with a result (success, failure, or partial)
4. **Cleanup** — resources released, result delivered back to the loop via event

## Parallel Execution

The loop can spawn multiple agents simultaneously:

- **Fan-out:** One event triggers multiple agents working on different aspects of the same task
- **Independent:** Unrelated events spawn unrelated agents that run concurrently
- **Pipeline:** Agent A's result triggers Agent B (sequential chaining via events)

## Agent Communication

Agents communicate with the loop through events:

- **Progress** — agent reports intermediate status (e.g., "reading files", "40% complete")
- **Result** — agent delivers final output
- **Error** — agent reports failure
- **Request** — agent asks the loop for something (e.g., "run this skill", "spawn a sub-agent")

Agents do NOT communicate directly with each other. All coordination goes through the loop.

## Agent Configuration

Each spawned agent receives:

```typescript
interface AgentConfig {
  prompt: string;            // what to do
  model: string;             // which model to use (resolved via model abstraction)
  tools: string[];           // which tools are available
  timeout?: number;          // max execution time
  maxTurns?: number;         // max inference rounds
  systemPrompt?: string;     // override system prompt
  memory?: boolean;          // whether to enable memory search
  sandbox?: boolean;         // whether to run in sandboxed mode
}
```

## Tool Execution

Agents execute tools during their inference loop:
- **Bash** — run shell commands
- **Filesystem** — read, write, edit files
- **Browser** — headless Chrome automation
- **Memory** — search/retrieve from memory index
- **Skill calls** — invoke registered skills
- **HTTP** — make web requests

Tools are filtered by the agent's config and the global tool policy.

## Resource Limits

- Max concurrent agents (configurable, default: 5)
- Per-agent timeout (default: 5 minutes)
- Per-agent max turns (default: 20)
- Memory limit per agent process
- Total system resource budget

## Agent Types

The system supports different agent execution strategies:

- **Embedded** — runs in the same Node.js process (fast, shares memory)
- **Subprocess** — runs in a child process (isolated, can be sandboxed)
- **Remote** — runs on a different machine (for distributed setups)

Default is embedded for speed; subprocess for untrusted or resource-heavy work.

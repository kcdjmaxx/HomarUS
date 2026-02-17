# Event Loop Core

**Language:** TypeScript
**Environment:** Node.js >= 22, Unix-like systems

## Overview

The event loop is the central coordinator of the system. It receives events from multiple sources, decides what work needs to happen, dispatches that work (often by spawning agents), and handles results when they come back. It never does the "thinking" itself — it's a scheduler and router, not an AI agent.

## Event Sources

The loop listens for events from:

- **Channels** — incoming messages from Telegram, WhatsApp, Discord, etc.
- **Skills** — skill processes calling back into the loop (e.g., a web UI button click)
- **Agents** — spawned agents reporting results, progress, or errors
- **Timers** — scheduled events (cron expressions, one-shot timers, intervals)
- **Webhooks** — external HTTP callbacks
- **Filesystem** — file change watchers (e.g., inbox directories)
- **Internal** — system events like startup, shutdown, config reload

## Event Format

All events share a common envelope:

```typescript
interface Event {
  id: string;            // unique event ID
  type: string;          // event type (e.g., "message", "skill_callback", "agent_result")
  source: string;        // where it came from (channel name, skill name, agent ID)
  timestamp: number;     // when it was emitted
  payload: unknown;      // type-specific data
  replyTo?: string;      // optional: event ID this is responding to
  priority?: number;     // optional: priority level (default normal)
}
```

## Dispatch

When an event arrives, the loop:

1. Validates the event envelope
2. Looks up registered handlers for the event type
3. Determines whether to handle synchronously or spawn agent(s)
4. Dispatches to the appropriate handler(s)
5. If spawning agents, tracks them and listens for their results

Multiple handlers can be registered for the same event type. The loop supports both:
- **Direct handlers** — synchronous functions for simple/fast work
- **Agent handlers** — spawn one or more agents for complex/slow work

## Concurrency

The loop itself is single-threaded (Node.js event loop). Agent work happens in parallel via:
- Child processes (for bash/tool execution)
- Concurrent async operations (for model API calls)
- Worker threads (for CPU-intensive work if needed)

The loop tracks all in-flight agents and their state. It can:
- Spawn multiple agents for the same event (fan-out)
- Wait for all agents to complete (fan-in / join)
- Cancel agents that are no longer needed
- Handle partial results as agents stream progress

## Backpressure

When too many events queue up or too many agents are in-flight, the loop applies backpressure:
- Configurable max concurrent agents
- Event queue with priority ordering
- Overflow strategies: drop lowest priority, delay, or reject

## Lifecycle

- **Startup:** Load config, register built-in handlers, load skills, start channel adapters, start timer service
- **Running:** Process events, spawn agents, track results
- **Shutdown:** Graceful — drain event queue, wait for in-flight agents (with timeout), close channels, persist state

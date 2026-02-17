# Homarus Agent — Design

## Intent

An homarus based AI agent coordinator that receives events from multiple sources (channels, skills, timers, webhooks), spawns parallel agents to handle work, and aggregates results. Replaces the serial cron/heartbeat model of OpenClaw with the event-driven dispatch model inspired by Frictionless. TypeScript/Node.js for Unix-like systems. Model-agnostic with an open skill/plugin system.

## Cross-cutting Concerns

### Error Handling
All subsystems use typed errors extending a base `HomarusError`. Errors in agent execution trigger failover (see ModelRouter). Errors in skills trigger skill health degradation. Errors in channels trigger reconnection. Unhandled errors are logged and emitted as `system_error` events.

### Logging
Structured JSON logging via a Logger interface. All components receive a logger from Homarus. Log levels: debug, info, warn, error. Logs include component name, event ID (when in event context), and agent ID (when in agent context).

### Event Tracing
Every event carries an `id` field. When an event triggers agent spawning, the agent's result event includes `replyTo` pointing back to the original event. This creates a trace chain: inbound event → agent spawn → tool calls → result event.

### Configuration Propagation
Config is loaded once by Homarus and distributed to subsystems via constructor injection. Each manager reads its own section. Hot reload pushes changes to affected subsystems.

### Graceful Degradation
If a subsystem fails to start (e.g., a channel adapter can't connect), the system logs a warning and continues without it. Only Config and Homarus failures are fatal.

## Artifacts

### CRC Cards
- [x] crc-Homarus.md → `src/homarus.ts`
- [x] crc-EventBus.md → `src/event-bus.ts`
- [x] crc-EventQueue.md → `src/event-queue.ts`
- [x] crc-AgentManager.md → `src/agent-manager.ts`
- [x] crc-Agent.md → `src/agent.ts`
- [x] crc-SkillManager.md → `src/skill-manager.ts`
- [x] crc-Skill.md → `src/skill.ts`
- [x] crc-SkillTransport.md → `src/skill-transport.ts`
- [x] crc-ModelRouter.md → `src/model-router.ts`
- [x] crc-ModelProvider.md → `src/model-provider.ts`
- [x] crc-MemoryIndex.md → `src/memory-index.ts`
- [x] crc-ChannelManager.md → `src/channel-manager.ts`
- [x] crc-ChannelAdapter.md → `src/channel-adapter.ts`
- [x] crc-ToolRegistry.md → `src/tool-registry.ts`
- [x] crc-IdentityManager.md → `src/identity-manager.ts`
- [x] crc-TimerService.md → `src/timer-service.ts`
- [x] crc-Config.md → `src/config.ts`
- [x] crc-HttpApi.md → `src/http-api.ts`
- [x] crc-CLI.md → `src/cli.ts`

### Sequences
- [x] seq-startup.md → `src/homarus.ts`
- [x] seq-message-dispatch.md → `src/homarus.ts`, `src/agent-manager.ts`, `src/channel-adapter.ts`
- [x] seq-agent-execution.md → `src/agent.ts`, `src/model-router.ts`, `src/tool-registry.ts`
- [x] seq-skill-callback.md → `src/skill.ts`, `src/skill-transport.ts`, `src/http-api.ts`
- [x] seq-timer-fire.md → `src/timer-service.ts`, `src/homarus.ts`
- [x] seq-shutdown.md → `src/homarus.ts`, `src/agent-manager.ts`

### Test Designs
- [ ] test-Homarus.md → `src/homarus.test.ts`
- [ ] test-AgentManager.md → `src/agent-manager.test.ts`
- [ ] test-ModelRouter.md → `src/model-router.test.ts`
- [ ] test-SkillManager.md → `src/skill-manager.test.ts`

## Gaps

- [ ] D1: Test files not yet implemented
  - [ ] test-Homarus.md → `src/homarus.test.ts`
  - [ ] test-AgentManager.md → `src/agent-manager.test.ts`
  - [ ] test-ModelRouter.md → `src/model-router.test.ts`
  - [ ] test-SkillManager.md → `src/skill-manager.test.ts`
- [ ] O1: No built-in channel adapters beyond CLI (Telegram, Discord, Slack would be skills)
- [ ] O2: No built-in tools registered (bash, read, write, web_fetch) — need core tool implementations
- [ ] O3: MemoryIndex embedding provider has no concrete implementation (only interface defined)
- [ ] O4: Agent subprocess/remote execution strategies not implemented (only embedded mode)

- [ ] O5: BrowserManager needs proper mini-spec design (CRC card, sequences, test design)
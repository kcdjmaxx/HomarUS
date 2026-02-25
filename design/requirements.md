# Requirements

## Feature: Event Loop Core
**Source:** specs/homarus-core.md

- **R1:** The system shall have a central event loop that receives events from multiple sources and dispatches work
- **R2:** The event loop shall support these event sources: channels, skills, agents, timers, webhooks, filesystem watchers, and internal system events
- **R3:** All events shall share a common envelope format with id, type, source, timestamp, payload, and optional replyTo and priority fields
- **R4:** The loop shall support both direct handlers (synchronous functions) and agent handlers (spawn agents) for event dispatch
- **R5:** Multiple handlers can be registered for the same event type
- **R6:** The loop shall track all in-flight agents and their state
- **R7:** The loop shall support fan-out (spawn multiple agents for one event), fan-in (wait for all to complete), and cancellation of agents
- **R8:** The loop shall apply backpressure via configurable max concurrent agents, priority-ordered event queue, and overflow strategies (drop, delay, reject)
- **R9:** The loop shall have a defined lifecycle: startup (load config, register handlers, load skills, start channels, start timers) → running → shutdown (drain queue, wait for agents with timeout, close channels, persist state)
- **R10:** The event loop itself shall be single-threaded (Node.js event loop) with parallel work via child processes, concurrent async operations, and optional worker threads

## Feature: Agent Spawning
**Source:** specs/agent-spawning.md

- **R11:** The loop shall spawn independent agent units of work with: prompt, model config, available tools, timeout, and result callback
- **R12:** Agents shall have a lifecycle: spawn → running → complete (success/failure/partial) → cleanup
- **R13:** Agents shall communicate with the loop via events: progress, result, error, and request (e.g., "run this skill", "spawn sub-agent")
- **R14:** Agents shall NOT communicate directly with each other; all coordination goes through the loop
- **R15:** The system shall support parallel agent execution patterns: fan-out, independent, and pipeline (agent A result triggers agent B)
- **R16:** Each agent shall be configurable with: prompt, model, tools list, timeout, maxTurns, systemPrompt override, memory access, and sandbox mode
- **R17:** Agents shall execute tools during their inference loop: bash, filesystem, browser, memory, skill calls, HTTP
- **R18:** The system shall enforce resource limits: max concurrent agents, per-agent timeout, per-agent max turns, and memory limits
- **R19:** The system shall support agent execution strategies: embedded (in-process), subprocess (isolated), and remote (distributed)

## Feature: Skill System
**Source:** specs/skill-system.md

- **R20:** Skills shall be the primary extensibility mechanism, open to any implementation (web app, service, CLI, bash script, tool definitions)
- **R21:** Every skill shall have a manifest (`skill.json`) defining: name, version, description, events it emits, events it handles, tools it provides, and optional process/lifecycle config
- **R22:** The system shall support skill types: tool-only (registers tools, no process), service (long-running with optional HTTP), script (one-shot triggered by events), and composite (chains sub-skills)
- **R23:** Skills shall communicate with the loop via standard transports: HTTP (POST events), stdio (JSON lines for subprocess skills), or direct (in-process function calls)
- **R24:** The loop shall provide a local API endpoint that skills can call to emit events back to the loop
- **R25:** Skills shall be loaded from: built-in, user directory (`~/.homarus/skills/`), and project directory (`./skills/`)
- **R26:** Skills shall support optional sandboxed execution with filesystem, network, and resource restrictions
- **R27:** Skills shall support hot reloading: detect file changes, gracefully stop old instance, reload manifest, start new instance without system restart

## Feature: Model Abstraction
**Source:** specs/model-abstraction.md

- **R28:** The system shall be model-agnostic with a common provider interface supporting chat, model listing, tool support detection, and streaming
- **R29:** Built-in provider adapters shall support: Anthropic, OpenAI, OpenRouter, Ollama (local), and any OpenAI-compatible endpoint
- **R30:** Model resolution shall follow: explicit agent config → task-type default → global default, with alias support (e.g., "smart" → specific model)
- **R31:** The system shall support failover chains: auth error (rotate profiles), rate limit (cooldown + next model), context overflow (compact + retry), timeout (next model), provider down (skip provider)
- **R32:** Each provider shall support multiple auth profiles with cooldown tracking for failed keys
- **R33:** The event loop shall be able to specify which model a spawned agent uses, enabling per-task model selection for cost optimization
- **R34:** The system shall track token usage per model, per agent, and per task, with configurable budget limits

## Feature: Memory System
**Source:** specs/memory-system.md

- **R35:** The system shall support workspace files (user-editable Markdown) injected into agent system prompts as bootstrap context
- **R36:** The system shall provide semantic memory via hybrid vector + keyword search over a SQLite index with sqlite-vec
- **R37:** Memory indexing shall use configurable embedding providers (OpenAI, Ollama, any OpenAI-compatible endpoint)
- **R38:** Memory search shall be hybrid with configurable vector/keyword weight split (default 70/30)
- **R39:** Agents shall access memory through tools: memory_search (semantic), memory_get (direct file), memory_store (persist)
- **R40:** The memory index shall auto-update on file changes with incremental re-indexing
- **R41:** The memory system shall support configurable extra paths for indexing additional directories
- **R42:** (inferred) Memory chunking shall use configurable chunk size and overlap (default 400 tokens, 80 overlap)

## Feature: Channel Adapters
**Source:** specs/channel-adapters.md

- **R43:** Channel adapters shall normalize inbound messages into standard events and convert outbound events into platform-specific messages
- **R44:** Each adapter shall implement: connect, disconnect, send, onMessage, and health check
- **R45:** Built-in adapters shall support: Telegram, WhatsApp, Discord, Slack, Signal, HTTP/webhook, and CLI (dev/testing)
- **R46:** Inbound messages shall be normalized to a common format with: from, channel, text, attachments, replyTo, isGroup, isMention, and raw original message
- **R47:** Access control shall support per-channel DM policy (pairing, allowlist, open, disabled) and group policy (mention-required, always-on, disabled)
- **R48:** Events from different channels/accounts shall be routable to different handler configurations for per-channel personas or tool sets

## Feature: Tool System
**Source:** specs/tool-system.md

- **R49:** Tools shall have a standard definition: name, description, JSON Schema parameters, execute function, and source identifier
- **R50:** Built-in tools shall include: bash, read, write, edit, web_fetch, web_search, browser, memory_search, memory_get, memory_store, and emit_event
- **R51:** Skills shall be able to register additional tools via their manifest
- **R52:** Tool access shall be controlled by a multi-layer policy chain: agent-level → sandbox policy → skill policy → global policy
- **R53:** Tool groups shall provide convenience shorthands: group:fs, group:runtime, group:web, group:memory
- **R54:** Tool execution shall respect per-tool timeouts, output size limits, and sandboxing

## Feature: Identity System
**Source:** specs/identity-system.md

- **R55:** The system shall support agent identity via a soul file (personality, values, communication style, boundaries, domain expertise, quirks)
- **R56:** The system shall support a user profile file (name, preferences, timezone, context, conventions, tools/environment, relationships)
- **R57:** Identity files shall be stored as user-editable Markdown in `~/.homarus/identity/`
- **R58:** All spawned agents shall inherit the base identity (soul + user) for multi-agent consistency
- **R59:** Identity shall support overlays: per-channel tone adjustments and per-task personality modifications that layer on top of the base without replacing it
- **R60:** System prompt assembly order shall be: soul → user → overlay → workspace → task
- **R61:** Identity changes shall take effect on next agent spawn without system restart
- **R62:** The system shall NOT auto-modify identity files; only the user changes who the agent is

## Feature: Configuration
**Source:** specs/configuration.md

- **R63:** The system shall be configured via a JSON config file with sensible defaults
- **R64:** Config shall support environment variable references with `${VAR_NAME}` syntax and `.env` file loading
- **R65:** Config location shall be `~/.homarus/config.json` with per-project override at `./homarus.json`
- **R66:** Config shall support hot reload: safe changes apply immediately, unsafe changes warn and require restart
- **R67:** Config shall be validated against a strict JSON schema; unknown keys shall be rejected
- **R68:** The system shall provide a CLI with commands: init, start, stop, status, config validate, skill list, skill add
- **R69:** (inferred) The system shall provide a local HTTP API for status, health checks, and programmatic control
- **R70:** (inferred) The system shall support running as a daemon via systemd (Linux) or launchd (macOS)

## Feature: MCP Layer
**Source:** specs/mcp-layer.md

### Two-Process Architecture
- **R71:** The system shall provide an MCP proxy (`mcp-proxy.ts`) that speaks MCP stdio protocol to Claude Code and never restarts during a session
- **R72:** The proxy shall spawn and manage a backend process as a child, forwarding MCP tool calls and resource reads over HTTP
- **R73:** The backend (`backend.ts`) shall run the existing Homarus event loop plus an HTTP API for the proxy
- **R74:** A `restart_backend` MCP tool shall live in the proxy itself, allowing the backend to be restarted without dropping the MCP connection
- **R75:** The backend HTTP API shall expose: `/api/health`, `/api/tool-list`, `/api/tool-call`, `/api/resource-list`, `/api/resource`, `/api/wait`
- **R76:** The proxy shall wait up to 30 seconds for the backend to become healthy after spawning
- **R77:** The proxy shall gracefully stop the backend on SIGINT/SIGTERM
- **R78:** The existing `homarus start` standalone mode shall continue working unchanged

### MCP Tools
- **R79:** The system shall expose `telegram_send` as an MCP tool (send message to Telegram chat by chatId)
- **R80:** The system shall expose `telegram_read` as an MCP tool (read recent incoming messages with configurable limit)
- **R81:** The system shall expose `telegram_typing` as an MCP tool (send typing indicator to a chat)
- **R82:** The system shall expose `telegram_react` as an MCP tool (react to a message with emoji)
- **R83:** The system shall expose `memory_search` as an MCP tool (hybrid vector + FTS search)
- **R84:** The system shall expose `memory_store` as an MCP tool (store and index content by key)
- **R85:** The system shall expose `timer_schedule` as an MCP tool (cron, interval, or one-shot)
- **R86:** The system shall expose `timer_cancel` as an MCP tool
- **R87:** The system shall expose `get_status` as an MCP tool (system status)
- **R88:** The system shall expose `get_events` as an MCP tool (recent event history)
- **R89:** The system shall expose `wait_for_event` as an MCP tool (long-poll up to 120s)
- **R90:** The system shall expose `dashboard_send` as an MCP tool (send to dashboard channel if present)
- **R91:** All MCP tool handlers shall return `{ content: [{ type: "text", text }] }` format

### MCP Resources
- **R92:** The system shall expose `identity://soul` as an MCP resource (soul.md content)
- **R93:** The system shall expose `identity://user` as an MCP resource (user.md content)
- **R94:** The system shall expose `config://current` as an MCP resource (config JSON with secrets redacted)
- **R95:** The system shall expose `events://recent` as an MCP resource (last 20 events)

### Event Loop Script
- **R96:** The system shall provide a bash script `bin/event-loop` that long-polls `/api/wait`
- **R97:** The event loop script shall block at OS level, consuming zero Claude Code tokens while idle
- **R98:** On timeout (204), the script shall loop silently; on events (200), it shall print JSON and exit
- **R99:** The script shall use a PID file to prevent duplicate listeners

### Telegram Enhancements
- **R100:** The TelegramChannelAdapter shall support `sendTyping(chatId)` method
- **R101:** The TelegramChannelAdapter shall support `setReaction(chatId, messageId, emoji)` method
- **R102:** The TelegramChannelAdapter shall maintain a recent message buffer (50 messages) accessible via `getRecentMessages(limit)`
- **R103:** The adapter shall auto-send a typing indicator on message receipt

### Event History and Long-Poll
- **R104:** Homarus shall maintain an event history buffer (last 100 events)
- **R105:** Homarus shall support a `waitForEvent(timeoutMs, since?)` method that blocks until events arrive or timeout
- **R106:** Homarus shall track a delivery watermark to prevent replaying old events
- **R107:** Homarus shall expose getter methods for subsystems used by MCP tools (getChannelManager, getMemoryIndex, getTimerService, getIdentityManager, getConfig, getEventHistory)
- **R108:** Homarus shall support a `setNotifyFn()` callback for broadcasting events to external consumers

# Homarus
**Requirements:** R1, R2, R4, R5, R6, R7, R8, R9, R10
**Refs:** ref-frictionless-architecture, ref-openclaw-architecture

## Knows
- state: "starting" | "running" | "stopping" | "stopped"
- eventBus: EventBus (event registration and dispatch)
- agentManager: AgentManager (agent lifecycle)
- skillManager: SkillManager (skill loading)
- channelManager: ChannelManager (channel adapters)
- toolRegistry: ToolRegistry (tool definitions and policy)
- modelRouter: ModelRouter (model resolution)
- memoryIndex: MemoryIndex (semantic memory)
- identityManager: IdentityManager (prompt assembly)
- timerService: TimerService (scheduled events)
- config: Config (system configuration)
- eventQueue: EventQueue (priority queue with backpressure)

## Does
- start(): Initialize all subsystems in order (config → identity → memory → tools → skills → channels → timers), set state to running, begin processing events
- stop(): Graceful shutdown — drain queue, wait for in-flight agents (with timeout), stop channels, stop skills, persist state
- processEvent(event): Dequeue next event, validate envelope, look up handlers, dispatch to direct handlers or spawn agents via agentManager
- registerHandler(eventType, handler): Register a direct handler function for an event type
- registerAgentHandler(eventType, agentConfig): Register an agent-spawning handler for an event type
- emit(event): Push event onto the eventQueue for processing

## Collaborators
- EventBus: delegates handler registration and lookup
- EventQueue: manages event priority and backpressure
- AgentManager: spawns agents when agent handlers match
- Config: provides configuration for all subsystems

## Sequences
- seq-startup.md
- seq-message-dispatch.md
- seq-shutdown.md

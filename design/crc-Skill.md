# Skill
**Requirements:** R20, R21, R22, R23, R24, R26
**Refs:** ref-openclaw-coder-app

## Knows
- manifest: SkillManifest (name, version, emits, handles, tools, process config)
- state: "loaded" | "starting" | "running" | "stopping" | "stopped" | "error"
- transport: SkillTransport (HTTP | stdio | direct)
- process: ChildProcess | null (for service/script skills)
- sandboxConfig: SandboxConfig | null (optional isolation)

## Does
- start(): Start the skill process (if service type), establish transport
- stop(): Gracefully stop the skill process
- health(): Check if skill process is healthy
- emitToLoop(event): Send an event from the skill to the loop via transport
- receiveFromLoop(event): Handle an event dispatched from the loop
- getTools(): Return tool definitions from manifest
- getHandledEvents(): Return event types this skill handles
- getEmittedEvents(): Return event types this skill emits

## Collaborators
- SkillManager: manages this skill's lifecycle
- SkillTransport: handles communication protocol (HTTP/stdio/direct)
- Homarus: receives events from and dispatches events to this skill

## Sequences
- seq-skill-callback.md

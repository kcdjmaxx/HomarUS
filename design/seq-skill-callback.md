# Sequence: Skill Callback (Skill → Loop → Agent)
**Requirements:** R20, R23, R24, R4, R11

## Participants
- Skill, SkillTransport, HttpApi, Homarus, EventQueue
- EventBus, AgentManager, Agent

## Flow: HTTP Transport (Service Skill)

```
Skill(web UI)    SkillTransport   HttpApi          Homarus
 |                  |                |                |
 |  user clicks     |                |                |
 |  "submit order"  |                |                |
 |                  |                |                |
 |--POST /events----|--------------->|                |
 |  {type: "skill_callback",        |                |
 |   source: "liquor-inventory",    |                |
 |   payload: {action: "order",     |                |
 |     items: [...]}}               |                |
 |                  |                |                |
 |                  |                |--validateAuth->|
 |                  |                |--emit(event)-->|
 |                  |                |                |--enqueue()
 |<--202 Accepted---|----------------|                |
```

```
Homarus        EventBus         AgentManager     Agent
 |                  |                |                |
 |--processEvent()->|                |                |
 |--getHandlers("skill_callback")->  |                |
 |<--[agentHandler for skill events]-|                |
 |                  |                |                |
 |--spawn(config)---|--------------->|                |
 |  prompt: "Handle order from      |                |
 |   liquor-inventory: {items}"     |                |
 |  model: config.default           |                |
 |                  |                |--run()-------->|
 |                  |                |  (agent works) |
 |                  |                |<--result-------|
 |                  |                |                |
 |<--agent_result---|----------------|                |
```

## Flow: Stdio Transport (Subprocess Skill)

```
Homarus        Skill            SkillTransport
 |                  |                |
 |  event for skill |                |
 |--send(event)-----|--------------->|
 |                  |  write JSON    |
 |                  |  to stdin      |
 |                  |                |--stdin: {event}-->|
 |                  |                |                   | (skill
 |                  |                |<--stdout: {event}-|  process)
 |                  |  parse JSON    |                |
 |                  |  from stdout   |                |
 |<--emit(event)----|----------------|                |
```

## Flow: Direct Transport (In-Process Skill)

```
Homarus        Skill            SkillTransport
 |                  |                |
 |  event for skill |                |
 |--receiveFromLoop(event)---------->|
 |                  |  direct fn call|
 |                  |  (sync or async)|
 |                  |                |
 |                  |--emitToLoop(event)              |
 |<--emit(event)----|                |                |
```

## Notes
- Skills can use any transport; the loop doesn't care about implementation
- HTTP transport: skill POSTs to loop's /events endpoint, loop POSTs back to skill's callback URL
- Stdio transport: bidirectional JSON lines over stdin/stdout of child process
- Direct transport: in-process function calls for maximum performance
- All three end up as events in the same EventQueue

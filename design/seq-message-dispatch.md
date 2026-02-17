# Sequence: Message Dispatch (Channel → Agent → Response)
**Requirements:** R1, R2, R3, R4, R6, R7, R11, R13, R43, R46

## Participants
- ChannelAdapter, ChannelManager, Homarus, EventQueue, EventBus
- AgentManager, Agent, ModelRouter, ToolRegistry, IdentityManager

## Flow

```
ChannelAdapter   ChannelMgr       Homarus        EventQueue
 |                  |                |                |
 |--onMessage(raw)->|                |                |
 |  normalizeInbound|                |                |
 |  checkAccess     |                |                |
 |                  |--emit(event)-->|                |
 |                  |                |--enqueue()---->|
 |                  |                |<--queued-------|
```

```
Homarus        EventQueue       EventBus         AgentManager
 |                  |                |                |
 |--processEvent()->|                |                |
 |<--dequeue()------|                |                |
 |                  |                |                |
 |--getHandlers(type)--------------->|                |
 |<--[directH, agentH]--------------|                |
 |                  |                |                |
 |  run directHandlers sync         |                |
 |                  |                |                |
 |  for each agentHandler:          |                |
 |--spawn(config)---|----------------|--------------->|
 |                  |                |  check canSpawn|
 |                  |                |  create Agent  |
 |<--agentId--------|----------------|----------------|
```

```
AgentManager     Agent            IdentityMgr      ModelRouter
 |                  |                |                |
 |--run()---------->|                |                |
 |                  |--buildPrompt-->|                |
 |                  |  soul+user     |                |
 |                  |  +overlay      |                |
 |                  |  +workspace    |                |
 |                  |  +task prompt  |                |
 |                  |<--systemPrompt-|                |
 |                  |                |                |
 |                  |--chat(req)------------------->  |
 |                  |  resolve model |                |
 |                  |  call provider |                |
 |                  |<--response (with tool calls)----|
```

```
Agent            ToolRegistry     Homarus        ChannelMgr
 |                  |                |                |
 |--execute(tool)-->|                |                |
 |  validate params |                |                |
 |  check policy    |                |                |
 |  run tool        |                |                |
 |<--tool result----|                |                |
 |                  |                |                |
 |  (repeat model call + tools      |                |
 |   until done or limits hit)      |                |
 |                  |                |                |
 |--emitResult()----|--------------->|                |
 |                  |  agent_result  |                |
 |                  |  event queued  |                |
 |                  |                |                |
 |                  |  processEvent  |                |
 |                  |  (result handler)               |
 |                  |                |--send()------->|
 |                  |                |  route to      |
 |                  |                |  source channel|
 |                  |                |<--sent---------|
```

## Notes
- Multiple agents can be spawned for a single inbound message (fan-out)
- Agent results come back as events, processed by the same loop
- The loop stays responsive while agents work — it processes other events between spawns and results
- If model call fails, ModelRouter handles failover before returning to Agent

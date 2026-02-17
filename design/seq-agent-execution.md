# Sequence: Agent Execution Loop
**Requirements:** R11, R12, R13, R16, R17, R18, R28, R31, R39, R52, R54, R60

## Participants
- AgentManager, Agent, IdentityManager, ModelRouter, ModelProvider
- ToolRegistry, MemoryIndex, Homarus

## Flow

```
AgentManager     Agent            IdentityMgr
 |                  |                |
 |--spawn(config)-->|                |
 |  set state=pending               |
 |  set state=running               |
 |                  |                |
 |                  |--buildSystemPrompt(options)---->|
 |                  |  options.channel = "telegram"   |
 |                  |  options.task = config.prompt    |
 |                  |<--prompt (soul+user+overlay+ws)-|
 |                  |                |
 |                  |  messages = [system: prompt,     |
 |                  |    user: config.prompt]          |
```

```
Agent            ModelRouter      ModelProvider     ToolRegistry
 |                  |                |                |
 |==INFERENCE LOOP START=================================|
 |                  |                |                |
 |--chat(messages)->|                |                |
 |  resolve model   |                |                |
 |                  |--chat(req)--->|                  |
 |                  |<--stream------|                  |
 |<--response-------|                |                |
 |                  |                |                |
 |  if response has tool_calls:     |                |
 |  for each tool_call:             |                |
 |--execute(name, params, ctx)------|--------------->|
 |                  |               |  checkPolicy    |
 |                  |               |  validate params|
 |                  |               |  run with timeout|
 |<--toolResult-----|----------------|----------------|
 |                  |                |                |
 |  append tool results to messages |                |
 |                  |                |                |
 |  if turns >= maxTurns: STOP      |                |
 |  if timedOut(): STOP             |                |
 |  if no tool_calls: DONE          |                |
 |                  |                |                |
 |==INFERENCE LOOP END===================================|
```

```
Agent            ModelRouter      Homarus
 |                  |                |
 |  if DONE:        |                |
 |  state = complete|                |
 |--emitResult()----|--------------->|
 |  {type: "agent_result",          |
 |   source: agentId,               |
 |   payload: {result, usage}}      |
 |                  |                |
 |  if ERROR:       |                |
 |                  |                |
 |  try failover:   |                |
 |--failover(err)-->|                |
 |  rotate profile  |                |
 |  or next model   |                |
 |  or compact      |                |
 |<--newModel-------|                |
 |  retry with new model             |
 |                  |                |
 |  if all failovers exhausted:     |
 |  state = failed  |                |
 |--emitError()-----|--------------->|
```

## Notes
- The inference loop repeats: model call → tool execution → model call until the model stops calling tools or limits are hit
- Memory tools (memory_search, memory_get) are executed like any other tool during the loop
- Failover is transparent to the agent — ModelRouter handles retries internally
- Progress events can be emitted at any point during the loop via emitProgress()
- Token usage is tracked per model call by ModelRouter

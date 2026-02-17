# Sequence: Graceful Shutdown
**Requirements:** R9

## Participants
- Homarus, EventQueue, AgentManager, ChannelManager
- SkillManager, TimerService, MemoryIndex, HttpApi

## Flow

```
Signal/CLI       Homarus        TimerService     HttpApi
 |                  |                |                |
 |--SIGTERM/stop()->|                |                |
 |                  |                |                |
 |                  |==SET STATE: stopping============|
 |                  |                |                |
 |                  |--stop()------->|                |
 |                  |  save timers   |                |
 |                  |<--stopped------|                |
 |                  |                |                |
 |                  |--stop()--------|--------------->|
 |                  |  close server  |                |
 |                  |<--stopped------|----------------|
```

```
Homarus        ChannelMgr       AgentManager     EventQueue
 |                  |                |                |
 |--disconnectAll->|                 |                |
 |  close channels  |                |                |
 |  (stops new msgs)|               |                |
 |<--disconnected---|                |                |
 |                  |                |                |
 |--waitForAll(timeout)------------>|                 |
 |                  |  wait for      |                |
 |                  |  in-flight     |                |
 |                  |  agents        |                |
 |                  |  (up to 30s)   |                |
 |                  |                |                |
 |  if timeout:     |                |                |
 |--cancelAll()-----|--------------->|                |
 |                  |  force cancel  |                |
 |<--all done-------|----------------|                |
 |                  |                |                |
 |--clear()---------|----------------|--------------->|
 |                  |                |  drain queue   |
```

```
Homarus        SkillManager     MemoryIndex
 |                  |                |
 |--unloadAll()---->|                |
 |  stop services   |                |
 |  stop watchers   |                |
 |<--unloaded-------|                |
 |                  |                |
 |--stopWatching()->|--------------->|
 |  close DB        |                |
 |<--closed---------|----------------|
 |                  |                |
 |==SET STATE: stopped===============|
```

## Notes
- Shutdown order is reverse of startup: API → channels → agents → queue → skills → memory
- Channels disconnect first to stop new messages from arriving
- Agents get a grace period (configurable, default 30s) before force cancel
- Timer state is persisted so timers resume after restart
- Queue is drained (events discarded) after agents complete

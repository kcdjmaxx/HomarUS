# Sequence: System Startup
**Requirements:** R9, R25, R35, R63, R64, R65, R67

## Participants
- CLI, Config, Homarus, IdentityManager, MemoryIndex, ToolRegistry
- SkillManager, ChannelManager, TimerService, HttpApi

## Flow

```
CLI                Config          Homarus        IdentityMgr
 |                  |                |                  |
 |--start()-------->|                |                  |
 |                  |--load()------->|                  |
 |                  |  load env file |                  |
 |                  |  resolve vars  |                  |
 |                  |  validate      |                  |
 |                  |<--config OK----|                  |
 |                  |                |                  |
 |                  |                |--load()--------->|
 |                  |                |  read soul.md    |
 |                  |                |  read user.md    |
 |                  |                |  read overlays   |
 |                  |                |  read workspace  |
 |                  |                |<--identity OK----|
 |                  |                |
```

```
Homarus        MemoryIndex      ToolRegistry     SkillManager
 |                  |                |                  |
 |--initialize()--->|                |                  |
 |  create DB       |                |                  |
 |  index workspace |                |                  |
 |<--index OK-------|                |                  |
 |                  |                |                  |
 |--registerBuiltins()------------->|                  |
 |  bash, read,     |               |                  |
 |  write, edit,    |               |                  |
 |  web_*, browser, |               |                  |
 |  memory_*,       |               |                  |
 |  emit_event      |               |                  |
 |<--tools OK-------|---------------|                  |
 |                  |                |                  |
 |--loadAll()-------|----------------|---------------->|
 |                  |               |  scan paths      |
 |                  |               |  read manifests  |
 |                  |               |  register tools->|
 |                  |               |  register events |
 |                  |               |  start services  |
 |<--skills OK------|----------------|-----------------|
```

```
Homarus        ChannelMgr       TimerService     HttpApi
 |                  |                |                |
 |--loadAdapters()->|                |                |
 |  create adapters |                |                |
 |--connectAll()--->|                |                |
 |  connect each    |                |                |
 |<--channels OK----|                |                |
 |                  |                |                |
 |--loadTimers()----|--------------->|                |
 |--start()---------|--------------->|                |
 |<--timers OK------|----------------|                |
 |                  |                |                |
 |--start()---------|----------------|--------------->|
 |  bind port       |               |                |
 |<--api OK---------|----------------|----------------|
 |                  |                |                |
 |==SET STATE: running===============================|
 |--begin processing events                          |
```

## Notes
- Subsystems start in dependency order: config → identity → memory → tools → skills → channels → timers → API
- If any subsystem fails to start, log error and abort with clear message
- Skills may depend on tools being registered, so tools load before skills
- Channels connect last because they start receiving messages immediately

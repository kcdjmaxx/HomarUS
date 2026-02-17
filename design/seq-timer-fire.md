# Sequence: Timer Fire
**Requirements:** R2, R9

## Participants
- TimerService, Homarus, EventQueue, AgentManager

## Flow

```
TimerService     Homarus        EventQueue       AgentManager
 |                  |                |                |
 |  timer evaluates |                |                |
 |  cron/interval   |                |                |
 |  matches now     |                |                |
 |                  |                |                |
 |--emit(event)--->|                 |                |
 |  {type: "timer_fired",           |                |
 |   source: "timer:daily-check",   |                |
 |   payload: {timerId, name,       |                |
 |     prompt: "Check email..."}}   |                |
 |                  |                |                |
 |                  |--enqueue()---->|                |
 |                  |                |                |
 |  (normal dispatch flow)          |                |
 |                  |--processEvent()|                |
 |                  |  getHandlers   |                |
 |                  |--spawn(config)-|--------------->|
 |                  |  prompt from   |                |
 |                  |  timer payload |                |
 |                  |                |  agent runs    |
 |                  |<--result-------|----------------|
 |                  |                |                |
 |  if one-shot:    |                |                |
 |  remove timer    |                |                |
 |  persist state   |                |                |
```

## Notes
- Timers emit events just like any other source — no special path
- The timer payload includes the prompt/instructions for the agent
- One-shot timers auto-remove after firing
- Recurring timers (cron, interval) persist across restarts
- Timer evaluation runs on the Node.js event loop (setInterval/setTimeout + croner)

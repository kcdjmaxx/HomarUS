# TimerService
**Requirements:** R2, R9
**Refs:** ref-openclaw-architecture

## Knows
- timers: Map<string, Timer> (timerId → timer config)
- store: string (path to timer persistence file)

## Does
- loadTimers(): Read persisted timers from disk
- saveTimers(): Persist current timers to disk
- add(config): Create a new timer (cron, interval, or one-shot)
- remove(timerId): Cancel and remove a timer
- get(timerId): Return timer by ID
- getAll(): Return all timers
- start(): Begin evaluating timers, emit events when they fire
- stop(): Stop all timers, persist state
- onFire(timerId): Emit a timer_fired event to the loop

## Collaborators
- Homarus: receives timer_fired events
- Config: provides timer persistence path and enabled flag

## Sequences
- seq-startup.md
- seq-timer-fire.md

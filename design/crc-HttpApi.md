# HttpApi
**Requirements:** R24, R69
**Refs:** ref-openclaw-architecture

## Knows
- port: number (from config)
- authToken: string (from config)
- server: HttpServer (Express or similar)

## Does
- start(): Bind HTTP server to port
- stop(): Close HTTP server
- postEvent(req): Receive event from skills/external callers, validate auth, push to loop
- getStatus(req): Return system status (agent count, queue depth, channels, skills)
- getHealth(req): Return health check for all subsystems
- validateAuth(req): Check bearer token against config

## Collaborators
- Homarus: delivers received events
- Skill: skills POST events to this API
- Config: provides port and auth token

## Sequences
- seq-skill-callback.md
- seq-startup.md

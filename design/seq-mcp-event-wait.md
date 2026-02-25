# Sequence: MCP Event Wait (Long-Poll)

**Requirements:** R96, R97, R98, R99, R104, R105, R106

Via bash event-loop script:
```
event-loop.sh      curl                McpBackendServer       Homarus              Telegram
    |                 |                      |                    |                    |
    |--curl /api/wait>|                      |                    |                    |
    |                 |--GET /api/wait------->|                    |                    |
    |                 |  ?timeout=120         |                    |                    |
    |                 |                      |--waitForEvent(120s)>|                    |
    |                 |                      |                    |  [blocks in waiter set]
    |                 |                      |                    |                    |
    |                 |  ... time passes (zero tokens) ...        |                    |
    |                 |                      |                    |                    |
    |                 |                      |                    |<--message received--|
    |                 |                      |                    |--emit(event)       |
    |                 |                      |                    |  [resolves waiter]  |
    |                 |                      |<--events[]---------|                    |
    |                 |<--200 JSON-----------|                    |                    |
    |<--print JSON----|                      |                    |                    |
    |--exit 0         |                      |                    |                    |
```

Timeout path (no events):
```
event-loop.sh      curl                McpBackendServer       Homarus
    |                 |                      |                    |
    |--curl /api/wait>|                      |                    |
    |                 |--GET /api/wait------->|                    |
    |                 |                      |--waitForEvent(120s)>|
    |                 |                      |                    | [timeout fires]
    |                 |                      |<--[] (empty)--------|
    |                 |<--204 No Content-----|                    |
    |  [loop again]   |                      |                    |
```

# Sequence: MCP Startup

**Requirements:** R71, R72, R73, R76, R77

```
ClaudeCode         McpProxy              BackendManager         Backend(backend.ts)        Homarus
    |                  |                       |                       |                      |
    |--stdio connect-->|                       |                       |                      |
    |                  |--spawn()------------->|                       |                      |
    |                  |                       |--fork(backend.js)---->|                      |
    |                  |                       |                       |--new Homarus()------->|
    |                  |                       |                       |--loop.start()-------->|
    |                  |                       |                       |  (channels, timers,   |
    |                  |                       |                       |   memory, etc.)       |
    |                  |                       |                       |--new McpBackendServer()|
    |                  |                       |                       |--server.start()       |
    |                  |                       |                       |  (listen on 18801)    |
    |                  |                       |                       |                      |
    |                  |                       |--GET /api/health----->|                      |
    |                  |                       |<---{ ok: true }------|                      |
    |                  |<--spawn() resolved----|                       |                      |
    |                  |                       |                       |                      |
    |                  |--new Server()         |                       |                      |
    |                  |--setRequestHandler()  |                       |                      |
    |                  |--connect(stdio)       |                       |                      |
    |<--MCP ready------|                       |                       |                      |
```

On SIGINT/SIGTERM:
```
Signal             McpProxy              BackendManager         Backend
  |                  |                       |                    |
  |--SIGINT--------->|                       |                    |
  |                  |--stop()-------------->|                    |
  |                  |                       |--SIGTERM---------->|
  |                  |                       |                    |--loop.stop()
  |                  |                       |<--exit------------|
  |                  |--server.close()       |                    |
  |                  |--process.exit(0)      |                    |
```

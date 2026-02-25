# McpBackend
**Requirements:** R73, R75, R78, R104, R105, R106, R107, R108
**Refs:** ref-homaruscc-backend

## Knows
- loop: Homarus instance
- httpServer: Express app + HTTP server
- port: number (default 18801)

## Does
- main(): Create Homarus, start loop, create McpBackendServer, start server, wire signal handlers
- The Homarus class itself is enhanced with event history, waitForEvent, getters (see crc-Homarus.md updates)

## Collaborators
- Homarus: the event loop
- McpBackendServer: Express HTTP API for the proxy
- McpTools: tool definitions
- McpResources: resource definitions

## Sequences
- seq-mcp-startup.md

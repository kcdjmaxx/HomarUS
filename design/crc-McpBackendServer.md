# McpBackendServer
**Requirements:** R75, R89, R91, R104, R105, R106
**Refs:** ref-homaruscc-backend

## Knows
- app: Express application
- httpServer: HTTP server
- port: number
- loop: Homarus reference
- mcpTools: McpToolDef[]
- mcpResources: McpResourceDef[]

## Does
- start(): Listen on port, setup routes
- stop(): Close server
- setupRoutes(): Register API endpoints:
  - GET /api/health -- returns { ok: true }
  - GET /api/tool-list -- returns tool definitions (name, description, inputSchema)
  - POST /api/tool-call -- execute tool by name with args, return result
  - GET /api/resource-list -- returns resource definitions (uri, name, description, mimeType)
  - POST /api/resource -- read resource by uri, return { uri, mimeType, text }
  - GET /api/wait -- long-poll for events, return 204 on timeout, 200 with events+identity
  - GET /api/status -- system status
  - GET /api/events -- recent events

## Collaborators
- Homarus: event loop, status, waitForEvent
- McpTools: tool handlers
- McpResources: resource handlers

## Sequences
- seq-mcp-tool-call.md
- seq-mcp-event-wait.md

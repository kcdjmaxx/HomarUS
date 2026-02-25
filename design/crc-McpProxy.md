# McpProxy
**Requirements:** R71, R72, R74, R76, R77
**Refs:** ref-homaruscc-mcp-proxy

## Knows
- backendPort: number (default 18801, from HOMARUS_MCP_PORT env)
- backendUrl: string (http://localhost:{port})
- backendChild: ChildProcess | null
- backendScript: string (resolved path to backend.js)
- mcpServer: MCP Server instance

## Does
- main(): Create BackendManager, spawn backend, create MCP server, connect stdio transport, wire handlers
- spawnBackend(): Spawn backend.js as child process, pipe stderr, wait for /api/health (30s timeout)
- restartBackend(): Stop then spawn backend
- stopBackend(): Send SIGTERM, wait 5s, then SIGKILL if needed
- handleListTools(): Fetch /api/tool-list from backend, append restart_backend
- handleCallTool(name, args): If restart_backend, call restartBackend(). Otherwise forward to /api/tool-call
- handleListResources(): Fetch /api/resource-list from backend
- handleReadResource(uri): POST /api/resource to backend
- shutdown(): Stop backend, close MCP server

## Collaborators
- BackendManager (internal): manages the child process lifecycle
- @modelcontextprotocol/sdk: Server, StdioServerTransport, request schemas

## Sequences
- seq-mcp-startup.md
- seq-mcp-tool-call.md

# ref-homaruscc-mcp-proxy

- **Source:** local:../homaruscc/src/mcp-proxy.ts
- **Type:** local
- **Fetched:** 2026-02-24
- **Requirements:** TBD
- **Status:** active
- **Summary:** Thin MCP proxy that uses @modelcontextprotocol/sdk stdio transport. Spawns and manages backend as child process. Forwards ListTools/CallTool/ListResources/ReadResource to backend over HTTP. Has a restart_backend tool that lives in the proxy. Uses WebSocket for event notifications from backend. Backend health check with 30s timeout.

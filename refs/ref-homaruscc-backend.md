# ref-homaruscc-backend

- **Source:** local:../homaruscc/src/backend.ts
- **Type:** local
- **Fetched:** 2026-02-24
- **Requirements:** TBD
- **Status:** active
- **Summary:** Standalone backend process entry point. Creates HomarUScc loop, starts it, then creates a DashboardServer (Express + WebSocket on port 3120). Dashboard server exposes /api/health, /api/wait (long-poll), /api/tool-list, /api/tool-call, /api/resource-list, /api/resource endpoints used by the MCP proxy. Also serves dashboard UI and various other APIs. The loop's notifyFn broadcasts events to WebSocket clients.

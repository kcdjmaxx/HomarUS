# ref-homaruscc-mcp-tools

- **Source:** local:../homaruscc/src/mcp-tools.ts
- **Type:** local
- **Fetched:** 2026-02-24
- **Requirements:** TBD
- **Status:** active
- **Summary:** Factory function createMcpTools() that builds MCP tool definitions from the event loop. Each tool has name, description, inputSchema (JSON Schema), and async handler. Tools: telegram_send, telegram_read, telegram_typing, telegram_react, memory_search, memory_store, timer_schedule, timer_cancel, dashboard_send, get_status, get_events, wait_for_event, browser_*, run_tool. Handler returns { content: [{ type: "text", text }] }.

# References

## ref-openclaw-architecture
- **Source:** https://docs.openclaw.ai, https://github.com/openclaw/openclaw
- **Type:** web
- **Fetched:** 2026-02-17
- **Requirements:** R9, R11, R16, R17, R18, R19, R28, R29, R30, R31, R32, R35, R36, R37, R38, R39, R40, R42, R43, R44, R45, R46, R47, R49, R50, R52, R53, R55, R56, R63, R64, R65, R67, R68, R70
- **Status:** active
- **Summary:** OpenClaw agent platform architecture — gateway, channels, tools, memory, cron, plugins, sessions. Patterns to adopt and replace.

## ref-frictionless-architecture
- **Source:** https://github.com/zot/frictionless (local copy at vault frictionless/)
- **Type:** web | local
- **Fetched:** 2026-02-17
- **Requirements:** R1, R2, R3, R4, R5, R6, R7, R8, R10, R13, R14, R15, R20, R21, R22, R23, R24, R27, R33, R48, R59, R66
- **Status:** active
- **Summary:** Frictionless event-driven app ecosystem — event loop, background agent spawning, pushState events, hot-loading, bidirectional skill communication.

## ref-openclaw-coder-app
- **Source:** local:frictionless/.ui/apps/open claw coder/
- **Type:** local
- **Fetched:** 2026-02-17
- **Requirements:** R13, R20, R21, R23, R24, R26, R27, R51
- **Status:** active
- **Summary:** Bridge plugin prototype — bidirectional events over SSH, skill contract pattern (input/output/events), build delegation, progress reporting.

## ref-homaruscc-mcp-proxy
- **Source:** local:../homaruscc/src/mcp-proxy.ts
- **Type:** local
- **Fetched:** 2026-02-24
- **Requirements:** R71, R72, R74, R76, R77
- **Status:** active
- **Summary:** Thin MCP proxy that uses @modelcontextprotocol/sdk stdio transport. Spawns backend as child process, forwards tool/resource calls over HTTP, restart_backend tool, WebSocket event notifications.

## ref-homaruscc-backend
- **Source:** local:../homaruscc/src/backend.ts
- **Type:** local
- **Fetched:** 2026-02-24
- **Requirements:** R73, R75, R78
- **Status:** active
- **Summary:** Standalone backend process. Creates event loop, starts DashboardServer with /api/health, /api/wait, /api/tool-call, /api/resource endpoints used by MCP proxy.

## ref-homaruscc-mcp-tools
- **Source:** local:../homaruscc/src/mcp-tools.ts
- **Type:** local
- **Fetched:** 2026-02-24
- **Requirements:** R79, R80, R81, R82, R83, R84, R85, R86, R87, R88, R89, R90, R91
- **Status:** active
- **Summary:** MCP tool definitions: telegram_send/read/typing/react, memory_search/store, timer_schedule/cancel, get_status, get_events, wait_for_event, dashboard_send.

## ref-homaruscc-mcp-resources
- **Source:** local:../homaruscc/src/mcp-resources.ts
- **Type:** local
- **Fetched:** 2026-02-24
- **Requirements:** R92, R93, R94, R95
- **Status:** active
- **Summary:** MCP resources: identity://soul, identity://user, config://current (redacted), events://recent.

## ref-homaruscc-event-loop
- **Source:** local:../homaruscc/bin/event-loop
- **Type:** local
- **Fetched:** 2026-02-24
- **Requirements:** R96, R97, R98, R99
- **Status:** active
- **Summary:** Bash script long-polling /api/wait, blocks at OS level (zero tokens while idle), PID file dedup, prints events and exits.

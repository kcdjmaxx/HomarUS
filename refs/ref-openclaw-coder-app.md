# ref-openclaw-coder-app
- **Source:** local:frictionless/.ui/apps/open claw coder/
- **Summary:** Bridge plugin connecting OpenClaw to Frictionless over Tailscale SSH. Prototype of the event-driven coordinator pattern — OpenClaw sends commands, Frictionless sends events back, bidirectional communication over a tunnel.

## Architecture

```
OpenClaw (EC2) ←── SSH Tunnel ──→ OpenClaw Coder Plugin ←── MCP ──→ Frictionless
                   Events                                            Browser
```

- **Outbound (OpenClaw → Frictionless):** Create apps, write files, run Lua, interact with MCP
- **Inbound (Frictionless → OpenClaw):** User interactions, build status, test results, app state

Tunnel forwards remote port 9999 to local MCP port.

## Data Model

**OpenClawCoder** (main): hostname, status (disconnected/connecting/connected/error), logs (LogEntry[]), clawApps (ClawApp[]), event subscriptions.

**LogEntry:** timestamp, direction (out/in/sys), message.

**ClawApp:** name, description, createdAt.

## Key Methods

- `connect()` / `disconnect()` — SSH tunnel management
- `createApp(name, desc, requirements)` — scaffold app directory + requirements.md
- `requestBuild(name)` — trigger Frictionless build pipeline via pushState
- `createAndBuild(name, desc, requirements)` — convenience combo
- `subscribe(appName)` / `unsubscribe(appName)` — event subscription management
- `sanitizePath(path)` — path traversal protection

## Build Delegation Pattern (Key)

OpenClaw does NOT write Frictionless app code directly. Instead:
1. OpenClaw creates app with name + requirements (including `## OpenClaw API` section)
2. OpenClaw calls `requestBuild(appName)` → Frictionless build pipeline
3. Frictionless builds (design → code → viewdefs → audit)
4. OpenClaw calls API methods via `frictionless_run_lua` to push data in / read results out

## OpenClaw API Pattern (Key)

Every app built for OpenClaw includes an `## OpenClaw API` section defining:
- **Input methods** — push data in (e.g., `loadItems(items)`)
- **Output methods** — read results out (e.g., `getOrders()`)
- **Events** — notifications on user actions (e.g., `order_submitted`)

This is the **skill contract pattern** — skills define their input/output/event interface, and the coordinator communicates through that contract.

## Security
- Tailscale network only (no public exposure)
- SSH-based auth
- File writes sandboxed to `.ui/apps/`
- Path traversal protection
- All commands logged

## Relevance to New Project
This app is a prototype of what we're building at a larger scale:
- Bidirectional event communication between coordinator and skills
- Skill contract (input methods, output methods, events)
- Build delegation (coordinator doesn't do the work, it dispatches)
- Progress reporting from workers back to coordinator
- Event subscription model (listen to specific skill events)

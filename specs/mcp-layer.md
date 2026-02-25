# MCP Layer for HomarUS

**Language:** TypeScript (Node.js, ES modules)
**Environment:** macOS/Linux, Node.js >= 22

## Overview

Add a Model Context Protocol (MCP) layer on top of HomarUS so it can be used as an MCP server by Claude Code. This is an **additional mode** alongside the existing standalone mode -- the existing CLI `homarus start` continues to work unchanged.

## 1. Two-Process Architecture

Two new entry points:
- **mcp-proxy.ts** -- Thin process that speaks MCP stdio to Claude Code. Never restarts. Spawns and manages the backend as a child process.
- **backend.ts** -- Runs the existing Homarus event loop plus an HTTP API server. Can be restarted by the proxy without dropping the MCP connection.

The proxy forwards MCP tool calls and resource reads to the backend over HTTP (`/api/tool-call`, `/api/resource`, `/api/tool-list`, `/api/resource-list`, `/api/health`). The backend exposes a long-poll endpoint (`/api/wait`) for the event loop script.

A `restart_backend` MCP tool lives in the proxy itself, allowing Claude Code to restart the backend after code changes.

The backend HTTP API port defaults to 18801 (one above HomarUS's existing standalone HTTP API port 18800), configurable via `HOMARUS_MCP_PORT` env var.

## 2. Identity (Simplified)

The MCP layer uses the existing IdentityManager but only exposes `soul.md` and `user.md` through MCP resources. No state.md, preferences.md, disagreements.md, dreams, texture preservation, or checkpoint system.

## 3. MCP Tools

Expose these as MCP tools (forwarded through proxy to backend):
- **telegram_send** -- Send message to Telegram chat
- **telegram_read** -- Read recent incoming Telegram messages
- **telegram_typing** -- Send typing indicator
- **telegram_react** -- React to a message with emoji
- **memory_search** -- Search memory index (hybrid vector + FTS)
- **memory_store** -- Store and index content
- **timer_schedule** -- Schedule a timer (cron/interval/once)
- **timer_cancel** -- Cancel a timer
- **get_status** -- System status
- **get_events** -- Recent event history
- **wait_for_event** -- Long-poll for new events (up to 120s)
- **dashboard_send** -- Send message to dashboard (if present)

## 4. MCP Resources

- **identity://soul** -- soul.md content
- **identity://user** -- user.md content
- **config://current** -- Current config with secrets redacted
- **events://recent** -- Last 20 events as JSON

## 5. Event Loop Script

A bash script `bin/event-loop` that:
- Long-polls `/api/wait?timeout=120` via curl
- Blocks at OS level (zero Claude Code tokens while idle)
- On 204 (timeout), loops silently
- On 200 (events), prints JSON and exits so Claude Code can process
- PID file dedup to prevent multiple listeners
- Reads port from `~/.homarus/config.json`

## 6. Telegram Enhancements

The existing HomarUS TelegramChannelAdapter needs:
- `sendTyping(chatId)` method
- `setReaction(chatId, messageId, emoji)` method
- `getRecentMessages(limit)` method for the telegram_read MCP tool
- Auto-typing on message receipt
- Recent message buffer (50 messages)

## 7. Event History and Long-Poll

The Homarus class needs:
- Event history buffer (last 100 events)
- `waitForEvent(timeoutMs, since?)` method -- returns promise that resolves when events arrive or timeout
- Event waiter set for coordinating blocked long-poll callers
- Delivery watermark tracking
- `setNotifyFn()` for WebSocket event broadcasting
- Getter methods for subsystems (getChannelManager, getMemoryIndex, etc.)

## Constraints

- Existing `homarus start` standalone mode must continue working
- No changes to the model router, agent system, or tool registry APIs
- New files only, plus minimal additions to existing files
- @modelcontextprotocol/sdk added as a dependency

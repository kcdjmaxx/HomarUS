# MCP Tools Reference

Complete reference for all MCP tools exposed by HomarUS. Tools are available to Claude Code as soon as the MCP server is connected.

HomarUS exposes **30 MCP tools** organized into logical groups.

---

## Telegram (5 tools)

### telegram_send

Send a message to a Telegram chat.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Telegram chat ID |
| `text` | string | yes | Message text (supports Markdown) |

**Returns:** Confirmation string.

### telegram_read

Read recent incoming Telegram messages.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | no | Number of messages to return (default 20) |

**Returns:** Formatted list of messages with timestamps, sender names, chat IDs, and text.

### telegram_typing

Send a typing indicator to a Telegram chat. Shows for up to 5 seconds or until a message is sent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Telegram chat ID |

### telegram_react

React to a Telegram message with an emoji.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Telegram chat ID |
| `messageId` | number | yes | Message ID to react to |
| `emoji` | string | yes | Emoji to react with |

### telegram_send_photo

Send a photo to a Telegram chat from a local file path.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `chatId` | string | yes | Telegram chat ID |
| `filePath` | string | yes | Absolute path to the image file |
| `caption` | string | no | Optional caption |

---

## Memory (2 tools)

### memory_search

Search the memory index using hybrid vector + FTS search. See [Core Concepts](core-concepts.md#memory) for details on scoring, decay, and MMR.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query |
| `limit` | number | no | Max results (default 10) |

**Returns:** Ranked results with path, score, and content preview (first 500 chars per result).

### memory_store

Store content to memory and index it for future retrieval.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | string | yes | File path to store at (e.g., `local/user/preferences/tone`) |
| `content` | string | yes | Content to store |

**Returns:** Confirmation with the stored key.

---

## Documentation Index (7 tools)

### docs_search

Search a domain-specific documentation index.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `domain` | string | yes | Domain name (e.g., `"react"`). Use `"*"` to search all domains |
| `query` | string | yes | Search query |
| `limit` | number | no | Max results (default 10) |

**Returns:** Ranked results with domain, path, score, and content preview.

### docs_ingest

Ingest files into a domain-specific documentation index. Supports `.md`, `.txt`, `.html`, `.json`, `.yaml`, `.yml`, `.rst`, `.xml` files.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `domain` | string | yes | Domain name |
| `filePath` | string | yes | File or directory path to ingest |

**Returns:** Count of files processed and chunks created.

### docs_ingest_text

Ingest raw text content into a domain index without saving to disk.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `domain` | string | yes | Domain name |
| `key` | string | yes | Unique key for this content |
| `content` | string | yes | Text content to index |

### docs_list

List all available documentation domains and their stats.

**Returns:** Domain names with file count and chunk count for each.

### docs_clear

Clear a documentation domain, removing all indexed content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `domain` | string | yes | Domain name to clear |

### docs_get_clusters

Get semantic clusters from a documentation domain. Clusters group related chunks by source file and embedding similarity.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `domain` | string | yes | Documentation domain |
| `clusterIndex` | number | no | Return only this cluster index (returns all if omitted) |
| `clusterThreshold` | number | no | Cosine similarity threshold for merging (default 0.85) |
| `maxClusters` | number | no | Maximum clusters to return (default 20) |

### docs_clear_compiled

Remove compiled/synthesized articles from a domain without removing raw chunks.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `domain` | string | yes | Documentation domain |

---

## Timers (2 tools)

### timer_schedule

Schedule a timer. See [Core Concepts](core-concepts.md#timers) for timer types and behavior.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Timer name (used for deduplication) |
| `type` | string | yes | `"cron"`, `"interval"`, or `"once"` |
| `schedule` | string | yes | Cron expression, interval in ms, or ISO timestamp |
| `prompt` | string | yes | Instructions executed when the timer fires |
| `timezone` | string | no | Timezone for cron timers (e.g., `"America/Chicago"`) |

**Returns:** Timer name and ID.

If a timer with the same name already exists, it is replaced.

### timer_cancel

Cancel a scheduled timer.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Timer ID or name to cancel |

---

## Dashboard (1 tool)

### dashboard_send

Send a message to the web dashboard chat.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | yes | Message text |

---

## System (3 tools)

### get_status

Get system status including channels, memory, timers, queue, docs domains, and fact extractor stats.

**Returns:** JSON object with full system state.

### get_events

Get recent event history.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | no | Number of events (default 20) |

**Returns:** Formatted event list with timestamps, types, sources, and payload previews.

### wait_for_event

Long-poll for events. Blocks until a new event arrives or timeout.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `timeout` | number | no | Max wait in ms (default 30000, max 120000) |

**Returns:** Event list (empty on timeout). The `bin/event-loop` bash script is the preferred way to do zero-token idle polling.

---

## Browser (7 tools)

Requires `browser.enabled: true` in config and Playwright installed. The browser launches lazily on first tool use.

### browser_navigate

Navigate to a URL.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | yes | URL to navigate to |

**Returns:** Page title and URL.

### browser_snapshot

Get the visible text content / accessibility tree of the current page.

**Returns:** Text representation of the page content.

### browser_screenshot

Take a screenshot of the current page.

**Returns:** Base64-encoded PNG string.

### browser_click

Click an element by CSS selector.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | yes | CSS selector |

### browser_type

Type text into an input element.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | yes | CSS selector of the input |
| `text` | string | yes | Text to type |

### browser_evaluate

Execute JavaScript in the browser page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `script` | string | yes | JavaScript code to execute |

**Returns:** Stringified result of the script evaluation.

### browser_content

Get the visible text content of the current page (innerText of body).

**Returns:** Full text content of the page.

---

## Image Generation (1 tool)

### nano_banana

Generate an image using Google's Gemini 2.5 Flash Image model. Requires `GOOGLE_API_KEY` in `.env`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | yes | Text description of the image to generate |
| `filename` | string | no | Output filename (default: auto-generated). Saved to `~/.homarus/images/` |

**Returns:** File path of the generated image.

---

## Meta-Tool (1 tool)

### run_tool

Execute any registered tool from the built-in tool registry. Provides access to file system, runtime, web, and memory tools.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Tool name |
| `params` | object | yes | Tool parameters |

**Available tools via run_tool:**

| Name | Group | Description |
|------|-------|-------------|
| `bash` | runtime | Execute a bash command |
| `read` | fs | Read a file |
| `write` | fs | Write a file |
| `edit` | fs | Edit a file with search/replace |
| `glob` | fs | Find files by glob pattern |
| `grep` | fs | Search file contents with regex |
| `git` | runtime | Run a git command |
| `web_fetch` | web | Fetch a URL |
| `web_search` | web | Web search |
| `memory_search` | memory | Search memory index |
| `memory_get` | memory | Get a specific memory file |
| `memory_store` | memory | Store content to memory |

---

## Proxy Tool (1 tool)

### restart_backend

Restart the HomarUS backend process. Handled by the proxy -- does not require the backend to be running.

**Returns:** Success or error message.

Use after code changes to pick up new functionality, or if the backend becomes unresponsive.

---

## Permission Model

Tool access is controlled by **tool policies** defined in [config.json](configuration.md#toolpolicies). Policies use allow/deny lists that can reference individual tools or built-in groups:

| Group | Tools |
|-------|-------|
| `group:fs` | read, write, edit, glob, grep |
| `group:runtime` | bash, git |
| `group:web` | web_fetch, web_search, browser |
| `group:memory` | memory_search, memory_get, memory_store |

If no policies are configured, all tools are available.

## MCP Resources

In addition to tools, HomarUS exposes MCP resources that Claude Code can read:

| URI | Name | Description |
|-----|------|-------------|
| `identity://soul` | Soul Identity | Current soul.md content |
| `identity://user` | User Profile | Current user.md content |
| `identity://state` | Agent State | Current state.md (mood, session continuity) |
| `config://current` | Current Config | Configuration with secrets redacted |
| `events://recent` | Recent Events | Last 20 events from the event loop |

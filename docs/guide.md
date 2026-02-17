# HomarUS Setup & Usage Guide

HomarUS is an event-loop based AI agent coordinator. It connects to LLM providers, listens on channels (Telegram, CLI), executes tools, manages memory, and runs scheduled tasks — all from a single long-running process.

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Models](#models)
- [Channels — Telegram](#channels--telegram)
- [Channels — CLI](#channels--cli)
- [Identity System](#identity-system)
- [Skills](#skills)
- [Memory](#memory)
- [Timers](#timers)
- [Browser](#browser)
- [HTTP API](#http-api)
- [CLI Reference](#cli-reference)
- [Built-in Tools Reference](#built-in-tools-reference)

---

## Installation

**Requirements:** Node.js >= 22

### npm (global install)

```bash
npm install -g homarus
```

### npx (run without installing)

```bash
npx homarus init
npx homarus start
```

### Build from source

```bash
git clone https://github.com/kcdjmaxx/HomarUS.git
cd HomarUS
npm install
npm run build
node dist/cli.js start
```

### Initialize

After installing, run `init` to scaffold the default config and directory structure:

```bash
homarus init
```

This creates:

```
~/.homarus/
  config.json          # Main configuration
  identity/
    soul.md            # Agent personality
    user.md            # User profile
    overlays/          # Channel/task-specific overlays
  workspace/           # Files injected into system prompt
  memory/              # Embedding database (created on first run)
  skills/              # Skill directories
```

---

## Configuration

HomarUS looks for config in two locations (first match wins):

1. **Project-level:** `./homarus.json` in the current working directory
2. **User-level:** `~/.homarus/config.json`

You can also pass an explicit path: `homarus start /path/to/config.json`

### Environment variable substitution

Any string value in the config can reference environment variables with `${VAR_NAME}` syntax. HomarUS also loads a `.env` file from the same directory as the config file.

```json
{
  "models": {
    "providers": {
      "anthropic": { "apiKey": "${ANTHROPIC_API_KEY}" }
    }
  }
}
```

### Full annotated example

```json
{
  "models": {
    "default": "anthropic/claude-sonnet-4-5",
    "fallback": ["openai/gpt-4o", "ollama/llama3"],
    "aliases": {
      "smart": "anthropic/claude-opus-4-5",
      "fast": "anthropic/claude-haiku-4-5"
    },
    "providers": {
      "anthropic": { "apiKey": "${ANTHROPIC_API_KEY}" },
      "openai": { "apiKey": "${OPENAI_API_KEY}" },
      "openrouter": {
        "apiKey": "${OPENROUTER_API_KEY}",
        "baseUrl": "https://openrouter.ai/api/v1"
      },
      "ollama": {
        "baseUrl": "http://127.0.0.1:11434/v1"
      }
    }
  },
  "channels": {
    "cli": {},
    "telegram": {
      "token": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "open",
      "groupPolicy": "mention_required",
      "pollingInterval": 1000,
      "allowedChatIds": [123456789]
    }
  },
  "agents": {
    "maxConcurrent": 5,
    "defaultTimeout": 300000,
    "defaultMaxTurns": 20
  },
  "memory": {
    "embedding": {
      "provider": "ollama",
      "model": "nomic-embed-text",
      "baseUrl": "http://127.0.0.1:11434/v1"
    },
    "search": { "vectorWeight": 0.7, "ftsWeight": 0.3 },
    "extraPaths": ["/home/user/notes"]
  },
  "skills": {
    "paths": ["~/.homarus/skills"]
  },
  "server": {
    "port": 18800,
    "auth": { "token": "your-secret-token" }
  },
  "timers": {
    "enabled": true,
    "store": "~/.homarus/timers.json"
  },
  "identity": {
    "dir": "~/.homarus/identity",
    "workspaceDir": "~/.homarus/workspace"
  },
  "browser": {
    "enabled": false,
    "headless": true,
    "proxy": "http://proxy.example.com:8888",
    "viewport": { "width": 1280, "height": 720 },
    "timeout": 30000
  }
}
```

### Hot-reload

HomarUS watches the config file for changes (polling every 2 seconds). The following keys can be changed without a restart:

- `models.aliases`
- `models.fallback`
- `agents.maxConcurrent`
- `agents.defaultTimeout`
- `agents.defaultMaxTurns`
- `memory.search`
- `skills.paths`
- `timers.enabled`

Changes to other keys (providers, channels, server port, identity dirs) log a warning and require a restart.

---

## Models

### Provider setup

HomarUS supports any OpenAI-compatible API, plus a native Anthropic provider. Each provider is registered by its key name in `models.providers`.

| Provider | `apiKey` | `baseUrl` | Notes |
|----------|----------|-----------|-------|
| `anthropic` | Required | Auto (`https://api.anthropic.com/v1`) | Native Messages API |
| `openai` | Required | Auto (`https://api.openai.com/v1`) | OpenAI-compatible |
| `openrouter` | Required | `https://openrouter.ai/api/v1` | Must set `baseUrl` |
| `ollama` | Not needed | `http://127.0.0.1:11434/v1` | Local, no API key |
| Any other | Depends | `https://api.{id}.com/v1` (default) | Set `baseUrl` if needed |

### Model IDs

Models use the format `provider/model-name`. The provider prefix is used to route to the correct API:

```
anthropic/claude-sonnet-4-5   → Anthropic Messages API
openai/gpt-4o                 → OpenAI chat completions
openrouter/meta/llama-3       → OpenRouter (OpenAI-compatible)
ollama/llama3                 → Local Ollama
```

### Aliases

Aliases let you refer to models by short names. These are resolved before routing:

```json
"aliases": {
  "smart": "anthropic/claude-opus-4-5",
  "fast": "anthropic/claude-haiku-4-5",
  "mid": "openai/gpt-4o"
}
```

Aliases are hot-reloadable — change them without restarting.

### Fallback chains

If the primary model fails (rate limit, auth error, context overflow), HomarUS tries the next model in the fallback chain:

```json
"fallback": ["openai/gpt-4o", "ollama/llama3"]
```

Failover behavior depends on the error:
- **401/unauthorized** — rotates auth profile (see below), then tries next
- **Context/token limit** — signals compact, then tries next
- **Other errors** — tries next model in chain

### Auth profile rotation

For providers with multiple API keys (e.g., to spread rate limits), you can configure profiles:

```json
"providers": {
  "openrouter": {
    "apiKey": "${OPENROUTER_KEY_1}",
    "baseUrl": "https://openrouter.ai/api/v1",
    "profiles": [
      { "apiKey": "${OPENROUTER_KEY_1}" },
      { "apiKey": "${OPENROUTER_KEY_2}" }
    ]
  }
}
```

When a key gets a 401, it's put on a 60-second cooldown and the next profile is activated.

---

## Channels — Telegram

### Step 1: Create a bot with BotFather

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a **display name** for your bot (e.g., "My HomarUS Bot")
4. Choose a **username** — must end in `bot` (e.g., `my_homarus_bot`)
5. BotFather replies with your **bot token** — a string like `110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`
6. Save this token securely (treat it like a password)

### Step 2: Configure bot settings (optional)

If you want the bot to respond to @mentions in groups:

1. Send `/setprivacy` to @BotFather
2. Select your bot
3. Choose **Disable** — this lets the bot see all messages in groups (not just commands)

Other useful BotFather commands:
- `/setdescription` — what users see before starting a chat
- `/setabouttext` — the bot's bio
- `/setuserpic` — bot avatar

### Step 3: Add to config

```json
"channels": {
  "telegram": {
    "token": "${TELEGRAM_BOT_TOKEN}",
    "dmPolicy": "open",
    "groupPolicy": "mention_required",
    "pollingInterval": 1000,
    "allowedChatIds": []
  }
}
```

Store the token in your `.env` file:

```
TELEGRAM_BOT_TOKEN=110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
```

### Config options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `token` | string | *required* | Bot token from BotFather |
| `dmPolicy` | string | `"open"` | How to handle direct messages |
| `groupPolicy` | string | `"mention_required"` | How to handle group messages |
| `pollingInterval` | number | `1000` | Milliseconds between poll cycles |
| `allowedChatIds` | number[] | `[]` (all allowed) | Whitelist of chat IDs; empty = allow all |

### DM policies

| Policy | Behavior |
|--------|----------|
| `open` | Accept DMs from anyone |
| `allowlist` | Only accept DMs from users in `allowedChatIds` |
| `pairing` | Reserved for future use |
| `disabled` | Ignore all DMs |

### Group policies

| Policy | Behavior |
|--------|----------|
| `mention_required` | Only respond when @mentioned by username |
| `always_on` | Respond to every message in the group |
| `disabled` | Ignore all group messages |

### Finding chat IDs

To find a user or group's chat ID:

1. Send a message to your bot (or add it to a group and send a message)
2. Call the Telegram API:

```bash
curl https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates | jq '.result[-1].message.chat.id'
```

3. The returned number is the chat ID — add it to `allowedChatIds`

Group chat IDs are negative numbers (e.g., `-1001234567890`).

### How it works

HomarUS uses **long polling** (not webhooks) — no public IP or SSL certificate needed. The adapter calls `getUpdates` with a 30-second timeout, processes any messages, then immediately polls again. On error, it uses exponential backoff (1s → 2s → 4s → ... → 30s max).

---

## Channels — CLI

The CLI channel is always available and requires no configuration. It reads from stdin and writes to stdout.

```json
"channels": {
  "cli": {}
}
```

The default config from `homarus init` includes the CLI channel. To run interactively:

```bash
homarus start
```

Type messages and press Enter. Responses print to stdout. Press Ctrl+C to stop.

---

## Identity System

The identity system builds the agent's system prompt from layered markdown files. Layers stack in this order:

1. **Soul** (`soul.md`) — Core personality, values, boundaries
2. **User** (`user.md`) — User profile, preferences, context about the operator
3. **Channel overlay** — Channel-specific behavior (e.g., `overlays/telegram.md`)
4. **Task overlay** — Task-specific instructions (applied per agent spawn)
5. **Workspace files** — All `.md` files in the workspace directory, added as sections

Layers are separated by `---` in the assembled prompt.

### Directory structure

```
~/.homarus/identity/
  soul.md              # Who the agent is
  user.md              # Who the user is
  overlays/
    telegram.md        # Behavior adjustments for Telegram
    research.md        # Overlay for research-type tasks
~/.homarus/workspace/
  TOOLS.md             # Available tools documentation
  RULES.md             # Operational rules
```

### Configuration

```json
"identity": {
  "dir": "~/.homarus/identity",
  "workspaceDir": "~/.homarus/workspace"
}
```

### Writing a soul.md

```markdown
# Soul

You are Hal, an AI assistant. You are helpful, direct, and concise.

## Values
- Accuracy over speed
- Ask before taking destructive actions
- Be transparent about limitations

## Boundaries
- Never share API keys or secrets
- Never execute commands you don't understand
```

### Writing a user.md

```markdown
# User

Name: Max
Location: Chicago, CST timezone
Preferences: Prefers concise responses, uses Telegram primarily
```

### Overlays

Overlays are named markdown files in `overlays/`. They're applied by channel name or task type. For example, `overlays/telegram.md` is automatically applied for Telegram messages:

```markdown
# Telegram Overlay

Keep responses under 4096 characters (Telegram message limit).
Use markdown formatting sparingly — Telegram supports limited markdown.
```

---

## Skills

Skills are pluggable extensions that add tools, handle events, or both. Each skill lives in its own directory with a `skill.json` manifest.

### Directory structure

```
~/.homarus/skills/
  my-skill/
    skill.json         # Manifest (required)
    index.js           # Entry point (for stdio/direct skills)
    ...
```

### Manifest (`skill.json`)

```json
{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "Does something useful",
  "tools": [
    {
      "name": "my_tool",
      "description": "Performs an action",
      "parameters": {
        "type": "object",
        "properties": {
          "input": { "type": "string", "description": "The input" }
        },
        "required": ["input"]
      }
    }
  ],
  "handles": ["custom_event"],
  "emits": ["custom_result"],
  "process": {
    "command": "node",
    "args": ["index.js"],
    "port": 8900,
    "healthCheck": "/health"
  }
}
```

### Transport types

| Type | Config | How it works |
|------|--------|-------------|
| **http** | `process.port` is set | Skill runs as an HTTP server; HomarUS POSTs events and tool calls to it |
| **stdio** | `process.command` is set (no port) | HomarUS spawns the process and communicates via stdin/stdout JSON |
| **direct** | No `process` block | Tool execution is dispatched through the event bus (in-process) |

### Skill paths

Tell HomarUS where to find skills:

```json
"skills": {
  "paths": [
    "~/.homarus/skills",
    "/opt/shared-skills"
  ]
}
```

Each directory is scanned for subdirectories containing `skill.json`.

### Hot-reload

HomarUS watches skill directories. When a skill's files change, it automatically unloads and reloads that skill. Skill paths are hot-reloadable — add new paths to the config and they'll be picked up without a restart.

---

## Memory

HomarUS provides hybrid search (vector + full-text) over indexed markdown files, backed by SQLite with the `sqlite-vec` extension.

### Setup

1. **Choose an embedding provider.** Ollama with `nomic-embed-text` is recommended for local/free operation:

```bash
# Install Ollama (https://ollama.ai)
ollama pull nomic-embed-text
```

2. **Configure in config.json:**

```json
"memory": {
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "baseUrl": "http://127.0.0.1:11434/v1"
  },
  "search": {
    "vectorWeight": 0.7,
    "ftsWeight": 0.3
  },
  "extraPaths": [
    "/home/user/notes",
    "/home/user/docs"
  ]
}
```

### Embedding providers

Any OpenAI-compatible embedding endpoint works:

| Provider | Model | Dimensions | Notes |
|----------|-------|-----------|-------|
| Ollama | `nomic-embed-text` | 768 | Free, local, 8192 token context |
| Ollama | `all-minilm` | 384 | Free, local, but only 512 token context |
| OpenAI | `text-embedding-3-small` | 1536 | Paid, cloud |
| OpenAI | `text-embedding-3-large` | 3072 | Paid, cloud |

For providers that need an API key:

```json
"embedding": {
  "provider": "openai",
  "model": "text-embedding-3-small",
  "apiKey": "${OPENAI_API_KEY}"
}
```

### Database location

The SQLite database is stored at `~/.homarus/memory/index.sqlite`. It uses WAL mode for concurrent reads.

### Indexing

HomarUS indexes markdown files from:
- Directories listed in `memory.extraPaths`
- Files stored via the `memory_store` tool at runtime

Content is split into chunks of ~400 words with 80-word overlap. Each chunk gets both an FTS5 entry and a vector embedding.

The memory index watches indexed directories for changes and re-indexes files automatically.

### Search tuning

```json
"search": {
  "vectorWeight": 0.7,
  "ftsWeight": 0.3
}
```

- **vectorWeight** — Weight for semantic similarity (embedding cosine distance). Higher values favor meaning over exact words.
- **ftsWeight** — Weight for BM25 full-text search. Higher values favor exact keyword matches.

Both weights are hot-reloadable.

---

## Timers

Timers trigger agent tasks on a schedule. Three types are supported.

### Timer types

| Type | `schedule` value | Example |
|------|-----------------|---------|
| `cron` | Cron expression (6 fields supported) | `"0 */1 9-21 * * *"` (hourly 9am-9pm) |
| `interval` | Milliseconds between fires | `"3600000"` (every hour) |
| `once` | ISO 8601 timestamp | `"2026-03-01T09:00:00Z"` |

### Configuration

Timers are enabled by default. The timer store file persists timer definitions across restarts:

```json
"timers": {
  "enabled": true,
  "store": "~/.homarus/timers.json"
}
```

If `store` is not set, it defaults to `~/.homarus/timers.json`.

### Timer definitions

Timers are stored in the timer store file as a JSON array. Each timer has:

```json
[
  {
    "id": "heartbeat",
    "name": "Hourly check-in",
    "type": "cron",
    "schedule": "0 0 9-21 * * *",
    "prompt": "Check email and kanban for new tasks.",
    "timezone": "America/Chicago",
    "model": "openai/gpt-4o"
  },
  {
    "id": "daily-summary",
    "name": "Daily summary",
    "type": "cron",
    "schedule": "0 0 21 * * *",
    "prompt": "Write a summary of today's completed tasks.",
    "timezone": "America/Chicago"
  },
  {
    "id": "reminder",
    "name": "One-time reminder",
    "type": "once",
    "schedule": "2026-03-01T15:00:00-06:00",
    "prompt": "Remind user about the meeting."
  }
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | No | Unique ID (auto-generated UUID if omitted) |
| `name` | Yes | Human-readable label |
| `type` | Yes | `cron`, `interval`, or `once` |
| `schedule` | Yes | Cron expression, ms interval, or ISO timestamp |
| `prompt` | Yes | The instruction sent to the agent when the timer fires |
| `timezone` | No | IANA timezone for cron (e.g., `America/Chicago`) |
| `model` | No | Override the default model for this timer's agent |

### Behavior

When a timer fires, it emits a `timer_fired` event into the event loop. This spawns an agent with the timer's `prompt` as the user message. One-shot (`once`) timers are automatically removed after firing.

The timer store is saved to disk whenever timers are added, removed, or when the service stops — so definitions survive restarts.

---

## Browser

HomarUS can control a headless browser via Playwright for web scraping, form filling, and screenshots.

### Setup

1. Install Playwright as a peer dependency:

```bash
npm install playwright
npx playwright install chromium
```

2. Enable in config:

```json
"browser": {
  "enabled": true,
  "headless": true
}
```

The browser launches lazily on first tool use, not at startup.

### Config options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `false` | Enable browser support |
| `headless` | boolean | `true` | Run without visible window |
| `executablePath` | string | — | Custom Chromium binary path |
| `proxy` | string | — | Proxy server URL (e.g., `http://proxy:8888`) |
| `viewport` | object | `{width: 1280, height: 720}` | Browser viewport size |
| `timeout` | number | `30000` | Default action timeout in ms |

### Browser actions

The `browser` tool exposes these actions:

| Action | Required params | Description |
|--------|----------------|-------------|
| `navigate` | `url` | Go to a URL |
| `click` | `selector` | Click an element |
| `type` | `selector`, `text` | Fill a form field |
| `screenshot` | — | Capture the current page (returns base64 PNG) |
| `content` | — | Get visible text content (truncated at 50k chars) |
| `evaluate` | `script` | Run JavaScript in the page |
| `back` | — | Navigate back |
| `forward` | — | Navigate forward |
| `wait` | `selector` or `timeout` | Wait for element or fixed duration |
| `scroll` | `direction`, `pixels` | Scroll up or down |

---

## HTTP API

HomarUS runs an Express HTTP server for status checks and event ingestion.

### Config

```json
"server": {
  "port": 18800,
  "auth": { "token": "your-secret-token" }
}
```

If `auth` is not set, all endpoints except `/health` are open (rely on network isolation).

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Returns `{"status":"ok","timestamp":...}` |
| `GET` | `/status` | Yes | Full system status (agents, queue, channels, skills, memory, usage) |
| `POST` | `/events` | Yes | Inject an event into the loop |

### Authentication

When `server.auth.token` is configured, protected endpoints require a Bearer token:

```bash
# Health check (no auth)
curl http://localhost:18800/health

# Status (requires auth)
curl -H "Authorization: Bearer your-secret-token" http://localhost:18800/status

# Inject event
curl -X POST http://localhost:18800/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{"id":"evt-1","type":"message","source":"external","timestamp":1234567890,"payload":{"text":"Hello"}}'
```

### Status response

The `/status` endpoint returns:

```json
{
  "state": "running",
  "agents": { "active": 1 },
  "queue": { "size": 0 },
  "channels": { "telegram": { "healthy": true, "message": "polling" } },
  "skills": [{ "name": "my-skill", "state": "running" }],
  "memory": { "fileCount": 62, "chunkCount": 247, "indexedPaths": [...] },
  "usage": { "anthropic/claude-sonnet-4-5": { "inputTokens": 1234, "outputTokens": 567 } }
}
```

---

## CLI Reference

```
homarus - Event-driven AI agent coordinator

Usage:
  homarus start [config-path]   Start the event loop (foreground)
  homarus init                  Create default config and directories
  homarus status [port]         Show status of running instance
  homarus config [config-path]  Validate config file
  homarus skills                List loaded skills (from running instance)
  homarus install-daemon        Install systemd/launchd service
```

### `homarus start [config-path]`

Starts the event loop in the foreground. Handles SIGINT and SIGTERM for graceful shutdown. If no config path is given, uses the default resolution order (project-level, then user-level).

### `homarus init`

Creates the `~/.homarus/` directory structure and a default `config.json` with:
- Anthropic as the default provider (using `${ANTHROPIC_API_KEY}`)
- Model aliases: smart (Opus), fast (Haiku)
- Ollama `nomic-embed-text` for embeddings
- CLI channel enabled
- Default agent limits (5 concurrent, 300s timeout, 20 turns)

Also creates starter `soul.md` and `user.md` files.

### `homarus status [port]`

Queries the running instance's `/status` endpoint. Defaults to port 18800.

### `homarus config [config-path]`

Loads and validates the config file. Exits with code 1 if invalid.

### `homarus skills`

Prints a reminder to use `homarus status` for skill info from a running instance.

### `homarus install-daemon`

Generates a service file for the current platform:

**macOS (launchd):**
- Writes `~/Library/LaunchAgents/com.homarus.plist`
- Run at login, keep alive on crash
- Logs to `~/.homarus/stdout.log` and `~/.homarus/stderr.log`

```bash
homarus install-daemon
launchctl load ~/Library/LaunchAgents/com.homarus.plist
```

**Linux (systemd):**
- Writes `~/.config/systemd/user/homarus.service`
- Restart on failure with 5s delay
- Uses `KillMode=control-group` (kills all child processes on stop)

```bash
homarus install-daemon
systemctl --user daemon-reload
systemctl --user enable --now homarus
```

### Debug logging

Set `DEBUG=1` to enable debug-level log output:

```bash
DEBUG=1 homarus start
```

---

## Built-in Tools Reference

These tools are always available to agents (except `browser`, which requires `browser.enabled: true`).

### File system tools

| Tool | Description | Sandbox-safe |
|------|-------------|:---:|
| `read` | Read file contents | Yes |
| `write` | Write content to a file | No |
| `edit` | Edit file with string replacement | No |
| `glob` | Find files by pattern | Yes |
| `grep` | Search file contents with regex | Yes |

### Runtime tools

| Tool | Description | Sandbox-safe |
|------|-------------|:---:|
| `bash` | Execute shell commands | No |
| `git` | Run git operations | No |

### Web tools

| Tool | Description | Sandbox-safe |
|------|-------------|:---:|
| `web_fetch` | Fetch and process a URL | Yes |
| `web_search` | Search the web | Yes |
| `browser` | Control headless browser (requires config) | No |

### Code tools

| Tool | Description | Sandbox-safe |
|------|-------------|:---:|
| `lsp` | Language Server Protocol operations | Yes |

### Memory tools

| Tool | Description | Sandbox-safe |
|------|-------------|:---:|
| `memory_search` | Hybrid vector + FTS search over indexed files | Yes |
| `memory_get` | Read a specific file by path | Yes |
| `memory_store` | Write content to a file and index it | No |

Skills can register additional tools at runtime. Use `homarus status` to see all loaded tools for a running instance.

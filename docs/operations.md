# Operations

This document covers monitoring, troubleshooting, logging, backup, and maintenance for HomarUS.

---

## Monitoring & Health Checks

### Health Endpoint

The backend exposes a simple health check:

```bash
curl -s http://127.0.0.1:3120/api/health
# {"ok":true,"state":"running"}
```

The MCP proxy uses this endpoint to verify the backend is alive after spawning it. It polls with 200ms intervals for up to 30 seconds before giving up.

### System Status

The `get_status` MCP tool (or `GET /api/status`) returns comprehensive system state:

```bash
curl -s http://127.0.0.1:3120/api/status | jq .
```

This includes:
- Channel health (Telegram connected, message counts)
- Timer count and active timer names
- Memory index stats (file count, chunk count)
- Agent registry status (active/completed/failed counts)
- Event queue size
- Compaction stats (count, loop failures, pending)
- Docs index domains and stats
- Fact extractor status (buffered turns, extractions run, facts stored)

### What to Watch For

| Signal | Meaning | Action |
|--------|---------|--------|
| Telegram channel `healthy: false` | Bot token invalid or network issue | Check `TELEGRAM_BOT_TOKEN` in `.env` |
| Compaction count climbing | Long session, approaching auto-restart | Save state; restart if count reaches 8 |
| Loop failures > 0 | Event loop didn't restart after compaction | Check that `bin/event-loop` ran post-compaction |
| Agent stuck in `running` | Background task may have died | Check agent timeout (30min default); clean up stale agents |
| High event queue | Events accumulating without being consumed | Restart the event loop |

### Compaction Stats

```bash
curl -s http://127.0.0.1:3120/api/compaction-stats | jq .
# {"count":3,"history":[...],"pending":null,"loopFailures":0}
```

Reset the counter manually:
```bash
curl -s -X POST http://127.0.0.1:3120/api/compaction/reset
```

---

## Troubleshooting

### Common Issues

#### Telegram Not Connecting

**Symptom:** `get_status` shows Telegram as unhealthy, or "poll error, retrying" in logs.

**Causes and fixes:**
1. **Backend not running** -- The proxy auto-spawns the backend, but if it crashed, use the `restart_backend` MCP tool.
2. **Bad bot token** -- Verify `TELEGRAM_BOT_TOKEN` in `~/.homarus/.env`. Test it: `curl https://api.telegram.org/bot<TOKEN>/getMe`.
3. **Network issue** -- Telegram long-polling requires outbound HTTPS. Check connectivity.
4. **Duplicate bot instances** -- Only one process can poll a Telegram bot token. Kill any stale Node processes: `pkill -f backend.js`.

#### Proxy vs Backend Errors

**Key distinction:** The MCP proxy (`mcp-proxy.ts`) never restarts -- it is the stable stdio bridge to Claude Code. The backend (`backend.ts`) is the restartable worker.

| Error source | How to tell | Fix |
|-------------|-------------|-----|
| Proxy error | `[proxy]` prefix in stderr | Fatal -- Claude Code must be restarted |
| Backend error | No `[proxy]` prefix | Use `restart_backend` tool |
| Backend unavailable | Tool calls return "Backend unavailable" | Use `restart_backend` tool |

#### Embedding Errors

**Symptom:** Memory search returns no results or throws errors.

**Causes:**
1. **sqlite-vec binding issue** -- Embeddings must be passed as `Uint8Array(float32Array.buffer)`, not `Float32Array` directly. This is a known sqlite-vec quirk.
2. **Embedding provider down** -- Check that the configured embedding provider is reachable.
3. **minScore too high** -- Default min score is 0.05. If results are being filtered, lower it in config.

#### Port Already in Use

**Symptom:** `EADDRINUSE` error on startup.

The dashboard server automatically attempts to kill the stale process on the configured port. If that fails, it continues in degraded mode (no dashboard, but MCP tools still work). Manual fix:

```bash
lsof -ti:3120 | xargs kill
```

#### Event Loop Not Restarting After Compaction

**Symptom:** No events being received after a compaction.

The compaction manager instructs Claude to restart `bin/event-loop` after compaction, but if the instruction is lost during compression, the loop stops. Fix: manually run `bash "$PWD/bin/event-loop"`.

---

## Logs & Debugging

### Logging Architecture

**All logging goes to stderr.** Stdout is reserved exclusively for the MCP JSON-RPC protocol. Any stray stdout output breaks the MCP connection.

The proxy prefixes its logs with `[proxy]`:
```
[INFO] [proxy] Spawning backend process {"script":"/path/to/backend.js"}
[INFO] [proxy] Backend is healthy
[INFO] [proxy] MCP proxy connected via stdio
```

The backend uses level prefixes without the `[proxy]` tag:
```
[INFO] HomarUS backend running (no MCP stdio)
[INFO] Dashboard server started {"port":3120}
[WARN] Config change requires restart for full effect
```

### Log Levels

| Level | When used |
|-------|-----------|
| `DEBUG` | Verbose tracing (disabled by default) |
| `INFO` | Normal operations (startup, tool calls, events) |
| `WARN` | Recoverable issues (config reload, failed skill load) |
| `ERROR` | Serious problems (tool execution failure, crash) |
| `FATAL` | Unrecoverable -- process exits |

### Enabling Debug Output

Set the `HOMARUS_DEBUG` environment variable:

```bash
HOMARUS_DEBUG=1 node dist/backend.js
```

### Where Logs Go

HomarUS does not write log files by default. All output goes to stderr, which:
- In **proxy mode**: is piped from the backend child process through the proxy's stderr, ultimately to Claude Code's log.
- In **tmux mode**: appears in the tmux pane.
- Can be redirected: `node dist/backend.js 2>/path/to/logfile`.

---

## Backup & Recovery

### What to Back Up

All persistent state lives under `~/.homarus/`:

| Path | Contents | Priority |
|------|----------|----------|
| `~/.homarus/config.json` | System configuration | Critical |
| `~/.homarus/.env` | Secrets (API tokens, bot tokens) | Critical |
| `~/.homarus/secrets/` | OAuth tokens and credentials | Critical |
| `~/.homarus/identity/` | soul.md, user.md, state.md, preferences.md, disagreements.md | High |
| `~/.homarus/memory/` | SQLite memory index (`index.sqlite`) | High |
| `~/.homarus/docs/` | Domain-specific documentation indexes | Medium |
| `~/.homarus/journal/` | Daily reflection entries | Medium |
| `~/.homarus/timers.json` | Persisted timer definitions | Medium |
| `~/.homarus/compaction-count.json` | Compaction counter | Low |

Memory content files are stored relative to the backend's working directory (the project directory), not under `~/.homarus/memory/`. The SQLite index can be rebuilt by re-indexing.

### Backup Script Example

```bash
#!/bin/bash
BACKUP_DIR="$HOME/backups/homarus/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# Core config and secrets
cp ~/.homarus/config.json "$BACKUP_DIR/"
cp ~/.homarus/.env "$BACKUP_DIR/"
cp -r ~/.homarus/secrets/ "$BACKUP_DIR/secrets/" 2>/dev/null

# Identity and journal
cp -r ~/.homarus/identity/ "$BACKUP_DIR/identity/"
cp -r ~/.homarus/journal/ "$BACKUP_DIR/journal/" 2>/dev/null

# Memory and docs indexes
cp ~/.homarus/memory/index.sqlite "$BACKUP_DIR/" 2>/dev/null
cp -r ~/.homarus/docs/ "$BACKUP_DIR/docs/" 2>/dev/null

# Timers
cp ~/.homarus/timers.json "$BACKUP_DIR/" 2>/dev/null

echo "Backup complete: $BACKUP_DIR"
```

### Restoring from Backup

1. Stop the backend: `restart_backend` or kill the process.
2. Copy backed-up files to `~/.homarus/`.
3. Restart: `restart_backend` tool or restart Claude Code.
4. If the memory index is missing, it will be rebuilt on next startup from memory content files.

---

## Updating HomarUS

### Standard Update

```bash
cd /path/to/homarus
git pull
npm install
npm run build
```

Then restart the backend using one of:
- The `restart_backend` MCP tool (preserves MCP connection)
- Telegram `/restart` command
- Killing and restarting the process

### Post-Update Checklist

1. Check for new config options in `src/types.ts` (`ConfigData` interface).
2. Review any new `.env` variables needed.
3. Run `get_status` to verify all channels and subsystems are healthy.

### Scripts Reference

| Script | Purpose | Called by |
|--------|---------|-----------|
| `bin/event-loop` | Zero-token long-poll loop | Claude Code (manually) |
| `bin/restart-claude` | Kill and restart Claude Code in tmux | Telegram `/restart` command |
| `bin/nuke-claude` | Nuclear restart -- kill ALL claude processes | Telegram `/nuke` command |

#### `bin/event-loop`

Long-polls `GET /api/wait?timeout=120`. Returns 204 on timeout (loops silently), 200 on events (prints JSON and exits for Claude to handle). Detects the `shouldRestart` flag for auto-restart after excessive compactions.

---

## Related Documentation

- [Core Concepts](core-concepts.md) -- system design and two-process model
- [Configuration](configuration.md) -- config file reference
- [Advanced](advanced.md) -- compaction, agents, skills, browser
- [Security](security.md) -- permission boundaries and safety rules

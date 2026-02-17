# Configuration

**Language:** TypeScript
**Environment:** Node.js >= 22, Unix-like systems

## Overview

The system is configured via a single JSON config file with sensible defaults. Config supports environment variable references, hot-reloading for safe changes, and validation against a strict schema.

## Config Location

Primary: `~/.homarus/config.json`
Per-project override: `./homarus.json`

## Structure

```json
{
  "models": {
    "default": "anthropic/claude-sonnet-4-5",
    "fallback": ["openai/gpt-5"],
    "aliases": { "smart": "...", "fast": "...", "cheap": "..." },
    "providers": {
      "anthropic": { "apiKey": "${ANTHROPIC_API_KEY}" },
      "openai": { "apiKey": "${OPENAI_API_KEY}" },
      "openrouter": { "apiKey": "${OPENROUTER_API_KEY}" },
      "ollama": { "baseUrl": "http://127.0.0.1:11434" }
    }
  },
  "channels": {
    "telegram": { "token": "${TELEGRAM_BOT_TOKEN}", "dmPolicy": "pairing" },
    "discord": { "token": "${DISCORD_BOT_TOKEN}" }
  },
  "agents": {
    "maxConcurrent": 5,
    "defaultTimeout": 300000,
    "defaultMaxTurns": 20
  },
  "memory": {
    "embedding": { "provider": "ollama", "model": "nomic-embed-text" },
    "search": { "vectorWeight": 0.7, "ftsWeight": 0.3 },
    "extraPaths": []
  },
  "skills": {
    "paths": ["~/.homarus/skills/", "./skills/"]
  },
  "server": {
    "port": 18800,
    "auth": { "token": "${EVENTLOOP_TOKEN}" }
  },
  "timers": {
    "enabled": true
  }
}
```

## Environment Variables

Config values can reference env vars with `${VAR_NAME}` syntax. The system loads `.env` files from the config directory.

## Hot Reload

The system watches the config file for changes. Safe changes (model aliases, agent limits, skill paths) apply immediately. Unsafe changes (server port, auth tokens) require restart. A warning is emitted for changes that need restart.

## Validation

Config is validated against a JSON schema on load. Unknown keys are rejected to prevent silent misconfiguration.

## CLI

```bash
homarus init              # Create config with onboarding wizard
homarus start             # Start the event loop
homarus stop              # Graceful shutdown
homarus status            # Show running state
homarus config validate   # Validate config file
homarus skill list        # List loaded skills
homarus skill add <path>  # Add a skill
```

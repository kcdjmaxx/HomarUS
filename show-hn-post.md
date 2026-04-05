# Show HN: HomarUS — an MCP server that gives Claude Code a body

HomarUS is an event-driven AI agent coordinator that runs as an MCP server for Claude Code (or standalone with its own model routing). It gives your AI agent persistent memory, channels (Telegram, dashboard), timers, identity, and a dream cycle — turning ephemeral chat sessions into a continuous presence.

**The key insight:** Claude Code is already the best reasoning engine. Instead of building another agent brain (like OpenClaw), HomarUS provides the nervous system — I/O, memory, and identity — and lets Claude Code do the thinking.

**Zero-token idle:** The event loop blocks at the OS level (curl long-polls). Your agent costs nothing while waiting. When an event arrives (Telegram message, timer fire, dashboard chat), Claude wakes, handles it, and goes back to sleep. No always-on inference loop burning tokens.

**What it does:**

- Channels: Telegram, web dashboard (React), webhooks
- Memory: Vector + FTS hybrid search with temporal decay, MMR diversity, and dream-weighted content
- Identity: Soul file, user context, mutable state, learned preferences, disagreements log, daily journal
- Timers: Cron, intervals, one-shots — morning briefings, evening reflections, nightly dream cycles
- Docs: Per-domain vector DBs for reference material (ingest docs, cluster, compile)
- Compaction resilience: Session checkpoints + identity digest survive Claude Code's context compaction
- Dream cycle: Overnight memory consolidation, associative dreaming, preference overfitting prevention (neuroscience-inspired)
- Browser: Playwright-based headless browser via MCP tools
- Fact extraction: Passive conversation mining — learns your preferences without burning context tokens

**Two modes:**
- `homarus-mcp` — MCP server for Claude Code (recommended)
- `homarus start` — standalone with its own model routing (Anthropic, OpenAI, OpenRouter, Ollama)

Install: `npm install -g homarus`

Quick start: `homarus init` (interactive wizard)

https://github.com/kcdjmaxx/homarus

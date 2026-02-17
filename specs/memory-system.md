# Memory System

**Language:** TypeScript
**Environment:** Node.js >= 22, Unix-like systems

## Overview

The memory system gives agents persistent knowledge across sessions. It combines human-readable Markdown files (the canonical store) with a derived SQLite index for fast machine retrieval. This is adopted from OpenClaw's memory architecture.

## Two Layers

### Workspace Files (Bootstrap Context)

On agent startup, workspace files are injected into the system prompt:
- Identity/personality configuration
- Tool usage conventions
- User preferences
- Operational rules

These are user-editable Markdown files in `~/.homarus/workspace/`.

### Semantic Memory (Search Index)

A hybrid vector + keyword search index over:
- Workspace files
- Session transcripts
- Skill-contributed knowledge
- Daily logs

**Backend:** SQLite with sqlite-vec extension
**Chunking:** 400-token chunks with 80-token overlap
**Search:** Hybrid — configurable vector/keyword weight split (default 70/30)

## Embedding Providers

Model-agnostic, supports:
- OpenAI embeddings API
- Ollama local models (e.g., nomic-embed-text)
- Any OpenAI-compatible embedding endpoint

## Memory Tools

Agents access memory through tools:
- `memory_search(query)` — semantic search, returns ranked chunks with sources
- `memory_get(path)` — direct file access
- `memory_store(content, tags)` — persist new knowledge

## Memory Lifecycle

- **Retain:** Extract facts from conversations into daily logs
- **Recall:** Query index during agent execution
- **Reflect:** Periodic jobs that consolidate, summarize, and maintain the knowledge base

## Index Management

- Auto-indexes new/changed files in workspace and configured paths
- Incremental updates (only re-index changed files)
- Configurable extra paths for indexing additional directories
- Session memory optionally included in index

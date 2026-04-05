# HomarUS Port — Code Review Report

Reviewed: 2026-04-03
Source: HomarUScc (`/Users/maxross/.../homaruscc/src/`)
Target: HomarUS (`/tmp/homarus-port/src/`)

---

## 1. Critical Issues

### C1. `docs_compile` tool and `compile()` method missing from DocsIndex
**File:** `src/docs-index.ts`, `src/mcp-tools.ts`
**Lines:** entire file / entire file
**What:** The source DocsIndex has a `compile()` method that uses an LLM to synthesize concept articles from document clusters. The ported DocsIndex drops `compile()` entirely. The source mcp-tools.ts exposes `docs_compile` as an MCP tool. The port has no `docs_compile` tool. The port still has `clearCompiled()` and filters `compiled/` paths in `getClusters()`, but there is no way to create compiled content.
**Fix:** Port the `compile()` method from source DocsIndex and add the `docs_compile` tool to mcp-tools.ts, or remove the orphaned `clearCompiled()` / compiled path filtering if compile is intentionally excluded.

### C2. CompactionManager loses `loop` reference — handlePreCompact/handlePostCompact severely degraded
**File:** `src/compaction-manager.ts`
**Lines:** 27-28, 58-108
**What:** Source CompactionManager takes `(loop: HomarUScc, logger: Logger)` and uses `this.loop` extensively in `handlePreCompact()` and `handlePostCompact()` to access timer names, memory stats, recent events, transcript logger, session checkpoint, agent registry, identity, delivery watermark, and transcript tail. The port constructor takes only `(logger: Logger)` and the `handlePreCompact()` / `handlePostCompact()` methods are stripped to bare-bones static strings. This means:
- Pre-compact: No timer list, no memory stats, no recent event summary, no transcript flush, no checkpoint save, no "event loop was active" nuance with checkpoint backup
- Post-compact: No watermark info, no timer list, no memory stats, no recent events, no recent memory content, no session checkpoint, no agent list, no transcript tail
The compaction hooks will work (they return strings), but they return almost no useful context for post-compaction recovery. This is the biggest functionality gap in the port.
**Fix:** Either pass the `Homarus` loop instance into the CompactionManager constructor (as the source does) and re-implement the enriched pre/post-compact methods, or accept that this is an intentional simplification and document it.

### C3. IdentityManager.getDigest() is a naive truncation instead of structured extraction
**File:** `src/identity-manager.ts`
**Lines:** 121-137
**What:** Source `getDigest()` extracts the agent's name via regex (`**Name: (\w+)**`), the Vibe section, and the current mood from state.md — producing a compressed ~200 token identity digest. The port just takes the first 500 characters of soul.md and first 200 characters of state.md. This means the digest may cut off mid-sentence, include YAML frontmatter, or miss the behavioral rules entirely if they appear after the 500-char mark.
**Fix:** Port the structured regex extraction from the source, or at minimum ensure the truncation lands on meaningful boundaries.

---

## 2. Medium Issues

### M1. MemoryIndex adds `dreamEnabled` guard not present in source
**File:** `src/memory-index.ts`
**Lines:** 49, 333-338
**What:** The source always applies dream scoring unconditionally (line 314-318 in source: no `if` guard). The port wraps dream scoring in `if (this.dreamEnabled)`. The `setDreamConfig` in the port also accepts an `enabled` field (line 105) which the source does not have. This is a behavioral divergence — in the source, dream content always gets weighted down by `dreamBaseWeight`; in the port, it can be disabled. Not necessarily a bug, but it changes semantics. If a user migrates config from HomarUScc to HomarUS with no `dreams.enabled` field, the default `true` preserves behavior, so this is low risk.
**Impact:** Low — default behavior matches. But the added toggle is undocumented API surface.

### M2. IdentityManager adds preferences.md and disagreements.md — source doesn't have them
**File:** `src/identity-manager.ts`
**Lines:** 18-19, 34-36
**What:** The port loads `preferences.md` and `disagreements.md` alongside soul/user/state. This is new functionality not in the source. The `buildSystemPrompt()` also injects preferences (line 68-69) and state with headers. The source's `buildSystemPrompt()` just concatenates state directly without a header.
**Impact:** Not a bug per se — this is an enhancement. But these files won't exist on most installs, so `getPreferences()` and `getDisagreements()` will return empty strings. The MCP resources (identity://preferences, identity://disagreements) are registered and call these methods, which will work fine. Clean enhancement.

### M3. isEvergreen() is more permissive than source
**File:** `src/memory-index.ts`
**Line:** 426
**What:** Source uses `path.endsWith(pattern)` only. Port uses `path.endsWith(pattern) || path.includes(pattern)`. Combined with the expanded default patterns (`soul.md`, `user.md` added to the list), this means paths like `/some/dir/soul.md.bak` or `/user.md-notes/file.txt` would incorrectly match as evergreen. The `includes()` fallback is overly broad for the added lowercase patterns.
**Fix:** Either revert to `endsWith` only (matching source), or verify that the patterns are specific enough that `includes` won't false-positive.

### M4. Missing `docs_compile` tool means `docs_clear_compiled` is orphaned
**File:** `src/mcp-tools.ts`
**Lines:** 709-729
**What:** The `docs_clear_compiled` tool exists, but without `docs_compile` there's no way to create compiled content in the first place. This tool will always return "Cleared 0 compiled chunk(s)".
**Fix:** See C1.

### M5. WebSocket `wss` setup has no upgrade path conflict handling
**File:** `src/mcp-backend-server.ts`
**Lines:** 58
**What:** The `WebSocketServer` is created with `{ server: this.httpServer }` which is the correct pattern — it handles the HTTP upgrade internally. This is fine. However, the dashboard catch-all route (line 70-72) uses `app.get("*", ...)` which could intercept WebSocket upgrade requests on some Express versions. In practice, since the WSS is attached to the raw HTTP server and Express only handles non-upgrade requests, this should work correctly.
**Impact:** Low risk in practice.

### M6. `startWatching()` only keeps the last watcher reference
**File:** `src/memory-index.ts`
**Lines:** 373-384
**What:** If `this.indexedPaths` has multiple directories, the `for` loop overwrites `this.watcher` on each iteration. Only the last directory's watcher is stored, so `stopWatching()` only closes the last one. This is the same bug as the source — it was ported faithfully. But it's still a bug: all watchers except the last will leak.
**Fix:** Use an array of watchers, or a single recursive watcher on a common parent.

---

## 3. Minor Issues

### m1. DEFAULT_EVERGREEN_PATTERNS includes lowercase duplicates
**File:** `src/memory-index.ts`
**Line:** 33
**What:** Source has `["MEMORY.md", "SOUL.md", "USER.md"]`. Port has `["MEMORY.md", "SOUL.md", "USER.md", "soul.md", "user.md"]`. Combined with the `includes()` in `isEvergreen()` (M3), this broadens matching. The lowercase additions are reasonable for HomarUS (which uses lowercase identity files), but should be documented.

### m2. FactExtractor uses raw `fetch()` — no timeout
**File:** `src/fact-extractor.ts`
**Lines:** 155-175
**What:** The Anthropic API call via `fetch()` has no timeout. If the API hangs, the extraction will block indefinitely. The source also has this issue — faithfully ported.
**Fix:** Add an `AbortController` with a timeout (e.g., 30s).

### m3. timer_cancel resolves by timer ID only, not by name
**File:** `src/mcp-tools.ts`
**Lines:** 226-235
**What:** The `timer_cancel` tool's schema says the param is "Timer ID or name to cancel" but the handler calls `loop.getTimerService().remove(name)` which only works with IDs. Users who pass a timer name (not UUID) will silently do nothing. This is the same in the source.
**Fix:** Add name-based lookup in `TimerService.remove()` or change the description to say "Timer ID".

### m4. FactExtractor stores to `local/user/preferences/` paths — no `.md` extension
**File:** `src/fact-extractor.ts`
**Lines:** 121-140
**What:** Memory paths like `local/user/preferences/prefer-dark-mode` have no `.md` extension. The MemoryIndex `store()` writes the file and then calls `indexFile()`, which will index the file. But `findMarkdownFiles()` only finds `.md` files during directory reindexing, so these facts would be lost on reindex. This is the same in the source — faithfully ported bug.
**Fix:** Append `.md` to the key paths.

### m5. Event loop script uses `exit 0` on events — one-shot design
**File:** `bin/event-loop`
**Lines:** 72-73
**What:** The event loop exits after receiving events (exit 0), expecting Claude to re-invoke it. This is the correct design for the zero-token pattern — the script blocks until events arrive, prints them, and exits so Claude can process them and then restart the loop. Not a bug.

### m6. `homarus.ts` creates embedding provider twice
**File:** `src/homarus.ts`
**Lines:** 248-257 and 299-308
**What:** The `start()` method creates an embedding provider for MemoryIndex (line 250-256) and then creates a second identical one for DocsIndex (line 300-308). The comment on line 299 says "Reuse the same embedding provider" but it actually creates a new instance. Not a correctness bug (both will work), just wasteful — two instances with separate connection pools.
**Fix:** Store the first embedding provider instance and pass it to DocsIndex.

---

## 4. Clean Files

### src/mcp-backend-server.ts
Mostly clean. WebSocket setup is correct (WSS attached to raw HTTP server). Dashboard static serving works. Checkpoint persistence to `~/.homarus/checkpoint.json` is correct. `/api/wait` correctly returns identity digest vs full identity based on compaction flag. All API routes look correct. The only issue is the degraded compaction context (C2 above, which is in CompactionManager, not this file).

### src/timer-service.ts
Clean port. `loadDefaults()` correctly checks existing timer names before adding. Timer persistence, cron/interval/once handling all look correct.

### src/fact-extractor.ts
Clean port. Extraction prompt is parameterized (userName, agentName passed in). Uses the Anthropic Messages API correctly. Buffering and deduplication logic is sound. Uses `fetch()` directly (no SDK import needed).

### src/docs-index.ts
Clean port of the base functionality. SQLite schema is correct. sqlite-vec binding pattern is correct (Uint8Array(f32.buffer)). `getClusters()` implements the maxClusters cap with orphan merge. `cosineSimilarity()` is correct. Only issue is the missing `compile()` method (C1).

### src/mcp-tools.ts
Clean port of all base tools. Tool handlers call the right methods on the right objects. Error cases are handled. Browser tools correctly delegate to the tool registry. Docs tools correctly null-check `getDocsIndex()`. Only gap is the missing `docs_compile` tool (C1).

### src/homarus.ts
Clean wiring. All new classes are instantiated in `start()`. Getters are available for all features. `stop()` cleans up all resources including factExtractor flush, docsIndex close, and browserManager close. The identity manager gets its dir paths from config. The only issue is the duplicate embedding provider creation (m6).

### bin/event-loop
Clean. Correctly parses `shouldRestart` from JSON. Handles identity field. PID file prevents duplicate listeners. Exit codes are correct (0 = events, 1 = error, 2 = compaction limit).

---

## Summary

| Severity | Count | Key Theme |
|----------|-------|-----------|
| Critical | 3 | Missing compile() method, degraded compaction context, naive digest |
| Medium | 6 | Behavioral divergences, orphaned code, leaked watcher bug |
| Minor | 6 | No timeouts, path extension issues, duplicate instances |
| Clean | 7 | Most core logic ported correctly |

The port is structurally sound — builds pass, types align, and the core event loop / memory / docs / timer / identity pipeline works. The biggest gaps are in the compaction recovery path (C2) which is severely simplified, and the missing `compile()` feature (C1). The identity digest (C3) will work but produce lower-quality compressed identity for event loop wakes.

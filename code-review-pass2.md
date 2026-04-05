# HomarUS Port -- Code Review Pass 2 (Verification)

Date: 2026-04-03

## Fix Verification

### C1: DocsIndex compile() method with LLM synthesis
**PASS.** `src/docs-index.ts` lines 355-538 implement `compile()` with clustering, Anthropic API calls for LLM synthesis, and storage via `ingestText()`. `src/mcp-tools.ts` lines 731-762 register the `docs_compile` tool that calls it.

### C2: CompactionManager takes Homarus loop reference
**PASS.** Constructor at `src/compaction-manager.ts:29` accepts `(loop: Homarus, logger: Logger)`. `src/mcp-backend-server.ts:49` instantiates it as `new CompactionManager(loop, logger)`. `handlePreCompact()` (line 62) gathers timer names, memory stats, recent events, and checkpoint from disk. `handlePostCompact()` (line 185) includes timer names with type, memory stats, event history, recent memory content, checkpoint, running agents, and transcript tail.

### C3: IdentityManager getDigest() uses regex extraction
**PASS.** `src/identity-manager.ts` lines 125-143 implement `getDigest()` using regex to extract name (`/\*\*Name:\s*(\w+)\*\*/`), Vibe section (`/## Vibe\n\n([\s\S]*?)(?=\n##|\n---)/`), and mood from state.md (`/## Last Session\n\n([\s\S]*?)(?=\n##)/`). No hardcoded names, no truncation.

### M3: MemoryIndex isEvergreen() uses endsWith() only
**PASS.** `src/memory-index.ts` line 426: `return this.evergreenPatterns.some((pattern) => path.endsWith(pattern));` -- uses `endsWith()`, not `includes()`.

### M6: MemoryIndex watchers array, all closed on stop
**PASS.** `src/memory-index.ts` line 57 declares `private watchers: FSWatcher[] = []`. `startWatching()` (line 373) guards with `if (this.watchers.length > 0) return;` and pushes each watcher. `stopWatching()` (line 388) iterates all watchers with `.close()` then resets to empty array.

### m2: FactExtractor AbortController with 30s timeout
**PASS.** `src/fact-extractor.ts` lines 156-158: creates `AbortController`, sets `setTimeout(() => controller.abort(), 30000)`, passes `signal: controller.signal` to fetch, and clears timeout after response (line 175).

### m4: .md extension appended to storage paths
**PASS.** `src/fact-extractor.ts` line 131: `const slug = fact.key.endsWith(".md") ? fact.key : \`${fact.key}.md\`;` ensures `.md` extension before constructing the storage path.

### m6: Single shared embedding provider for DocsIndex
**PASS.** `src/homarus.ts` lines 248-258 create `sharedEmbeddingProvider` once, pass it to `memoryIndex.setEmbeddingProvider()`, then reuse same instance at line 300-301 for `docsIndex.setEmbeddingProvider(sharedEmbeddingProvider)`.

## New Issues Check

### Personal name leaks
**CLEAN.** Grep for `caul`, `kcdjmaxx`, `hal39000`, `hal@` returned zero matches. All `max` occurrences are variable names (`maxTs`, `maxRank`, `maxConcurrent`, etc.).

### Type/import issues from fixes
**CLEAN.** No new imports were needed that could break. The `Homarus` type import in `compaction-manager.ts` (line 7) and the loop parameter flow are consistent.

### Wiring issues
**CLEAN.** `CompactionManager` receives `loop` and calls `loop.getTimerService()`, `loop.getMemoryIndex()`, `loop.getEventHistory()`, `loop.getIdentityManager()`, `loop.getAgentRegistry()` -- all of which are public getters on `Homarus`.

### Missed issues from first review
**None found.** The port looks solid after the fixes.

## Summary

All 8 verified fixes: **PASS** (3 critical, 2 medium, 3 minor).
New issues: **None**.
Personal name leaks: **None**.

The codebase is clean for merge.

# MemoryIndex
**Requirements:** R36, R37, R38, R39, R40, R41, R42

## Knows
- db: SQLiteDatabase (with sqlite-vec extension)
- embeddingProvider: EmbeddingProvider (generates vectors)
- chunkSize: number (default 400 tokens)
- chunkOverlap: number (default 80 tokens)
- vectorWeight: number (default 0.7)
- ftsWeight: number (default 0.3)
- indexedPaths: string[] (directories being indexed)
- watcher: FSWatcher | null (for auto-update)

## Does
- initialize(): Create database tables, load existing index
- indexFile(path): Chunk file content, generate embeddings, store in DB
- indexDirectory(path): Recursively index all Markdown files in a directory
- reindex(path): Re-index a changed file (incremental update)
- search(query, options?): Hybrid vector + FTS search, return ranked results with sources
- get(path): Direct file content retrieval
- store(content, tags?): Persist new content to memory and index it
- startWatching(): Watch indexed paths for changes, trigger reindex
- stopWatching(): Stop filesystem watchers
- getStats(): Return index statistics (file count, chunk count, etc.)

## Collaborators
- EmbeddingProvider: generates vector embeddings for chunks and queries
- Agent: accesses memory via memory_search/memory_get/memory_store tools
- Config: provides embedding config, search weights, extra paths

## Sequences
- seq-agent-execution.md

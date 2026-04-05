# Docs Vector DB

The docs vector DB provides domain-specific knowledge bases for the agent. Unlike the agent's personal memory (which stores experiences and facts with temporal decay), docs indexes are static reference material -- API documentation, framework guides, specification files -- that the agent can search when it needs domain expertise.

## Why it exists

An agent working across multiple technical domains needs access to reference material that does not belong in its personal memory. The docs system gives each domain its own isolated index:

- **React** documentation
- **API references** for services the agent integrates with
- **Framework documentation** for projects under development
- Any other reference material organized by domain

Each domain gets its own SQLite database, keeping indexes independent and disposable. You can clear one domain without affecting others.

## Architecture

```
~/.homarus/docs/
    react.sqlite           <- one DB per domain
    openclaw.sqlite
    touchdesigner.sqlite

Each SQLite DB contains:
    chunks          <- text chunks with path + index
    chunks_fts      <- FTS5 full-text search index
    chunks_vec      <- sqlite-vec vector embeddings (if available)
```

The implementation lives in `src/docs-index.ts`.

## Domain isolation

Every domain is a separate SQLite database at `~/.homarus/docs/<domain>.sqlite`. Domains are created lazily when content is first ingested. This isolation means:

- Searching one domain only hits that domain's content
- Clearing a domain deletes one file (the `.sqlite` + WAL/SHM files)
- Domains can be different sizes without cross-contamination
- Use `domain: "*"` with `docs_search` to search across all domains

## Ingesting content

### From files or directories

The `docs_ingest` tool accepts a file path or directory path. For directories, it recursively scans for supported file types:

**Supported extensions:** `.md`, `.txt`, `.html`, `.json`, `.yaml`, `.yml`, `.rst`, `.xml`

Directories starting with `.` (dotfiles) and `node_modules` are skipped.

```
docs_ingest({ domain: "react", filePath: "/path/to/react-docs/" })
docs_ingest({ domain: "mylib", filePath: "/path/to/operators.md" })
```

Each file is chunked, stored in the `chunks` table, and (if an embedding provider is available) embedded into the `chunks_vec` table.

Re-ingesting the same path replaces existing chunks for that path (DELETE then INSERT within a transaction).

### From raw text

The `docs_ingest_text` tool indexes text content directly without saving to disk. This is useful for scraped web pages, API responses, or generated summaries.

```
docs_ingest_text({
  domain: "mylib",
  key: "api/operators/moviefilein",
  content: "The Movie File In operator reads video files..."
})
```

The `key` serves as a virtual path -- re-ingesting the same key replaces the previous content.

## Hybrid search

Searches combine FTS5 full-text search with sqlite-vec vector similarity, weighted and merged:

```
Final score = (FTS BM25 normalized) * ftsWeight + (1 - cosine distance) * vectorWeight
```

### Default weights

| Parameter | Default | Description |
|-----------|---------|-------------|
| `vectorWeight` | 0.7 | Weight for vector similarity |
| `ftsWeight` | 0.3 | Weight for FTS BM25 score |

Results below a score of 0.05 are filtered out.

### Search scope

- **Single domain:** `docs_search({ domain: "react", query: "useEffect cleanup" })`
- **All domains:** `docs_search({ domain: "*", query: "useEffect cleanup" })`

Cross-domain search (`*`) checks both loaded domains and unloaded ones on disk, opening databases as needed.

## Semantic clustering

The `docs_get_clusters` tool groups related chunks by source file and embedding similarity. Clusters are built by:

1. Grouping chunks by source file
2. Computing centroid embeddings for each file group
3. Merging groups whose centroids exceed a similarity threshold (default 0.85)
4. Capping at a maximum number of clusters (default 20); overflow merges into the most similar existing cluster

This is useful for understanding the structure of a large ingested corpus and for generating compiled summaries.

## Compiled content

The `docs_clear_compiled` tool removes chunks whose paths start with `compiled/` from a domain, leaving raw ingested chunks intact. This supports a workflow where raw documentation is ingested, synthesized into compiled articles, and the compiled content can be regenerated independently.

## Chunking strategy

Content is split into overlapping chunks by word count:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `chunkSize` | 400 | Words per chunk |
| `chunkOverlap` | 80 | Words of overlap between consecutive chunks |

## Database schema

Each domain SQLite database has three tables:

### `chunks` (main storage)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Auto-incrementing chunk ID |
| `path` | TEXT | File path or virtual key |
| `chunk_index` | INTEGER | Position within the source file |
| `content` | TEXT | Chunk text content |
| `updated_at` | INTEGER | Timestamp (ms since epoch) |

Unique constraint on `(path, chunk_index)`.

### `chunks_fts` (full-text search)

FTS5 virtual table synced with `chunks` via triggers (INSERT, UPDATE, DELETE). Enables BM25 ranking.

### `chunks_vec` (vector embeddings)

sqlite-vec virtual table with a `float[N]` embedding column (dimension N comes from the embedding provider, default 768).

## MCP tools

Seven tools are registered for the DocsIndex:

| Tool | Description | Required params |
|------|-------------|-----------------|
| `docs_search` | Search a domain index | `domain`, `query` |
| `docs_ingest` | Ingest files or directories | `domain`, `filePath` |
| `docs_ingest_text` | Ingest raw text content | `domain`, `key`, `content` |
| `docs_list` | List all domains with stats | (none) |
| `docs_clear` | Delete a domain entirely | `domain` |
| `docs_get_clusters` | Get semantic clusters | `domain` |
| `docs_clear_compiled` | Remove compiled articles | `domain` |

## Use cases

### Indexing framework documentation

```
docs_ingest({ domain: "react", filePath: "/path/to/react.dev/docs/" })
docs_search({ domain: "react", query: "useEffect cleanup function" })
```

### Indexing API references from web scrapes

```
docs_ingest_text({
  domain: "stripe",
  key: "api/charges/create",
  content: "POST /v1/charges — Creates a new charge..."
})
```

### Cross-domain knowledge retrieval

```
docs_search({ domain: "*", query: "how to handle WebSocket connections" })
```

See also: [MCP Tools](mcp-tools.md) for the full tool reference, [Dashboard](dashboard.md) for the memory browser (which searches the agent's personal memory, not docs).

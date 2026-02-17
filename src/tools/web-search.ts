// Built-in tool: web_search — search the web and return results
import type { ToolDefinition, ToolContext, ToolResult } from "../types.js";

interface WebSearchParams {
  query: string;
  limit?: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// Uses DuckDuckGo HTML search (no API key needed)
async function duckduckgoSearch(query: string, limit: number): Promise<SearchResult[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Homarus/1.0)",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Search failed: HTTP ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // Parse DuckDuckGo HTML results
  // Results are in <a class="result__a"> with <a class="result__snippet">
  const resultBlocks = html.split("class=\"result__body\"");

  for (let i = 1; i < resultBlocks.length && results.length < limit; i++) {
    const block = resultBlocks[i];

    // Extract URL and title from result__a
    const linkMatch = block.match(/class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;

    let resultUrl = linkMatch[1];
    // DuckDuckGo wraps URLs in a redirect — extract the actual URL
    const uddgMatch = resultUrl.match(/uddg=([^&]*)/);
    if (uddgMatch) {
      resultUrl = decodeURIComponent(uddgMatch[1]);
    }

    const title = linkMatch[2].replace(/<[^>]+>/g, "").trim();

    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const snippet = snippetMatch
      ? snippetMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";

    if (title && resultUrl) {
      results.push({ title, url: resultUrl, snippet });
    }
  }

  return results;
}

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description: "Search the web and return results with titles, URLs, and snippets. Uses DuckDuckGo (no API key required).",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
      limit: { type: "number", description: "Maximum number of results (default 10)" },
    },
    required: ["query"],
  },
  source: "builtin",

  async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
    if (context.sandbox) {
      return { output: "", error: "web_search tool is not available in sandbox mode" };
    }

    const { query, limit = 10 } = params as WebSearchParams;

    try {
      const results = await duckduckgoSearch(query, limit);

      if (results.length === 0) {
        return { output: "No results found." };
      }

      const formatted = results.map((r, i) =>
        `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.snippet}`
      ).join("\n\n");

      return { output: formatted };
    } catch (err) {
      return { output: "", error: `Search failed: ${String((err as Error).message ?? err)}` };
    }
  },
};

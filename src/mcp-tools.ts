// CRC: crc-McpTools.md | Seq: seq-mcp-tool-call.md
// MCP tool definitions exposed to Claude Code via the backend HTTP API
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Homarus } from "./homarus.js";
import type { TelegramChannelAdapter } from "./telegram-adapter.js";

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

// R79-R91: Factory function creating all MCP tool definitions
export function createMcpTools(loop: Homarus): McpToolDef[] {
  const tools: McpToolDef[] = [];

  // R79: telegram_send
  tools.push({
    name: "telegram_send",
    description: "Send a message to a Telegram chat",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string", description: "Telegram chat ID to send to" },
        text: { type: "string", description: "Message text to send" },
      },
      required: ["chatId", "text"],
    },
    async handler(params) {
      const { chatId, text } = params as { chatId: string; text: string };
      try {
        await loop.getChannelManager().send("telegram", chatId, { text });
        return { content: [{ type: "text", text: `Sent to Telegram chat ${chatId}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true };
      }
    },
  });

  // R80: telegram_read
  tools.push({
    name: "telegram_read",
    description: "Read recent incoming Telegram messages",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of recent messages to return (default 20)" },
      },
    },
    async handler(params) {
      const { limit = 20 } = params as { limit?: number };
      const adapter = loop.getChannelManager().getAdapter("telegram") as TelegramChannelAdapter | undefined;
      if (!adapter) {
        return { content: [{ type: "text", text: "Telegram not configured" }] };
      }
      const messages = adapter.getRecentMessages(limit);
      if (messages.length === 0) {
        return { content: [{ type: "text", text: "No recent messages" }] };
      }
      const formatted = messages.map((m) =>
        `[${new Date(m.timestamp).toISOString()}] ${m.from} (chat ${m.chatId}): ${m.text}`
      ).join("\n");
      return { content: [{ type: "text", text: formatted }] };
    },
  });

  // R81: telegram_typing
  tools.push({
    name: "telegram_typing",
    description: "Send a typing indicator to a Telegram chat. Shows for up to 5 seconds or until a message is sent.",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string", description: "Telegram chat ID" },
      },
      required: ["chatId"],
    },
    async handler(params) {
      const { chatId } = params as { chatId: string };
      const adapter = loop.getChannelManager().getAdapter("telegram") as TelegramChannelAdapter | undefined;
      if (!adapter) {
        return { content: [{ type: "text", text: "Telegram not configured" }] };
      }
      try {
        await adapter.sendTyping(chatId);
        return { content: [{ type: "text", text: "Typing indicator sent" }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true };
      }
    },
  });

  // R82: telegram_react
  tools.push({
    name: "telegram_react",
    description: "React to a Telegram message with an emoji.",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string", description: "Telegram chat ID" },
        messageId: { type: "number", description: "Message ID to react to" },
        emoji: { type: "string", description: "Emoji to react with" },
      },
      required: ["chatId", "messageId", "emoji"],
    },
    async handler(params) {
      const { chatId, messageId, emoji } = params as { chatId: string; messageId: number; emoji: string };
      const adapter = loop.getChannelManager().getAdapter("telegram") as TelegramChannelAdapter | undefined;
      if (!adapter) {
        return { content: [{ type: "text", text: "Telegram not configured" }] };
      }
      try {
        await adapter.setReaction(chatId, messageId, emoji);
        return { content: [{ type: "text", text: `Reacted with ${emoji} on message ${messageId}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true };
      }
    },
  });

  // telegram_send_photo
  tools.push({
    name: "telegram_send_photo",
    description: "Send a photo to a Telegram chat from a local file path.",
    inputSchema: {
      type: "object",
      properties: {
        chatId: { type: "string", description: "Telegram chat ID" },
        filePath: { type: "string", description: "Absolute path to the image file" },
        caption: { type: "string", description: "Optional caption for the photo" },
      },
      required: ["chatId", "filePath"],
    },
    async handler(params) {
      const { chatId, filePath, caption } = params as { chatId: string; filePath: string; caption?: string };
      const adapter = loop.getChannelManager().getAdapter("telegram") as TelegramChannelAdapter | undefined;
      if (!adapter) {
        return { content: [{ type: "text", text: "Telegram not configured" }] };
      }
      try {
        await adapter.sendPhoto(chatId, filePath, caption);
        return { content: [{ type: "text", text: `Photo sent to chat ${chatId}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true };
      }
    },
  });

  // R83: memory_search
  tools.push({
    name: "memory_search",
    description: "Search the memory index using hybrid vector + FTS search",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
    async handler(params) {
      const { query, limit = 10 } = params as { query: string; limit?: number };
      const results = await loop.getMemoryIndex().search(query, { limit });
      if (results.length === 0) {
        return { content: [{ type: "text", text: "No results found" }] };
      }
      const formatted = results.map((r, i) =>
        `[${i + 1}] ${r.path} (score: ${r.score.toFixed(3)})\n${r.content.slice(0, 500)}`
      ).join("\n\n---\n\n");
      return { content: [{ type: "text", text: formatted }] };
    },
  });

  // R84: memory_store
  tools.push({
    name: "memory_store",
    description: "Store content to memory and index it",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "File path to store at" },
        content: { type: "string", description: "Content to store" },
      },
      required: ["key", "content"],
    },
    async handler(params) {
      const { key, content } = params as { key: string; content: string };
      await loop.getMemoryIndex().store(content, key);
      return { content: [{ type: "text", text: `Stored and indexed: ${key}` }] };
    },
  });

  // R85: timer_schedule
  tools.push({
    name: "timer_schedule",
    description: "Schedule a timer (cron, interval, or one-shot)",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Timer name" },
        type: { type: "string", description: "Timer type: cron, interval, or once", enum: ["cron", "interval", "once"] },
        schedule: { type: "string", description: "Cron expression, interval in ms, or ISO timestamp" },
        prompt: { type: "string", description: "Event prompt/description when timer fires" },
        timezone: { type: "string", description: "Timezone for cron timers (optional)" },
      },
      required: ["name", "type", "schedule", "prompt"],
    },
    async handler(params) {
      const { name, type, schedule, prompt, timezone } = params as {
        name: string; type: "cron" | "interval" | "once"; schedule: string; prompt: string; timezone?: string;
      };
      const id = loop.getTimerService().add({ name, type, schedule, prompt, timezone });
      return { content: [{ type: "text", text: `Timer scheduled: ${name} (${id})` }] };
    },
  });

  // R86: timer_cancel
  tools.push({
    name: "timer_cancel",
    description: "Cancel a scheduled timer",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Timer ID or name to cancel" },
      },
      required: ["name"],
    },
    async handler(params) {
      const { name } = params as { name: string };
      loop.getTimerService().remove(name);
      return { content: [{ type: "text", text: `Timer cancelled: ${name}` }] };
    },
  });

  // R90: dashboard_send
  tools.push({
    name: "dashboard_send",
    description: "Send a message to the web dashboard chat",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Message text to send" },
      },
      required: ["text"],
    },
    async handler(params) {
      const { text } = params as { text: string };
      try {
        await loop.getChannelManager().send("dashboard", "chat", { text });
        return { content: [{ type: "text", text: "Sent to dashboard" }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true };
      }
    },
  });

  // R87: get_status
  tools.push({
    name: "get_status",
    description: "Get system status (channels, memory, timers, queue)",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const status = loop.getStatus();
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    },
  });

  // R88: get_events
  tools.push({
    name: "get_events",
    description: "Get recent event history",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of recent events (default 20)" },
      },
    },
    async handler(params) {
      const { limit = 20 } = params as { limit?: number };
      const events = loop.getEventHistory().slice(-limit);
      if (events.length === 0) {
        return { content: [{ type: "text", text: "No events" }] };
      }
      const formatted = events.map((e) =>
        `[${new Date(e.timestamp).toISOString()}] ${e.type} from ${e.source}: ${JSON.stringify(e.payload).slice(0, 200)}`
      ).join("\n");
      return { content: [{ type: "text", text: formatted }] };
    },
  });

  // R89: wait_for_event
  tools.push({
    name: "wait_for_event",
    description: "Long-poll for events. Blocks until a new event arrives or timeout. Use in a loop for continuous event handling.",
    inputSchema: {
      type: "object",
      properties: {
        timeout: { type: "number", description: "Max wait ms (default 30000, max 120000)" },
      },
    },
    async handler(params) {
      const { timeout = 30000 } = params as { timeout?: number };
      const events = await loop.waitForEvent(Math.min(timeout, 120000));
      if (events.length === 0) {
        return { content: [{ type: "text", text: "No events (timeout)" }] };
      }
      const formatted = events.map((e) =>
        `[${new Date(e.timestamp).toISOString()}] ${e.type} from ${e.source}: ${JSON.stringify(e.payload).slice(0, 500)}`
      ).join("\n");
      return { content: [{ type: "text", text: formatted }] };
    },
  });

  // run_tool: execute registered tools (bash, read, write, etc.)
  tools.push({
    name: "run_tool",
    description: "Execute any registered tool (bash, read, write, edit, glob, grep, git, web_fetch, web_search, memory_*)",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Tool name to execute" },
        params: { type: "object", description: "Tool parameters" },
      },
      required: ["name", "params"],
    },
    async handler(params) {
      const { name, params: toolParams } = params as { name: string; params: Record<string, unknown> };
      const tool = loop.getToolRegistry().get(name);
      if (!tool) {
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
      }
      try {
        const result = await tool.execute(toolParams, { agentId: "mcp", sandbox: false, workingDir: process.cwd() });
        return { content: [{ type: "text", text: typeof result.output === "string" ? result.output : JSON.stringify(result.output) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Tool error: ${String(err)}` }], isError: true };
      }
    },
  });

  // nano_banana: AI image generation via Gemini 2.5 Flash Image
  tools.push({
    name: "nano_banana",
    description: "Generate an image using Google's Gemini 2.5 Flash Image model (Nano Banana). Returns the file path of the generated image.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Text description of the image to generate" },
        filename: { type: "string", description: "Output filename (default: auto-generated). Will be saved to ~/.homarus/images/" },
      },
      required: ["prompt"],
    },
    async handler(params) {
      const { prompt, filename } = params as { prompt: string; filename?: string };
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        return { content: [{ type: "text", text: "GOOGLE_API_KEY not set in .env" }], isError: true };
      }

      try {
        const res = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
          {
            method: "POST",
            headers: {
              "x-goog-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
            }),
          },
        );

        if (!res.ok) {
          const errorText = await res.text();
          return { content: [{ type: "text", text: `Gemini API error (${res.status}): ${errorText}` }], isError: true };
        }

        const data = await res.json() as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> };
          }>;
        };

        const parts = data.candidates?.[0]?.content?.parts;
        if (!parts) {
          return { content: [{ type: "text", text: "No content in response" }], isError: true };
        }

        // Find the image part
        const imagePart = parts.find(p => p.inlineData);
        const textPart = parts.find(p => p.text);

        if (!imagePart?.inlineData) {
          const textOnly = textPart?.text ?? "No image generated";
          return { content: [{ type: "text", text: `Model returned text only: ${textOnly}` }] };
        }

        // Save the image
        const home = process.env.HOME ?? ".";
        const imagesDir = resolve(home, ".homarus", "images");
        if (!existsSync(imagesDir)) {
          mkdirSync(imagesDir, { recursive: true });
        }

        const ext = imagePart.inlineData.mimeType === "image/png" ? "png" : "jpg";
        const outName = filename ?? `nano-banana-${Date.now()}.${ext}`;
        const outPath = resolve(imagesDir, outName);

        const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
        writeFileSync(outPath, imageBuffer);

        let response = `Image saved to: ${outPath}`;
        if (textPart?.text) {
          response += `\n\nModel notes: ${textPart.text}`;
        }

        return { content: [{ type: "text", text: response }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true };
      }
    },
  });

  // --- Browser tools (wrap BrowserManager via the registered "browser" tool) ---

  const browserToolCall = async (action: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> => {
    const tool = loop.getToolRegistry().get("browser");
    if (!tool) {
      return { content: [{ type: "text", text: "Browser not available — Playwright may not be installed. Run: npm install playwright" }], isError: true };
    }
    try {
      const result = await tool.execute(action, { agentId: "mcp", sandbox: false, workingDir: process.cwd() });
      if (result.error) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
      }
      return { content: [{ type: "text", text: typeof result.output === "string" ? result.output : JSON.stringify(result.output) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Browser error: ${String(err)}` }], isError: true };
    }
  };

  tools.push({
    name: "browser_navigate",
    description: "Navigate the browser to a URL. Returns page title and URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
      },
      required: ["url"],
    },
    async handler(params) {
      const { url } = params as { url: string };
      return browserToolCall({ action: "navigate", url });
    },
  });

  tools.push({
    name: "browser_snapshot",
    description: "Get the accessibility tree / visible text content of the current page.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return browserToolCall({ action: "content" });
    },
  });

  tools.push({
    name: "browser_screenshot",
    description: "Take a screenshot of the current page. Returns base64-encoded PNG.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return browserToolCall({ action: "screenshot" });
    },
  });

  tools.push({
    name: "browser_click",
    description: "Click an element on the page by CSS selector.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of the element to click" },
      },
      required: ["selector"],
    },
    async handler(params) {
      const { selector } = params as { selector: string };
      return browserToolCall({ action: "click", selector });
    },
  });

  tools.push({
    name: "browser_type",
    description: "Type text into an input element identified by CSS selector.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector of the input element" },
        text: { type: "string", description: "Text to type into the element" },
      },
      required: ["selector", "text"],
    },
    async handler(params) {
      const { selector, text } = params as { selector: string; text: string };
      return browserToolCall({ action: "type", selector, text });
    },
  });

  tools.push({
    name: "browser_evaluate",
    description: "Execute JavaScript in the browser page context and return the result.",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string", description: "JavaScript code to evaluate in the page" },
      },
      required: ["script"],
    },
    async handler(params) {
      const { script } = params as { script: string };
      return browserToolCall({ action: "evaluate", script });
    },
  });

  tools.push({
    name: "browser_content",
    description: "Get the visible text content of the current page (innerText of body).",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return browserToolCall({ action: "content" });
    },
  });

  // --- Docs Index tools ---

  // docs_search
  tools.push({
    name: "docs_search",
    description: "Search a documentation domain using hybrid vector + FTS search",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Documentation domain to search" },
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["domain", "query"],
    },
    async handler(params) {
      const { domain, query, limit = 10 } = params as { domain: string; query: string; limit?: number };
      const docsIndex = loop.getDocsIndex();
      if (!docsIndex) {
        return { content: [{ type: "text", text: "Docs index not initialized" }], isError: true };
      }
      const results = await docsIndex.search(domain, query, limit);
      if (results.length === 0) {
        return { content: [{ type: "text", text: "No results found" }] };
      }
      const formatted = results.map((r, i) =>
        `[${i + 1}] ${r.path} (score: ${r.score.toFixed(3)})\n${r.content.slice(0, 500)}`
      ).join("\n\n---\n\n");
      return { content: [{ type: "text", text: formatted }] };
    },
  });

  // docs_ingest
  tools.push({
    name: "docs_ingest",
    description: "Ingest a file or directory into a documentation domain",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Documentation domain" },
        filePath: { type: "string", description: "Absolute path to file or directory to ingest" },
      },
      required: ["domain", "filePath"],
    },
    async handler(params) {
      const { domain, filePath } = params as { domain: string; filePath: string };
      const docsIndex = loop.getDocsIndex();
      if (!docsIndex) {
        return { content: [{ type: "text", text: "Docs index not initialized" }], isError: true };
      }
      try {
        const result = await docsIndex.ingest(domain, filePath);
        return { content: [{ type: "text", text: `Ingested ${result.filesProcessed} file(s), ${result.chunksCreated} chunks into domain "${domain}"` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true };
      }
    },
  });

  // docs_ingest_text
  tools.push({
    name: "docs_ingest_text",
    description: "Ingest raw text content into a documentation domain under a given key",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Documentation domain" },
        key: { type: "string", description: "Key/path for this content (e.g. 'api-reference')" },
        content: { type: "string", description: "Text content to ingest" },
      },
      required: ["domain", "key", "content"],
    },
    async handler(params) {
      const { domain, key, content } = params as { domain: string; key: string; content: string };
      const docsIndex = loop.getDocsIndex();
      if (!docsIndex) {
        return { content: [{ type: "text", text: "Docs index not initialized" }], isError: true };
      }
      try {
        const result = await docsIndex.ingestText(domain, key, content);
        return { content: [{ type: "text", text: `Ingested ${result.chunksCreated} chunks for key "${key}" in domain "${domain}"` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true };
      }
    },
  });

  // docs_list
  tools.push({
    name: "docs_list",
    description: "List all documentation domains with file and chunk counts",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const docsIndex = loop.getDocsIndex();
      if (!docsIndex) {
        return { content: [{ type: "text", text: "Docs index not initialized" }], isError: true };
      }
      const domains = docsIndex.listDomains();
      if (domains.length === 0) {
        return { content: [{ type: "text", text: "No documentation domains" }] };
      }
      const formatted = domains.map((d) =>
        `${d.domain}: ${d.stats.fileCount} files, ${d.stats.chunkCount} chunks`
      ).join("\n");
      return { content: [{ type: "text", text: formatted }] };
    },
  });

  // docs_clear
  tools.push({
    name: "docs_clear",
    description: "Delete an entire documentation domain (removes its SQLite database)",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Documentation domain to clear" },
      },
      required: ["domain"],
    },
    async handler(params) {
      const { domain } = params as { domain: string };
      const docsIndex = loop.getDocsIndex();
      if (!docsIndex) {
        return { content: [{ type: "text", text: "Docs index not initialized" }], isError: true };
      }
      await docsIndex.clearDomain(domain);
      return { content: [{ type: "text", text: `Domain "${domain}" cleared` }] };
    },
  });

  // docs_get_clusters
  tools.push({
    name: "docs_get_clusters",
    description: "Get semantic clusters from a documentation domain. Clusters group related chunks by source file and embedding similarity.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Documentation domain" },
        clusterIndex: { type: "number", description: "Return only this cluster index (optional, returns all if omitted)" },
        clusterThreshold: { type: "number", description: "Cosine similarity threshold for merging clusters (default 0.85)" },
        maxClusters: { type: "number", description: "Maximum number of clusters to return (default 20)" },
      },
      required: ["domain"],
    },
    async handler(params) {
      const { domain, clusterIndex, clusterThreshold, maxClusters } = params as {
        domain: string; clusterIndex?: number; clusterThreshold?: number; maxClusters?: number;
      };
      const docsIndex = loop.getDocsIndex();
      if (!docsIndex) {
        return { content: [{ type: "text", text: "Docs index not initialized" }], isError: true };
      }
      try {
        let clusters = await docsIndex.getClusters(domain, { clusterThreshold, maxClusters });
        if (clusterIndex !== undefined) {
          clusters = clusters.filter(c => c.index === clusterIndex);
          if (clusters.length === 0) {
            return { content: [{ type: "text", text: `No cluster at index ${clusterIndex}` }] };
          }
        }
        const formatted = clusters.map((c) =>
          `Cluster ${c.index} (${c.chunkCount} chunks)\nSources: ${c.sources.join(", ")}\n${c.content.slice(0, 2000)}`
        ).join("\n\n===\n\n");
        return { content: [{ type: "text", text: formatted }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true };
      }
    },
  });

  // docs_clear_compiled
  tools.push({
    name: "docs_clear_compiled",
    description: "Remove compiled/synthesized articles from a domain without removing raw chunks",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Documentation domain" },
      },
      required: ["domain"],
    },
    async handler(params) {
      const { domain } = params as { domain: string };
      const docsIndex = loop.getDocsIndex();
      if (!docsIndex) {
        return { content: [{ type: "text", text: "Docs index not initialized" }], isError: true };
      }
      const deleted = await docsIndex.clearCompiled(domain);
      return { content: [{ type: "text", text: `Cleared ${deleted} compiled chunk(s) from domain "${domain}"` }] };
    },
  });

  // docs_compile
  tools.push({
    name: "docs_compile",
    description: "Synthesize concept articles from clustered documentation chunks using an LLM. Groups related chunks by embedding similarity, then generates coherent markdown articles for each cluster.",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Documentation domain to compile" },
        clusterThreshold: { type: "number", description: "Cosine similarity threshold for merging clusters (default 0.85)" },
        maxClusters: { type: "number", description: "Maximum clusters to process per batch (default 20)" },
      },
      required: ["domain"],
    },
    async handler(params) {
      const { domain, clusterThreshold, maxClusters } = params as {
        domain: string; clusterThreshold?: number; maxClusters?: number;
      };
      const docsIndex = loop.getDocsIndex();
      if (!docsIndex) {
        return { content: [{ type: "text", text: "Docs index not initialized" }], isError: true };
      }
      try {
        const result = await docsIndex.compile(domain, {
          clusterThreshold,
          maxClustersPerBatch: maxClusters,
        });
        return { content: [{ type: "text", text: `Compiled domain "${domain}": ${result.clustersFound} clusters found, ${result.articlesGenerated} articles generated, ${result.chunksCreated} chunks created` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${String(err)}` }], isError: true };
      }
    },
  });

  return tools;
}

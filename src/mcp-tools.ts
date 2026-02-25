// CRC: crc-McpTools.md | Seq: seq-mcp-tool-call.md
// MCP tool definitions exposed to Claude Code via the backend HTTP API
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

  return tools;
}

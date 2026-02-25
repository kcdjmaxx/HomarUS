// CRC: crc-ChannelAdapter.md | Seq: seq-message-dispatch.md
// O1: Telegram channel adapter — long-polling, no webhooks needed
import type { OutboundMessage, HealthStatus, Logger, ChannelConfig, DmPolicy, GroupPolicy } from "./types.js";
import { ChannelAdapter } from "./channel-adapter.js";

// --- Telegram API types (local to this file) ---

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  entities?: TelegramMessageEntity[];
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}

// --- Config ---

export interface TelegramAdapterConfig {
  token: string;
  dmPolicy?: DmPolicy;
  groupPolicy?: GroupPolicy;
  pollingInterval?: number;
  allowedChatIds?: number[];
}

// --- Adapter ---

const BASE_URL = "https://api.telegram.org/bot";
const POLL_TIMEOUT = 30; // seconds, Telegram long-poll
const MAX_BACKOFF = 30_000; // ms
const INITIAL_BACKOFF = 1_000; // ms

export class TelegramChannelAdapter extends ChannelAdapter {
  private token: string;
  private botUsername = "";
  private offset = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;
  private lastPollOk = false;
  private lastPollTime = 0;
  private backoffMs = INITIAL_BACKOFF;
  private pollingInterval: number;
  private allowedChatIds: Set<number>;
  // R102: Recent message buffer for MCP telegram_read tool
  private recentMessages: Array<{ from: string; text: string; chatId: string; timestamp: number }> = [];
  private maxRecentMessages = 50;

  constructor(config: TelegramAdapterConfig, logger: Logger) {
    super("telegram", logger, config.dmPolicy ?? "open", config.groupPolicy ?? "mention_required");
    this.token = config.token;
    this.pollingInterval = config.pollingInterval ?? 1000;
    this.allowedChatIds = new Set(config.allowedChatIds ?? []);
  }

  static fromChannelConfig(config: ChannelConfig, logger: Logger): TelegramChannelAdapter {
    if (!config.token || typeof config.token !== "string") {
      throw new Error("Telegram adapter requires a 'token' in channel config");
    }
    return new TelegramChannelAdapter({
      token: config.token,
      dmPolicy: config.dmPolicy,
      groupPolicy: config.groupPolicy,
      pollingInterval: config.pollingInterval as number | undefined,
      allowedChatIds: config.allowedChatIds as number[] | undefined,
    }, logger);
  }

  // --- Lifecycle ---

  async connect(): Promise<void> {
    this.state = "connecting";
    this.stopping = false;

    // Validate token and get bot username
    const me = await this.apiCall<TelegramUser>("getMe");
    this.botUsername = me.username ?? "";
    this.logger.info("Telegram connected", { username: this.botUsername });

    this.state = "connected";
    this.backoffMs = INITIAL_BACKOFF;
    this.schedulePoll();
  }

  async disconnect(): Promise<void> {
    this.stopping = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.state = "disconnected";
    this.logger.info("Telegram disconnected");
  }

  // --- Sending ---

  async send(target: string, message: OutboundMessage): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id: target,
      text: message.text,
      parse_mode: "Markdown",
    };
    if (message.replyTo) {
      body.reply_to_message_id = Number(message.replyTo);
    }
    await this.apiCall("sendMessage", body);
  }

  // --- Health ---

  health(): HealthStatus {
    return {
      healthy: this.state === "connected" && this.lastPollOk,
      message: this.state === "connected"
        ? (this.lastPollOk ? "polling" : "poll error, retrying")
        : this.state,
      lastCheck: this.lastPollTime || Date.now(),
    };
  }

  // R100: Send typing indicator
  async sendTyping(chatId: string): Promise<void> {
    await this.apiCall("sendChatAction", { chat_id: chatId, action: "typing" });
  }

  // R101: React to a message with emoji
  async setReaction(chatId: string, messageId: number, emoji: string): Promise<void> {
    await this.apiCall("setMessageReaction", {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: "emoji", emoji }],
    });
  }

  // R102: Get recent messages for MCP telegram_read tool
  getRecentMessages(limit = 20): Array<{ from: string; text: string; chatId: string; timestamp: number }> {
    return this.recentMessages.slice(-limit);
  }

  async sendPhoto(chatId: string, filePath: string, caption?: string): Promise<void> {
    const { readFileSync } = await import("node:fs");
    const { basename } = await import("node:path");
    const fileData = readFileSync(filePath);
    const fileName = basename(filePath);

    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("photo", new Blob([fileData]), fileName);
    if (caption) form.append("caption", caption);

    const url = `${BASE_URL}${this.token}/sendPhoto`;
    const res = await fetch(url, { method: "POST", body: form });
    const json = (await res.json()) as TelegramResponse<unknown>;
    if (!json.ok) {
      throw new Error(`Telegram API error (sendPhoto): ${json.description ?? "unknown"}`);
    }
  }

  // --- Polling ---

  private schedulePoll(): void {
    if (this.stopping) return;
    this.pollTimer = setTimeout(() => this.poll(), this.pollingInterval);
  }

  private async poll(): Promise<void> {
    if (this.stopping) return;

    try {
      const updates = await this.apiCall<TelegramUpdate[]>("getUpdates", {
        offset: this.offset,
        timeout: POLL_TIMEOUT,
      });

      this.lastPollOk = true;
      this.lastPollTime = Date.now();
      this.backoffMs = INITIAL_BACKOFF;

      for (const update of updates) {
        this.offset = update.update_id + 1;
        if (update.message) {
          this.handleMessage(update.message);
        }
      }

      this.schedulePoll();
    } catch (err) {
      this.lastPollOk = false;
      this.lastPollTime = Date.now();
      this.logger.error("Telegram poll error", { error: String(err), backoffMs: this.backoffMs });

      // Exponential backoff with cap
      if (!this.stopping) {
        this.pollTimer = setTimeout(() => this.poll(), this.backoffMs);
        this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF);
      }
    }
  }

  // --- Message handling ---

  private handleMessage(msg: TelegramMessage): void {
    if (!msg.text) return;

    // Chat whitelist check
    if (this.allowedChatIds.size > 0 && !this.allowedChatIds.has(msg.chat.id)) {
      this.logger.debug("Message from non-whitelisted chat, ignoring", { chatId: msg.chat.id });
      return;
    }

    const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
    const isMention = this.detectMention(msg);
    const text = isMention ? this.stripMention(msg.text) : msg.text;

    // R102: Store in recent message buffer
    this.recentMessages.push({
      from: msg.from?.username ?? String(msg.from?.id ?? "unknown"),
      text,
      chatId: String(msg.chat.id),
      timestamp: Date.now(),
    });
    if (this.recentMessages.length > this.maxRecentMessages) {
      this.recentMessages.shift();
    }

    // R103: Auto-send typing indicator on message receipt
    this.sendTyping(String(msg.chat.id)).catch(() => {});

    this.deliverWithTarget({
      from: msg.from?.username ?? String(msg.from?.id ?? "unknown"),
      channel: "telegram",
      text,
      isGroup,
      isMention,
      replyTo: String(msg.message_id),
      raw: msg,
    }, String(msg.chat.id));
  }

  private detectMention(msg: TelegramMessage): boolean {
    if (!this.botUsername || !msg.entities) return false;
    return msg.entities.some((e) => {
      if (e.type !== "mention") return false;
      const mentionText = msg.text!.substring(e.offset, e.offset + e.length);
      return mentionText.toLowerCase() === `@${this.botUsername.toLowerCase()}`;
    });
  }

  private stripMention(text: string): string {
    return text.replace(new RegExp(`@${this.botUsername}\\b`, "gi"), "").trim();
  }

  // --- Telegram API ---

  private async apiCall<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const url = `${BASE_URL}${this.token}/${method}`;
    const opts: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    };

    const res = await fetch(url, opts);
    const json = (await res.json()) as TelegramResponse<T>;

    if (!json.ok) {
      throw new Error(`Telegram API error (${method}): ${json.description ?? "unknown"}`);
    }
    return json.result;
  }
}

// CRC: crc-ChannelAdapter.md | Seq: seq-message-dispatch.md
import { v4 as uuid } from "uuid";
import type {
  Event, MessagePayload, OutboundMessage, DmPolicy, GroupPolicy, HealthStatus, Logger,
} from "./types.js";

export type AdapterState = "disconnected" | "connecting" | "connected" | "error";

export abstract class ChannelAdapter {
  readonly name: string;
  protected state: AdapterState = "disconnected";
  protected dmPolicy: DmPolicy;
  protected groupPolicy: GroupPolicy;
  protected logger: Logger;
  private messageHandler: ((event: Event) => void) | null = null;

  constructor(name: string, logger: Logger, dmPolicy: DmPolicy = "open", groupPolicy: GroupPolicy = "mention_required") {
    this.name = name;
    this.logger = logger;
    this.dmPolicy = dmPolicy;
    this.groupPolicy = groupPolicy;
  }

  getState(): AdapterState {
    return this.state;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(target: string, message: OutboundMessage): Promise<void>;
  abstract health(): HealthStatus;

  // CRC: crc-ChannelAdapter.md — onMessage()
  onMessage(handler: (event: Event) => void): void {
    this.messageHandler = handler;
  }

  // CRC: crc-ChannelAdapter.md — normalizeInbound()
  protected normalizeInbound(payload: MessagePayload): Event {
    return {
      id: uuid(),
      type: "message",
      source: `channel:${this.name}`,
      timestamp: Date.now(),
      payload,
    };
  }

  // CRC: crc-ChannelAdapter.md — checkAccess()
  protected checkAccess(payload: MessagePayload): boolean {
    if (payload.isGroup) {
      if (this.groupPolicy === "disabled") return false;
      if (this.groupPolicy === "mention_required" && !payload.isMention) return false;
      return true;
    }
    // DM
    if (this.dmPolicy === "disabled") return false;
    return true;
  }

  // Subclasses call this to deliver normalized events to the loop
  protected deliver(payload: MessagePayload): void {
    if (!this.checkAccess(payload)) {
      this.logger.debug("Message rejected by policy", { channel: this.name, from: payload.from });
      return;
    }
    const event = this.normalizeInbound(payload);
    this.messageHandler?.(event);
  }
}

// CLI channel adapter — reads from stdin, writes to stdout
export class CLIChannelAdapter extends ChannelAdapter {
  private rl: import("node:readline").Interface | null = null;

  constructor(logger: Logger) {
    super("cli", logger, "open", "always_on");
  }

  async connect(): Promise<void> {
    this.state = "connecting";
    const { createInterface } = await import("node:readline");
    this.rl = createInterface({ input: process.stdin });
    this.rl.on("line", (line) => {
      if (!line.trim()) return;
      this.deliver({
        from: "user",
        channel: "cli",
        text: line,
        isGroup: false,
        isMention: false,
        raw: line,
      });
    });
    this.state = "connected";
    this.logger.info("CLI channel connected");
  }

  async disconnect(): Promise<void> {
    this.rl?.close();
    this.rl = null;
    this.state = "disconnected";
  }

  async send(_target: string, message: OutboundMessage): Promise<void> {
    process.stdout.write(message.text + "\n");
  }

  health(): HealthStatus {
    return { healthy: this.state === "connected", lastCheck: Date.now() };
  }
}

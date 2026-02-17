// CRC: crc-ChannelManager.md | Seq: seq-message-dispatch.md, seq-startup.md, seq-shutdown.md
import type { Event, OutboundMessage, ChannelConfig, HealthStatus, Logger } from "./types.js";
import { ChannelAdapter, CLIChannelAdapter } from "./channel-adapter.js";
import { TelegramChannelAdapter } from "./telegram-adapter.js";

export class ChannelManager {
  private adapters = new Map<string, ChannelAdapter>();
  private logger: Logger;
  private eventHandler: ((event: Event) => void) | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  setEventHandler(fn: (event: Event) => void): void {
    this.eventHandler = fn;
  }

  // CRC: crc-ChannelManager.md — loadAdapters()
  loadAdapters(channels: Record<string, ChannelConfig>): void {
    for (const [name, config] of Object.entries(channels)) {
      let adapter: ChannelAdapter;

      switch (name) {
        case "cli":
          adapter = new CLIChannelAdapter(this.logger);
          break;
        case "telegram":
          adapter = TelegramChannelAdapter.fromChannelConfig(config, this.logger);
          break;
        default:
          this.logger.warn("Unknown channel type, skipping", { name });
          continue;
      }

      this.adapters.set(name, adapter);
    }

    // Always ensure CLI adapter exists as fallback
    if (!this.adapters.has("cli")) {
      this.adapters.set("cli", new CLIChannelAdapter(this.logger));
    }
  }

  // CRC: crc-ChannelManager.md — connectAll()
  async connectAll(): Promise<void> {
    for (const [name, adapter] of this.adapters) {
      try {
        adapter.onMessage((event) => this.eventHandler?.(event));
        await adapter.connect();
      } catch (err) {
        this.logger.error("Failed to connect channel", { name, error: String(err) });
      }
    }
    this.logger.info("Channels connected", { count: this.adapters.size });
  }

  // CRC: crc-ChannelManager.md — disconnectAll()
  async disconnectAll(): Promise<void> {
    for (const [name, adapter] of this.adapters) {
      try {
        await adapter.disconnect();
      } catch (err) {
        this.logger.warn("Error disconnecting channel", { name, error: String(err) });
      }
    }
  }

  // CRC: crc-ChannelManager.md — send()
  async send(channel: string, target: string, message: OutboundMessage): Promise<void> {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      throw new Error(`Unknown channel: ${channel}`);
    }
    await adapter.send(target, message);
  }

  // CRC: crc-ChannelManager.md — getAdapter()
  getAdapter(name: string): ChannelAdapter | undefined {
    return this.adapters.get(name);
  }

  // CRC: crc-ChannelManager.md — getConnected()
  getConnected(): ChannelAdapter[] {
    return [...this.adapters.values()].filter((a) => a.getState() === "connected");
  }

  // CRC: crc-ChannelManager.md — healthCheck()
  healthCheck(): Record<string, HealthStatus> {
    const results: Record<string, HealthStatus> = {};
    for (const [name, adapter] of this.adapters) {
      results[name] = adapter.health();
    }
    return results;
  }
}

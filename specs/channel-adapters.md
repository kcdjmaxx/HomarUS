# Channel Adapters

**Language:** TypeScript
**Environment:** Node.js >= 22, Unix-like systems

## Overview

Channel adapters connect the event loop to external messaging platforms. Each adapter normalizes inbound messages into standard events and converts outbound events into platform-specific messages. The event loop doesn't know or care which platform a message came from.

## Adapter Interface

```typescript
interface ChannelAdapter {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(target: string, message: OutboundMessage): Promise<void>;
  onMessage(handler: (event: Event) => void): void;
  health(): Promise<HealthStatus>;
}
```

## Supported Channels

Built-in adapters for:
- **Telegram** — via grammY
- **WhatsApp** — via Baileys
- **Discord** — via discord.js
- **Slack** — via Bolt
- **Signal** — via signal-cli
- **HTTP/Webhook** — generic REST endpoint for custom integrations
- **CLI** — local terminal for development/testing

## Message Normalization

Inbound messages from any channel become standard events:

```typescript
interface MessageEvent {
  type: "message";
  source: string;        // "telegram", "discord", etc.
  payload: {
    from: string;        // sender identifier
    channel: string;     // channel/chat identifier
    text: string;        // message content
    attachments?: Attachment[];
    replyTo?: string;    // if replying to a message
    isGroup: boolean;    // group vs DM
    isMention: boolean;  // was the bot mentioned
    raw: unknown;        // original platform message for edge cases
  };
}
```

## Access Control

- **DM policy:** pairing (one-time codes), allowlist, open, or disabled
- **Group policy:** mention-required (default), always-on, or disabled
- **Per-channel config** in the main config file

## Multi-Channel Routing

Events from different channels/accounts can be routed to different handler configurations. This allows different "personas" or tool sets per channel.

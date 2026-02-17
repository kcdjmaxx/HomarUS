# ChannelAdapter
**Requirements:** R43, R44, R46

## Knows
- name: string (e.g., "telegram", "discord", "cli")
- state: "disconnected" | "connecting" | "connected" | "error"
- dmPolicy: "pairing" | "allowlist" | "open" | "disabled"
- groupPolicy: "mention_required" | "always_on" | "disabled"

## Does
- connect(): Establish connection to the messaging platform
- disconnect(): Gracefully close connection
- send(target, message): Send a message to a specific target on this platform
- onMessage(handler): Register handler for incoming messages (normalizes to Event format)
- health(): Return connection health status
- normalizeInbound(raw): Convert platform-specific message to standard MessageEvent
- formatOutbound(message): Convert standard OutboundMessage to platform format
- checkAccess(message): Validate message against DM/group policies

## Collaborators
- ChannelManager: manages adapter lifecycle
- Homarus: receives normalized events

## Sequences
- seq-message-dispatch.md

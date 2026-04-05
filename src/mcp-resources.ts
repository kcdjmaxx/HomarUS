// CRC: crc-McpResources.md | Seq: seq-mcp-tool-call.md
// MCP resource definitions exposed to Claude Code via the backend HTTP API
import type { Homarus } from "./homarus.js";

export interface McpResourceDef {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: () => Promise<string>;
}

// R92-R95: Factory function creating all MCP resource definitions
export function createMcpResources(loop: Homarus): McpResourceDef[] {
  return [
    // R92: identity://soul
    {
      uri: "identity://soul",
      name: "Soul Identity",
      description: "Current soul.md content -- core identity and personality",
      mimeType: "text/markdown",
      async handler() {
        return loop.getIdentityManager().getSoul() || "(no soul.md configured)";
      },
    },
    // R93: identity://user
    {
      uri: "identity://user",
      name: "User Profile",
      description: "Current user.md content -- user preferences and context",
      mimeType: "text/markdown",
      async handler() {
        return loop.getIdentityManager().getUser() || "(no user.md configured)";
      },
    },
    // identity://state
    {
      uri: "identity://state",
      name: "Agent State",
      description: "Current state.md content -- ephemeral agent state",
      mimeType: "text/markdown",
      async handler() {
        return loop.getIdentityManager().getState() || "(no state.md configured)";
      },
    },
    // identity://preferences
    {
      uri: "identity://preferences",
      name: "Preferences",
      description: "Current preferences.md content -- learned user preferences",
      mimeType: "text/markdown",
      async handler() {
        return loop.getIdentityManager().getPreferences() || "(no preferences.md configured)";
      },
    },
    // identity://disagreements
    {
      uri: "identity://disagreements",
      name: "Disagreements",
      description: "Current disagreements.md content -- areas of principled disagreement",
      mimeType: "text/markdown",
      async handler() {
        return loop.getIdentityManager().getDisagreements() || "(no disagreements.md configured)";
      },
    },
    // R94: config://current
    {
      uri: "config://current",
      name: "Current Config",
      description: "Current configuration (secrets redacted)",
      mimeType: "application/json",
      async handler() {
        const config = loop.getConfig().getAll();
        // Redact sensitive fields
        const redacted = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
        const channels = redacted.channels as Record<string, Record<string, unknown>> | undefined;
        if (channels) {
          for (const ch of Object.values(channels)) {
            if (ch.token) ch.token = "***";
          }
        }
        const models = redacted.models as Record<string, unknown> | undefined;
        if (models?.providers) {
          const providers = models.providers as Record<string, Record<string, unknown>>;
          for (const p of Object.values(providers)) {
            if (p.apiKey) p.apiKey = "***";
          }
        }
        const memory = redacted.memory as Record<string, Record<string, unknown>> | undefined;
        if (memory?.embedding) {
          const emb = memory.embedding as Record<string, unknown>;
          if (emb.apiKey) emb.apiKey = "***";
        }
        return JSON.stringify(redacted, null, 2);
      },
    },
    // R95: events://recent
    {
      uri: "events://recent",
      name: "Recent Events",
      description: "Last 20 events from the event loop",
      mimeType: "application/json",
      async handler() {
        const events = loop.getEventHistory().slice(-20);
        return JSON.stringify(events, null, 2);
      },
    },
  ];
}

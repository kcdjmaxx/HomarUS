#!/usr/bin/env node
// CRC: crc-McpProxy.md | Seq: seq-mcp-startup.md, seq-mcp-tool-call.md
// Thin MCP proxy -- stdio transport forwarding to backend HTTP API.
// Never restarts. Backend can be restarted via restart_backend tool.
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BACKEND_PORT = parseInt(process.env.HOMARUS_MCP_PORT ?? "18801", 10);
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const TOOL_CALL_TIMEOUT = 130_000; // 130s -- covers wait_for_event's 120s max

// --- Logger (stderr only, stdout is MCP protocol) ---
function log(level: string, msg: string, meta?: Record<string, unknown>): void {
  process.stderr.write(`[${level}] [proxy] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`);
}

// R71, R76: Backend process manager
class BackendManager {
  private child: ChildProcess | null = null;
  private backendScript: string;

  constructor() {
    this.backendScript = resolve(import.meta.dirname ?? __dirname, "mcp-backend.js");
  }

  // R72: Spawn backend as child process
  async spawn(): Promise<void> {
    if (this.child) return;

    log("INFO", "Spawning backend process", { script: this.backendScript });

    this.child = spawn("node", [this.backendScript], {
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env },
    });

    // Pipe backend stderr through to our stderr
    this.child.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(data);
    });

    this.child.on("exit", (code, signal) => {
      log("WARN", "Backend process exited", { code, signal });
      this.child = null;
    });

    // R76: Wait for backend to become healthy
    await this.waitForHealthy();
  }

  // R74: Restart backend
  async restart(): Promise<void> {
    log("INFO", "Restarting backend...");
    await this.stop();
    await this.spawn();
    log("INFO", "Backend restarted successfully");
  }

  // R77: Stop backend
  async stop(): Promise<void> {
    if (!this.child) return;

    const child = this.child;
    this.child = null;

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        log("WARN", "Backend didn't exit gracefully, killing");
        child.kill("SIGKILL");
        resolve();
      }, 5000);

      child.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });

      child.kill("SIGTERM");
    });
  }

  // R76: Wait up to 30s for backend health
  private async waitForHealthy(): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/health`);
        if (res.ok) {
          log("INFO", "Backend is healthy");
          return;
        }
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("Backend failed to become healthy within 30s");
  }
}

// --- HTTP forwarding helpers ---
async function forwardToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/tool-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, args }),
      signal: AbortSignal.timeout(TOOL_CALL_TIMEOUT),
    });
    return await res.json() as { content: Array<{ type: string; text: string }>; isError?: boolean };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Backend unavailable: ${String(err)}. Use restart_backend to restart.` }],
      isError: true,
    };
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`);
  return await res.json() as T;
}

// R74: restart_backend tool definition (lives in proxy, not forwarded)
const restartBackendTool = {
  name: "restart_backend",
  description: "Restart the HomarUS backend process. Use after code changes or if the backend becomes unresponsive.",
  inputSchema: { type: "object" as const, properties: {} },
};

// --- Main ---
async function main(): Promise<void> {
  const backend = new BackendManager();

  // R72: Spawn backend first
  await backend.spawn();

  // R71: Create MCP server with stdio transport
  const server = new Server(
    { name: "homarus", version: "0.2.0" },
    { capabilities: { tools: {}, resources: {} } },
  );

  // --- MCP handlers ---
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const tools = await fetchJson<Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>>("/api/tool-list");
      return { tools: [...tools, restartBackendTool] };
    } catch {
      return { tools: [restartBackendTool] };
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // R74: Handle restart_backend locally in proxy
    if (name === "restart_backend") {
      try {
        await backend.restart();
        return { content: [{ type: "text", text: "Backend restarted successfully." }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to restart backend: ${String(err)}` }],
          isError: true,
        };
      }
    }

    return await forwardToolCall(name, (args ?? {}) as Record<string, unknown>);
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      const resources = await fetchJson<Array<{ uri: string; name: string; description: string; mimeType: string }>>("/api/resource-list");
      return { resources };
    } catch {
      return { resources: [] };
    }
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    try {
      const res = await fetch(`${BACKEND_URL}/api/resource`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri }),
      });
      if (!res.ok) {
        throw new Error(`Backend returned ${res.status}`);
      }
      const data = await res.json() as { uri: string; mimeType: string; text: string };
      return { contents: [data] };
    } catch (err) {
      throw new Error(`Backend unavailable: ${String(err)}. Use restart_backend to restart.`);
    }
  });

  // Connect MCP transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log("INFO", "MCP proxy connected via stdio");

  // R77: Graceful shutdown
  const shutdown = async () => {
    log("INFO", "Proxy shutting down...");
    await backend.stop();
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[FATAL] [proxy] ${String(err)}\n`);
  process.exit(1);
});

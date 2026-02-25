// CRC: crc-McpBackendServer.md | Seq: seq-mcp-tool-call.md, seq-mcp-event-wait.md
// HTTP API server for the MCP backend -- serves tool calls, resource reads, and long-poll
import { createServer, type Server as HttpServer } from "node:http";
import express from "express";
import type { Logger } from "./types.js";
import type { Homarus } from "./homarus.js";
import { createMcpTools, type McpToolDef } from "./mcp-tools.js";
import { createMcpResources, type McpResourceDef } from "./mcp-resources.js";

export class McpBackendServer {
  private app: express.Application;
  private httpServer: HttpServer;
  private port: number;
  private logger: Logger;
  private loop: Homarus;
  private mcpTools: McpToolDef[];
  private mcpResources: McpResourceDef[];

  constructor(logger: Logger, port: number, loop: Homarus) {
    this.logger = logger;
    this.port = port;
    this.loop = loop;
    this.mcpTools = createMcpTools(loop);
    this.mcpResources = createMcpResources(loop);

    this.app = express();
    this.httpServer = createServer(this.app);
    this.setupRoutes();
  }

  // CRC: crc-McpBackendServer.md -- start()
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.once("error", reject);
      this.httpServer.listen(this.port, () => {
        this.httpServer.removeListener("error", reject);
        this.logger.info("MCP backend server started", { port: this.port });
        resolve();
      });
    });
  }

  // CRC: crc-McpBackendServer.md -- stop()
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.close(() => {
        this.logger.info("MCP backend server stopped");
        resolve();
      });
    });
  }

  // CRC: crc-McpBackendServer.md -- setupRoutes()
  private setupRoutes(): void {
    this.app.use(express.json());

    // R75: Health check
    this.app.get("/api/health", (_req, res) => {
      res.json({ ok: true, state: this.loop.getState() });
    });

    // R75: Status
    this.app.get("/api/status", (_req, res) => {
      res.json(this.loop.getStatus());
    });

    // R75: Recent events
    this.app.get("/api/events", (req, res) => {
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(this.loop.getEventHistory().slice(-limit));
    });

    // R75: Tool list for proxy
    this.app.get("/api/tool-list", (_req, res) => {
      res.json(this.mcpTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })));
    });

    // R75: Tool call forwarding
    this.app.post("/api/tool-call", async (req, res) => {
      const { name, args } = req.body as { name: string; args: Record<string, unknown> };
      const tool = this.mcpTools.find((t) => t.name === name);
      if (!tool) {
        res.status(404).json({
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        });
        return;
      }
      try {
        const result = await tool.handler(args ?? {});
        res.json(result);
      } catch (err) {
        res.status(500).json({
          content: [{ type: "text", text: `Tool error: ${String(err)}` }],
          isError: true,
        });
      }
    });

    // R75: Resource list for proxy
    this.app.get("/api/resource-list", (_req, res) => {
      res.json(this.mcpResources.map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      })));
    });

    // R75: Resource read forwarding
    this.app.post("/api/resource", async (req, res) => {
      const { uri } = req.body as { uri: string };
      const resource = this.mcpResources.find((r) => r.uri === uri);
      if (!resource) {
        res.status(404).json({ error: `Unknown resource: ${uri}` });
        return;
      }
      try {
        const text = await resource.handler();
        res.json({ uri: resource.uri, mimeType: resource.mimeType, text });
      } catch (err) {
        res.status(500).json({ error: `Resource error: ${String(err)}` });
      }
    });

    // R75, R105: Long-poll for events
    this.app.get("/api/wait", async (req, res) => {
      const timeout = Math.min(parseInt(req.query.timeout as string) || 30, 120) * 1000;
      const sinceParam = req.query.since ? parseInt(req.query.since as string) : undefined;
      try {
        const events = await this.loop.waitForEvent(timeout, sinceParam);
        if (events.length === 0) {
          res.status(204).end();
        } else {
          const identity = this.loop.getIdentityManager();
          res.json({
            identity: {
              soul: identity.getSoul(),
              user: identity.getUser(),
            },
            events,
            cursor: this.loop.getDeliveryWatermark(),
          });
        }
      } catch {
        res.status(204).end();
      }
    });

    // Identity endpoints (convenience, used by resources too)
    this.app.get("/api/identity/soul", (_req, res) => {
      res.type("text/markdown").send(this.loop.getIdentityManager().getSoul() || "(not configured)");
    });

    this.app.get("/api/identity/user", (_req, res) => {
      res.type("text/markdown").send(this.loop.getIdentityManager().getUser() || "(not configured)");
    });
  }
}

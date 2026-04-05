// CRC: crc-McpBackendServer.md | Seq: seq-mcp-tool-call.md, seq-mcp-event-wait.md
// HTTP API + WebSocket server for the MCP backend — serves tool calls, resources, long-poll,
// and the React dashboard with live event streaming.
import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import type { Logger, Event } from "./types.js";
import type { Homarus } from "./homarus.js";
import { createMcpTools, type McpToolDef } from "./mcp-tools.js";
import { createMcpResources, type McpResourceDef } from "./mcp-resources.js";
import { CompactionManager } from "./compaction-manager.js";

interface WsMessage {
  type: "chat" | "status" | "events";
  payload: unknown;
}

interface WsOutbound {
  type: "chat" | "event" | "status" | "error";
  payload: unknown;
}

export class McpBackendServer {
  private app: express.Application;
  private httpServer: HttpServer;
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private port: number;
  private logger: Logger;
  private loop: Homarus;
  private mcpTools: McpToolDef[];
  private mcpResources: McpResourceDef[];
  private compactionManager: CompactionManager;
  private checkpointPath: string;
  private checkpoint: Record<string, unknown> | null = null;
  private lastWaitPoll = 0;

  constructor(logger: Logger, port: number, loop: Homarus) {
    this.logger = logger;
    this.port = port;
    this.loop = loop;
    this.mcpTools = createMcpTools(loop);
    this.mcpResources = createMcpResources(loop);
    this.compactionManager = new CompactionManager(loop, logger);

    // Checkpoint persistence path
    const homeDir = homedir();
    this.checkpointPath = join(homeDir, ".homarus", "checkpoint.json");
    this.loadCheckpoint();

    this.app = express();
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.setupRoutes();
    this.setupWebSocket();
  }

  // CRC: crc-McpBackendServer.md -- start()
  async start(): Promise<void> {
    // Serve built dashboard (catch-all must be last, after API routes)
    const distPath = resolve(import.meta.dirname ?? __dirname, "../dashboard/dist");
    if (existsSync(distPath)) {
      this.app.use(express.static(distPath));
      this.app.get("*", (_req, res) => {
        res.sendFile(join(distPath, "index.html"));
      });
    }

    try {
      await this.listen();
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        this.logger.warn("Port in use, killing stale process", { port: this.port });
        if (this.killStaleProcess()) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            await this.listen();
            return;
          } catch {
            // Fall through to degraded mode
          }
        }
        this.logger.warn("Server unavailable — port still in use, continuing without it", { port: this.port });
        return;
      }
      throw err;
    }
  }

  private listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.once("error", reject);
      this.httpServer.listen(this.port, () => {
        this.httpServer.removeListener("error", reject);
        this.logger.info("MCP backend server started", { port: this.port });
        resolve();
      });
    });
  }

  private killStaleProcess(): boolean {
    try {
      const pid = execSync(`lsof -ti:${this.port}`, { encoding: "utf8" }).trim();
      if (pid) {
        this.logger.info("Killing stale process on port", { pid });
        execSync(`kill ${pid}`);
        return true;
      }
    } catch {
      // lsof returns non-zero if no process found
    }
    return false;
  }

  // CRC: crc-McpBackendServer.md -- stop()
  async stop(): Promise<void> {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      this.httpServer.close(() => {
        this.logger.info("MCP backend server stopped");
        resolve();
      });
    });
  }

  getLastWaitPoll(): number {
    return this.lastWaitPoll;
  }

  getCompactionStats() {
    return this.compactionManager.getCompactionStats();
  }

  // Broadcast event to all connected WebSocket clients
  broadcastEvent(event: Event): void {
    this.broadcast({
      type: "event",
      payload: {
        id: event.id,
        type: event.type,
        source: event.source,
        timestamp: event.timestamp,
        payload: event.payload,
      },
    });
  }

  private broadcast(msg: WsOutbound): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === 1 /* WebSocket.OPEN */) {
        client.send(data);
      }
    }
  }

  private loadCheckpoint(): void {
    try {
      if (existsSync(this.checkpointPath)) {
        this.checkpoint = JSON.parse(readFileSync(this.checkpointPath, "utf-8"));
      }
    } catch {
      this.checkpoint = null;
    }
  }

  private saveCheckpoint(): void {
    try {
      mkdirSync(join(homedir(), ".homarus"), { recursive: true });
      writeFileSync(this.checkpointPath, JSON.stringify(this.checkpoint, null, 2));
    } catch (err) {
      this.logger.warn("Failed to persist checkpoint", { error: String(err) });
    }
  }

  // --- WebSocket setup ---
  private setupWebSocket(): void {
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      this.logger.info("Dashboard WebSocket client connected", { clients: this.clients.size });

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as WsMessage;
          this.handleWsMessage(ws, msg);
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", payload: { message: "Invalid message format" } }));
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
        this.logger.info("Dashboard WebSocket client disconnected", { clients: this.clients.size });
      });
    });
  }

  private handleWsMessage(ws: WebSocket, msg: WsMessage): void {
    switch (msg.type) {
      case "chat": {
        const { text } = msg.payload as { text: string };
        if (!text) return;
        // Inject as an event into the loop
        this.loop.emit({
          id: randomUUID(),
          type: "message",
          source: "channel:dashboard:chat",
          timestamp: Date.now(),
          payload: {
            from: "User",
            channel: "dashboard",
            text,
            isGroup: false,
            isMention: false,
            raw: {},
          },
          replyTo: "channel:dashboard:chat",
        });
        break;
      }
      case "status": {
        ws.send(JSON.stringify({ type: "status", payload: this.loop.getStatus() }));
        break;
      }
      case "events": {
        const limit = (msg.payload as { limit?: number })?.limit ?? 20;
        ws.send(JSON.stringify({ type: "event", payload: this.loop.getEventHistory().slice(-limit) }));
        break;
      }
    }
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
      const status = this.loop.getStatus();
      const compaction = this.compactionManager.getCompactionStats();
      res.json({
        ...status,
        compaction: { count: compaction.count, loopFailures: compaction.loopFailures, pending: !!compaction.pending },
      });
    });

    // Compaction stats
    this.app.get("/api/compaction-stats", (_req, res) => {
      res.json(this.compactionManager.getCompactionStats());
    });

    this.app.post("/api/compaction/reset", (_req, res) => {
      this.compactionManager.resetCount();
      res.json({ ok: true, message: "Compaction counter reset to 0" });
    });

    // R75: Recent events
    this.app.get("/api/events", (req, res) => {
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(this.loop.getEventHistory().slice(-limit));
    });

    // Accept external events
    this.app.post("/api/events", (req, res) => {
      const { type, source, payload, priority } = req.body;
      if (!type || !source || !payload) {
        res.status(400).json({ error: "Missing required fields: type, source, payload" });
        return;
      }
      const event: Event = {
        id: randomUUID(),
        type,
        source,
        timestamp: Date.now(),
        payload,
        priority,
      };
      this.loop.emit(event);
      this.logger.info(`External event injected: ${type} from ${source}`);
      res.json({ ok: true, id: event.id });
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

    // R75, R105: Long-poll for events — digest on normal wakes, full identity after compaction
    this.app.get("/api/wait", async (req, res) => {
      this.lastWaitPoll = Date.now();
      this.compactionManager.setEventLoopActive();
      const timeout = Math.min(parseInt(req.query.timeout as string) || 30, 120) * 1000;
      const sinceParam = req.query.since ? parseInt(req.query.since as string) : undefined;
      try {
        const events = await this.loop.waitForEvent(timeout, sinceParam);
        if (events.length === 0) {
          res.status(204).end();
        } else {
          const identity = this.loop.getIdentityManager();
          const needsFull = this.compactionManager.consumeCompactionFlag();
          const identityPayload = needsFull
            ? { soul: identity.getSoul(), user: identity.getUser(), state: identity.getAgentState(), full: true }
            : { digest: identity.getDigest(), full: false };
          const compactionStats = this.compactionManager.getCompactionStats();
          const shouldRestart = this.compactionManager.shouldAutoRestart();
          res.json({
            identity: identityPayload,
            events,
            cursor: this.loop.getDeliveryWatermark(),
            compaction: { count: compactionStats.count, loopFailures: compactionStats.loopFailures },
            ...(shouldRestart && { shouldRestart: true }),
            currentTime: new Date().toLocaleString("en-US", {
              timeZone: "America/Chicago",
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            }),
          });
        }
      } catch {
        res.status(204).end();
      }
    });

    // --- Compaction hooks (called by Claude Code PreCompact/SessionStart hooks) ---
    this.app.get("/api/pre-compact", (_req, res) => {
      const prompt = this.compactionManager.handlePreCompact();
      res.type("text/plain").send(prompt);
    });

    this.app.post("/api/pre-compact", (_req, res) => {
      const prompt = this.compactionManager.handlePreCompact();
      res.type("text/plain").send(prompt);
    });

    this.app.get("/api/post-compact", (_req, res) => {
      const context = this.compactionManager.handlePostCompact();
      res.type("text/plain").send(context);
    });

    // Agent registry endpoints (for Claude Code background agent dispatch)
    this.app.get("/api/agents", (_req, res) => {
      const registry = this.loop.getAgentRegistry();
      res.json({
        agents: registry.getAll(),
        availableSlots: registry.getAvailableSlots(),
        activeCount: registry.getActiveCount(),
      });
    });

    this.app.post("/api/agents", (req, res) => {
      const { id, description } = req.body as { id: string; description: string };
      if (!id || !description) {
        res.status(400).json({ error: "id and description required" });
        return;
      }
      const registry = this.loop.getAgentRegistry();
      const ok = registry.register(id, description);
      if (!ok) {
        res.status(429).json({ error: "No available slots" });
        return;
      }
      res.json({ ok: true, id });
    });

    this.app.post("/api/agents/:id/complete", (req, res) => {
      const { id } = req.params;
      const { result } = req.body as { result?: string };
      this.loop.getAgentRegistry().complete(id, result ?? "");
      res.json({ ok: true });
    });

    this.app.post("/api/agents/:id/fail", (req, res) => {
      const { id } = req.params;
      const { error } = req.body as { error?: string };
      this.loop.getAgentRegistry().fail(id, error ?? "Unknown error");
      res.json({ ok: true });
    });

    this.app.delete("/api/agents/:id", (req, res) => {
      const { id } = req.params;
      this.loop.getAgentRegistry().cleanup(id);
      res.json({ ok: true });
    });

    // Session checkpoint endpoints — persisted to file
    this.app.get("/api/checkpoint", (_req, res) => {
      res.json(this.checkpoint ?? { currentTopic: null, recentMessages: [] });
    });

    this.app.post("/api/checkpoint", (req, res) => {
      this.checkpoint = req.body;
      this.saveCheckpoint();
      res.json({ ok: true });
    });

    this.app.delete("/api/checkpoint", (_req, res) => {
      this.checkpoint = null;
      this.saveCheckpoint();
      res.json({ ok: true });
    });

    // Identity endpoints
    this.app.get("/api/identity/soul", (_req, res) => {
      res.type("text/markdown").send(this.loop.getIdentityManager().getSoul() || "(not configured)");
    });

    this.app.get("/api/identity/user", (_req, res) => {
      res.type("text/markdown").send(this.loop.getIdentityManager().getUser() || "(not configured)");
    });

    this.app.get("/api/identity/state", (_req, res) => {
      res.type("text/markdown").send(this.loop.getIdentityManager().getAgentState() || "(no state file)");
    });
  }
}

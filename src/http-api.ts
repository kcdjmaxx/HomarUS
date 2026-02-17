// CRC: crc-HttpApi.md | Seq: seq-skill-callback.md, seq-startup.md
import type { Event, Logger } from "./types.js";
import type { Server } from "node:http";

export class HttpApi {
  private port: number;
  private authToken: string | null;
  private server: Server | null = null;
  private logger: Logger;
  private eventHandler: ((event: Event) => void) | null = null;
  private statusFn: (() => Record<string, unknown>) | null = null;

  constructor(logger: Logger, port: number, authToken?: string) {
    this.logger = logger;
    this.port = port;
    this.authToken = authToken ?? null;
  }

  setEventHandler(fn: (event: Event) => void): void {
    this.eventHandler = fn;
  }

  setStatusProvider(fn: () => Record<string, unknown>): void {
    this.statusFn = fn;
  }

  // CRC: crc-HttpApi.md — start()
  async start(): Promise<void> {
    const express = (await import("express")).default;
    const app = express();
    app.use(express.json());

    // Health check — no auth required
    app.get("/health", (_req, res) => {
      res.json({ status: "ok", timestamp: Date.now() });
    });

    // Status endpoint
    app.get("/status", (req, res) => {
      if (!this.validateAuth(req)) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      const status = this.statusFn?.() ?? {};
      res.json(status);
    });

    // Event ingestion — skills POST events here
    app.post("/events", (req, res) => {
      if (!this.validateAuth(req)) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }

      const event = req.body as Event;
      if (!event?.type || !event?.id) {
        res.status(400).json({ error: "Invalid event: must have id and type" });
        return;
      }

      this.eventHandler?.(event);
      res.status(202).json({ accepted: true, eventId: event.id });
    });

    return new Promise((resolve) => {
      this.server = app.listen(this.port, () => {
        this.logger.info("HTTP API started", { port: this.port });
        resolve();
      });
    });
  }

  // CRC: crc-HttpApi.md — stop()
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => {
        this.logger.info("HTTP API stopped");
        this.server = null;
        resolve();
      });
    });
  }

  // CRC: crc-HttpApi.md — validateAuth()
  private validateAuth(req: { headers: Record<string, string | string[] | undefined> }): boolean {
    if (!this.authToken) return true; // No auth configured
    const header = req.headers.authorization;
    if (!header || typeof header !== "string") return false;
    return header === `Bearer ${this.authToken}`;
  }
}

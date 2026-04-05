#!/usr/bin/env node
// CRC: crc-McpBackend.md | Seq: seq-mcp-startup.md
// HomarUS MCP backend -- standalone process (no MCP stdio)
// Used by mcp-proxy.ts or can be run directly for testing.
import { Homarus } from "./homarus.js";
import { McpBackendServer } from "./mcp-backend-server.js";
import type { Logger } from "./types.js";

const logger: Logger = {
  debug(msg, meta) {
    if (process.env.HOMARUS_DEBUG) {
      process.stderr.write(`[DEBUG] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`);
    }
  },
  info(msg, meta) {
    process.stderr.write(`[INFO] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`);
  },
  warn(msg, meta) {
    process.stderr.write(`[WARN] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`);
  },
  error(msg, meta) {
    process.stderr.write(`[ERROR] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`);
  },
};

async function main(): Promise<void> {
  const configPath = process.env.HOMARUS_CONFIG ?? undefined;
  const port = parseInt(process.env.HOMARUS_MCP_PORT ?? "18801", 10);

  // R73: Create and start the Homarus event loop
  const loop = new Homarus(logger, configPath);
  await loop.start();

  // R75: Create and start the MCP backend HTTP + WebSocket server
  const server = new McpBackendServer(logger, port, loop);
  await server.start();

  // Forward event loop notifications to WebSocket clients
  loop.setNotifyFn((event) => {
    server.broadcastEvent(event);
  });

  logger.info("HomarUS MCP backend running", { port });

  // R77: Graceful shutdown
  const shutdown = async () => {
    logger.info("MCP backend shutting down...");
    await server.stop();
    await loop.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[FATAL] ${String(err)}\n`);
  process.exit(1);
});

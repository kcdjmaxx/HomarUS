// CRC: design.md O4 — Agent subprocess worker entry point
// This file runs as a child process forked by SubprocessStrategy.
// It receives an init message, reconstructs deps, runs an Agent, and reports back via IPC.

import { v4 as uuid } from "uuid";
import { Agent } from "./agent.js";
import { ModelRouter } from "./model-router.js";
import { OpenAICompatibleProvider } from "./model-provider.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { IdentityManager } from "./identity-manager.js";
import type {
  AgentConfig, Event, Logger, ToolDefinition, ToolResult,
  ToolContext, ToolSchema,
} from "./types.js";
import type {
  InitMessage, ParentMessage, ChildMessage,
  ToolRequestMessage, EventMessage, ResultMessage, ErrorMessage,
  SerializedProvider,
} from "./subprocess-strategy.js";

// Minimal logger that writes to stderr (stdout is reserved for IPC)
const logger: Logger = {
  debug: (msg, meta) => console.error(`[worker:debug] ${msg}`, meta ?? ""),
  info: (msg, meta) => console.error(`[worker:info] ${msg}`, meta ?? ""),
  warn: (msg, meta) => console.error(`[worker:warn] ${msg}`, meta ?? ""),
  error: (msg, meta) => console.error(`[worker:error] ${msg}`, meta ?? ""),
};

// Pending tool requests awaiting parent response
const pendingToolCalls = new Map<string, {
  resolve: (result: ToolResult) => void;
  reject: (err: Error) => void;
}>();

let agent: Agent | null = null;

function send(msg: ChildMessage): void {
  process.send!(msg);
}

// Build a proxy ToolRegistry that delegates execution to the parent via IPC
function buildProxyToolRegistry(toolSchemas: ToolSchema[]): ToolRegistry {
  const proxyTools = new Map<string, ToolDefinition>();

  for (const schema of toolSchemas) {
    proxyTools.set(schema.name, {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters,
      source: "subprocess-proxy",
      execute: async (params: unknown, context: ToolContext): Promise<ToolResult> => {
        const callId = uuid();
        return new Promise<ToolResult>((resolve, reject) => {
          pendingToolCalls.set(callId, { resolve, reject });
          send({
            type: "tool_request",
            callId,
            toolName: schema.name,
            params,
            agentId: context.agentId,
            sandbox: context.sandbox,
          } satisfies ToolRequestMessage);
        });
      },
    });
  }

  // Return an object that satisfies the ToolRegistry interface used by Agent
  return {
    getForAgent(_allowedTools?: string[]): ToolDefinition[] {
      return [...proxyTools.values()];
    },
    execute: async (name: string, params: unknown, context: ToolContext): Promise<ToolResult> => {
      const tool = proxyTools.get(name);
      if (!tool) return { output: "", error: `Unknown tool: ${name}` };
      return tool.execute(params, context);
    },
    // Stubs for interface compliance — not used by Agent.run()
    register() {},
    unregister() {},
    get(name: string) { return proxyTools.get(name); },
    getAll() { return [...proxyTools.values()]; },
    registerGroup() {},
    resolveGroup() { return []; },
    addPolicy() {},
    checkPolicy() { return true; },
    toSchemas() {
      return [...proxyTools.values()].map((t) => ({
        name: t.name, description: t.description, parameters: t.parameters,
      }));
    },
  } as unknown as ToolRegistry;
}

// Build a minimal IdentityManager that returns the pre-built system prompt
function buildProxyIdentityManager(systemPrompt: string): IdentityManager {
  return {
    buildSystemPrompt: () => systemPrompt,
    load() {},
    reload() {},
    getSoul() { return ""; },
    getUser() { return ""; },
    getOverlay() { return undefined; },
    getWorkspaceFile() { return undefined; },
    listOverlays() { return []; },
  } as unknown as IdentityManager;
}

// Build a ModelRouter from serialized provider configs
function buildModelRouter(
  providers: SerializedProvider[],
  defaultModel: string,
  aliases: Record<string, string>,
  fallbackChain: string[],
): ModelRouter {
  const router = new ModelRouter(logger, defaultModel);

  for (const pc of providers) {
    const provider = new OpenAICompatibleProvider(
      pc.id,
      pc.baseUrl,
      { apiKey: pc.apiKey },
      logger,
    );
    router.registerProvider(provider);
  }

  router.setAliases(aliases);
  router.setFallbackChain(fallbackChain);
  return router;
}

async function handleInit(msg: InitMessage): Promise<void> {
  const modelRouter = buildModelRouter(
    msg.providerConfigs,
    msg.defaultModel,
    msg.aliases,
    msg.fallbackChain,
  );
  const toolRegistry = buildProxyToolRegistry(msg.toolSchemas);
  const identityManager = buildProxyIdentityManager(msg.systemPrompt);

  agent = new Agent(
    msg.agentConfig,
    modelRouter,
    toolRegistry,
    identityManager,
    logger,
  );

  agent.setEmitter((event: Event) => {
    send({ type: "event", event } satisfies EventMessage);
  });

  try {
    const result = await agent.run();
    send({ type: "result", result } satisfies ResultMessage);
    process.exit(0);
  } catch (err) {
    send({ type: "error", error: String((err as Error).message ?? err) } satisfies ErrorMessage);
    process.exit(1);
  }
}

process.on("message", (msg: ParentMessage) => {
  switch (msg.type) {
    case "init":
      handleInit(msg).catch((err) => {
        send({ type: "error", error: String(err) });
        process.exit(1);
      });
      break;

    case "tool_result": {
      const pending = pendingToolCalls.get(msg.callId);
      if (pending) {
        pendingToolCalls.delete(msg.callId);
        pending.resolve(msg.result);
      }
      break;
    }

    case "cancel":
      agent?.cancel();
      break;
  }
});

// Clean exit on disconnect
process.on("disconnect", () => {
  agent?.cancel();
  process.exit(0);
});

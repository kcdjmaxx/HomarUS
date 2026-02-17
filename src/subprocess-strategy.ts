// CRC: design.md O4 — Subprocess execution strategy
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { v4 as uuid } from "uuid";
import type { AgentConfig, AgentResult, Event, Logger, ToolSchema } from "./types.js";
import type { ModelRouter } from "./model-router.js";
import type { ExecutionHandle, ExecutionDeps, ExecutionStrategy } from "./execution-strategy.js";

// IPC message types — Parent → Child
export interface InitMessage {
  type: "init";
  agentConfig: AgentConfig;
  systemPrompt: string;
  providerConfigs: SerializedProvider[];
  toolSchemas: ToolSchema[];
  defaultModel: string;
  aliases: Record<string, string>;
  fallbackChain: string[];
}

export interface ToolResultMessage {
  type: "tool_result";
  callId: string;
  result: { output: string; error?: string };
}

export interface CancelMessage {
  type: "cancel";
}

export type ParentMessage = InitMessage | ToolResultMessage | CancelMessage;

// IPC message types — Child → Parent
export interface EventMessage {
  type: "event";
  event: Event;
}

export interface ToolRequestMessage {
  type: "tool_request";
  callId: string;
  toolName: string;
  params: unknown;
  agentId: string;
  sandbox: boolean;
}

export interface ResultMessage {
  type: "result";
  result: AgentResult;
}

export interface ErrorMessage {
  type: "error";
  error: string;
}

export type ChildMessage = EventMessage | ToolRequestMessage | ResultMessage | ErrorMessage;

export interface SerializedProvider {
  id: string;
  baseUrl: string;
  apiKey: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class SubprocessStrategy implements ExecutionStrategy {
  execute(config: AgentConfig, deps: ExecutionDeps): ExecutionHandle {
    const agentId = uuid();
    let eventListener: ((event: Event) => void) | null = null;
    let child: ChildProcess | null = null;

    const resultPromise = new Promise<AgentResult>((resolveResult, rejectResult) => {
      const workerPath = resolve(__dirname, "agent-worker.js");

      child = fork(workerPath, [], {
        stdio: ["pipe", "pipe", "pipe", "ipc"],
        serialization: "json",
      });

      child.on("message", async (msg: ChildMessage) => {
        switch (msg.type) {
          case "event":
            eventListener?.(msg.event);
            break;

          case "tool_request": {
            const result = await deps.toolRegistry.execute(
              msg.toolName,
              msg.params,
              {
                agentId: msg.agentId,
                sandbox: msg.sandbox,
                workingDir: process.cwd(),
              },
            );
            child?.send({
              type: "tool_result",
              callId: msg.callId,
              result,
            } satisfies ToolResultMessage);
            break;
          }

          case "result":
            resolveResult(msg.result);
            break;

          case "error":
            rejectResult(new Error(msg.error));
            break;
        }
      });

      child.on("error", (err) => {
        deps.logger.error("Subprocess error", { agentId, error: String(err) });
        rejectResult(err);
      });

      child.on("exit", (code, signal) => {
        if (code !== 0 && code !== null) {
          deps.logger.warn("Subprocess exited abnormally", { agentId, code, signal });
          rejectResult(new Error(`Worker exited with code ${code}`));
        }
      });

      // Build init message
      const systemPrompt = deps.identityManager.buildSystemPrompt({
        channel: config.channel,
        taskOverlay: config.taskOverlay,
        taskPrompt: config.systemPrompt,
      });

      const tools = deps.toolRegistry.getForAgent(config.tools);
      const toolSchemas: ToolSchema[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));

      // Extract serializable provider configs from the model router
      const providerConfigs = extractProviderConfigs(deps.modelRouter);

      const initMsg: InitMessage = {
        type: "init",
        agentConfig: { ...config, executionStrategy: "embedded" }, // child always runs embedded
        systemPrompt,
        providerConfigs,
        toolSchemas,
        defaultModel: deps.modelRouter.resolve(config.model) ?? deps.modelRouter.resolve(),
        aliases: {},
        fallbackChain: [],
      };

      child.send(initMsg);
    });

    return {
      agentId,
      cancel: () => {
        child?.send({ type: "cancel" } satisfies CancelMessage);
      },
      result: resultPromise,
      onEvent: (fn) => { eventListener = fn; },
    };
  }
}

// Extract provider info from the router. ModelRouter doesn't expose providers directly,
// so we use getProvider() with the resolved model to get what we need.
function extractProviderConfigs(modelRouter: ModelRouter): SerializedProvider[] {
  const configs: SerializedProvider[] = [];
  const defaultModel = modelRouter.resolve();
  const provider = modelRouter.getProvider(defaultModel);
  if (provider) {
    configs.push({
      id: provider.id,
      baseUrl: (provider as unknown as { baseUrl: string }).baseUrl,
      apiKey: (provider as unknown as { activeProfile: { apiKey: string } }).activeProfile.apiKey,
    });
  }
  return configs;
}

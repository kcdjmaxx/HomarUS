// CRC: design.md O4 — Execution strategy interface and embedded strategy
import type { AgentConfig, AgentResult, Event, Logger } from "./types.js";
import { Agent } from "./agent.js";
import type { ModelRouter } from "./model-router.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { IdentityManager } from "./identity-manager.js";

export interface ExecutionHandle {
  readonly agentId: string;
  cancel(): void;
  readonly result: Promise<AgentResult>;
  onEvent(fn: (event: Event) => void): void;
  /** The Agent instance, available only for embedded strategy */
  readonly agent?: Agent;
}

export interface ExecutionDeps {
  modelRouter: ModelRouter;
  toolRegistry: ToolRegistry;
  identityManager: IdentityManager;
  logger: Logger;
}

export interface ExecutionStrategy {
  execute(config: AgentConfig, deps: ExecutionDeps): ExecutionHandle;
}

// Wraps the existing Agent class — same behavior as the original AgentManager.spawn()
export class EmbeddedStrategy implements ExecutionStrategy {
  execute(config: AgentConfig, deps: ExecutionDeps): ExecutionHandle {
    const agent = new Agent(
      config,
      deps.modelRouter,
      deps.toolRegistry,
      deps.identityManager,
      deps.logger,
    );

    let eventListener: ((event: Event) => void) | null = null;

    agent.setEmitter((event: Event) => {
      eventListener?.(event);
    });

    const resultPromise = agent.run();

    return {
      agentId: agent.id,
      cancel: () => agent.cancel(),
      result: resultPromise,
      onEvent: (fn) => { eventListener = fn; },
      agent,
    };
  }
}

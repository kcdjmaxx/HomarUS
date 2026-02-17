// CRC: crc-AgentManager.md | Seq: seq-message-dispatch.md, seq-agent-execution.md, seq-shutdown.md
import type { AgentConfig, AgentResult, Event, ExecutionStrategyType, Logger } from "./types.js";
import { Agent } from "./agent.js";
import type { ModelRouter } from "./model-router.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { IdentityManager } from "./identity-manager.js";
import type { ExecutionHandle, ExecutionStrategy } from "./execution-strategy.js";
import { EmbeddedStrategy } from "./execution-strategy.js";
import { SubprocessStrategy } from "./subprocess-strategy.js";

interface ActiveAgent {
  handle: ExecutionHandle;
  cancel: () => void;
  // Keep a reference to the Agent for getAgent()/getActive() when using embedded strategy
  agent?: Agent;
}

export class AgentManager {
  private agents = new Map<string, ActiveAgent>();
  private maxConcurrent: number;
  private defaultTimeout: number;
  private defaultMaxTurns: number;
  private defaultExecutionStrategy: ExecutionStrategyType;
  private modelRouter: ModelRouter;
  private toolRegistry: ToolRegistry;
  private identityManager: IdentityManager;
  private logger: Logger;
  private emitFn: ((event: Event) => void) | null = null;

  private strategies: Record<ExecutionStrategyType, ExecutionStrategy> = {
    embedded: new EmbeddedStrategy(),
    subprocess: new SubprocessStrategy(),
  };

  constructor(
    logger: Logger,
    modelRouter: ModelRouter,
    toolRegistry: ToolRegistry,
    identityManager: IdentityManager,
    options?: {
      maxConcurrent?: number;
      defaultTimeout?: number;
      defaultMaxTurns?: number;
      defaultExecutionStrategy?: ExecutionStrategyType;
    },
  ) {
    this.logger = logger;
    this.modelRouter = modelRouter;
    this.toolRegistry = toolRegistry;
    this.identityManager = identityManager;
    this.maxConcurrent = options?.maxConcurrent ?? 5;
    this.defaultTimeout = options?.defaultTimeout ?? 300_000;
    this.defaultMaxTurns = options?.defaultMaxTurns ?? 20;
    this.defaultExecutionStrategy = options?.defaultExecutionStrategy ?? "embedded";
  }

  setEmitter(fn: (event: Event) => void): void {
    this.emitFn = fn;
  }

  // CRC: crc-AgentManager.md — spawn()
  async spawn(config: AgentConfig): Promise<string> {
    if (!this.canSpawn()) {
      throw new Error(`Max concurrent agents reached (${this.maxConcurrent})`);
    }

    const agentConfig: AgentConfig = {
      ...config,
      timeout: config.timeout ?? this.defaultTimeout,
      maxTurns: config.maxTurns ?? this.defaultMaxTurns,
    };

    const strategyType = config.executionStrategy ?? this.defaultExecutionStrategy;
    const strategy = this.strategies[strategyType];

    const handle = strategy.execute(agentConfig, {
      modelRouter: this.modelRouter,
      toolRegistry: this.toolRegistry,
      identityManager: this.identityManager,
      logger: this.logger,
    });

    if (this.emitFn) {
      handle.onEvent(this.emitFn);
    }

    const activeAgent: ActiveAgent = {
      handle,
      cancel: () => handle.cancel(),
      agent: handle.agent,
    };

    this.agents.set(handle.agentId, activeAgent);
    this.logger.info("Spawning agent", {
      id: handle.agentId,
      model: config.model,
      strategy: strategyType,
    });

    // Run async — don't await, let it complete in background
    handle.result
      .then((result) => this.onAgentComplete(handle.agentId, result))
      .catch((err) => {
        this.logger.error("Agent run failed", { id: handle.agentId, error: String(err) });
        this.agents.delete(handle.agentId);
      });

    return handle.agentId;
  }

  // CRC: crc-AgentManager.md — cancel()
  cancel(agentId: string): void {
    const active = this.agents.get(agentId);
    if (!active) return;
    active.cancel();
    this.logger.info("Agent cancel requested", { id: agentId });
  }

  // CRC: crc-AgentManager.md — cancelAll()
  cancelAll(): void {
    for (const active of this.agents.values()) {
      active.cancel();
    }
    this.logger.info("All agents cancel requested", { count: this.agents.size });
  }

  // CRC: crc-AgentManager.md — getAgent() — returns undefined for subprocess agents
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId)?.agent;
  }

  // CRC: crc-AgentManager.md — getActive()
  getActive(): Agent[] {
    return [...this.agents.values()]
      .filter((a) => a.agent?.getState() === "running")
      .map((a) => a.agent!);
  }

  // CRC: crc-AgentManager.md — activeCount()
  activeCount(): number {
    return this.agents.size;
  }

  // CRC: crc-AgentManager.md — canSpawn()
  canSpawn(): boolean {
    return this.activeCount() < this.maxConcurrent;
  }

  // CRC: crc-AgentManager.md — waitForAll()
  async waitForAll(timeout = 30_000): Promise<void> {
    const start = Date.now();
    while (this.agents.size > 0) {
      if (Date.now() - start > timeout) {
        this.logger.warn("Wait for agents timed out, force cancelling", { remaining: this.agents.size });
        this.cancelAll();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // CRC: crc-AgentManager.md — onAgentComplete()
  private onAgentComplete(agentId: string, result: AgentResult): void {
    this.agents.delete(agentId);
    this.logger.info("Agent complete", {
      id: agentId,
      toolCalls: result.toolCalls.length,
      tokens: result.usage.inputTokens + result.usage.outputTokens,
    });
  }
}

// CRC: crc-AgentManager.md | Seq: seq-message-dispatch.md, seq-agent-execution.md, seq-shutdown.md
import type { AgentConfig, AgentResult, Event, Logger } from "./types.js";
import { Agent } from "./agent.js";
import type { ModelRouter } from "./model-router.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { IdentityManager } from "./identity-manager.js";

export class AgentManager {
  private agents = new Map<string, Agent>();
  private maxConcurrent: number;
  private defaultTimeout: number;
  private defaultMaxTurns: number;
  private modelRouter: ModelRouter;
  private toolRegistry: ToolRegistry;
  private identityManager: IdentityManager;
  private logger: Logger;
  private emitFn: ((event: Event) => void) | null = null;

  constructor(
    logger: Logger,
    modelRouter: ModelRouter,
    toolRegistry: ToolRegistry,
    identityManager: IdentityManager,
    options?: { maxConcurrent?: number; defaultTimeout?: number; defaultMaxTurns?: number },
  ) {
    this.logger = logger;
    this.modelRouter = modelRouter;
    this.toolRegistry = toolRegistry;
    this.identityManager = identityManager;
    this.maxConcurrent = options?.maxConcurrent ?? 5;
    this.defaultTimeout = options?.defaultTimeout ?? 300_000;
    this.defaultMaxTurns = options?.defaultMaxTurns ?? 20;
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

    const agent = new Agent(
      agentConfig,
      this.modelRouter,
      this.toolRegistry,
      this.identityManager,
      this.logger,
    );

    if (this.emitFn) {
      agent.setEmitter(this.emitFn);
    }

    this.agents.set(agent.id, agent);
    this.logger.info("Spawning agent", { id: agent.id, model: config.model });

    // Run async — don't await, let it complete in background
    agent.run()
      .then((result) => this.onAgentComplete(agent.id, result))
      .catch((err) => {
        this.logger.error("Agent run failed", { id: agent.id, error: String(err) });
        this.agents.delete(agent.id);
      });

    return agent.id;
  }

  // CRC: crc-AgentManager.md — cancel()
  cancel(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.cancel();
    this.logger.info("Agent cancel requested", { id: agentId });
  }

  // CRC: crc-AgentManager.md — cancelAll()
  cancelAll(): void {
    for (const agent of this.agents.values()) {
      agent.cancel();
    }
    this.logger.info("All agents cancel requested", { count: this.agents.size });
  }

  // CRC: crc-AgentManager.md — getAgent()
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  // CRC: crc-AgentManager.md — getActive()
  getActive(): Agent[] {
    return [...this.agents.values()].filter((a) => a.getState() === "running");
  }

  // CRC: crc-AgentManager.md — activeCount()
  activeCount(): number {
    return this.getActive().length;
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

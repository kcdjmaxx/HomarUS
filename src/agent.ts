// CRC: crc-Agent.md | Seq: seq-agent-execution.md
import { v4 as uuid } from "uuid";
import type {
  AgentConfig, AgentState, AgentResult, Event,
  ChatMessage, ToolCall, ToolCallRecord, TokenUsage, Logger,
} from "./types.js";
import type { ModelRouter } from "./model-router.js";
import type { ToolRegistry } from "./tool-registry.js";
import type { IdentityManager } from "./identity-manager.js";

export class Agent {
  readonly id: string;
  private state: AgentState = "pending";
  private config: AgentConfig;
  private turns = 0;
  private startTime = 0;
  private result: AgentResult | null = null;
  private cancelled = false;
  private totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  private toolCallLog: ToolCallRecord[] = [];

  private modelRouter: ModelRouter;
  private toolRegistry: ToolRegistry;
  private identityManager: IdentityManager;
  private logger: Logger;
  private emitFn: ((event: Event) => void) | null = null;

  constructor(
    config: AgentConfig,
    modelRouter: ModelRouter,
    toolRegistry: ToolRegistry,
    identityManager: IdentityManager,
    logger: Logger,
  ) {
    this.id = uuid();
    this.config = config;
    this.modelRouter = modelRouter;
    this.toolRegistry = toolRegistry;
    this.identityManager = identityManager;
    this.logger = logger;
  }

  setEmitter(fn: (event: Event) => void): void {
    this.emitFn = fn;
  }

  getState(): AgentState {
    return this.state;
  }

  getResult(): AgentResult | null {
    return this.result;
  }

  // CRC: crc-Agent.md — run()
  async run(): Promise<AgentResult> {
    this.state = "running";
    this.startTime = Date.now();
    this.emitProgress("started");

    const maxTurns = this.config.maxTurns ?? 20;
    const systemPrompt = this.identityManager.buildSystemPrompt({
      channel: this.config.channel,
      taskOverlay: this.config.taskOverlay,
      taskPrompt: this.config.systemPrompt,
    });

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: this.config.prompt },
    ];

    const tools = this.toolRegistry.getForAgent(this.config.tools);
    const toolSchemas = tools.length > 0
      ? tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))
      : undefined;

    try {
      while (this.turns < maxTurns && !this.cancelled) {
        if (this.isTimedOut()) {
          this.state = "failed";
          this.emitError("Agent timed out");
          return this.buildResult("Agent timed out after " + (this.config.timeout ?? 300_000) + "ms");
        }

        this.turns++;
        let fullContent = "";
        const pendingToolCalls: ToolCall[] = [];

        // Stream inference
        for await (const chunk of this.modelRouter.chat({
          model: this.modelRouter.resolve(this.config.model),
          messages,
          tools: toolSchemas,
          maxTokens: 4096,
        })) {
          if (chunk.content) fullContent += chunk.content;
          if (chunk.toolCalls) pendingToolCalls.push(...chunk.toolCalls);
          if (chunk.usage) {
            this.totalUsage.inputTokens += chunk.usage.inputTokens;
            this.totalUsage.outputTokens += chunk.usage.outputTokens;
          }
        }

        // No tool calls — agent is done
        if (pendingToolCalls.length === 0) {
          this.state = "complete";
          this.result = this.buildResult(fullContent);
          this.emitResult();
          return this.result;
        }

        // Record assistant message with tool calls
        messages.push({
          role: "assistant",
          content: fullContent,
          toolCalls: pendingToolCalls,
        });

        // Execute tool calls
        for (const tc of pendingToolCalls) {
          if (this.cancelled) break;
          const start = Date.now();
          let params: unknown;
          try {
            params = JSON.parse(tc.arguments);
          } catch {
            params = tc.arguments;
          }

          const result = await this.toolRegistry.execute(tc.name, params, {
            agentId: this.id,
            sandbox: this.config.sandbox ?? false,
            workingDir: process.cwd(),
          });

          this.toolCallLog.push({
            tool: tc.name,
            params,
            result: result.error ?? result.output,
            durationMs: Date.now() - start,
          });

          messages.push({
            role: "tool",
            content: result.error ?? result.output,
            toolCallId: tc.id,
          });
        }

        this.emitProgress(`turn ${this.turns}/${maxTurns}`);
      }

      // Exhausted turns
      if (this.cancelled) {
        this.state = "cancelled";
        this.result = this.buildResult("Agent cancelled");
      } else {
        this.state = "complete";
        this.result = this.buildResult("Agent reached max turns");
      }
      this.emitResult();
      return this.result;
    } catch (err) {
      this.state = "failed";
      const errorMsg = String((err as Error).message ?? err);
      this.emitError(errorMsg);
      return this.buildResult(errorMsg);
    }
  }

  // CRC: crc-Agent.md — cancel()
  cancel(): void {
    this.cancelled = true;
    this.logger.info("Agent cancellation requested", { id: this.id });
  }

  // CRC: crc-Agent.md — isTimedOut()
  isTimedOut(): boolean {
    if (!this.config.timeout) return false;
    return Date.now() - this.startTime > this.config.timeout;
  }

  // CRC: crc-Agent.md — isOverTurns()
  isOverTurns(): boolean {
    return this.turns >= (this.config.maxTurns ?? 20);
  }

  private buildResult(output: string): AgentResult {
    return {
      output,
      toolCalls: [...this.toolCallLog],
      usage: { ...this.totalUsage },
    };
  }

  // CRC: crc-Agent.md — emitProgress()
  private emitProgress(progress: string): void {
    this.emitFn?.({
      id: uuid(),
      type: "agent_progress",
      source: `agent:${this.id}`,
      timestamp: Date.now(),
      payload: { agentId: this.id, progress, turns: this.turns },
    });
  }

  // CRC: crc-Agent.md — emitResult()
  private emitResult(): void {
    this.emitFn?.({
      id: uuid(),
      type: "agent_complete",
      source: `agent:${this.id}`,
      timestamp: Date.now(),
      replyTo: this.config.replyTo,
      payload: { agentId: this.id, result: this.result, state: this.state },
    });
  }

  // CRC: crc-Agent.md — emitError()
  private emitError(error: string): void {
    this.emitFn?.({
      id: uuid(),
      type: "agent_error",
      source: `agent:${this.id}`,
      timestamp: Date.now(),
      payload: { agentId: this.id, error },
    });
  }
}

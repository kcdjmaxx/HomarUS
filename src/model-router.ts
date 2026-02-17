// CRC: crc-ModelRouter.md | Seq: seq-agent-execution.md
import type { ChatRequest, ChatChunk, TokenUsage, AuthProfile, Logger } from "./types.js";
import { ModelProvider } from "./model-provider.js";

export interface BudgetConfig {
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxTotalTokens?: number;
}

export class ModelRouter {
  private providers = new Map<string, ModelProvider>();
  private aliases = new Map<string, string>();
  private defaultModel: string;
  private fallbackChain: string[] = [];
  private authProfiles = new Map<string, AuthProfile[]>();
  private tokenUsage = new Map<string, TokenUsage>();
  private budgetLimits: BudgetConfig | null = null;
  private logger: Logger;

  constructor(logger: Logger, defaultModel: string) {
    this.logger = logger;
    this.defaultModel = defaultModel;
  }

  // CRC: crc-ModelRouter.md — registerProvider()
  registerProvider(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
    this.logger.debug("Registered model provider", { id: provider.id });
  }

  setAliases(aliases: Record<string, string>): void {
    for (const [alias, model] of Object.entries(aliases)) {
      this.aliases.set(alias, model);
    }
  }

  setFallbackChain(chain: string[]): void {
    this.fallbackChain = chain;
  }

  setBudget(budget: BudgetConfig): void {
    this.budgetLimits = budget;
  }

  // CRC: crc-ModelRouter.md — resolve()
  resolve(modelSpec?: string): string {
    if (!modelSpec) return this.defaultModel;
    return this.aliases.get(modelSpec) ?? modelSpec;
  }

  // CRC: crc-ModelRouter.md — getProvider()
  getProvider(modelId: string): ModelProvider | undefined {
    // Try exact match first
    if (this.providers.has(modelId)) return this.providers.get(modelId);

    // Extract provider prefix: "anthropic/claude-sonnet-4-5" → "anthropic"
    const slash = modelId.indexOf("/");
    if (slash > 0) {
      const prefix = modelId.substring(0, slash);
      return this.providers.get(prefix);
    }

    // Fallback: try first provider
    const [first] = this.providers.values();
    return first;
  }

  // CRC: crc-ModelRouter.md — chat()
  async *chat(request: ChatRequest, modelSpec?: string): AsyncIterable<ChatChunk> {
    const resolvedModel = this.resolve(modelSpec ?? request.model);
    const modelsToTry = [resolvedModel, ...this.fallbackChain.filter((m) => m !== resolvedModel)];

    for (const model of modelsToTry) {
      const provider = this.getProvider(model);
      if (!provider) {
        this.logger.warn("No provider for model", { model });
        continue;
      }

      try {
        const req = { ...request, model };
        for await (const chunk of provider.chat(req)) {
          if (chunk.usage) {
            this.trackUsage(model, chunk.usage);
          }
          yield chunk;
        }
        return; // Success — exit
      } catch (err) {
        const error = err as Error;
        this.logger.warn("Model failed, trying failover", { model, error: error.message });

        const action = this.failover(error, model);
        if (action === "rotate") {
          this.rotateAuthProfile(model);
        }
        // Continue to next model in chain
      }
    }

    throw new Error(`All models failed: ${modelsToTry.join(", ")}`);
  }

  // CRC: crc-ModelRouter.md — failover()
  failover(error: Error, currentModel: string): "rotate" | "next" | "compact" {
    const msg = error.message.toLowerCase();
    if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("invalid_api_key")) {
      return "rotate";
    }
    if (msg.includes("context") || msg.includes("token limit") || msg.includes("too long")) {
      return "compact";
    }
    return "next";
  }

  // CRC: crc-ModelRouter.md — trackUsage()
  trackUsage(model: string, tokens: TokenUsage): void {
    const current = this.tokenUsage.get(model) ?? { inputTokens: 0, outputTokens: 0 };
    current.inputTokens += tokens.inputTokens;
    current.outputTokens += tokens.outputTokens;
    this.tokenUsage.set(model, current);
  }

  getUsage(): Map<string, TokenUsage> {
    return new Map(this.tokenUsage);
  }

  // CRC: crc-ModelRouter.md — checkBudget()
  checkBudget(): boolean {
    if (!this.budgetLimits) return false;
    let totalInput = 0;
    let totalOutput = 0;
    for (const usage of this.tokenUsage.values()) {
      totalInput += usage.inputTokens;
      totalOutput += usage.outputTokens;
    }
    if (this.budgetLimits.maxInputTokens && totalInput >= this.budgetLimits.maxInputTokens) return true;
    if (this.budgetLimits.maxOutputTokens && totalOutput >= this.budgetLimits.maxOutputTokens) return true;
    if (this.budgetLimits.maxTotalTokens && (totalInput + totalOutput) >= this.budgetLimits.maxTotalTokens) return true;
    return false;
  }

  // CRC: crc-ModelRouter.md — rotateAuthProfile()
  rotateAuthProfile(modelId: string): void {
    const slash = modelId.indexOf("/");
    const providerId = slash > 0 ? modelId.substring(0, slash) : modelId;
    const profiles = this.authProfiles.get(providerId);
    if (!profiles || profiles.length < 2) return;

    // Move current profile to end with cooldown
    const current = profiles.shift();
    if (current) {
      current.cooldownUntil = Date.now() + 60_000;
      current.failCount = (current.failCount ?? 0) + 1;
      profiles.push(current);
    }

    // Set next active profile on the provider
    const next = profiles.find((p) => !p.cooldownUntil || p.cooldownUntil < Date.now());
    if (next) {
      const provider = this.providers.get(providerId);
      provider?.setProfile(next);
      this.logger.info("Rotated auth profile", { provider: providerId });
    }
  }

  setAuthProfiles(providerId: string, profiles: AuthProfile[]): void {
    this.authProfiles.set(providerId, [...profiles]);
  }
}

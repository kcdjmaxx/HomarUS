# ModelRouter
**Requirements:** R28, R29, R30, R31, R32, R33, R34

## Knows
- providers: Map<string, ModelProvider> (provider ID → adapter)
- aliases: Map<string, string> (alias → full model ID)
- defaultModel: string (global default model)
- fallbackChain: string[] (ordered fallback models)
- authProfiles: Map<string, AuthProfile[]> (provider → profiles with cooldowns)
- tokenUsage: Map<string, TokenUsage> (model → usage tracking)
- budgetLimits: BudgetConfig | null

## Does
- resolve(modelSpec): Resolve a model specification — check explicit, then alias, then default
- chat(request, modelSpec?): Route a chat request to the resolved provider with failover
- failover(error, currentModel): Determine next model based on error type (auth → rotate profile, rate limit → cooldown + next, context overflow → compact, timeout → next)
- registerProvider(provider): Add a model provider adapter
- getProvider(modelId): Extract provider from model ID (e.g., "anthropic/claude-sonnet-4-5" → anthropic provider)
- trackUsage(model, tokens): Record token usage for cost tracking
- checkBudget(): Return whether budget limits have been reached
- rotateAuthProfile(provider): Move to next auth profile, apply cooldown to failed one

## Collaborators
- ModelProvider: abstract provider interface (Anthropic, OpenAI, etc.)
- Agent: requests model inference during execution
- Config: provides model configuration, aliases, auth profiles

## Sequences
- seq-agent-execution.md

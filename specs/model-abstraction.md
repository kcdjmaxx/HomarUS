# Model Abstraction

**Language:** TypeScript
**Environment:** Node.js >= 22, Unix-like systems

## Overview

The system is model-agnostic. Users choose which models to use, configure failover chains, and can assign different models to different tasks. The model layer abstracts provider differences so the rest of the system doesn't care whether it's talking to Anthropic, OpenAI, OpenRouter, or a local model.

## Provider Interface

All providers implement a common interface:

```typescript
interface ModelProvider {
  id: string;                          // e.g., "anthropic", "openai", "openrouter"
  chat(request: ChatRequest): AsyncIterable<ChatChunk>;
  listModels(): Promise<ModelInfo[]>;
  supportsTools(): boolean;
  supportsStreaming(): boolean;
}
```

## Supported Providers

Built-in provider adapters for:
- **Anthropic** — Claude models via API
- **OpenAI** — GPT models via API
- **OpenRouter** — multi-model router
- **Ollama** — local models
- **Custom** — any OpenAI-compatible API endpoint

## Model Resolution

When an agent needs a model, the resolver:

1. Checks for explicit model in agent config
2. Falls back to task-type default (e.g., "use cheap model for simple tasks")
3. Falls back to global default
4. Resolves aliases (e.g., "smart" → "anthropic/claude-opus-4-5")

## Failover

If the primary model fails, the system tries alternatives:

- **Auth error** — rotate to next auth profile for same provider, then try next model
- **Rate limit** — apply cooldown, try next model
- **Context overflow** — compact conversation and retry same model
- **Timeout** — retry with next model
- **Provider down** — skip provider entirely, try next

Failover chain is configurable per-model:
```json
{
  "models": {
    "default": "anthropic/claude-sonnet-4-5",
    "fallback": ["openai/gpt-5", "openrouter/moonshotai/kimi-k2.5"],
    "aliases": {
      "smart": "anthropic/claude-opus-4-5",
      "fast": "anthropic/claude-haiku-4-5",
      "cheap": "openai/gpt-4o-mini"
    }
  }
}
```

## Auth Profiles

Each provider can have multiple auth profiles (API keys). The system rotates through them on auth/billing failures. Profiles have cooldown tracking so bad keys aren't retried immediately.

## Per-Task Model Selection

The event loop can specify which model an agent should use when spawning it. This enables cost optimization:
- Cheap models for simple routing decisions
- Capable models for complex reasoning
- Fast models for real-time responses
- Local models for privacy-sensitive tasks

## Token Tracking

The system tracks token usage per model, per agent, per task for cost visibility. Configurable budget limits can pause work when thresholds are reached.

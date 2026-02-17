# ModelProvider
**Requirements:** R28, R29

## Knows
- id: string (e.g., "anthropic", "openai", "openrouter", "ollama")
- baseUrl: string (API endpoint)
- activeProfile: AuthProfile (current API key/credentials)

## Does
- chat(request: ChatRequest): AsyncIterable<ChatChunk> — stream chat completion
- listModels(): List available models from this provider
- supportsTools(): Whether this provider supports tool use
- supportsStreaming(): Whether this provider supports streaming responses
- validateAuth(): Test if current auth profile works

## Collaborators
- ModelRouter: creates and manages provider instances

## Sequences
- seq-agent-execution.md

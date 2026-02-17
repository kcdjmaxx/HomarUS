// CRC: crc-ModelProvider.md | Seq: seq-agent-execution.md
import type { ChatRequest, ChatChunk, ModelInfo, AuthProfile, Logger } from "./types.js";

export abstract class ModelProvider {
  readonly id: string;
  protected baseUrl: string;
  protected activeProfile: AuthProfile;
  protected logger: Logger;

  constructor(id: string, baseUrl: string, profile: AuthProfile, logger: Logger) {
    this.id = id;
    this.baseUrl = baseUrl;
    this.activeProfile = profile;
    this.logger = logger;
  }

  abstract chat(request: ChatRequest): AsyncIterable<ChatChunk>;
  abstract listModels(): Promise<ModelInfo[]>;
  abstract supportsTools(): boolean;
  abstract supportsStreaming(): boolean;

  setProfile(profile: AuthProfile): void {
    this.activeProfile = profile;
  }

  async validateAuth(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }
}

// OpenAI-compatible provider (works for OpenAI, OpenRouter, Ollama, and any compatible endpoint)
export class OpenAICompatibleProvider extends ModelProvider {
  constructor(id: string, baseUrl: string, profile: AuthProfile, logger: Logger) {
    super(id, baseUrl, profile, logger);
  }

  async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
    const body = this.buildRequestBody(request);
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.activeProfile.apiKey}`,
      },
      body: JSON.stringify({ ...body, stream: true }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.id} API error ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          const chunk = this.parseChunk(parsed);
          if (chunk) yield chunk;
        } catch {
          // skip unparseable chunks
        }
      }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.activeProfile.apiKey}` },
    });
    if (!response.ok) throw new Error(`Failed to list models: ${response.status}`);
    const data = (await response.json()) as { data: Array<{ id: string }> };
    return data.data.map((m) => ({ id: m.id, name: m.id }));
  }

  supportsTools(): boolean {
    return true;
  }

  supportsStreaming(): boolean {
    return true;
  }

  private buildRequestBody(request: ChatRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((m) => {
        const msg: Record<string, unknown> = { role: m.role, content: m.content };
        if (m.toolCallId) msg.tool_call_id = m.toolCallId;
        if (m.toolCalls) msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        }));
        return msg;
      }),
    };
    if (request.tools?.length) {
      body.tools = request.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    return body;
  }

  private parseChunk(data: Record<string, unknown>): ChatChunk | null {
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    if (!choices?.length) return null;
    const delta = choices[0].delta as Record<string, unknown> | undefined;
    if (!delta) return null;

    const chunk: ChatChunk = {};
    if (typeof delta.content === "string") chunk.content = delta.content;
    if (choices[0].finish_reason) chunk.finishReason = choices[0].finish_reason as ChatChunk["finishReason"];

    const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
    if (toolCalls) {
      chunk.toolCalls = toolCalls.map((tc) => {
        const fn = tc.function as Record<string, unknown>;
        return { id: tc.id as string, name: fn.name as string, arguments: fn.arguments as string };
      });
    }

    if (data.usage) {
      const usage = data.usage as Record<string, number>;
      chunk.usage = { inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0 };
    }

    return chunk;
  }
}

// Anthropic provider (Messages API)
export class AnthropicProvider extends ModelProvider {
  constructor(profile: AuthProfile, logger: Logger) {
    super("anthropic", "https://api.anthropic.com/v1", profile, logger);
  }

  async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
    const systemMsg = request.messages.find((m) => m.role === "system");
    const nonSystemMsgs = request.messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: request.model,
      messages: nonSystemMsgs.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
    };
    if (systemMsg) body.system = systemMsg.content;
    if (request.tools?.length) {
      body.tools = request.tools.map((t) => ({
        name: t.name, description: t.description, input_schema: t.parameters,
      }));
    }
    if (request.temperature !== undefined) body.temperature = request.temperature;

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.activeProfile.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(trimmed.slice(6)) as Record<string, unknown>;
          const chunk = this.parseAnthropicEvent(data);
          if (chunk) yield chunk;
        } catch {
          // skip
        }
      }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    // Anthropic doesn't have a list models endpoint; return known models
    return [
      { id: "claude-opus-4-5", name: "Claude Opus 4.5", contextWindow: 200000 },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", contextWindow: 200000 },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", contextWindow: 200000 },
    ];
  }

  supportsTools(): boolean {
    return true;
  }

  supportsStreaming(): boolean {
    return true;
  }

  private parseAnthropicEvent(data: Record<string, unknown>): ChatChunk | null {
    const type = data.type as string;
    if (type === "content_block_delta") {
      const delta = data.delta as Record<string, unknown>;
      if (delta.type === "text_delta") return { content: delta.text as string };
      if (delta.type === "input_json_delta") return null; // handled in tool_use
    }
    if (type === "message_delta") {
      const delta = data.delta as Record<string, unknown>;
      const usage = data.usage as Record<string, number> | undefined;
      return {
        finishReason: delta.stop_reason === "tool_use" ? "tool_calls" : "stop",
        usage: usage ? { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 } : undefined,
      };
    }
    if (type === "message_start") {
      const message = data.message as Record<string, unknown>;
      const usage = message.usage as Record<string, number> | undefined;
      if (usage) return { usage: { inputTokens: usage.input_tokens ?? 0, outputTokens: 0 } };
    }
    return null;
  }
}

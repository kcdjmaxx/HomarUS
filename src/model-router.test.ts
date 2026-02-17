// Test: test-ModelRouter.md
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModelRouter } from "./model-router.js";
import { ModelProvider } from "./model-provider.js";
import type { ChatRequest, ChatChunk, ModelInfo, AuthProfile, Logger } from "./types.js";

const logger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

class FakeProvider extends ModelProvider {
  public chatFn: (request: ChatRequest) => AsyncIterable<ChatChunk>;

  constructor(id: string, profile: AuthProfile = { apiKey: "test" }) {
    super(id, "http://fake", profile, logger);
    this.chatFn = async function* () {
      yield { content: "ok", finishReason: "stop" as const, usage: { inputTokens: 10, outputTokens: 5 } };
    };
  }

  async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
    yield* this.chatFn(request);
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: "fake-model", name: "Fake" }];
  }

  supportsTools(): boolean { return true; }
  supportsStreaming(): boolean { return true; }
}

describe("ModelRouter", () => {
  let router: ModelRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new ModelRouter(logger, "default/model-v1");
  });

  it("resolves alias to full model ID", () => {
    router.setAliases({ smart: "anthropic/claude-opus-4-5" });
    expect(router.resolve("smart")).toBe("anthropic/claude-opus-4-5");
  });

  it("resolves undefined to default model", () => {
    expect(router.resolve(undefined)).toBe("default/model-v1");
  });

  it("resolves unknown model to itself", () => {
    expect(router.resolve("some/model")).toBe("some/model");
  });

  it("failover returns rotate on auth error", () => {
    const action = router.failover(new Error("401 Unauthorized"), "test/model");
    expect(action).toBe("rotate");
  });

  it("failover returns next on rate limit", () => {
    const action = router.failover(new Error("429 Too Many Requests"), "test/model");
    expect(action).toBe("next");
  });

  it("failover returns compact on context overflow", () => {
    const action = router.failover(new Error("context length exceeded token limit"), "test/model");
    expect(action).toBe("compact");
  });

  it("tracks token usage per model", async () => {
    const provider = new FakeProvider("provA");
    router.registerProvider(provider);

    const req: ChatRequest = {
      model: "provA/model-1",
      messages: [{ role: "user", content: "hi" }],
    };

    for await (const _ of router.chat(req)) { /* consume */ }

    // Different model on same provider
    provider.chatFn = async function* () {
      yield { content: "ok", usage: { inputTokens: 20, outputTokens: 10 } };
    };
    for await (const _ of router.chat({ ...req, model: "provA/model-2" })) { /* consume */ }

    const usage = router.getUsage();
    expect(usage.get("provA/model-1")).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(usage.get("provA/model-2")).toEqual({ inputTokens: 20, outputTokens: 10 });
  });

  it("budget limit triggers when exceeded", () => {
    router.setBudget({ maxTotalTokens: 100 });
    expect(router.checkBudget()).toBe(false);

    router.trackUsage("model-a", { inputTokens: 60, outputTokens: 50 });
    expect(router.checkBudget()).toBe(true);
  });

  it("falls over to next model on failure", async () => {
    const failing = new FakeProvider("provA");
    failing.chatFn = async function* () {
      throw new Error("429 rate limited");
    };

    const working = new FakeProvider("provB");

    router.registerProvider(failing);
    router.registerProvider(working);
    router.setFallbackChain(["provB/backup"]);

    const chunks: ChatChunk[] = [];
    for await (const chunk of router.chat({ model: "provA/primary", messages: [{ role: "user", content: "hi" }] })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].content).toBe("ok");
  });

  it("rotates auth profile on auth error", () => {
    const provider = new FakeProvider("myProvider");
    router.registerProvider(provider);

    const profiles: AuthProfile[] = [
      { apiKey: "key1" },
      { apiKey: "key2" },
    ];
    router.setAuthProfiles("myProvider", profiles);

    router.rotateAuthProfile("myProvider/some-model");

    // After rotation, provider should have key2 active
    expect(provider["activeProfile"].apiKey).toBe("key2");
  });
});

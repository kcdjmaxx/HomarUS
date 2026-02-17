// Test: test-BrowserManager.md
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserManager } from "./browser-manager.js";
import { createBrowserTool } from "./tools/browser.js";
import type { Logger, ToolContext } from "./types.js";

const logger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Fake Playwright page with all methods BrowserManager calls
function fakePage() {
  return {
    setDefaultTimeout: vi.fn(),
    goto: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue("https://example.com"),
    title: vi.fn().mockResolvedValue("Example"),
    click: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("PNG")),
    evaluate: vi.fn().mockResolvedValue("page text"),
    goBack: vi.fn().mockResolvedValue(undefined),
    goForward: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  };
}

// Mock the dynamic import of playwright
const page = fakePage();
const mockContext = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn().mockResolvedValue(undefined) };
const mockBrowser = { newContext: vi.fn().mockResolvedValue(mockContext), close: vi.fn().mockResolvedValue(undefined) };

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

describe("BrowserManager", () => {
  let bm: BrowserManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.newPage.mockResolvedValue(page);
    mockBrowser.newContext.mockResolvedValue(mockContext);
    bm = new BrowserManager(logger, { headless: true });
  });

  it("launch and close lifecycle", async () => {
    expect(bm.isLaunched()).toBe(false);

    await bm.launch();
    expect(bm.isLaunched()).toBe(true);

    await bm.close();
    expect(bm.isLaunched()).toBe(false);
  });

  it("auto-launch on first execute", async () => {
    expect(bm.isLaunched()).toBe(false);

    const result = await bm.execute({ action: "navigate", url: "https://example.com" });

    expect(bm.isLaunched()).toBe(true);
    expect(result.success).toBe(true);
    expect(result.url).toBe("https://example.com");
  });

  it("navigate requires url parameter", async () => {
    await bm.launch();
    const result = await bm.execute({ action: "navigate" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("url required for navigate");
  });

  it("click requires selector parameter", async () => {
    await bm.launch();
    const result = await bm.execute({ action: "click" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("selector required for click");
  });

  it("unknown action returns error", async () => {
    await bm.launch();
    const result = await bm.execute({ action: "fly" } as any);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Unknown action: fly");
  });

  it("Playwright error is caught and returned", async () => {
    await bm.launch();
    page.goto.mockRejectedValueOnce(new Error("net::ERR_NAME_NOT_RESOLVED"));

    const result = await bm.execute({ action: "navigate", url: "https://bad.invalid" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("ERR_NAME_NOT_RESOLVED");
  });

  it("sandbox mode denies browser tool", async () => {
    const tool = createBrowserTool(bm);
    const ctx: ToolContext = { sandbox: true, agentId: "test", workingDir: "/tmp" };
    const result = await tool.execute({ action: "navigate", url: "https://example.com" }, ctx);
    expect(result.error).toBe("browser tool is not available in sandbox mode");
  });
});

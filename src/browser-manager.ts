// CRC: crc-BrowserManager.md
// Browser lifecycle manager — wraps Playwright, provides a persistent browser/page
import type { BrowserConfig, Logger } from "./types.js";

// Playwright types — kept as `any` so the module compiles without playwright installed.
// The actual import happens dynamically in launch().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Browser = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BrowserContext = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any;

export interface BrowserAction {
  action: "navigate" | "click" | "type" | "screenshot" | "content" | "evaluate" | "back" | "forward" | "wait" | "scroll";
  url?: string;
  selector?: string;
  text?: string;
  script?: string;
  timeout?: number;
  direction?: "up" | "down";
  pixels?: number;
}

export interface BrowserResult {
  success: boolean;
  data?: string;
  screenshot?: string; // base64
  error?: string;
  url?: string;
  title?: string;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: BrowserConfig;
  private logger: Logger;
  private launched = false;

  constructor(logger: Logger, config: BrowserConfig = {}) {
    this.logger = logger;
    this.config = config;
  }

  async launch(): Promise<void> {
    if (this.launched) return;

    const modName = "playwright";
    // Dynamic import — fails at runtime (not compile time) if playwright isn't installed
    const pw = await import(modName).catch(() => {
      throw new Error("playwright is not installed — run: npm install playwright");
    });
    const chromium = pw.chromium;

    const launchOptions: Record<string, unknown> = {
      headless: this.config.headless ?? true,
    };

    if (this.config.executablePath) {
      launchOptions.executablePath = this.config.executablePath;
    }

    if (this.config.proxy) {
      launchOptions.proxy = { server: this.config.proxy };
    }

    this.browser = await chromium.launch(launchOptions);
    this.context = await this.browser.newContext({
      viewport: this.config.viewport ?? { width: 1280, height: 720 },
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout ?? 30_000);
    this.launched = true;
    this.logger.info("Browser launched", { headless: this.config.headless ?? true });
  }

  async close(): Promise<void> {
    if (!this.launched) return;
    await this.context?.close();
    await this.browser?.close();
    this.page = null;
    this.context = null;
    this.browser = null;
    this.launched = false;
    this.logger.info("Browser closed");
  }

  isLaunched(): boolean {
    return this.launched;
  }

  async execute(action: BrowserAction): Promise<BrowserResult> {
    if (!this.launched || !this.page) {
      // Auto-launch on first use
      await this.launch();
      if (!this.page) {
        return { success: false, error: "Browser failed to launch" };
      }
    }

    const page = this.page;
    const timeout = action.timeout ?? this.config.timeout ?? 30_000;

    try {
      switch (action.action) {
        case "navigate": {
          if (!action.url) return { success: false, error: "url required for navigate" };
          await page.goto(action.url, { timeout, waitUntil: "domcontentloaded" });
          return {
            success: true,
            url: page.url(),
            title: await page.title(),
            data: `Navigated to ${page.url()}`,
          };
        }

        case "click": {
          if (!action.selector) return { success: false, error: "selector required for click" };
          await page.click(action.selector, { timeout });
          await page.waitForLoadState("domcontentloaded").catch(() => {});
          return {
            success: true,
            url: page.url(),
            data: `Clicked ${action.selector}`,
          };
        }

        case "type": {
          if (!action.selector) return { success: false, error: "selector required for type" };
          if (action.text === undefined) return { success: false, error: "text required for type" };
          await page.fill(action.selector, action.text, { timeout });
          return {
            success: true,
            data: `Typed into ${action.selector}`,
          };
        }

        case "screenshot": {
          const buffer = await page.screenshot({ fullPage: false, type: "png" });
          return {
            success: true,
            screenshot: buffer.toString("base64"),
            url: page.url(),
            title: await page.title(),
            data: `Screenshot captured (${buffer.length} bytes)`,
          };
        }

        case "content": {
          // Get visible text content, not raw HTML
          const text = await page.evaluate(() => {
            // Get innerText which respects visibility
            return document.body.innerText;
          });
          const truncated = text.length > 50_000
            ? text.slice(0, 50_000) + `\n... (truncated, ${text.length} total chars)`
            : text;
          return {
            success: true,
            data: truncated,
            url: page.url(),
            title: await page.title(),
          };
        }

        case "evaluate": {
          if (!action.script) return { success: false, error: "script required for evaluate" };
          const result = await page.evaluate(action.script);
          return {
            success: true,
            data: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          };
        }

        case "back": {
          await page.goBack({ timeout });
          return { success: true, url: page.url(), data: "Navigated back" };
        }

        case "forward": {
          await page.goForward({ timeout });
          return { success: true, url: page.url(), data: "Navigated forward" };
        }

        case "wait": {
          if (action.selector) {
            await page.waitForSelector(action.selector, { timeout });
            return { success: true, data: `Element found: ${action.selector}` };
          }
          // Wait a fixed duration
          await page.waitForTimeout(action.timeout ?? 1000);
          return { success: true, data: `Waited ${action.timeout ?? 1000}ms` };
        }

        case "scroll": {
          const dir = action.direction ?? "down";
          const px = action.pixels ?? 500;
          const delta = dir === "down" ? px : -px;
          await page.evaluate((d: number) => window.scrollBy(0, d), delta);
          return { success: true, data: `Scrolled ${dir} ${px}px` };
        }

        default:
          return { success: false, error: `Unknown action: ${action.action}` };
      }
    } catch (err) {
      return {
        success: false,
        error: String((err as Error).message ?? err),
        url: page.url(),
      };
    }
  }
}

// Built-in tool: browser — control a browser via Playwright
import type { ToolDefinition, ToolContext, ToolResult } from "../types.js";
import type { BrowserManager, BrowserAction } from "../browser-manager.js";

export function createBrowserTool(browserManager: BrowserManager): ToolDefinition {
  return {
    name: "browser",
    description: `Control a headless browser. Actions: navigate (go to URL), click (click element by CSS selector), type (fill input by selector), screenshot (capture page as base64 PNG), content (get visible page text), evaluate (run JavaScript), back/forward (navigation history), wait (wait for selector or duration), scroll (scroll up/down).`,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "The browser action to perform",
          enum: ["navigate", "click", "type", "screenshot", "content", "evaluate", "back", "forward", "wait", "scroll"],
        },
        url: { type: "string", description: "URL to navigate to (for navigate action)" },
        selector: { type: "string", description: "CSS selector for the target element (for click, type, wait)" },
        text: { type: "string", description: "Text to type (for type action)" },
        script: { type: "string", description: "JavaScript to evaluate (for evaluate action)" },
        timeout: { type: "number", description: "Timeout in milliseconds" },
        direction: { type: "string", description: "Scroll direction (for scroll action)", enum: ["up", "down"] },
        pixels: { type: "number", description: "Pixels to scroll (for scroll action, default 500)" },
      },
      required: ["action"],
    },
    source: "builtin",

    async execute(params: unknown, context: ToolContext): Promise<ToolResult> {
      if (context.sandbox) {
        return { output: "", error: "browser tool is not available in sandbox mode" };
      }

      const action = params as BrowserAction;
      const result = await browserManager.execute(action);

      if (!result.success) {
        return { output: "", error: result.error ?? "Browser action failed" };
      }

      // Build output with context
      const parts: string[] = [];
      if (result.url) parts.push(`URL: ${result.url}`);
      if (result.title) parts.push(`Title: ${result.title}`);
      if (result.data) parts.push(result.data);
      if (result.screenshot) parts.push(`[Screenshot: ${result.screenshot.length} chars base64]`);

      return { output: parts.join("\n") };
    },
  };
}

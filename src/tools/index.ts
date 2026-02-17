// Built-in tool registration
import type { ToolRegistry } from "../tool-registry.js";
import type { MemoryIndex } from "../memory-index.js";
import type { BrowserManager } from "../browser-manager.js";
import type { Logger } from "../types.js";
import { bashTool } from "./bash.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { editTool } from "./edit.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { gitTool } from "./git.js";
import { webFetchTool } from "./web-fetch.js";
import { webSearchTool } from "./web-search.js";
import { lspTool } from "./lsp.js";
import { createMemoryTools } from "./memory.js";
import { createBrowserTool } from "./browser.js";

export function registerBuiltinTools(
  registry: ToolRegistry,
  memoryIndex: MemoryIndex,
  browserManager: BrowserManager | null,
  logger: Logger,
): void {
  // group:fs
  registry.register(readTool);
  registry.register(writeTool);
  registry.register(editTool);
  registry.register(globTool);
  registry.register(grepTool);

  // group:runtime
  registry.register(bashTool);
  registry.register(gitTool);

  // group:web
  registry.register(webFetchTool);
  registry.register(webSearchTool);
  if (browserManager) {
    registry.register(createBrowserTool(browserManager));
  }

  // group:code
  registry.register(lspTool);

  // group:memory
  for (const tool of createMemoryTools(memoryIndex)) {
    registry.register(tool);
  }

  const tools = [
    readTool.name, writeTool.name, editTool.name, globTool.name, grepTool.name,
    bashTool.name, gitTool.name,
    webFetchTool.name, webSearchTool.name,
    lspTool.name,
    "memory_search", "memory_get", "memory_store",
  ];
  if (browserManager) tools.push("browser");

  logger.info("Built-in tools registered", { count: tools.length, tools });
}

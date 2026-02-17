// CRC: crc-ToolRegistry.md | Seq: seq-agent-execution.md
import type { ToolDefinition, ToolResult, ToolContext, Logger } from "./types.js";

export interface ToolPolicy {
  name: string;
  allow?: string[];
  deny?: string[];
}

const BUILTIN_GROUPS: Record<string, string[]> = {
  "group:fs": ["read", "write", "edit"],
  "group:runtime": ["bash"],
  "group:web": ["web_fetch", "web_search", "browser"],
  "group:memory": ["memory_search", "memory_get", "memory_store"],
};

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private policies: ToolPolicy[] = [];
  private groups = new Map<string, string[]>(Object.entries(BUILTIN_GROUPS));
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  // CRC: crc-ToolRegistry.md — register()
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.logger.debug("Registered tool", { name: tool.name, source: tool.source });
  }

  // CRC: crc-ToolRegistry.md — unregister()
  unregister(name: string): void {
    this.tools.delete(name);
  }

  // CRC: crc-ToolRegistry.md — get()
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  // CRC: crc-ToolRegistry.md — getAll()
  getAll(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  // CRC: crc-ToolRegistry.md — getForAgent()
  getForAgent(allowedTools?: string[]): ToolDefinition[] {
    const all = this.getAll();
    if (!allowedTools) return all;

    // Resolve groups in the allow list
    const resolved = new Set<string>();
    for (const name of allowedTools) {
      const group = this.groups.get(name);
      if (group) {
        group.forEach((t) => resolved.add(t));
      } else {
        resolved.add(name);
      }
    }

    return all.filter((t) => resolved.has(t.name));
  }

  // CRC: crc-ToolRegistry.md — execute()
  async execute(name: string, params: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { output: "", error: `Unknown tool: ${name}` };
    }

    if (!this.checkPolicy(name, context)) {
      return { output: "", error: `Tool ${name} denied by policy` };
    }

    const start = Date.now();
    try {
      const result = await tool.execute(params, context);
      this.logger.debug("Tool executed", { name, durationMs: Date.now() - start });
      return result;
    } catch (err) {
      this.logger.error("Tool execution failed", { name, error: String(err) });
      return { output: "", error: String(err) };
    }
  }

  // CRC: crc-ToolRegistry.md — registerGroup()
  registerGroup(name: string, toolNames: string[]): void {
    this.groups.set(name, toolNames);
  }

  // CRC: crc-ToolRegistry.md — resolveGroup()
  resolveGroup(groupName: string): string[] {
    return this.groups.get(groupName) ?? [];
  }

  addPolicy(policy: ToolPolicy): void {
    this.policies.push(policy);
  }

  // CRC: crc-ToolRegistry.md — checkPolicy()
  checkPolicy(toolName: string, _context: ToolContext): boolean {
    for (const policy of this.policies) {
      if (policy.deny?.includes(toolName)) return false;
      if (policy.allow && !policy.allow.includes(toolName)) return false;
    }
    return true;
  }

  toSchemas(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return this.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }
}

// Test: test-SkillManager.md
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SkillManager } from "./skill-manager.js";
import { EventBus } from "./event-bus.js";
import { ToolRegistry } from "./tool-registry.js";
import type { SkillManifest, Logger } from "./types.js";

const logger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function createSkillDir(baseDir: string, name: string, manifest: SkillManifest): string {
  const skillDir = join(baseDir, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "skill.json"), JSON.stringify(manifest));
  return skillDir;
}

describe("SkillManager", () => {
  let tmpDir: string;
  let eventBus: EventBus;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = mkdtempSync(join(tmpdir(), "homarus-test-"));
    eventBus = new EventBus(logger);
    toolRegistry = new ToolRegistry(logger);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads skill from directory with valid manifest", async () => {
    const manifest: SkillManifest = {
      name: "test-skill",
      version: "1.0.0",
      description: "A test skill",
    };
    createSkillDir(tmpDir, "test-skill", manifest);

    const manager = new SkillManager(logger, eventBus, toolRegistry, [tmpDir]);
    await manager.loadAll();

    const skill = manager.get("test-skill");
    expect(skill).toBeDefined();
    expect(skill!.manifest.name).toBe("test-skill");
    expect(skill!.getState()).toBe("running");
  });

  it("registers skill tools in the registry after load", async () => {
    const manifest: SkillManifest = {
      name: "tool-skill",
      version: "1.0.0",
      description: "Skill with tools",
      tools: [
        { name: "tool_alpha", description: "Alpha tool", parameters: { type: "object", properties: {} } },
        { name: "tool_beta", description: "Beta tool", parameters: { type: "object", properties: {} } },
      ],
    };
    createSkillDir(tmpDir, "tool-skill", manifest);

    const manager = new SkillManager(logger, eventBus, toolRegistry, [tmpDir]);
    await manager.loadAll();

    expect(toolRegistry.get("tool_alpha")).toBeDefined();
    expect(toolRegistry.get("tool_beta")).toBeDefined();
    expect(toolRegistry.get("tool_alpha")!.source).toBe("skill:tool-skill");
  });

  it("hot reload replaces skill instance", async () => {
    const manifest: SkillManifest = {
      name: "reload-skill",
      version: "1.0.0",
      description: "Original",
    };
    createSkillDir(tmpDir, "reload-skill", manifest);

    const manager = new SkillManager(logger, eventBus, toolRegistry, [tmpDir]);
    await manager.loadAll();

    const original = manager.get("reload-skill");
    expect(original!.manifest.description).toBe("Original");

    // Update manifest
    const updatedManifest: SkillManifest = {
      name: "reload-skill",
      version: "2.0.0",
      description: "Updated",
    };
    writeFileSync(join(tmpDir, "reload-skill", "skill.json"), JSON.stringify(updatedManifest));

    await manager.reload("reload-skill");

    const reloaded = manager.get("reload-skill");
    expect(reloaded!.manifest.version).toBe("2.0.0");
    expect(reloaded!.manifest.description).toBe("Updated");
  });

  it("rejects invalid manifest (no skill.json)", async () => {
    // Create directory without skill.json
    mkdirSync(join(tmpDir, "bad-skill"), { recursive: true });

    const manager = new SkillManager(logger, eventBus, toolRegistry, [tmpDir]);
    await manager.loadAll();

    // Should not have loaded it
    expect(manager.get("bad-skill")).toBeUndefined();
    // Should have logged a warning
    expect(logger.warn).toHaveBeenCalled();
  });

  it("registers skill event handlers on the bus", async () => {
    const manifest: SkillManifest = {
      name: "event-skill",
      version: "1.0.0",
      description: "Handles events",
      handles: ["order_submitted"],
    };
    createSkillDir(tmpDir, "event-skill", manifest);

    const manager = new SkillManager(logger, eventBus, toolRegistry, [tmpDir]);
    await manager.loadAll();

    // The event bus should have a direct handler for "order_submitted"
    expect(eventBus.hasHandlers("order_submitted")).toBe(true);
  });
});

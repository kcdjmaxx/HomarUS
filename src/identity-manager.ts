// CRC: crc-IdentityManager.md | Seq: seq-agent-execution.md, seq-startup.md
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Logger } from "./types.js";

export interface PromptBuildOptions {
  channel?: string;
  taskOverlay?: string;
  taskPrompt?: string;
}

export class IdentityManager {
  private soulContent = "";
  private userContent = "";
  private stateContent = "";
  private preferencesContent = "";
  private disagreementsContent = "";
  private overlays = new Map<string, string>();
  private workspaceFiles = new Map<string, string>();
  private identityDir: string;
  private workspaceDir: string;
  private logger: Logger;

  constructor(logger: Logger, identityDir: string, workspaceDir: string) {
    this.logger = logger;
    this.identityDir = identityDir;
    this.workspaceDir = workspaceDir;
  }

  // CRC: crc-IdentityManager.md — load()
  load(): void {
    this.soulContent = this.readFile(resolve(this.identityDir, "soul.md"));
    this.userContent = this.readFile(resolve(this.identityDir, "user.md"));
    this.stateContent = this.readFile(resolve(this.identityDir, "state.md"));
    this.preferencesContent = this.readFile(resolve(this.identityDir, "preferences.md"));
    this.disagreementsContent = this.readFile(resolve(this.identityDir, "disagreements.md"));
    this.loadOverlays();
    this.loadWorkspaceFiles();
    this.logger.info("Identity loaded", {
      hasSoul: this.soulContent.length > 0,
      hasUser: this.userContent.length > 0,
      hasState: this.stateContent.length > 0,
      hasPreferences: this.preferencesContent.length > 0,
      hasDisagreements: this.disagreementsContent.length > 0,
      overlays: this.overlays.size,
      workspaceFiles: this.workspaceFiles.size,
    });
  }

  // CRC: crc-IdentityManager.md — reload()
  reload(): void {
    this.overlays.clear();
    this.workspaceFiles.clear();
    this.load();
  }

  // CRC: crc-IdentityManager.md — buildSystemPrompt()
  buildSystemPrompt(options: PromptBuildOptions = {}): string {
    const parts: string[] = [];

    // 1. Soul
    if (this.soulContent) parts.push(this.soulContent);

    // 2. User profile
    if (this.userContent) parts.push(this.userContent);

    // 3. Preferences
    if (this.preferencesContent) parts.push(`## Preferences\n${this.preferencesContent}`);

    // 4. Agent state (ephemeral)
    if (this.stateContent) parts.push(`## Agent State\n${this.stateContent}`);

    // 5. Channel overlay
    if (options.channel) {
      const overlay = this.overlays.get(options.channel);
      if (overlay) parts.push(overlay);
    }

    // 6. Task overlay
    if (options.taskOverlay) {
      const overlay = this.overlays.get(options.taskOverlay);
      if (overlay) parts.push(overlay);
    }

    // 7. Workspace files
    for (const [name, content] of this.workspaceFiles) {
      if (content) parts.push(`## ${name}\n${content}`);
    }

    // 8. Task prompt (not part of identity, but assembled here for convenience)
    if (options.taskPrompt) parts.push(options.taskPrompt);

    return parts.join("\n\n---\n\n");
  }

  // CRC: crc-IdentityManager.md — getSoul()
  getSoul(): string {
    return this.soulContent;
  }

  // CRC: crc-IdentityManager.md — getUser()
  getUser(): string {
    return this.userContent;
  }

  // Identity personality files
  getState(): string {
    return this.stateContent;
  }

  getPreferences(): string {
    return this.preferencesContent;
  }

  getDisagreements(): string {
    return this.disagreementsContent;
  }

  // R149: Compressed identity digest (~200 tokens) for normal event wakes
  /**
   * Returns a compressed identity digest (~200 tokens) for normal event wakes.
   * Extracts name, core behavioral rules, and current mood — enough for
   * personality consistency without the full 3K token payload.
   */
  getDigest(): string {
    const lines: string[] = [];

    // Extract name from soul via regex (no hardcoded names)
    const nameMatch = this.soulContent.match(/\*\*Name:\s*(\w+)\*\*/);
    if (nameMatch) lines.push(`You are ${nameMatch[1]}.`);

    // Extract Vibe section (key behavioral rules)
    const vibeMatch = this.soulContent.match(/## Vibe\n\n([\s\S]*?)(?=\n##|\n---)/);
    if (vibeMatch) lines.push(vibeMatch[1].trim());

    // Extract current mood/state summary (first paragraph of state.md)
    if (this.stateContent) {
      const moodMatch = this.stateContent.match(/## Last Session\n\n([\s\S]*?)(?=\n##)/);
      if (moodMatch) lines.push("Last session: " + moodMatch[1].trim());
    }

    return lines.join("\n\n");
  }

  // Agent state file (state.md) — optional ephemeral state
  getAgentState(): string {
    return this.stateContent;
  }

  // CRC: crc-IdentityManager.md — getOverlay()
  getOverlay(name: string): string | undefined {
    return this.overlays.get(name);
  }

  // CRC: crc-IdentityManager.md — getWorkspaceFile()
  getWorkspaceFile(name: string): string | undefined {
    return this.workspaceFiles.get(name);
  }

  // CRC: crc-IdentityManager.md — listOverlays()
  listOverlays(): string[] {
    return [...this.overlays.keys()];
  }

  private loadOverlays(): void {
    const overlayDir = resolve(this.identityDir, "overlays");
    if (!existsSync(overlayDir)) return;

    for (const file of readdirSync(overlayDir)) {
      if (!file.endsWith(".md")) continue;
      const name = file.replace(/\.md$/, "");
      const content = this.readFile(join(overlayDir, file));
      if (content) this.overlays.set(name, content);
    }
  }

  private loadWorkspaceFiles(): void {
    if (!existsSync(this.workspaceDir)) return;

    for (const file of readdirSync(this.workspaceDir)) {
      if (!file.endsWith(".md")) continue;
      const content = this.readFile(join(this.workspaceDir, file));
      if (content) this.workspaceFiles.set(file, content);
    }
  }

  private readFile(path: string): string {
    if (!existsSync(path)) return "";
    try {
      return readFileSync(path, "utf-8").trim();
    } catch (err) {
      this.logger.warn("Failed to read identity file", { path, error: String(err) });
      return "";
    }
  }
}

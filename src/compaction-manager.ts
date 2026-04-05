// CRC: crc-CompactionManager.md | Seq: seq-compaction-flush.md
// Auto-flush before context compaction — tracks compaction count and signals restart
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { Logger } from "./types.js";
import type { Homarus } from "./homarus.js";

export interface CompactionRecord {
  timestamp: number;
  loopRestarted: boolean;
}

export class CompactionManager {
  private compactedSinceLastWake = false;
  private logger: Logger;
  private loop: Homarus;

  // Compaction counter — persisted across backend restarts
  private compactionCount = 0;
  private compactionHistory: CompactionRecord[] = [];
  private pendingCompaction: CompactionRecord | null = null;
  private static readonly COUNTER_FILE = join(homedir(), ".homarus", "compaction-count.json");
  private static readonly MAX_COMPACTIONS = 8; // Auto-restart threshold

  // Event loop tracking — set true on first /api/wait call
  private eventLoopActive = false;

  constructor(loop: Homarus, logger: Logger) {
    this.loop = loop;
    this.logger = logger;
    this.compactionCount = this.loadCount();
  }

  private loadCount(): number {
    try {
      const data = JSON.parse(readFileSync(CompactionManager.COUNTER_FILE, "utf-8"));
      return typeof data.count === "number" ? data.count : 0;
    } catch {
      return 0;
    }
  }

  resetCount(): void {
    this.compactionCount = 0;
    this.compactionHistory = [];
    this.pendingCompaction = null;
    this.saveCount();
    this.logger.info("Compaction counter reset to 0");
  }

  private saveCount(): void {
    try {
      mkdirSync(dirname(CompactionManager.COUNTER_FILE), { recursive: true });
      writeFileSync(CompactionManager.COUNTER_FILE, JSON.stringify({ count: this.compactionCount }));
    } catch (err) {
      this.logger.warn("Failed to persist compaction count", { error: String(err) });
    }
  }

  handlePreCompact(): string {
    this.compactedSinceLastWake = true;

    // Track compaction
    this.compactionCount++;
    this.saveCount();
    const now = Date.now();
    this.pendingCompaction = { timestamp: now, loopRestarted: false };
    this.logger.info(`Compaction #${this.compactionCount} at ${new Date(now).toISOString()}`);

    // Gather rich context from the loop
    const timerNames = this.loop.getTimerService().getAll().map((t) => t.name);
    const memoryStats = this.loop.getMemoryIndex().getStats();
    const recentEvents = this.loop.getEventHistory().slice(-10);
    const eventSummary = recentEvents
      .map((e) => `[${e.type}] ${e.source}: ${JSON.stringify(e.payload).slice(0, 100)}`)
      .join("\n");

    // Read checkpoint from disk if available
    const checkpointData = this.readCheckpointFromDisk();

    const lines = [
      "IMPORTANT: Context compaction is about to occur. Save session state NOW.",
      "",
      "Save anything valuable:",
      "- Decisions made during this session",
      "- Task progress and current status",
      "- Important observations or findings",
      "- Any user preferences or corrections learned",
      "",
      `Active timers: ${timerNames.length > 0 ? timerNames.join(", ") : "none"}`,
      `Memory: ${memoryStats.fileCount} files, ${memoryStats.chunkCount} chunks indexed`,
      "",
      "Recent events:",
      eventSummary || "(none)",
    ];

    if (checkpointData) {
      lines.push("", "--- Session Checkpoint ---", checkpointData);
    }

    if (this.eventLoopActive) {
      lines.push(
        "",
        "CRITICAL: The event loop (bin/event-loop) was running before compaction.",
        "After compaction, you MUST restart it immediately:",
        '  bash "$PWD/bin/event-loop"',
      );
    }

    return lines.join("\n");
  }

  /**
   * Read the last N bytes of today's transcript file for post-compaction context.
   */
  private readTranscriptTail(maxBytes = 50_000): string {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const transcriptPath = join(homedir(), ".homarus", "transcripts", `${date}.md`);
      if (!existsSync(transcriptPath)) return "";

      const stat = statSync(transcriptPath);
      const size = stat.size;
      if (size === 0) return "";

      const readSize = Math.min(size, maxBytes);
      const offset = size - readSize;
      const buf = Buffer.alloc(readSize);
      const fd = openSync(transcriptPath, "r");
      readSync(fd, buf, 0, readSize, offset);
      closeSync(fd);

      let content = buf.toString("utf-8");
      // If we started mid-file, skip to the first complete section header
      if (offset > 0) {
        const firstHeader = content.indexOf("\n## ");
        if (firstHeader >= 0) {
          content = content.slice(firstHeader + 1);
        }
      }
      return content;
    } catch (err) {
      this.logger.warn("Failed to read transcript tail for post-compaction", { error: String(err) });
      return "";
    }
  }

  /**
   * Read recent memory entries with their content for post-compaction context.
   */
  private readRecentMemoryContent(limit = 10): string[] {
    try {
      const recentPaths = this.loop.getMemoryIndex().getRecentPaths(limit);
      const entries: string[] = [];
      for (const p of recentPaths) {
        try {
          const content = readFileSync(p, "utf-8").trim();
          const truncated = content.length > 500 ? content.slice(0, 500) + "..." : content;
          entries.push(`[${p}]\n${truncated}`);
        } catch {
          entries.push(`[${p}] (file not readable)`);
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Read checkpoint data from disk (shared with McpBackendServer).
   */
  private readCheckpointFromDisk(): string | null {
    try {
      const checkpointPath = join(homedir(), ".homarus", "checkpoint.json");
      if (!existsSync(checkpointPath)) return null;
      const data = JSON.parse(readFileSync(checkpointPath, "utf-8"));
      return JSON.stringify(data, null, 2);
    } catch {
      return null;
    }
  }

  handlePostCompact(): string {
    this.compactedSinceLastWake = true;

    this.logger.info("Post-compact context re-injection (enriched)");

    const timerNames = this.loop.getTimerService().getAll().map((t) => `${t.name} (${t.type})`);
    const memoryStats = this.loop.getMemoryIndex().getStats();
    const watermark = this.loop.getDeliveryWatermark();
    const recentEvents = this.loop.getEventHistory().slice(-25);

    const lines = [
      "Context was just compacted. Here is critical state:",
      "",
      `Event delivery watermark: ${watermark} (${watermark ? new Date(watermark).toISOString() : "none"})`,
      "The event loop will NOT replay events before this watermark — you are safe to restart it.",
      "",
    ];

    if (timerNames.length > 0) {
      lines.push(`Active timers: ${timerNames.join(", ")}`);
    }

    lines.push(`Memory index: ${memoryStats.fileCount} files, ${memoryStats.chunkCount} chunks`);

    if (this.loop.getIdentityManager().getSoul()) {
      lines.push("Identity: soul.md and user.md are loaded");
    }

    // Recent events with fuller payloads
    if (recentEvents.length > 0) {
      lines.push("", `Last ${recentEvents.length} events (already handled — do NOT re-process):`);
      for (const e of recentEvents) {
        const ts = new Date(e.timestamp).toISOString();
        const summary = JSON.stringify(e.payload).slice(0, 300);
        lines.push(`  [${ts}] ${e.type}/${e.source}: ${summary}`);
      }
    }

    // Recent memory content
    const memoryEntries = this.readRecentMemoryContent(15);
    if (memoryEntries.length > 0) {
      lines.push("", "--- Recent Memory Entries (content) ---");
      for (const entry of memoryEntries) {
        lines.push(entry, "");
      }
    }

    // Session checkpoint from disk
    const checkpointData = this.readCheckpointFromDisk();
    if (checkpointData) {
      lines.push("", "--- Session Checkpoint ---", checkpointData);
    }

    // Include active agents
    const agents = this.loop.getAgentRegistry().getAll().filter(a => a.status === "running");
    if (agents.length > 0) {
      lines.push("", "Running background agents:");
      for (const a of agents) {
        lines.push(`  - ${a.id}: ${a.description} (started ${new Date(a.startTime).toISOString()})`);
      }
    }

    if (this.eventLoopActive) {
      lines.push(
        "",
        "CRITICAL: The event loop was running before compaction. Restart it NOW:",
        '  bash "$PWD/bin/event-loop"',
      );
    }

    // Transcript tail for continuity
    const transcriptTail = this.readTranscriptTail(50_000);
    if (transcriptTail) {
      lines.push(
        "",
        "--- Recent Transcript (raw conversation for continuity) ---",
        "The following is the tail of today's transcript. Use it to understand the flow",
        "of conversation and pick up where you left off naturally.",
        "",
        transcriptTail,
      );
    }

    return lines.join("\n");
  }

  /**
   * Returns true if compaction occurred since the last /api/wait delivery.
   * Consuming this resets the flag.
   */
  consumeCompactionFlag(): boolean {
    if (this.compactedSinceLastWake) {
      this.compactedSinceLastWake = false;
      if (this.pendingCompaction) {
        this.pendingCompaction.loopRestarted = true;
        this.compactionHistory.push(this.pendingCompaction);
        this.pendingCompaction = null;
        this.logger.info(`Compaction #${this.compactionCount} — loop restarted successfully`);
      }
      return true;
    }
    return false;
  }

  /** Called on first /api/wait — marks event loop as active for this backend lifetime */
  setEventLoopActive(): void {
    if (!this.eventLoopActive) {
      this.eventLoopActive = true;
      this.logger.info("Event loop marked active — will instruct restart after compaction");
    }
  }

  isEventLoopActive(): boolean {
    return this.eventLoopActive;
  }

  getCompactionStats(): {
    count: number;
    history: CompactionRecord[];
    pending: CompactionRecord | null;
    loopFailures: number;
  } {
    const failures = this.compactionHistory.filter(c => !c.loopRestarted).length;
    return {
      count: this.compactionCount,
      history: [...this.compactionHistory, ...(this.pendingCompaction ? [this.pendingCompaction] : [])],
      pending: this.pendingCompaction,
      loopFailures: failures,
    };
  }

  shouldAutoRestart(): boolean {
    return this.compactionCount >= CompactionManager.MAX_COMPACTIONS;
  }
}

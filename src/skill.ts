// CRC: crc-Skill.md | Seq: seq-skill-callback.md
import { spawn, type ChildProcess } from "node:child_process";
import type { Event, SkillManifest, SkillState, ToolSchema, Logger } from "./types.js";
import {
  SkillTransport, HttpSkillTransport, StdioSkillTransport, DirectSkillTransport,
} from "./skill-transport.js";

export class Skill {
  readonly manifest: SkillManifest;
  private state: SkillState = "loaded";
  private transport: SkillTransport;
  private process: ChildProcess | null = null;
  private logger: Logger;
  private loopHandler: ((event: Event) => void) | null = null;

  constructor(manifest: SkillManifest, transport: SkillTransport, logger: Logger) {
    this.manifest = manifest;
    this.transport = transport;
    this.logger = logger;
  }

  getState(): SkillState {
    return this.state;
  }

  getTransport(): SkillTransport {
    return this.transport;
  }

  // CRC: crc-Skill.md — start()
  async start(): Promise<void> {
    if (this.state === "running") return;
    this.state = "starting";

    try {
      // Start child process if manifest defines one
      if (this.manifest.process) {
        const { command, args = [], port } = this.manifest.process;
        this.process = spawn(command, args, {
          stdio: this.transport.type === "stdio" ? ["pipe", "pipe", "pipe"] : "ignore",
          env: { ...process.env },
        });

        this.process.on("error", (err) => {
          this.logger.error("Skill process error", { skill: this.manifest.name, error: String(err) });
          this.state = "error";
        });

        this.process.on("exit", (code) => {
          this.logger.info("Skill process exited", { skill: this.manifest.name, code });
          if (this.state === "running") this.state = "stopped";
        });

        // Attach stdio transport to process
        if (this.transport instanceof StdioSkillTransport) {
          this.transport.attachProcess(this.process);
        }

        // Wait briefly for process to start
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      await this.transport.connect();

      // Wire transport events to loop
      this.transport.onEvent((event) => {
        this.loopHandler?.(event);
      });

      this.state = "running";
      this.logger.info("Skill started", { name: this.manifest.name, transport: this.transport.type });
    } catch (err) {
      this.state = "error";
      this.logger.error("Failed to start skill", { name: this.manifest.name, error: String(err) });
      throw err;
    }
  }

  // CRC: crc-Skill.md — stop()
  async stop(): Promise<void> {
    if (this.state === "stopped" || this.state === "loaded") return;
    this.state = "stopping";

    await this.transport.disconnect();

    if (this.process) {
      this.process.kill("SIGTERM");
      // Give it 5s to exit gracefully before SIGKILL
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.process?.kill("SIGKILL");
          resolve();
        }, 5000);
        this.process!.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      this.process = null;
    }

    this.state = "stopped";
    this.logger.info("Skill stopped", { name: this.manifest.name });
  }

  // CRC: crc-Skill.md — health()
  health(): boolean {
    if (this.state !== "running") return false;
    if (this.process && this.process.exitCode !== null) return false;
    return this.transport.isConnected();
  }

  // CRC: crc-Skill.md — emitToLoop()
  onLoopEvent(handler: (event: Event) => void): void {
    this.loopHandler = handler;
  }

  // CRC: crc-Skill.md — receiveFromLoop()
  async receiveFromLoop(event: Event): Promise<void> {
    await this.transport.send(event);
  }

  // CRC: crc-Skill.md — getTools()
  getTools(): ToolSchema[] {
    return this.manifest.tools ?? [];
  }

  // CRC: crc-Skill.md — getHandledEvents()
  getHandledEvents(): string[] {
    return this.manifest.handles ?? [];
  }

  // CRC: crc-Skill.md — getEmittedEvents()
  getEmittedEvents(): string[] {
    return this.manifest.emits ?? [];
  }
}

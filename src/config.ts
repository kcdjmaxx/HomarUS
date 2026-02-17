// CRC: crc-Config.md | Seq: seq-startup.md
import { readFileSync, existsSync, watchFile, unwatchFile } from "node:fs";
import { resolve, dirname } from "node:path";
import { config as loadDotenv } from "dotenv";
import type { ConfigData, Logger } from "./types.js";

const DEFAULT_CONFIG: ConfigData = {
  models: { default: "anthropic/claude-sonnet-4-5" },
  channels: {},
  agents: { maxConcurrent: 5, defaultTimeout: 300_000, defaultMaxTurns: 20 },
  memory: { search: { vectorWeight: 0.7, ftsWeight: 0.3 } },
  skills: { paths: [] },
  server: { port: 18800 },
  timers: { enabled: true },
  identity: {},
};

// Keys that can be hot-reloaded without restart
const SAFE_KEYS = new Set([
  "models.aliases",
  "models.fallback",
  "agents.maxConcurrent",
  "agents.defaultTimeout",
  "agents.defaultMaxTurns",
  "memory.search",
  "skills.paths",
  "timers.enabled",
]);

export class Config {
  private data: ConfigData = structuredClone(DEFAULT_CONFIG);
  private configPath: string;
  private watching = false;
  private logger: Logger;

  constructor(logger: Logger, configPath?: string) {
    this.logger = logger;
    this.configPath = configPath ?? this.resolveConfigPath();
  }

  // CRC: crc-Config.md — load()
  load(path?: string): ConfigData {
    if (path) this.configPath = path;
    this.loadEnvFile();

    if (!existsSync(this.configPath)) {
      this.logger.info("No config file found, using defaults", { path: this.configPath });
      return this.data;
    }

    const raw = readFileSync(this.configPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const resolved = this.resolveEnvVars(parsed);
    this.data = this.merge(DEFAULT_CONFIG, resolved as Partial<ConfigData>);
    this.logger.info("Config loaded", { path: this.configPath });
    return this.data;
  }

  // CRC: crc-Config.md — get()
  get<T = unknown>(key: string): T | undefined {
    const parts = key.split(".");
    let current: unknown = this.data;
    for (const part of parts) {
      if (current == null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current as T;
  }

  // CRC: crc-Config.md — getSection()
  getSection<T = unknown>(section: string): T {
    return (this.data as unknown as Record<string, unknown>)[section] as T;
  }

  getAll(): ConfigData {
    return this.data;
  }

  // CRC: crc-Config.md — resolveEnvVars()
  private resolveEnvVars(obj: unknown): unknown {
    if (typeof obj === "string") {
      return obj.replace(/\$\{([^}]+)\}/g, (_, varName: string) => {
        return process.env[varName] ?? "";
      });
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.resolveEnvVars(item));
    }
    if (obj !== null && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        result[key] = this.resolveEnvVars(value);
      }
      return result;
    }
    return obj;
  }

  // CRC: crc-Config.md — loadEnvFile()
  private loadEnvFile(): void {
    const envPath = resolve(dirname(this.configPath), ".env");
    if (existsSync(envPath)) {
      loadDotenv({ path: envPath });
      this.logger.debug("Loaded .env file", { path: envPath });
    }
  }

  // CRC: crc-Config.md — startWatching()
  startWatching(onChange: (safeChange: boolean) => void): void {
    if (this.watching) return;
    this.watching = true;

    watchFile(this.configPath, { interval: 2000 }, () => {
      try {
        const oldData = structuredClone(this.data);
        this.load();
        const safe = this.isSafeChange(oldData, this.data);
        if (!safe) {
          this.logger.warn("Config change requires restart for full effect");
        }
        onChange(safe);
      } catch (err) {
        this.logger.error("Failed to reload config", { error: String(err) });
      }
    });
  }

  // CRC: crc-Config.md — stopWatching()
  stopWatching(): void {
    if (!this.watching) return;
    unwatchFile(this.configPath);
    this.watching = false;
  }

  // CRC: crc-Config.md — isSafeChange()
  private isSafeChange(oldConfig: ConfigData, newConfig: ConfigData): boolean {
    const oldJson = JSON.stringify(oldConfig);
    const newJson = JSON.stringify(newConfig);
    if (oldJson === newJson) return true;

    // Check if only safe keys changed
    const oldFlat = this.flatten(oldConfig);
    const newFlat = this.flatten(newConfig);
    const allKeys = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)]);

    for (const key of allKeys) {
      if (JSON.stringify(oldFlat[key]) !== JSON.stringify(newFlat[key])) {
        const isSafe = [...SAFE_KEYS].some((sk) => key.startsWith(sk));
        if (!isSafe) return false;
      }
    }
    return true;
  }

  private resolveConfigPath(): string {
    // Check project-level first, then user-level
    const projectPath = resolve(process.cwd(), "homarus.json");
    if (existsSync(projectPath)) return projectPath;

    const home = process.env.HOME ?? process.env.USERPROFILE ?? "~";
    return resolve(home, ".homarus", "config.json");
  }

  private merge(defaults: ConfigData, overrides: Partial<ConfigData>): ConfigData {
    const result = structuredClone(defaults);
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined && value !== null) {
        const resultObj = result as unknown as Record<string, unknown>;
        if (typeof value === "object" && !Array.isArray(value) && typeof resultObj[key] === "object") {
          resultObj[key] = {
            ...(resultObj[key] as Record<string, unknown>),
            ...(value as Record<string, unknown>),
          };
        } else {
          resultObj[key] = value;
        }
      }
    }
    return result;
  }

  private flatten(obj: unknown, prefix = ""): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
          Object.assign(result, this.flatten(value, fullKey));
        } else {
          result[fullKey] = value;
        }
      }
    }
    return result;
  }
}

#!/usr/bin/env node
// CRC: crc-CLI.md | Seq: seq-startup.md
import { resolve } from "node:path";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { Homarus } from "./homarus.js";
import type { Logger } from "./types.js";

const logger: Logger = {
  debug: (msg, meta) => { if (process.env.DEBUG) console.error(`[DEBUG] ${msg}`, meta ?? ""); },
  info: (msg, meta) => console.error(`[INFO] ${msg}`, meta ? JSON.stringify(meta) : ""),
  warn: (msg, meta) => console.error(`[WARN] ${msg}`, meta ? JSON.stringify(meta) : ""),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta ? JSON.stringify(meta) : ""),
};

const [,, command, ...args] = process.argv;

async function main(): Promise<void> {
  switch (command) {
    case "start":
      return start();
    case "init":
      return init();
    case "status":
      return status();
    case "config":
      return configValidate();
    case "skills":
      return skillList();
    case "install-daemon":
      return installDaemon();
    default:
      printUsage();
  }
}

// CRC: crc-CLI.md — start()
async function start(): Promise<void> {
  const loop = new Homarus(logger, args[0]);

  // Graceful shutdown on signals
  const shutdown = async () => {
    logger.info("Shutdown signal received");
    await loop.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await loop.start();
}

// CRC: crc-CLI.md — init()
function init(): void {
  const home = process.env.HOME ?? ".";
  const configDir = resolve(home, ".homarus");
  const configPath = resolve(configDir, "config.json");

  if (existsSync(configPath)) {
    logger.info("Config already exists", { path: configPath });
    return;
  }

  mkdirSync(configDir, { recursive: true });
  mkdirSync(resolve(configDir, "identity"), { recursive: true });
  mkdirSync(resolve(configDir, "identity/overlays"), { recursive: true });
  mkdirSync(resolve(configDir, "workspace"), { recursive: true });
  mkdirSync(resolve(configDir, "memory"), { recursive: true });
  mkdirSync(resolve(configDir, "skills"), { recursive: true });

  const defaultConfig = {
    models: {
      default: "anthropic/claude-sonnet-4-5",
      aliases: { smart: "anthropic/claude-opus-4-5", fast: "anthropic/claude-haiku-4-5" },
      providers: {
        anthropic: { apiKey: "${ANTHROPIC_API_KEY}" },
      },
    },
    channels: { cli: {} },
    agents: { maxConcurrent: 5, defaultTimeout: 300000, defaultMaxTurns: 20 },
    memory: { embedding: { provider: "ollama", model: "nomic-embed-text", baseUrl: "http://127.0.0.1:11434/v1" } },
    skills: { paths: [resolve(configDir, "skills")] },
    server: { port: 18800 },
    timers: { enabled: true },
    identity: { dir: resolve(configDir, "identity"), workspaceDir: resolve(configDir, "workspace") },
  };

  writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  writeFileSync(resolve(configDir, "identity/soul.md"), "# Soul\n\nYou are a helpful AI assistant.");
  writeFileSync(resolve(configDir, "identity/user.md"), "# User\n\nNo user profile configured.");

  logger.info("Initialized homarus", { configDir });
  console.log(`Config created at ${configPath}`);
  console.log("Edit the config to add your API keys and customize settings.");
}

// CRC: crc-CLI.md — status()
async function status(): Promise<void> {
  const port = args[0] ?? "18800";
  try {
    const response = await fetch(`http://localhost:${port}/status`);
    if (!response.ok) {
      console.log(`Status check failed: ${response.status}`);
      return;
    }
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch {
    console.log("Event loop is not running or not reachable.");
  }
}

// CRC: crc-CLI.md — configValidate()
async function configValidate(): Promise<void> {
  const { Config } = await import("./config.js");
  const config = new Config(logger, args[0]);
  try {
    config.load();
    console.log("Config is valid.");
  } catch (err) {
    console.error("Config validation failed:", String(err));
    process.exit(1);
  }
}

// CRC: crc-CLI.md — skillList()
function skillList(): void {
  console.log("Use `homarus status` to see loaded skills from a running instance.");
}

// CRC: crc-CLI.md — installDaemon()
function installDaemon(): void {
  const home = process.env.HOME ?? ".";
  const platform = process.platform;

  if (platform === "darwin") {
    const plistPath = resolve(home, "Library/LaunchAgents/com.homarus.plist");
    const nodePath = process.execPath;
    const cliPath = resolve(import.meta.dirname ?? ".", "cli.js");

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.homarus</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${cliPath}</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${home}/.homarus/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>${home}/.homarus/stderr.log</string>
</dict>
</plist>`;
    writeFileSync(plistPath, plist);
    console.log(`LaunchAgent plist written to ${plistPath}`);
    console.log("Run: launchctl load " + plistPath);
  } else {
    // systemd
    const servicePath = resolve(home, ".config/systemd/user/homarus.service");
    const serviceDir = resolve(home, ".config/systemd/user");
    mkdirSync(serviceDir, { recursive: true });

    const nodePath = process.execPath;
    const cliPath = resolve(import.meta.dirname ?? ".", "cli.js");

    const unit = `[Unit]
Description=Homarus Agent
After=network.target

[Service]
ExecStart=${nodePath} ${cliPath} start
Restart=on-failure
RestartSec=5
KillMode=control-group

[Install]
WantedBy=default.target
`;
    writeFileSync(servicePath, unit);
    console.log(`Systemd service written to ${servicePath}`);
    console.log("Run: systemctl --user daemon-reload && systemctl --user enable --now homarus");
  }
}

function printUsage(): void {
  console.log(`homarus - Event-driven AI agent coordinator

Usage:
  homarus start [config-path]   Start the event loop (foreground)
  homarus init                  Create default config and directories
  homarus status [port]         Show status of running instance
  homarus config [config-path]  Validate config file
  homarus skills                List loaded skills
  homarus install-daemon        Install systemd/launchd service
`);
}

main().catch((err) => {
  logger.error("Fatal error", { error: String(err) });
  process.exit(1);
});

// CRC: crc-CLI.md | Seq: seq-startup.md
// Interactive setup wizard for `homarus init`

import * as readline from "node:readline";
import { Writable } from "node:stream";
import { resolve } from "node:path";

interface ProviderPreset {
  name: string;
  envVar: string;
  baseUrl?: string;
  models: string[];
  defaultModel: string;
  needsKey: boolean;
}

const PROVIDERS: ProviderPreset[] = [
  {
    name: "Anthropic (Claude)",
    envVar: "ANTHROPIC_API_KEY",
    models: ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"],
    defaultModel: "claude-sonnet-4-5",
    needsKey: true,
  },
  {
    name: "OpenAI (GPT)",
    envVar: "OPENAI_API_KEY",
    models: ["gpt-5", "gpt-5-mini"],
    defaultModel: "gpt-5",
    needsKey: true,
  },
  {
    name: "OpenRouter (multi-provider, recommended)",
    envVar: "OPENROUTER_API_KEY",
    models: ["anthropic/claude-sonnet-4-5", "moonshotai/kimi-k2.5", "openai/gpt-5"],
    defaultModel: "anthropic/claude-sonnet-4-5",
    needsKey: true,
  },
  {
    name: "Ollama (local, free)",
    envVar: "",
    baseUrl: "http://127.0.0.1:11434/v1",
    models: ["llama3"],
    defaultModel: "llama3",
    needsKey: false,
  },
];

const PROVIDER_KEY_MAP: Record<string, string> = {
  "Anthropic (Claude)": "anthropic",
  "OpenAI (GPT)": "openai",
  "OpenRouter (multi-provider, recommended)": "openrouter",
  "Ollama (local, free)": "ollama",
};

export interface WizardResult {
  providerKey: string;
  provider: ProviderPreset;
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  telegram: {
    enabled: boolean;
    botToken?: string;
    dmPolicy?: string;
    groupPolicy?: string;
  };
}

let rl: readline.Interface;

function createRL(): void {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function closeRL(): void {
  rl.close();
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function askSecret(question: string): Promise<string> {
  // Close the main rl so we can take over stdin
  closeRL();

  // Use a muted output stream so readline doesn't echo input
  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

  process.stdout.write(question);

  const secretRL = readline.createInterface({
    input: process.stdin,
    output: muted,
    terminal: true,
  });

  return new Promise((res) => {
    secretRL.question("", (answer) => {
      secretRL.close();
      process.stdout.write("\n");
      // Reopen the main readline for subsequent prompts
      createRL();
      res(answer.trim());
    });
  });
}

async function select(question: string, options: string[]): Promise<number> {
  console.log(question);
  for (let i = 0; i < options.length; i++) {
    console.log(`  ${i + 1}. ${options[i]}`);
  }

  while (true) {
    const answer = await ask("> ");
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= options.length) {
      return num - 1;
    }
    console.log(`Please enter a number between 1 and ${options.length}.`);
  }
}

async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? "(Y/n)" : "(y/N)";
  const answer = await ask(`${question} ${hint} `);
  if (answer === "") return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

export async function runSetupWizard(): Promise<WizardResult> {
  createRL();

  try {
    console.log("\n🦞 Homarus Setup Wizard\n");

    // Step 1: Provider selection
    const providerIndex = await select(
      "Which model provider would you like to use?",
      PROVIDERS.map((p) => p.name),
    );
    const provider = PROVIDERS[providerIndex];
    const providerKey = PROVIDER_KEY_MAP[provider.name];

    // Step 2: API Key
    let apiKey = "";
    let baseUrl = provider.baseUrl;

    if (provider.needsKey) {
      apiKey = await askSecret(`Enter your ${provider.envVar}: `);
      if (!apiKey) {
        console.log(`Warning: No API key provided. Set ${provider.envVar} in ~/.homarus/.env later.`);
      }
    } else {
      // Ollama — ask for base URL
      const customUrl = await ask(`Ollama base URL (${provider.baseUrl}): `);
      if (customUrl) {
        baseUrl = customUrl;
      }
    }

    // Step 3: Default model
    let defaultModel: string;
    if (providerKey === "ollama") {
      const modelAnswer = await ask(`Default model (${provider.defaultModel}): `);
      defaultModel = modelAnswer || provider.defaultModel;
    } else {
      const modelIndex = await select(
        "Which default model?",
        provider.models.map((m, i) => (i === 0 ? `${m} (default)` : m)),
      );
      defaultModel = provider.models[modelIndex];
    }

    // Step 4: Telegram setup
    const telegramEnabled = await confirm("\nWould you like to set up Telegram?", false);

    let botToken = "";
    let dmPolicy = "open";
    let groupPolicy = "mention_required";

    if (telegramEnabled) {
      console.log("\nTo create a Telegram bot:");
      console.log("  1. Open @BotFather in Telegram");
      console.log("  2. Send /newbot and follow the prompts");
      console.log("  3. Copy the bot token\n");

      botToken = await askSecret("Enter your Telegram bot token: ");

      const dmIndex = await select("DM policy:", ["open (default)", "allowlist", "disabled"]);
      dmPolicy = ["open", "allowlist", "disabled"][dmIndex];

      const groupIndex = await select("Group policy:", [
        "mention_required (default)",
        "always_on",
        "disabled",
      ]);
      groupPolicy = ["mention_required", "always_on", "disabled"][groupIndex];
    }

    // Step 5: Summary
    console.log("\n--- Configuration Summary ---");
    console.log(`  Provider:  ${provider.name}`);
    console.log(`  Model:     ${defaultModel}`);
    console.log(`  API Key:   ${apiKey ? "****" + apiKey.slice(-4) : "(not set)"}`);
    if (baseUrl) console.log(`  Base URL:  ${baseUrl}`);
    console.log(`  Telegram:  ${telegramEnabled ? "enabled" : "disabled"}`);
    if (telegramEnabled) {
      console.log(`    Token:   ${botToken ? "****" + botToken.slice(-4) : "(not set)"}`);
      console.log(`    DM:      ${dmPolicy}`);
      console.log(`    Groups:  ${groupPolicy}`);
    }
    console.log("");

    return {
      providerKey,
      provider,
      apiKey,
      baseUrl,
      defaultModel,
      telegram: {
        enabled: telegramEnabled,
        botToken: botToken || undefined,
        dmPolicy,
        groupPolicy,
      },
    };
  } finally {
    closeRL();
  }
}

export function buildConfigFromWizard(result: WizardResult, configDir: string): {
  config: Record<string, unknown>;
  envLines: string[];
} {
  const providerConfig: Record<string, unknown> = {};

  if (result.provider.needsKey) {
    providerConfig.apiKey = `\${${result.provider.envVar}}`;
  }
  if (result.baseUrl) {
    providerConfig.baseUrl = result.baseUrl;
  }

  const channels: Record<string, unknown> = { cli: {} };
  if (result.telegram.enabled) {
    channels.telegram = {
      token: "${TELEGRAM_BOT_TOKEN}",
      dmPolicy: result.telegram.dmPolicy ?? "open",
      groupPolicy: result.telegram.groupPolicy ?? "mention_required",
    };
  }

  const config = {
    models: {
      default: result.defaultModel,
      aliases: {},
      providers: {
        [result.providerKey]: providerConfig,
      },
    },
    channels,
    agents: { maxConcurrent: 5, defaultTimeout: 300000, defaultMaxTurns: 20 },
    memory: {
      embedding: {
        provider: "ollama",
        model: "nomic-embed-text",
        baseUrl: "http://127.0.0.1:11434/v1",
      },
    },
    skills: { paths: [resolve(configDir, "skills")] },
    server: { port: 18800 },
    timers: { enabled: true },
    identity: {
      dir: resolve(configDir, "identity"),
      workspaceDir: resolve(configDir, "workspace"),
    },
  };

  const envLines: string[] = [];
  if (result.apiKey && result.provider.envVar) {
    envLines.push(`${result.provider.envVar}=${result.apiKey}`);
  }
  if (result.telegram.botToken) {
    envLines.push(`TELEGRAM_BOT_TOKEN=${result.telegram.botToken}`);
  }

  return { config, envLines };
}

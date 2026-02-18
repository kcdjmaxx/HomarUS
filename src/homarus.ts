// CRC: crc-Homarus.md | Seq: seq-startup.md, seq-message-dispatch.md, seq-shutdown.md
import { v4 as uuid } from "uuid";
import type { Event, AgentConfig, AgentResult, ConfigData, Logger, MessagePayload } from "./types.js";
import { Config } from "./config.js";
import { EventBus } from "./event-bus.js";
import { EventQueue } from "./event-queue.js";
import { AgentManager } from "./agent-manager.js";
import { SkillManager } from "./skill-manager.js";
import { ChannelManager } from "./channel-manager.js";
import { ToolRegistry } from "./tool-registry.js";
import { ModelRouter } from "./model-router.js";
import { MemoryIndex } from "./memory-index.js";
import { IdentityManager } from "./identity-manager.js";
import { TimerService } from "./timer-service.js";
import { HttpApi } from "./http-api.js";
import { OpenAICompatibleProvider, AnthropicProvider } from "./model-provider.js";
import { BrowserManager } from "./browser-manager.js";
import { createEmbeddingProvider } from "./embedding-provider.js";
import { registerBuiltinTools } from "./tools/index.js";

export type LoopState = "starting" | "running" | "stopping" | "stopped";

export class Homarus {
  private state: LoopState = "stopped";
  private config: Config;
  private eventBus: EventBus;
  private eventQueue: EventQueue;
  private agentManager!: AgentManager;
  private skillManager!: SkillManager;
  private channelManager: ChannelManager;
  private toolRegistry: ToolRegistry;
  private modelRouter!: ModelRouter;
  private memoryIndex: MemoryIndex;
  private identityManager: IdentityManager;
  private timerService!: TimerService;
  private httpApi!: HttpApi;
  private browserManager: BrowserManager | null = null;
  private logger: Logger;
  private processing = false;
  private processInterval: ReturnType<typeof setInterval> | null = null;

  constructor(logger: Logger, configPath?: string) {
    this.logger = logger;
    this.config = new Config(logger, configPath);
    this.eventBus = new EventBus(logger);
    this.eventQueue = new EventQueue(logger);
    this.toolRegistry = new ToolRegistry(logger);
    this.memoryIndex = new MemoryIndex(logger);
    this.channelManager = new ChannelManager(logger);
    this.identityManager = new IdentityManager(logger, "", "");
  }

  getState(): LoopState {
    return this.state;
  }

  // CRC: crc-Homarus.md — emit()
  emit(event: Event): void {
    this.eventQueue.enqueue(event);
  }

  // CRC: crc-Homarus.md — registerHandler()
  registerHandler(eventType: string, handler: (event: Event) => void | Promise<void>): void {
    this.eventBus.registerDirect(eventType, handler);
  }

  // CRC: crc-Homarus.md — registerAgentHandler()
  registerAgentHandler(eventType: string, agentConfig: Partial<AgentConfig>, buildPrompt?: (event: Event) => string): void {
    this.eventBus.registerAgent(eventType, {
      id: uuid(),
      agentConfig,
      buildPrompt,
    });
  }

  // CRC: crc-Homarus.md — start()
  async start(): Promise<void> {
    this.state = "starting";
    this.logger.info("Event loop starting...");

    // 1. Load config
    const configData = this.config.load();

    // 2. Identity
    const identityDir = configData.identity?.dir ?? "";
    const workspaceDir = configData.identity?.workspaceDir ?? "";
    this.identityManager = new IdentityManager(this.logger, identityDir, workspaceDir);
    if (identityDir) this.identityManager.load();

    // 3. Model router
    this.modelRouter = new ModelRouter(this.logger, configData.models.default);
    if (configData.models.aliases) {
      this.modelRouter.setAliases(configData.models.aliases);
    }
    if (configData.models.fallback) {
      this.modelRouter.setFallbackChain(configData.models.fallback);
    }
    this.initProviders(configData);

    // 4. Agent manager
    this.agentManager = new AgentManager(
      this.logger,
      this.modelRouter,
      this.toolRegistry,
      this.identityManager,
      {
        maxConcurrent: configData.agents?.maxConcurrent,
        defaultTimeout: configData.agents?.defaultTimeout,
        defaultMaxTurns: configData.agents?.defaultMaxTurns,
      },
    );
    this.agentManager.setEmitter((e) => this.emit(e));

    // 5. Memory
    const home = process.env.HOME ?? ".";
    const memoryConfig = configData.memory;
    if (memoryConfig?.embedding) {
      // Create embedding provider from config
      const embeddingProvider = createEmbeddingProvider({
        provider: memoryConfig.embedding.provider,
        model: memoryConfig.embedding.model,
        baseUrl: memoryConfig.embedding.baseUrl,
        apiKey: memoryConfig.embedding.apiKey,
        dimensions: memoryConfig.embedding.dimensions,
      }, this.logger);
      this.memoryIndex.setEmbeddingProvider(embeddingProvider);

      const dbPath = `${home}/.homarus/memory/index.sqlite`;
      try {
        await this.memoryIndex.initialize(dbPath);
        if (memoryConfig.extraPaths) {
          for (const p of memoryConfig.extraPaths) {
            await this.memoryIndex.indexDirectory(p);
          }
        }
      } catch (err) {
        this.logger.warn("Memory initialization failed", { error: String(err) });
      }
    }

    // 5b. Browser (lazy — launches on first tool use)
    if (configData.browser?.enabled) {
      this.browserManager = new BrowserManager(this.logger, configData.browser);
    }

    // 5c. Register built-in tools
    registerBuiltinTools(this.toolRegistry, this.memoryIndex, this.browserManager, this.logger);

    // 6. Skill manager
    this.skillManager = new SkillManager(
      this.logger,
      this.eventBus,
      this.toolRegistry,
      configData.skills?.paths ?? [],
    );
    this.skillManager.setLoopEmitter((e) => this.emit(e));
    await this.skillManager.loadAll();

    // 7. Timer service
    const timerStore = configData.timers?.store ?? `${home}/.homarus/timers.json`;
    this.timerService = new TimerService(this.logger, timerStore);
    this.timerService.setEmitter((e) => this.emit(e));
    this.timerService.loadTimers();
    if (configData.timers?.enabled !== false) {
      this.timerService.start();
    }

    // 8. Channels
    this.channelManager.setEventHandler((e) => this.emit(e));
    this.channelManager.loadAdapters(configData.channels);
    await this.channelManager.connectAll();

    // 9. HTTP API
    const serverPort = configData.server?.port ?? 18800;
    const authToken = configData.server?.auth?.token;
    this.httpApi = new HttpApi(this.logger, serverPort, authToken);
    this.httpApi.setEventHandler((e) => this.emit(e));
    this.httpApi.setStatusProvider(() => this.getStatus());
    await this.httpApi.start();

    // 10. Register default message handler
    this.registerDefaultHandlers();

    // 11. Config hot-reload
    this.config.startWatching((safe) => {
      if (safe) this.logger.info("Config hot-reloaded");
    });

    // 12. Start event processing loop
    this.state = "running";
    this.startProcessing();
    this.logger.info("Event loop running");
  }

  // CRC: crc-Homarus.md — stop()
  async stop(): Promise<void> {
    if (this.state === "stopped") return;
    this.state = "stopping";
    this.logger.info("Event loop stopping...");

    this.stopProcessing();
    this.config.stopWatching();
    this.timerService.stop();
    this.agentManager.cancelAll();
    await this.agentManager.waitForAll(10_000);
    await this.channelManager.disconnectAll();
    await this.skillManager.stopAll();
    this.skillManager.stopWatching();
    this.memoryIndex.stopWatching();
    if (this.browserManager) await this.browserManager.close();
    await this.httpApi.stop();

    // Drain remaining events
    const remaining = this.eventQueue.clear();
    if (remaining.length > 0) {
      this.logger.info("Drained remaining events", { count: remaining.length });
    }

    this.state = "stopped";
    this.logger.info("Event loop stopped");
  }

  // CRC: crc-Homarus.md — processEvent()
  private async processEvent(event: Event): Promise<void> {
    const handlers = this.eventBus.getHandlers(event.type);

    // Execute direct handlers
    for (const handler of handlers.direct) {
      try {
        await handler(event);
      } catch (err) {
        this.logger.error("Direct handler failed", { eventType: event.type, error: String(err) });
      }
    }

    // Spawn agents for agent handlers
    for (const agentHandler of handlers.agent) {
      if (!this.agentManager.canSpawn()) {
        this.logger.warn("Cannot spawn agent, max concurrent reached", { eventType: event.type });
        // Re-queue with lower priority
        this.emit({ ...event, priority: (event.priority ?? 0) - 1 });
        continue;
      }

      const prompt = agentHandler.buildPrompt
        ? agentHandler.buildPrompt(event)
        : `Handle event: ${JSON.stringify(event.payload)}`;

      const config: AgentConfig = {
        ...agentHandler.agentConfig,
        prompt,
        replyTo: event.replyTo ?? event.source,
      };

      try {
        await this.agentManager.spawn(config);
      } catch (err) {
        this.logger.error("Failed to spawn agent", { error: String(err) });
      }
    }
  }

  private startProcessing(): void {
    this.processInterval = setInterval(() => {
      if (this.processing || this.state !== "running") return;
      this.processing = true;
      this.processNext()
        .catch((err) => this.logger.error("Event processing error", { error: String(err) }))
        .finally(() => { this.processing = false; });
    }, 50); // Check queue every 50ms
  }

  private stopProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }

  private async processNext(): Promise<void> {
    const event = this.eventQueue.dequeue();
    if (!event) return;
    await this.processEvent(event);
  }

  private registerDefaultHandlers(): void {
    // Default message handler: spawn an agent for incoming messages
    this.registerAgentHandler("message", {}, (event) => {
      const payload = event.payload as MessagePayload;
      return payload.text;
    });

    // Route agent results back to the originating channel
    this.registerHandler("agent_complete", async (event) => {
      const payload = event.payload as {
        agentId: string;
        result?: AgentResult;
        state: string;
      };
      if (!payload.result?.output) return;

      // replyTo format: "channel:<name>" with optional ":<target>" for chat IDs
      const replyTo = event.replyTo ?? "";
      if (!replyTo.startsWith("channel:")) return;

      const parts = replyTo.substring("channel:".length);
      const colonIdx = parts.indexOf(":");
      const channelName = colonIdx > 0 ? parts.substring(0, colonIdx) : parts;
      const target = colonIdx > 0 ? parts.substring(colonIdx + 1) : "";

      try {
        await this.channelManager.send(channelName, target, { text: payload.result.output });
      } catch (err) {
        this.logger.error("Failed to send agent reply", { channel: channelName, error: String(err) });
      }
    });
  }

  private initProviders(configData: ConfigData): void {
    const providers = configData.models.providers ?? {};

    for (const [id, providerConfig] of Object.entries(providers)) {
      const apiKey = providerConfig.apiKey ?? "";
      const profile = { apiKey };

      if (id === "anthropic") {
        this.modelRouter.registerProvider(new AnthropicProvider(profile, this.logger));
      } else {
        const baseUrl = providerConfig.baseUrl ?? `https://api.${id}.com/v1`;
        this.modelRouter.registerProvider(
          new OpenAICompatibleProvider(id, baseUrl, profile, this.logger),
        );
      }

      if (providerConfig.profiles) {
        this.modelRouter.setAuthProfiles(id, providerConfig.profiles);
      }
    }
  }

  private getStatus(): Record<string, unknown> {
    return {
      state: this.state,
      agents: {
        active: this.agentManager.activeCount(),
      },
      queue: {
        size: this.eventQueue.size(),
      },
      channels: this.channelManager.healthCheck(),
      skills: this.skillManager.getAll().map((s) => ({
        name: s.manifest.name,
        state: s.getState(),
      })),
      memory: this.memoryIndex.getStats(),
      usage: Object.fromEntries(this.modelRouter.getUsage()),
    };
  }
}

// Shared types for homarus
// CRC: crc-Homarus.md, crc-Agent.md, crc-Skill.md, crc-ModelProvider.md, crc-ChannelAdapter.md, crc-ToolRegistry.md

// --- Events ---

export interface Event {
  id: string;
  type: string;
  source: string;
  timestamp: number;
  payload: unknown;
  replyTo?: string;
  priority?: number;
}

export interface MessagePayload {
  from: string;
  channel: string;
  text: string;
  attachments?: Attachment[];
  replyTo?: string;
  isGroup: boolean;
  isMention: boolean;
  raw: unknown;
}

export interface Attachment {
  type: string;
  url?: string;
  data?: Buffer;
  mimeType?: string;
  filename?: string;
}

export interface OutboundMessage {
  text: string;
  attachments?: Attachment[];
  replyTo?: string;
}

// --- Agents ---

export interface AgentConfig {
  prompt: string;
  model?: string;
  tools?: string[];
  timeout?: number;
  maxTurns?: number;
  systemPrompt?: string;
  memory?: boolean;
  sandbox?: boolean;
  channel?: string;
  taskOverlay?: string;
  replyTo?: string;
}

export type AgentState = "pending" | "running" | "complete" | "failed" | "cancelled";

export interface AgentResult {
  output: string;
  toolCalls: ToolCallRecord[];
  usage: TokenUsage;
}

export interface ToolCallRecord {
  tool: string;
  params: unknown;
  result: unknown;
  durationMs: number;
}

// --- Models ---

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatChunk {
  content?: string;
  toolCalls?: ToolCall[];
  finishReason?: "stop" | "tool_calls" | "length" | "error";
  usage?: TokenUsage;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  maxOutput?: number;
}

export interface AuthProfile {
  apiKey: string;
  cooldownUntil?: number;
  failCount?: number;
}

// --- Tools ---

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: unknown, context: ToolContext) => Promise<ToolResult>;
  source: string;
}

export interface ToolContext {
  agentId: string;
  sandbox: boolean;
  workingDir: string;
}

export interface ToolResult {
  output: string;
  error?: string;
}

// --- Skills ---

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  emits?: string[];
  handles?: string[];
  tools?: ToolSchema[];
  process?: {
    command: string;
    args?: string[];
    port?: number;
    healthCheck?: string;
  };
  hooks?: {
    onStart?: string;
    onStop?: string;
    onHealth?: string;
  };
}

export type SkillState = "loaded" | "starting" | "running" | "stopping" | "stopped" | "error";
export type TransportType = "http" | "stdio" | "direct";

// --- Channels ---

export type DmPolicy = "pairing" | "allowlist" | "open" | "disabled";
export type GroupPolicy = "mention_required" | "always_on" | "disabled";

export interface HealthStatus {
  healthy: boolean;
  message?: string;
  lastCheck: number;
}

// --- Browser ---

export interface BrowserConfig {
  enabled?: boolean;
  headless?: boolean;
  executablePath?: string;
  proxy?: string;
  viewport?: { width: number; height: number };
  timeout?: number;
}

// --- Config ---

export interface ConfigData {
  models: ModelsConfig;
  channels: Record<string, ChannelConfig>;
  agents: AgentsConfig;
  memory: MemoryConfig;
  skills: SkillsConfig;
  server: ServerConfig;
  timers: TimersConfig;
  identity: IdentityConfig;
  browser?: BrowserConfig;
}

export interface ModelsConfig {
  default: string;
  fallback?: string[];
  aliases?: Record<string, string>;
  providers?: Record<string, ProviderConfig>;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  profiles?: AuthProfile[];
}

export interface ChannelConfig {
  token?: string;
  dmPolicy?: DmPolicy;
  groupPolicy?: GroupPolicy;
  [key: string]: unknown;
}

export interface AgentsConfig {
  maxConcurrent?: number;
  defaultTimeout?: number;
  defaultMaxTurns?: number;
}

export interface MemoryConfig {
  embedding?: { provider: string; model: string; baseUrl?: string };
  search?: { vectorWeight?: number; ftsWeight?: number };
  extraPaths?: string[];
}

export interface SkillsConfig {
  paths?: string[];
}

export interface ServerConfig {
  port?: number;
  auth?: { token: string };
}

export interface TimersConfig {
  enabled?: boolean;
  store?: string;
}

export interface IdentityConfig {
  dir?: string;
  workspaceDir?: string;
}

// --- Handlers ---

export type DirectHandler = (event: Event) => void | Promise<void>;

export interface AgentHandlerConfig {
  id: string;
  agentConfig: Partial<AgentConfig>;
  buildPrompt?: (event: Event) => string;
}

// --- Logging ---

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

// --- Errors ---

export class HomarusError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "HomarusError";
  }
}

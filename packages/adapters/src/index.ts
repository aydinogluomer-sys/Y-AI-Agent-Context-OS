/**
 * P11 — Agent adapter katmani (barrel).
 *
 * Bu paket VENDOR-NEUTRAL sozlesmeyi tanimlar. Somut adapter'lar
 * sozlesmeyi uygular; Y hicbir vendor'un ic reasoning formatina
 * baglanmaz (ADR-042).
 */

export {
  AdapterError,
  assertStartInput,
  type AgentAdapter,
  type AgentAdapterId,
  type AgentCapabilities,
  type AgentEvent,
  type AgentEventKind,
  type AgentSession,
  type AgentStartInput,
  type HealthResult,
  type HealthStatus,
  type RateLimitSpec,
  type TaskSpec,
  type ToolSpec,
  type WorkspaceRef
} from "./types";

export { AdapterRegistry, UnconfiguredAdapter } from "./registry";
export { ClaudeCodeAdapter, claudeCodeConfigFromEnv, type ClaudeCodeConfig } from "./claude-code";
export { CodexAdapter, codexConfigFromEnv, type CodexConfig } from "./codex";

/**
 * P11 / Y-P11-003 — Codex adapter.
 *
 * DURUM: Claude Code adapter'ıyla AYNI — sözleşme hazır, wire-up eksik.
 * `openai` bağımlılığı kurulmadı; sebep faz kaydında yazılı.
 *
 * İKİ ADAPTER NEDEN NEREDEYSE AYNI GÖRÜNÜYOR
 *   Çünkü sözleşme vendor-neutral (ADR-042). Farklar YETENEKLERDE
 *   olmalı, yapıda değil. İki adapter'ın yapısal olarak farklılaşması,
 *   soyutlamanın sızdırdığının işaretidir.
 *
 *   Somut farklar: araç kümesi, MCP desteği ve context limiti.
 */

import {
  AdapterError,
  assertStartInput,
  type AgentAdapter,
  type AgentCapabilities,
  type AgentEvent,
  type AgentSession,
  type AgentStartInput,
  type HealthResult,
  type ToolSpec
} from "./types";

export interface CodexConfig {
  readonly apiKey: string | null;
  readonly model: string;
  readonly contextLimit: number;
  readonly maxOutputTokens: number;
  readonly probe?: (apiKey: string) => Promise<{ ok: boolean; latencyMs: number; message: string }>;
}

const CODEX_TOOLS: readonly ToolSpec[] = [
  { name: "read_file", description: "Dosya okuma", mutates: false },
  { name: "search", description: "Icerik arama", mutates: false },
  { name: "apply_patch", description: "Yama uygulama", mutates: true },
  { name: "shell", description: "Komut calistirma", mutates: true }
];

export class CodexAdapter implements AgentAdapter {
  readonly id = "codex" as const;

  constructor(private readonly config: CodexConfig) {}

  get configured(): boolean {
    return this.config.apiKey !== null && this.config.apiKey.length > 0;
  }

  async negotiate(): Promise<AgentCapabilities> {
    if (!this.configured) {
      throw new AdapterError(
        "NOT_CONFIGURED",
        "Codex icin API anahtari yok. Yetenekler TAHMIN EDILMEZ."
      );
    }

    return {
      adapterId: this.id,
      model: this.config.model,
      contextLimit: this.config.contextLimit,
      maxOutputTokens: this.config.maxOutputTokens,
      streaming: true,
      toolSupport: CODEX_TOOLS,
      // Claude Code'dan farkli: MCP destegi yok.
      mcpSupport: false,
      fileOperations: true,
      approvalSupport: true,
      tokenizerId: "openai-cl100k",
      rateLimit: { requestsPerMinute: null, tokensPerMinute: null, declaredBy: "unknown" },
      source: "configured",
      negotiatedAt: new Date().toISOString()
    };
  }

  async health(): Promise<HealthResult> {
    const checkedAt = new Date().toISOString();

    if (!this.configured) {
      return {
        adapterId: this.id,
        status: "not_configured",
        probedNetwork: false,
        latencyMs: null,
        checkedAt,
        message: "OPENAI_API_KEY yapilandirilmamis."
      };
    }

    if (!this.config.probe) {
      return {
        adapterId: this.id,
        status: "not_configured",
        probedNetwork: false,
        latencyMs: null,
        checkedAt,
        message:
          "API anahtari var ama aga cikan bir probe yapilandirilmamis. " +
          "Anahtarin varligi, saglayicinin erisilebilir oldugunun KANITI DEGILDIR."
      };
    }

    try {
      const result = await this.config.probe(this.config.apiKey as string);
      return {
        adapterId: this.id,
        status: result.ok ? "ready" : "unreachable",
        probedNetwork: true,
        latencyMs: result.latencyMs,
        checkedAt,
        message: result.message
      };
    } catch (error) {
      return {
        adapterId: this.id,
        status: "unreachable",
        probedNetwork: true,
        latencyMs: null,
        checkedAt,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async start(input: AgentStartInput): Promise<AgentSession> {
    assertStartInput(input);

    throw new AdapterError(
      "NOT_IMPLEMENTED",
      "Codex oturum baslatma henuz baglanmadi. `openai` bagimliligi kurulmadi " +
        "cunku calisir bir kimlik bilgisi ve ag erisimi olmadan DOGRULANAMAZ."
    );
  }

  async cancel(): Promise<void> {
    throw new AdapterError("NOT_IMPLEMENTED", "Oturum baslatilamadigi icin iptal edilemez.");
  }

  async *events(sessionId: string): AsyncIterable<AgentEvent> {
    // Olay yok.
    void sessionId;
  }
}

export function codexConfigFromEnv(env: Record<string, string | undefined>): CodexConfig {
  return {
    apiKey: env.OPENAI_API_KEY ?? null,
    model: env.CODEX_MODEL ?? "gpt-5-codex",
    contextLimit: Number(env.CODEX_CONTEXT_LIMIT ?? 128_000),
    maxOutputTokens: Number(env.CODEX_MAX_OUTPUT ?? 32_000)
  };
}

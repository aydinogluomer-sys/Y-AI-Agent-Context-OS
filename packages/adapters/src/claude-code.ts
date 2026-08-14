/**
 * P11 / Y-P11-002 — Claude Code adapter.
 *
 * BU DOSYANIN DURUMU: SÖZLEŞME HAZIR, WIRE-UP EKSİK
 *
 *   Adapter'ın yetenek bildirimi, sağlık probe'u ve olay modeli gerçek.
 *   Eksik olan tek şey `@anthropic-ai/claude-agent-sdk` bağımlılığının
 *   kurulması ve `start()` içindeki gerçek oturum başlatma çağrısı.
 *
 *   Bunun neden böyle bırakıldığı, faz kaydında yazılıdır: SDK'yı
 *   eklemek, çalıştırılabilir bir kimlik bilgisi ve ağ erişimi olmadan
 *   DOĞRULANAMAZ. Doğrulanamayan bir entegrasyonu "tamam" işaretlemek,
 *   P00'da kapattığımız kalıbın kendisidir.
 *
 *   `start()` bugün AÇIKÇA `NOT_IMPLEMENTED` fırlatır. Sahte bir oturum
 *   döndürmez.
 *
 * YETENEKLER NEDEN `configured`, `declared` DEĞİL
 *   Anthropic API'si model başına context limitini programatik olarak
 *   bildirmiyor; değerler dokümantasyondan gelir. `source: "configured"`
 *   bunu söyler ve bütçe motoru (P08) buna göre davranır.
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

export interface ClaudeCodeConfig {
  readonly apiKey: string | null;
  readonly model: string;
  readonly contextLimit: number;
  readonly maxOutputTokens: number;
  /** Test edilebilirlik: gerçek ağ çağrısını değiştirilebilir kılar. */
  readonly probe?: (apiKey: string) => Promise<{ ok: boolean; latencyMs: number; message: string }>;
}

/**
 * Claude Code'un araç kümesi.
 *
 * `mutates` bayrağı Change Firewall'ın (P10) ilgilendiği ayrımdır:
 * yazma yapabilen araçlar mutation kararı gerektirir.
 */
const CLAUDE_CODE_TOOLS: readonly ToolSpec[] = [
  { name: "Read", description: "Dosya okuma", mutates: false },
  { name: "Glob", description: "Dosya adi arama", mutates: false },
  { name: "Grep", description: "Icerik arama", mutates: false },
  { name: "Write", description: "Dosya yazma", mutates: true },
  { name: "Edit", description: "Dosya duzenleme", mutates: true },
  { name: "Bash", description: "Komut calistirma", mutates: true }
];

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly id = "claude-code" as const;

  constructor(private readonly config: ClaudeCodeConfig) {}

  get configured(): boolean {
    return this.config.apiKey !== null && this.config.apiKey.length > 0;
  }

  async negotiate(): Promise<AgentCapabilities> {
    if (!this.configured) {
      throw new AdapterError(
        "NOT_CONFIGURED",
        "Claude Code icin API anahtari yok. Yetenekler TAHMIN EDILMEZ: " +
          "uydurma bir context limiti butce motorunu yanlis besler."
      );
    }

    return {
      adapterId: this.id,
      model: this.config.model,
      contextLimit: this.config.contextLimit,
      maxOutputTokens: this.config.maxOutputTokens,
      streaming: true,
      toolSupport: CLAUDE_CODE_TOOLS,
      mcpSupport: true,
      fileOperations: true,
      approvalSupport: true,
      // Gercek BPE tokenizer'i P08'de bos birakildi; burada ADI
      // bildiriliyor ama registry'de karsiligi yok ve `hasExact` false
      // doner. Bu tutarsizlik degil, durustluk: ad biliniyor,
      // uygulamasi yok.
      tokenizerId: "anthropic-claude",
      rateLimit: {
        requestsPerMinute: null,
        tokensPerMinute: null,
        // Saglayici bunlari programatik bildirmiyor; TAHMIN EDILMEZ.
        declaredBy: "unknown"
      },
      // Context limiti dokumantasyondan geliyor, API'den degil.
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
        message: "ANTHROPIC_API_KEY yapilandirilmamis."
      };
    }

    if (!this.config.probe) {
      // Probe fonksiyonu yoksa AGA CIKILMADI ve bu SOYLENIYOR.
      // P00'daki hata tam olarak buydu: env degiskenine bakip
      // "Live Connectivity Probe" demek.
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
    // Girdi dogrulamasi GERCEK ve simdi calisiyor: manifest ve boundary
    // olmadan oturum baslatilamaz.
    assertStartInput(input);

    throw new AdapterError(
      "NOT_IMPLEMENTED",
      "Claude Code oturum baslatma henuz baglanmadi. `@anthropic-ai/claude-agent-sdk` " +
        "bagimliligi kurulmadi cunku calisir bir kimlik bilgisi ve ag erisimi olmadan " +
        "DOGRULANAMAZ. Dogrulanamayan bir entegrasyonu 'tamam' isaretlemek, P00'da " +
        "kapatilan kalibin kendisidir. Sozlesme (negotiate/health/events) hazir."
    );
  }

  async cancel(): Promise<void> {
    throw new AdapterError("NOT_IMPLEMENTED", "Oturum baslatilamadigi icin iptal edilemez.");
  }

  async *events(sessionId: string): AsyncIterable<AgentEvent> {
    // Olay yok: oturum baslatilamiyor. Uydurma olay uretmek, run'in
    // calistigi yanilsamasini uretirdi.
    void sessionId;
  }
}

/**
 * Ortam değişkenlerinden yapılandırma.
 *
 * Context limiti ve azami çıktı, dokümantasyondan gelen değerlerdir ve
 * ortam değişkeniyle DEĞİŞTİRİLEBİLİR: bir model güncellemesi kod
 * değişikliği gerektirmemelidir.
 */
export function claudeCodeConfigFromEnv(env: Record<string, string | undefined>): ClaudeCodeConfig {
  return {
    apiKey: env.ANTHROPIC_API_KEY ?? null,
    model: env.CLAUDE_CODE_MODEL ?? "claude-opus-5",
    contextLimit: Number(env.CLAUDE_CODE_CONTEXT_LIMIT ?? 200_000),
    maxOutputTokens: Number(env.CLAUDE_CODE_MAX_OUTPUT ?? 64_000)
  };
}

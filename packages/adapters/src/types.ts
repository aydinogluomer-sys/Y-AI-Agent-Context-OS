/**
 * P11 — Vendor-neutral `AgentAdapter` sözleşmesi (ADR-042..ADR-045).
 *
 * P00 Truth Audit: repo'da HİÇBİR agent entegrasyonu yoktu.
 *   - `package.json`'da `@anthropic-ai/*` ya da `openai` bağımlılığı YOK.
 *   - Tek gerçek provider `@google/genai`; model adı hard-code ve
 *     YALNIZ `server.ts`'in `/api/simulate-task` route'undan
 *     çağrılıyordu. `apps/api` bu paketi hiç import etmiyordu.
 *   - `GET /api/providers/health` "Live LLM Provider Connectivity
 *     Probes" diye belgelenmişti ama yalnız `process.env` varlığına
 *     bakıyordu; ağ çağrısı yoktu. Üstelik döndürdüğü model kimlikleri
 *     registry'dekiyle uyuşmuyordu.
 *   - "Claude Code" repo'da yalnız seed/mock veri olarak geçiyordu.
 *
 * Ürünün "Y kendi agent'ını yazmaz, mevcut agent'ları yönetir" tezi bu
 * sözleşme olmadan gerçekleşemez.
 *
 * ADR-042 — Y AGENT'IN İÇ REASONING'İNE BAĞIMLI OLMAZ
 *   Adapter yalnız GÖZLEMLENEBİLİR olayları raporlar: tool call, file
 *   read/write, command, completion. Reasoning formatları vendor'a özgü
 *   ve kararsızdır; buna bağlanmak vendor-neutral iddiasını bozar.
 *
 * ADR-043 — MANİFEST TEK İÇERİK KAYNAĞIDIR
 *   Adapter, manifest dışından dosya içeriği enjekte EDEMEZ. Agent kendi
 *   başına dosya okumak isterse bu bir `file_read` OLAYIDIR ve Context
 *   Firewall'dan geçer.
 *
 * ADR-044 — AGENT SANDBOX'TA ÇALIŞIR
 *   Workspace'e erişim Y tarafından aracılanır; doğrudan dosya sistemi
 *   erişimi YOKTUR. Agent'a doğrudan repo yolu vermek, Change Firewall'ı
 *   baypas etmesi demektir.
 *
 * ADR-045 — CAPABILITY NEGOTIATION HER RUN BAŞINDA
 *   Bütçe (P08) adapter limitine bağlıdır; limit değişirse determinizm
 *   girdisi değişmiş olur. Bu yüzden yetenekler manifest'e yazılır.
 */

export type AgentAdapterId = "claude-code" | "codex" | "gemini-cli" | "generic-mcp";

export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  /** Bu araç dosya sistemine yazabilir mi (Change Firewall ilgilenir). */
  readonly mutates: boolean;
}

export interface RateLimitSpec {
  readonly requestsPerMinute: number | null;
  readonly tokensPerMinute: number | null;
  /** Sağlayıcı bunları bildirmiyorsa `null` — TAHMİN EDİLMEZ. */
  readonly declaredBy: "provider" | "configuration" | "unknown";
}

export interface AgentCapabilities {
  readonly adapterId: AgentAdapterId;
  readonly model: string;
  /** Bütçe motorunun (P08) girdisi. */
  readonly contextLimit: number;
  readonly maxOutputTokens: number;
  readonly streaming: boolean;
  readonly toolSupport: readonly ToolSpec[];
  readonly mcpSupport: boolean;
  /**
   * [P17 / T-09] Adapter'in bildirdigi MCP araclari.
   *
   * `mcpSupport: boolean` tek basina "MCP var mi" sorusunu cevapliyor ama
   * "HANGI MCP" sorusunu hic sormuyordu. MCP agent'a CALISMA ZAMANINDA
   * yeni araclar kazandirir; bilinmeyen bir arac, Y'nin korumadigi bir
   * yoldur (Change Firewall ve komut allow-list'i yalniz BILINEN yollari
   * korur).
   *
   * Bu liste HAM bildirimdir — izin verildigi anlamina GELMEZ.
   * `filterMcpTools` policy'ye gore suzer, `decideMcpToolCall` cagri
   * aninda yeniden karar verir.
   */
  readonly mcpTools: readonly { readonly serverId: string; readonly toolName: string }[];
  readonly fileOperations: boolean;
  readonly approvalSupport: boolean;
  readonly tokenizerId: string;
  readonly rateLimit: RateLimitSpec;
  /**
   * Yetenekler NEREDEN öğrenildi.
   *
   * `declared`: sağlayıcının API'sinden okundu.
   * `configured`: operatör yapılandırdı.
   * `assumed`: VARSAYILDI — bu değer manifest'e yazılır ve bütçe
   *   motoru güvenlik payını artırır. Varsayımı gerçek gibi sunmak,
   *   P00'daki sahte health probe'un aynısı olurdu.
   */
  readonly source: "declared" | "configured" | "assumed";
  readonly negotiatedAt: string;
}

export type HealthStatus = "ready" | "not_configured" | "unreachable" | "rate_limited";

export interface HealthResult {
  readonly adapterId: AgentAdapterId;
  readonly status: HealthStatus;
  /**
   * Probe GERÇEKTEN ağa çıktı mı.
   *
   * P00'daki `/api/providers/health` yalnız `process.env` varlığına
   * bakıp "Live Connectivity Probe" diyordu. Bu alan o yalanı imkânsız
   * kılar: `false` ise çağıran, sonucun bir bağlantı kanıtı OLMADIĞINI
   * bilir.
   */
  readonly probedNetwork: boolean;
  readonly latencyMs: number | null;
  readonly checkedAt: string;
  readonly message: string;
}

export type AgentEventKind =
  | "session_started"
  | "tool_call"
  | "file_read"
  | "file_write"
  | "command"
  | "message"
  | "error"
  | "session_completed"
  | "session_cancelled";

export interface AgentEvent {
  readonly sessionId: string;
  readonly sequence: number;
  readonly kind: AgentEventKind;
  readonly at: string;
  /**
   * Olayın yükü.
   *
   * İç reasoning BURAYA YAZILMAZ (ADR-042). Yalnız gözlemlenebilir
   * gerçekler: hangi araç çağrıldı, hangi dosya okundu/yazıldı, hangi
   * komut çalıştırıldı.
   */
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface TaskSpec {
  readonly taskId: string;
  readonly title: string;
  readonly description: string;
  readonly acceptanceCriteria: readonly string[];
}

export interface WorkspaceRef {
  /**
   * Agent'a VERİLMEYEN mutlak yol.
   *
   * Bu alan Y'nin kendi kullanımı içindir; adapter dosya işlemlerini
   * Y üzerinden yapar (ADR-044). Yolu agent'a iletmek, sandbox'ı
   * anlamsız kılar.
   */
  readonly absolutePath: string;
  readonly repositoryId: string;
  readonly commitSha: string;
}

export interface AgentStartInput {
  /** P09 — agent'a verilen içeriğin TEK kaynağı (ADR-043). */
  readonly manifest: { manifestHash: string; items: readonly { path: string; content?: string }[] };
  /** P10 — yazma sınırı. */
  readonly boundary: { boundaryHash: string; expected: readonly string[]; allowed: readonly string[] };
  readonly task: TaskSpec;
  readonly workspace: WorkspaceRef;
  readonly runId: string;
}

export interface AgentSession {
  readonly sessionId: string;
  readonly adapterId: AgentAdapterId;
  readonly runId: string;
  readonly startedAt: string;
  readonly capabilities: AgentCapabilities;
}

export interface AgentAdapter {
  readonly id: AgentAdapterId;
  negotiate(): Promise<AgentCapabilities>;
  /** GERÇEK probe — `probedNetwork` alanı yalanı imkânsız kılar. */
  health(): Promise<HealthResult>;
  start(input: AgentStartInput): Promise<AgentSession>;
  cancel(sessionId: string): Promise<void>;
  events(sessionId: string): AsyncIterable<AgentEvent>;
}

export class AdapterError extends Error {
  constructor(
    readonly code:
      | "NOT_CONFIGURED"
      | "NOT_IMPLEMENTED"
      | "UNREACHABLE"
      | "SESSION_NOT_FOUND"
      | "MANIFEST_REQUIRED"
      | "BOUNDARY_REQUIRED",
    message: string
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

/**
 * Başlatma girdisinin geçerliliği.
 *
 * Manifest ve boundary ZORUNLUDUR. Manifestsiz bir agent, ne gördüğü
 * kayıtlı olmayan bir agent'tır; boundary'siz bir agent, nereye
 * yazabileceği kayıtlı olmayan bir agent'tır. İkisi de ürünün iddia
 * ettiği şeyin karşıtıdır.
 */
export function assertStartInput(input: AgentStartInput): void {
  if (!input.manifest || input.manifest.manifestHash.length === 0) {
    throw new AdapterError(
      "MANIFEST_REQUIRED",
      "Manifest olmadan agent baslatilamaz (ADR-043): ne gordugu kayitli olmayan " +
        "bir agent, urunun PROOF iddiasini bosa cikarir."
    );
  }
  if (!input.boundary || input.boundary.boundaryHash.length === 0) {
    throw new AdapterError(
      "BOUNDARY_REQUIRED",
      "Change boundary olmadan agent baslatilamaz (P10): nereye yazabilecegi " +
        "kayitli olmayan bir agent, CHANGE sutununu bosa cikarir."
    );
  }
}

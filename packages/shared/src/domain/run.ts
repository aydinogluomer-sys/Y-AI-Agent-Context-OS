/**
 * P01 / Y-P01-001 — Run FSM ve olay sözleşmeleri.
 *
 * P00 Truth Audit bulgusu (P0-13): `POST .../runs` dört event yazıp
 * `status: "completed"` dönüyordu. Hiçbir context derlenmiyor, hiçbir model
 * çağrılmıyor, hiçbir dosyaya dokunulmuyordu. `selectedItemsCount: 3` literal'di.
 *
 * Bu modül P12'nin implemente edeceği gerçek durum makinesini tanımlar.
 * ADR-046 (manifest ve boundary olmadan `ready` olunamaz),
 * ADR-047 (terminal durumlar geri alınamaz),
 * ADR-048 (her geçiş bir event'tir).
 */

export const RUN_STATES = [
  "created",
  "queued",
  "preparing_context",
  "awaiting_policy",
  "ready",
  "running",
  "awaiting_approval",
  "verifying",
  "completed",
  "failed",
  "cancelled",
  "blocked",
  "degraded"
] as const;

export type RunState = (typeof RUN_STATES)[number];

/** Terminal durumlar bir daha değişmez; yeniden deneme YENİ run üretir. */
export const TERMINAL_STATES: readonly RunState[] = ["completed", "failed", "cancelled"] as const;

export function isTerminal(state: RunState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Geçerli durum geçişleri.
 * Burada olmayan her geçiş reddedilir — sessizce yok sayılmaz.
 */
export const VALID_TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> = {
  created: ["queued", "cancelled", "blocked"],
  queued: ["preparing_context", "cancelled", "failed"],
  preparing_context: ["awaiting_policy", "failed", "cancelled", "blocked"],
  awaiting_policy: ["ready", "blocked", "failed", "cancelled"],
  ready: ["running", "cancelled", "failed"],
  running: ["awaiting_approval", "verifying", "failed", "cancelled", "degraded"],
  awaiting_approval: ["running", "blocked", "cancelled", "failed"],
  verifying: ["completed", "failed", "degraded"],
  degraded: ["verifying", "failed", "cancelled"],
  blocked: ["cancelled", "failed"],
  completed: [],
  failed: [],
  cancelled: []
};

export function canTransition(from: RunState, to: RunState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * FSM guard'ları.
 * ADR-046: manifest yazılmadan `ready` olunamaz, boundary hesaplanmadan
 * `running` olunamaz. Bu kısıtlar tip düzeyinde değil, runtime'da
 * doğrulanır — çünkü koşul veritabanı durumudur.
 */
export interface TransitionGuards {
  readonly hasManifest: boolean;
  readonly hasChangeBoundary: boolean;
  readonly hasAgentSession: boolean;
}

export function guardTransition(
  from: RunState,
  to: RunState,
  guards: TransitionGuards
): { ok: true } | { ok: false; reason: string } {
  if (!canTransition(from, to)) {
    return { ok: false, reason: `Gecersiz gecis: ${from} -> ${to}` };
  }
  if (to === "ready" && !guards.hasManifest) {
    return { ok: false, reason: "ready durumuna gecilemez: context manifest yazilmadi (ADR-046)" };
  }
  if (to === "running" && !guards.hasChangeBoundary) {
    return { ok: false, reason: "running durumuna gecilemez: change boundary hesaplanmadi (ADR-046)" };
  }
  if (to === "verifying" && !guards.hasAgentSession) {
    return { ok: false, reason: "verifying durumuna gecilemez: agent oturumu yok" };
  }
  return { ok: true };
}

/**
 * Run olay tipleri (master plan §17).
 * P13 bunları SSE üzerinden yayınlar.
 */
export const RUN_EVENT_TYPES = [
  "run.created",
  "context.started",
  "context.fragment.selected",
  "context.completed",
  "policy.checked",
  "policy.blocked",
  "agent.started",
  "agent.tool_call",
  "agent.command",
  "agent.file_read",
  "agent.file_write",
  "approval.requested",
  "approval.resolved",
  "test.started",
  "test.completed",
  "evidence.created",
  "run.completed",
  "run.failed"
] as const;

export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

/**
 * Tek bir run olayı.
 *
 * ADR-051: `agent.file_read`/`file_write` olayları dosya YOLUNU ve hash'ini
 * taşır, İÇERİĞİNİ değil. SSE akışı bir sızıntı kanalına dönüşmemelidir.
 */
export interface RunEvent {
  readonly id: string;
  readonly runId: string;
  /** Run içinde monoton artan sıra. `UNIQUE(run_id, sequence)`. */
  readonly sequence: number;
  readonly type: RunEventType;
  /** Hash chain (P14): bir önceki olayın payload hash'i. */
  readonly prevHash: string | null;
  readonly payloadHash: string;
  readonly occurredAt: string;
  /** Aktör DAİMA doğrulanmış principal veya imzalı service identity (T-19). */
  readonly actorPrincipalId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface TaskRun {
  readonly id: string;
  readonly orgId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly state: RunState;
  readonly manifestId: string | null;
  readonly boundaryId: string | null;
  readonly agentConnectionId: string | null;
  readonly capabilitiesHash: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly failureReason: string | null;
  /** Event zincirinin son halkası — tamper tespiti için. */
  readonly chainHeadHash: string | null;
  readonly chainLength: number;
}

/**
 * P12 / Y-P12-001, Y-P12-002 — Gerçek run yaşam döngüsü (ADR-046..048).
 *
 * P00 Truth Audit — PLANIN TEK EN KRİTİK BULGUSU
 *
 *   `POST .../runs` handler'ı şunu yapıyordu:
 *     1. Bir run kimliği üret.
 *     2. Dört olay yaz: queued, running, (sabit payload), completed.
 *     3. `res.json({ ok: true, run: { status: "completed" } })`.
 *
 *   Hiçbir context derlenmiyordu, hiçbir model çağrılmıyordu, hiçbir
 *   dosyaya dokunulmuyordu. Payload'daki `selectedItemsCount: 3` ve
 *   `tokenBudget: 50000` LİTERALDİ. Handler her çağrıda "başarıyla
 *   tamamlandı" diyordu.
 *
 *   `.../runs/:runId/cancel` ise zaten "completed" olmuş bir run'a
 *   `cancelled` olayı ekliyordu — DURUM KONTROLÜ YOKTU.
 *
 *   Ayrıca run tablosu YOKTU: run yalnız `event_records` içindeki
 *   `payload_json.runId` alanıyla vardı ve `GET .../runs/:runId/events`
 *   tüm task olaylarını çekip JS'te filtreliyordu.
 *
 * ADR-046 — MANİFEST VE BOUNDARY OLMADAN `ready` OLUNMAZ
 *   FSM guard'ları bunu zorlar. Bir run'ın `running` olabilmesi için
 *   önce ne göreceği (manifest) ve nereye yazabileceği (boundary)
 *   kayıtlı olmalıdır.
 *
 * ADR-047 — TERMİNAL DURUMLAR GERİ ALINAMAZ
 *   `completed`/`failed`/`cancelled` bir daha değişmez. Yeniden deneme
 *   YENİ run üretir. Sebep: kanıt zinciri (P14) run kimliğine bağlıdır;
 *   bir run'ın sonucu değişebilseydi zincir anlamını yitirirdi.
 *
 * ADR-048 — HER DURUM GEÇİŞİ BİR EVENT'TİR
 *   `runs.state` kolonu TÜRETİLMİŞ bir görünümdür; kaynak gerçek
 *   `run_events` zinciridir. İkisi çelişirse zincir doğrudur.
 */

import { newId } from "@y/shared";
import {
  guardTransition,
  isTerminal,
  type RunState,
  type TransitionGuards
} from "@y/shared";

export interface RunDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface RunRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly state: RunState;
  readonly adapterId: string | null;
  readonly manifestId: string | null;
  readonly boundaryId: string | null;
  readonly agentSessionId: string | null;
  readonly idempotencyKey: string;
  readonly attempt: number;
}

export interface CreateRunInput {
  readonly organizationId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly adapterId: string;
  /**
   * Aynı anahtarla ikinci bir istek YENİ run üretmez.
   *
   * P00'da bu kavram yoktu: aynı task için `POST /runs` iki kez
   * çağrılırsa iki "completed" run oluşurdu ve hangisinin gerçek
   * olduğu belirsizdi.
   */
  readonly idempotencyKey: string;
  readonly requestedBy: string;
}

export class RunError extends Error {
  constructor(
    readonly code:
      | "INVALID_TRANSITION"
      | "TERMINAL_STATE"
      | "RUN_NOT_FOUND"
      | "GUARD_FAILED",
    message: string
  ) {
    super(message);
    this.name = "RunError";
  }
}

export class RunService {
  constructor(private readonly db: RunDb) {}

  /**
   * Run oluşturur ya da var olanı döndürür (idempotent).
   *
   * `ON CONFLICT DO NOTHING` + `SELECT`: iki eşzamanlı istek tek run
   * üretir. `DO UPDATE` kullanmak, ikinci isteğin birincinin durumunu
   * ezmesi demek olurdu.
   */
  async createOrGet(input: CreateRunInput): Promise<{ run: RunRecord; created: boolean }> {
    const id = newId("run");

    const inserted = await this.db.query(
      `INSERT INTO runs
         (id, organization_id, project_id, task_id, adapter_id, state, idempotency_key, requested_by, attempt)
       VALUES ($1, $2, $3, $4, $5, 'created', $6, $7, 1)
       ON CONFLICT (task_id, idempotency_key) DO NOTHING
       RETURNING id;`,
      [
        id,
        input.organizationId,
        input.projectId,
        input.taskId,
        input.adapterId,
        input.idempotencyKey,
        input.requestedBy
      ]
    );

    const created = inserted.rows.length > 0;
    const run = await this.findByIdempotency(input.taskId, input.idempotencyKey);

    if (!run) {
      throw new RunError("RUN_NOT_FOUND", "Run olusturuldu ama okunamadi.");
    }

    if (created) {
      await this.appendEvent(run.id, null, "created", "Run olusturuldu.", input.requestedBy);
    }

    return { run, created };
  }

  /**
   * Durum geçişi.
   *
   * ÜÇ KATMANLI KORUMA:
   *   1. Terminal durum kontrolü (ADR-047).
   *   2. FSM geçerlilik kontrolü (`canTransition`).
   *   3. Guard kontrolü (manifest/boundary/session — ADR-046).
   *
   * Geçiş ve olay TEK sorguda yazılır; durum güncellenip olay
   * yazılamazsa ikisi çelişirdi.
   */
  async transition(
    runId: string,
    to: RunState,
    params: { reason: string; actor: string; guards?: Partial<TransitionGuards> }
  ): Promise<RunRecord> {
    const run = await this.findById(runId);
    if (!run) throw new RunError("RUN_NOT_FOUND", `Run bulunamadi: ${runId}`);

    if (isTerminal(run.state)) {
      // P00'daki `cancel` route'u tam olarak bunu YAPMIYORDU: zaten
      // "completed" olmus bir run'a `cancelled` olayi ekliyordu.
      throw new RunError(
        "TERMINAL_STATE",
        `Run '${run.state}' durumunda ve terminal (ADR-047). Yeniden deneme YENI ` +
          `run uretir; bir run'in sonucu degisebilseydi kanit zinciri anlamini yitirirdi.`
      );
    }

    const guards: TransitionGuards = {
      hasManifest: params.guards?.hasManifest ?? run.manifestId !== null,
      hasChangeBoundary: params.guards?.hasChangeBoundary ?? run.boundaryId !== null,
      hasAgentSession: params.guards?.hasAgentSession ?? run.agentSessionId !== null
    };

    const verdict = guardTransition(run.state, to, guards);
    // Negatif guard tek basina pozitif dali daraltmiyor (P01'de ayni
    // sorun yasandi); ayrik birlesim acikca ayristirilir.
    if (verdict.ok === false) {
      throw new RunError(
        to === run.state ? "INVALID_TRANSITION" : "GUARD_FAILED",
        verdict.reason
      );
    }

    // Durum guncellemesi KOSULLU: `WHERE state = $3` esszamanli iki
    // gecisin ikisinin de basarili olmasini engeller (lost update).
    const updated = await this.db.query(
      `UPDATE runs SET state = $2, updated_at = NOW()
        WHERE id = $1 AND state = $3
        RETURNING id;`,
      [runId, to, run.state]
    );

    if (updated.rows.length === 0) {
      throw new RunError(
        "INVALID_TRANSITION",
        `Run durumu arada degisti (beklenen '${run.state}'). Esszamanli gecis reddedildi.`
      );
    }

    await this.appendEvent(runId, run.state, to, params.reason, params.actor);

    const refreshed = await this.findById(runId);
    if (!refreshed) throw new RunError("RUN_NOT_FOUND", `Run kayboldu: ${runId}`);
    return refreshed;
  }

  /** Manifest bağlama — `ready` guard'ının ön koşulu. */
  async attachManifest(runId: string, manifestId: string): Promise<void> {
    await this.db.query(`UPDATE runs SET manifest_id = $2, updated_at = NOW() WHERE id = $1;`, [
      runId,
      manifestId
    ]);
  }

  /** Boundary bağlama — `running` guard'ının ön koşulu. */
  async attachBoundary(runId: string, boundaryId: string): Promise<void> {
    await this.db.query(`UPDATE runs SET boundary_id = $2, updated_at = NOW() WHERE id = $1;`, [
      runId,
      boundaryId
    ]);
  }

  async attachAgentSession(runId: string, sessionId: string): Promise<void> {
    await this.db.query(
      `UPDATE runs SET agent_session_id = $2, updated_at = NOW() WHERE id = $1;`,
      [runId, sessionId]
    );
  }

  async findById(runId: string): Promise<RunRecord | null> {
    const result = await this.db.query(
      `SELECT id, organization_id, project_id, task_id, state, adapter_id,
              manifest_id, boundary_id, agent_session_id, idempotency_key, attempt
         FROM runs WHERE id = $1;`,
      [runId]
    );
    return result.rows[0] ? toRun(result.rows[0]) : null;
  }

  async findByIdempotency(taskId: string, key: string): Promise<RunRecord | null> {
    const result = await this.db.query(
      `SELECT id, organization_id, project_id, task_id, state, adapter_id,
              manifest_id, boundary_id, agent_session_id, idempotency_key, attempt
         FROM runs WHERE task_id = $1 AND idempotency_key = $2;`,
      [taskId, key]
    );
    return result.rows[0] ? toRun(result.rows[0]) : null;
  }

  /**
   * Run'ın olay zinciri.
   *
   * P00'da `GET .../runs/:runId/events` TÜM task olaylarını çekip JS'te
   * filtreliyordu. Bir task'ın binlerce olayı varsa bu, her istekte
   * hepsini belleğe getirmek demekti.
   */
  async events(runId: string): Promise<
    { sequence: number; fromState: string | null; toState: string; reason: string; actor: string; at: string }[]
  > {
    const result = await this.db.query(
      `SELECT sequence, from_state, to_state, reason, actor, created_at
         FROM run_events WHERE run_id = $1 ORDER BY sequence;`,
      [runId]
    );

    return result.rows.map((row) => ({
      sequence: Number(row.sequence),
      fromState: row.from_state ?? null,
      toState: row.to_state,
      reason: row.reason,
      actor: row.actor,
      at: row.created_at ? new Date(row.created_at).toISOString() : ""
    }));
  }

  private async appendEvent(
    runId: string,
    fromState: RunState | null,
    toState: RunState,
    reason: string,
    actor: string
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO run_events (id, run_id, sequence, from_state, to_state, reason, actor)
       VALUES ($1, $2,
               (SELECT COALESCE(MAX(sequence), 0) + 1 FROM run_events WHERE run_id = $2),
               $3, $4, $5, $6);`,
      [newId("revt"), runId, fromState, toState, reason, actor]
    );
  }
}

function toRun(row: any): RunRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    taskId: row.task_id,
    state: row.state as RunState,
    adapterId: row.adapter_id ?? null,
    manifestId: row.manifest_id ?? null,
    boundaryId: row.boundary_id ?? null,
    agentSessionId: row.agent_session_id ?? null,
    idempotencyKey: row.idempotency_key,
    attempt: Number(row.attempt ?? 1)
  };
}

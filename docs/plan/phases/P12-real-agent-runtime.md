# Phase 12 — Real Agent Runtime

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P11](P11-agent-adapter-layer.md) · [P13 →](P13-realtime-events-and-approvals.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P12 |
| **Workstream** | C — Runtime / Agent Integration |
| **Dependencies** | P09, P10, P11 |
| **Migration bloğu** | `0091`–`0100` |

## Objective

Sahte run yolunu gerçek bir çalışma zamanıyla değiştirmek: 13 durumlu FSM, PostgreSQL tabanlı kuyruk, worker havuzu, retry/idempotency/iptal/çökme kurtarma.

## Why This Phase Exists

Bu, planın tek en kritik fazı. Bugün "agent run" şu:

```ts
// apps/api/src/index.ts:296-377
const runId = `run_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
await eventStoreService.appendEvent({ ... idempotency_key: `evt_${runId}_queued` });
await eventStoreService.appendEvent({ ... status: "running" ... });
await eventStoreService.appendEvent({ ...
  payload_json: { runId, selectedItemsCount: 3, tokenBudget: 50000, usableInput: 30000 } });
const evidenceRes = await evidenceStoreService.createEvidenceRecord({ ... });
await eventStoreService.appendEvent({ ... status: "completed", evidenceId: evidenceRes.id });
res.json({ ok: true, run: { runId, status: "completed", ... } });
```

Hiçbir context derlenmiyor, hiçbir model çağrılmıyor, hiçbir dosyaya dokunulmuyor. `selectedItemsCount: 3` ve `tokenBudget: 50000` **literal**. Bu handler her çağrıda "başarılı tamamlandı" diyor.

`.../runs/:runId/cancel` (L397-429) zaten "completed" olmuş bir run'a `cancelled` olayı ekliyor — durum kontrolü yok.

Frontend tarafında da durum aynı: `apps/web/src/App.tsx:284-392` dört `await delay(400)` adımıyla sahte bir pipeline oynatıyor ve `"sha256-" + Math.random().toString(16)...` ile **uydurma hash** üretiyor (L373). `AIMissionControlPanel.tsx:154-175` sahte konsey oyları ve hard-coded bir SHA-256 basıyor.

## Dependencies

P09 (manifest), P10 (boundary), P11 (adapter). Üçü de donmuş olmalı.

## Current Repository Reality

| Konu | Gerçek |
|---|---|
| Run tablosu | Yok. Run yalnız `event_records` içindeki `payload_json.runId` ile var |
| Run olayları | `GET .../runs/:runId/events` (L379-395) tüm task olaylarını çekip **JS'te** filtreliyor |
| FSM | Yok |
| Kuyruk | Genel kuyruk yok; `index_jobs` için `FOR UPDATE SKIP LOCKED` örüntüsü **var ve doğru** (`index-job-service.ts:311-331`) |
| Worker | `WorkerRuntimeService` gerçek bookkeeping (register/heartbeat/claim/complete/fail/lease-release) |
| Frontend↔backend | `WorkerRuntimeDashboard.tsx` `/workers/claim-job`, `/complete-job`, `/fail-job`, `/activate` çağırıyor; sunucuda `/claim`, `/complete`, `/fail` var, `/activate` yok → **404** |
| Agent bookkeeping | `packages/agents/*` — `agent_sessions`, `agent_handoffs`, `resume_states`, `agent_memories` |
| Debug log | `AgentDebugService` process-static `Map` (`packages/agents/src/debug.ts:18`) — restart'ta kayıp; `debug_logs` tablosu okunuyor ama **hiç yazılmıyor** |

## Target State

```text
created → queued → preparing_context → awaiting_policy → ready → running
                                                                    ├→ awaiting_approval → running
                                                                    └→ verifying → completed
terminal: failed · cancelled · blocked · degraded
```

- Genel `jobs` kuyruğu (`SKIP LOCKED`), job tipleri: `context-compile`, `run-execute`, `quality-gate`, `index`, `embed`, `graph`.
- Worker havuzu: heartbeat, lease, çökme kurtarma, stale lock geri alma.
- Idempotency: aynı `(task_id, idempotency_key)` iki run üretmez.

## Architecture Decisions

- **ADR-004** — PostgreSQL-backed queue (master §4 gerekçesi).
- **ADR-046 (yeni)** — **Run, manifest ve boundary olmadan `ready` olamaz.** FSM kısıtı; `preparing_context` ve `awaiting_policy` durumları bunu zorunlu kılar.
- **ADR-047 (yeni)** — **Terminal durumlar geri alınamaz.** `completed`/`failed`/`cancelled` bir daha değişmez; yeniden deneme **yeni run** üretir. Sebep: kanıt zinciri (P14) run kimliğine bağlıdır.
- **ADR-048 (yeni)** — **Her durum geçişi bir event'tir.** Durum kolonu bir türetilmiş görünümdür; kaynak gerçek event zinciridir. Sebep: audit ve zaman çizelgesi tutarlılığı.

## Files / Packages Affected

Yeni `packages/runtime`, `workers/`, `apps/api/src/routes/runs.ts`, `packages/agents` göçü.

### New Files

```text
packages/runtime/package.json
packages/runtime/src/{index.ts,types.ts}
packages/runtime/src/fsm/{machine.ts,transitions.ts,guards.ts}
packages/runtime/src/queue/{pg-queue.ts,claim.ts,idempotency.ts,retry.ts}
packages/runtime/src/workers/{pool.ts,heartbeat.ts,recovery.ts}
packages/runtime/src/run/{orchestrator.ts,executor.ts,cancel.ts}
workers/run-worker.ts
workers/quality-gate-worker.ts
apps/api/src/routes/runs.ts
apps/api/src/domain/run/*.ts
packages/runtime/src/__tests__/{fsm,queue,idempotency,recovery,cancel}.test.ts
tests/resilience/{worker-crash,stale-lock,duplicate-event,provider-timeout}.spec.ts
```

### Files to Modify

- `apps/api/src/index.ts:296-429` — sahte run ve cancel handler'ları **silinir**.
- `packages/agents/*` — `agent_sessions`/`handoffs`/`resume_states` mantığı `packages/runtime`'a taşınır.
- `WorkerRuntimeService` → `packages/runtime/src/workers/`; endpoint adları frontend'in beklediği isimlerle **hizalanır** (`/claim`, `/complete`, `/fail` kanonik; frontend P15'te düzeltilir — ama `/activate` gerçek bir işlem olarak eklenir veya frontend'den kaldırılır).

### Files to Delete/Deprecate

- Sahte run handler'ı (`index.ts:296-377`) — **DELETE**
- Durum kontrolsüz cancel (`index.ts:397-429`) — **DELETE**
- `AgentDebugService` static `Map` (`packages/agents/src/debug.ts`) — **DELETE**, Event Store'a devredilir
- `debug_logs` tablosu — **DROP** (0100)
- `agent_memories` · `resume_states` · `resume_schedules` · `agent_sessions` · `agent_handoffs` — `task_runs` + `run_events`'e **MERGE**

## Database Changes

```text
0093  jobs                (id, org_id, project_id, kind, payload_json, state, priority,
                           attempts, max_attempts, available_at, claimed_by, lease_expires_at,
                           idempotency_key UNIQUE) + idx(state, available_at)
0094  task_runs           (id, org_id, project_id, task_id, state, manifest_id, boundary_id,
                           agent_connection_id, capabilities_hash, started_at, ended_at,
                           failure_reason) 
0095  run_events          (event_records REPLACE) + run_id FK, + sequence, + prev_hash,
                           + chain_index; UNIQUE(run_id, sequence); append-only trigger
0096  run_state_transitions (run_id, from_state, to_state, event_id, at)
0097  workers             (worker_registry ALTER) + identity_id FK service_identities
0098  quality_gate_runs   + run_id FK, + executed_by_worker_id
0099  agent_* tablolarının task_runs/run_events'e göçü
0100  debug_logs, agent_memories, resume_*, agent_sessions, agent_handoffs DROP
```

`prev_hash`/`chain_index` P14'ün hash chain'inin şema temelini burada atar.

## API Changes

```text
POST /api/v1/projects/:pid/tasks/:tid/runs      → 202 + runId (kuyruğa girer)
GET  /api/v1/runs/:runId                         run + durum + manifest referansı
POST /api/v1/runs/:runId/cancel                  durum kontrollü
GET  /api/v1/projects/:pid/runs
GET  /api/v1/admin/queue · /admin/workers
```
Legacy run route'ları → 410.

## Type / Contract Changes

`RunState` (13), `TaskRun`, `RunEvent`, `RunEventType`, `JobSpec` (P01) implemente edilir. **`RunEvent` sözleşmesi P13'ün girdisi.**

## Frontend Changes

Yok (P15). Ancak sahte chat pipeline'ı ve `AIMissionControlPanel` teatrosu artık **backend'siz** kalır; P15'te silinir. Bu arada bu ekranlar hata gösterir — sahte başarı göstermez.

## Backend Changes

Run başlatma senkron olarak **hiçbir iş yapmaz**; job kuyruğa girer ve `202` döner.

## Worker Changes

- `workers/run-worker.ts` — run job'ını alır, FSM'i sürer, adapter'ı çalıştırır, olayları yazar.
- `workers/quality-gate-worker.ts` — gerçek komut çalıştırır (P14 ile ortak).
- Mevcut `index-worker` ve yeni `ingestion/embedding/graph` worker'ları aynı kuyruk altyapısını kullanır.

## Security Changes

- Worker kimliği imzalı (`service_identities`, T-15).
- Her mutation Change Firewall'dan geçer (P10 entegrasyonu).
- Her tool çağrısı capability allow-list'inden geçer (P11 entegrasyonu).
- Run olaylarının aktörü **daima** doğrulanmış principal veya imzalı service identity (T-19).
- İptal edilen run'ın workspace'i temizlenir; yarım mutation'lar geri alınır (lease + hash-before).

## Migration Strategy

1. `jobs` kuyruğu + worker havuzu (mevcut `index_jobs` örüntüsü genelleştirilir).
2. FSM + `task_runs` + `run_events`.
3. `run-worker` orchestrator: compile → policy → adapter → mutation kararları → quality gate.
4. Sahte handler'lar silinir; legacy 410.
5. `agent_*` tabloları göç edip DROP edilir.

## Implementation Tasks

### Y-P12-001 — PostgreSQL kuyruğu
**Create:** `queue/{pg-queue,claim}.ts`. **Algorithm:** `SELECT ... FOR UPDATE SKIP LOCKED` + lease + `available_at` (backoff).
**Acceptance:** N worker, M job → her job tam bir kez işlenir.

### Y-P12-002 — Idempotency
**Create:** `queue/idempotency.ts`. `UNIQUE(idempotency_key)`; tekrarlı istek aynı `runId`'yi döndürür.
**Negative test:** Aynı anahtarla iki istek → tek run.

### Y-P12-003 — Retry + backoff
**Create:** `queue/retry.ts`. Kalıcı hata (policy denied) retry **edilmez**; geçici hata (rate limit, ağ) edilir.

### Y-P12-004 — Run FSM
**Create:** `fsm/{machine,transitions,guards}.ts`. 13 durum, geçerli geçiş tablosu, guard'lar:
- `preparing_context → awaiting_policy` yalnız manifest yazıldıysa
- `awaiting_policy → ready` yalnız boundary hesaplandıysa
- terminal durumdan çıkış **yok**
**Acceptance:** Geçersiz geçiş denemesi hata veriyor; her geçiş bir event ve bir `run_state_transitions` satırı üretiyor.

### Y-P12-005 — Worker havuzu + heartbeat
**Create:** `workers/{pool,heartbeat}.ts`. Lease TTL, heartbeat aralığı, kapasiteye göre claim.

### Y-P12-006 — Çökme kurtarma
**Create:** `workers/recovery.ts`. Lease süresi geçmiş job'lar geri alınır; yarım run `degraded` veya yeniden kuyruğa.
**Acceptance:** Worker SIGKILL sonrası job kaybolmuyor ve iki kez uygulanmıyor.

### Y-P12-007 — Run orchestrator
**Create:** `run/orchestrator.ts`. Sıra: manifest compile (P08/P09) → boundary (P10) → adapter negotiate (P11) → execute → mutation kararları → quality gate (P14) → evidence (P14).

### Y-P12-008 — Executor + olay akışı
**Create:** `run/executor.ts`. Adapter olayları `RunEvent`'e normalize edilir, sıralı `sequence` ile yazılır.
**Edge Cases:** Olay patlaması (rate limit + batch), sıra dışı olay (adapter garantisi yoksa Y sıralar).

### Y-P12-009 — İptal
**Create:** `run/cancel.ts`. Durum kontrollü; çalışan adapter oturumu iptal edilir; workspace temizlenir.
**Negative test:** `completed` run iptal edilemez (bugün edilebiliyor).

### Y-P12-010 — Sahte yolların silinmesi
`index.ts:296-429` silinir; `AgentDebugService` static Map silinir.
**Negative test:** `selectedItemsCount: 3` gibi literal'ler kaynak ağacında yok.

### Y-P12-011 — Worker endpoint hizalaması
`/claim`, `/complete`, `/fail` kanonik; `/activate` ya gerçek bir işlem olarak eklenir ya da sözleşmeden çıkarılır (frontend P15'te hizalanır).

### Y-P12-012 — `agent_*` göçü (0099–0100)

## Parallelizable Tasks

```text
Y-P12-001 + 002 + 003 (kuyruk) ∥ Y-P12-004 (FSM)
Y-P12-005 + 006 (worker) ∥ Y-P12-008 (executor)
```
Sıralı: `(001..006) → 007 → 008 → 009 → 010`.

## Tests

| Suite | İçerik |
|---|---|
| `fsm.test.ts` | 13 durum × geçerli/geçersiz geçişler; guard'lar |
| `queue.test.ts` | Eşzamanlı claim; tam-bir-kez işleme; öncelik |
| `idempotency.test.ts` | Tekrarlı istek → tek run |
| `recovery.test.ts` | Worker çökmesi → job kurtarma |
| `cancel.test.ts` | Çalışan run iptal; terminal run iptal edilemez |
| `orchestrator.test.ts` | Uçtan uca sıra; manifest/boundary olmadan `ready` olmuyor |

## Negative Tests

- Manifest yazılmadan `ready` → **engellenir**.
- Boundary hesaplanmadan `running` → **engellenir**.
- `completed` run'a `cancel` → **400**.
- Aynı idempotency key ile iki POST → tek run.
- Worker SIGKILL → job iki kez uygulanmıyor.
- Adapter erişilemez → run `failed`/`blocked`, **`completed` değil**.
- Run olayına elle `completed` yazma denemesi → append-only trigger reddi.
- `setTimeout` ile tamamlanan kod yolu → grep testi **fail**.

## Security Tests

Appendix I: **T-15** (worker impersonation), T-19 (audit actor), T-11 (P10 ile ortak, runtime entegrasyonu).

## E2E

`tests/e2e/real-run.spec.ts` — **golden path'in kalbi.** Gerçek repo + gerçek task → compile → policy → gerçek adapter → gerçek dosya değişikliği → boundary kararı → quality gate → evidence. Tek adım simüle değil.

## Observability

`agent_run_duration`, `run_state_total{state}`, `queue_depth{kind}`, `queue_wait_time`, `worker_retry_rate`, `worker_crash_recovery_total`, `provider_error_rate`, `run_failure_total{reason}`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Worker çöker | Job askıda | Lease süresi dolar → yeniden claim; run `degraded` veya retry |
| Provider timeout | Run takılır | Adapter timeout → `failed` (sahte tamamlanma yok) |
| Duplicate event | Zaman çizelgesi bozulur | `UNIQUE(run_id, sequence)` + idempotency key |
| Kuyruk birikmesi | Uzun bekleme | `queue_depth` alarmı; öncelik + kapasite ayarı |
| Kısmi mutation | Tutarsız workspace | Lease + hash-before/after; iptal/hata durumunda geri alma |
| Process restart | Çalışan run | Restart sonrası state DB'den okunur; bellekte state tutulmaz |

## Rollback / Recovery

Sahte handler'lar geri getirilmez. Kuyruk ve FSM devreye alınırken legacy yüzey 410 döner; geri dönüş gerekirse legacy route'lar geçici olarak yeniden açılabilir **ama sahte tamamlanma davranışıyla değil** — 503 ile.

## Acceptance Criteria

1. Sahte run handler'ı silinmiş.
2. 13 durumlu FSM çalışıyor; geçersiz geçiş imkânsız.
3. Kuyruk `SKIP LOCKED` ile tam-bir-kez işliyor.
4. Idempotency, retry, iptal, çökme kurtarma çalışıyor.
5. Run manifest ve boundary olmadan `ready` olamıyor.
6. Gerçek adapter çalışıyor; gerçek dosya değişiyor.
7. Terminal durumlar değişmez.
8. `debug_logs`, `agent_*` tabloları göç etmiş/DROP edilmiş.
9. Restart sonrası run durumu persist'ten okunuyor.

## Evidence Required

```text
tests/e2e/real-run.spec.ts                PASS  ← golden path'in kalbi
tests/resilience/*.spec.ts                PASS
psql: SELECT state, COUNT(*) FROM task_runs GROUP BY 1     gerçek dağılım
gerçek git diff çıktısı                    agent'ın yaptığı değişiklik
grep -rn "selectedItemsCount: 3"          boş
worker SIGKILL kurtarma logu               kayıt
```

## Exit Gate

```bash
pnpm test --filter @y/runtime
pnpm run test:integration -- tests/integration/runtime
pnpm run test:resilience
pnpm run test:e2e -- tests/e2e/real-run.spec.ts
pnpm --filter @y/db run test:migrations:fresh
pnpm --filter @y/db run test:migrations:upgrade
```

**Bu gate geçilmeden ürün "çalışıyor" denemez.** `RunEvent` sözleşmesi burada donar — P13 buna bağımlıdır.

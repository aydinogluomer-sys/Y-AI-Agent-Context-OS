# Phase 13 — Real-Time Events & Approvals

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P12](P12-real-agent-runtime.md) · [P14 →](P14-evidence-audit-cas-consolidation.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P13 |
| **Workstream** | C + D |
| **Dependencies** | P12 |
| **Migration bloğu** | `0101`–`0104` |

## Objective

Run olaylarını gerçek zamanlı yayınlamak (SSE), onay akışını canlı hale getirmek, olay sıralaması ve idempotency garantilerini tanımlamak.

## Why This Phase Exists

Repo'da **hiçbir gerçek zamanlı mekanizma yok**:
- `text/event-stream` yok, `EventSource` yok, `res.flush` yok.
- WebSocket app kodu yok — `WebSocket` string'i yalnızca `src/main.tsx:12`'de Vite HMR konsol gürültüsünü filtrelemek için geçiyor.
- Tarayıcıda polling de yok. `WorkerRuntimeDashboard.tsx` tek `useEffect` ile bir kez fetch ediyor (L350); `useIndexOrchestration.ts` yalnız kullanıcı eylemi sonrası yeniden çekiyor (L82/95/114) ve geri bildirim `alert()` ile veriliyor (L110-112, 128).
- UI'daki "canlı" log akışları hard-coded string dizileri üzerinde `setInterval`.

Onay akışı bir governance ürününün çekirdeğidir ve bugün hiç yok. `ASK_APPROVAL` kararı (P10) canlı bildirilmezse run gereksiz bekler.

## Dependencies

P12 (`RunEvent` sözleşmesi, run FSM).

## Current Repository Reality

| Konu | Gerçek |
|---|---|
| SSE / WebSocket | Yok |
| Browser polling | Yok |
| Server-side polling | `workers/index-worker.ts:111-119` — `while(!stopped) { runOnce(); sleep(...) }`, ayrı process, manuel başlatılır |
| Olay sıralaması | `event_records` var; run bazlı sıra P12'de eklendi (`UNIQUE(run_id, sequence)`) |
| Onay | Backend P10'da kuruldu; canlı bildirim yok |
| UI geri bildirimi | `alert()` |

## Target State

```text
GET /api/v1/runs/:runId/events        text/event-stream
    Last-Event-ID desteği             kopma sonrası kayıpsız devam
    heartbeat (: comment) 15s         proxy timeout'a karşı
    olay tipleri:
      run.created · context.started · context.fragment.selected · context.completed
      policy.checked · policy.blocked
      agent.started · agent.tool_call · agent.command · agent.file_read · agent.file_write
      approval.requested · approval.resolved
      test.started · test.completed
      evidence.created
      run.completed · run.failed
```

**Garantiler:**
- **Sıra:** run içinde `sequence` monoton artar; istemci sıra dışı olay görmez.
- **Idempotency:** her olayın `event_id`'si benzersiz; tekrar gönderim istemcide tekilleştirilir.
- **At-least-once teslim:** kopma sonrası `Last-Event-ID`'den devam; tekrar mümkündür, kayıp değildir.

## Architecture Decisions

- **ADR-005** — SSE (master §4 gerekçesi).
- **ADR-049 (yeni)** — **Yayın kaynağı Event Store'dur, bellek değil.** Yayıncı `run_events`'i `LISTEN/NOTIFY` + sequence takibiyle okur. Alternatifler: (a) executor'dan doğrudan bellek üzerinden yayın, (b) DB'den okuma. Seçilen (b). Sebep: (a) çok-instance'lı dağıtımda çalışmaz ve kanıt ile yayın arasında ayrışma yaratır.
- **ADR-050 (yeni)** — **Approval yanıtı SSE üzerinden gelmez.** Onay `POST /approvals/:id/resolve` ile verilir; SSE yalnız bildirim kanalıdır. Sebep: yazma işlemleri idempotent, kimlik doğrulamalı ve audit'li olmalı; SSE tek yönlüdür.
- **ADR-051 (yeni)** — **Olay yükü redakte edilmiş olmalı.** `agent.file_read`/`file_write` olayları dosya **yolunu** ve hash'ini taşır, içeriği değil. Sebep: SSE akışı bir sızıntı kanalına dönüşmemeli.

## Files / Packages Affected

`apps/api/src/routes/runs.ts`, yeni `apps/api/src/sse/*`, `packages/runtime`, `apps/web` (minimum).

### New Files

```text
apps/api/src/sse/{stream.ts,subscription.ts,heartbeat.ts,resume.ts}
packages/runtime/src/events/{publisher.ts,notify.ts,types.ts}
apps/api/src/routes/approvals.ts        (P10'da kuruldu, canlı bildirim burada)
migrations/0101_run_events_notify.sql … 0104_approval_notifications.sql
apps/api/src/sse/__tests__/{stream,resume,ordering}.test.ts
tests/integration/sse/{reconnect,ordering,idempotency}.test.ts
```

### Files to Modify

- `packages/runtime/src/run/executor.ts` — olay yazımından sonra `pg_notify`.
- `apps/web/src/lib/api/*` — geçici SSE istemcisi (tam UI P15'te).

### Files to Delete/Deprecate

- `alert()` tabanlı geri bildirim (P15'te tamamen gider; burada SSE alternatifi gelir)
- UI'daki `setInterval` sahte log akışları — P15'te silinir

## Database Changes

```text
0101  run_events        + notify trigger (pg_notify('run_events', run_id))
0102  sse_subscriptions (opsiyonel telemetri: run_id, principal_id, connected_at, last_event_id)
0103  approval_requests + notification_state
0104  run_events        idx(run_id, sequence) — resume sorgusu için
```

## API Changes

```text
GET  /api/v1/runs/:runId/events        SSE; Last-Event-ID; auth zorunlu; membership kontrolü
GET  /api/v1/projects/:pid/approvals/stream   SSE (proje düzeyi onay bildirimleri)
POST /api/v1/approvals/:approvalId/resolve    (P10)
```

## Type / Contract Changes

`RunEventType` enum'u kesinleşir (yukarıdaki 18 tip). `SseEnvelope { id, event, data, retry }`.

## Frontend Changes

Minimum: SSE istemcisi + reconnect + tekilleştirme. **Tam UI P15'te.**

## Backend Changes

Executor olay yazdıktan sonra bildirim gönderir; SSE endpoint'i DB'den okur (ADR-049).

## Worker Changes

Yok (yayın API tarafında).

## Security Changes

- SSE bağlantısı authenticated + membership kontrollü; token süresi dolarsa bağlantı kapatılır.
- Olay yükleri redakte (ADR-051): içerik yok, yol + hash var.
- Rate limit: principal başına eşzamanlı SSE bağlantı sayısı sınırlı (DoS).
- `Last-Event-ID` ile geçmişe erişim de membership kontrolünden geçer (geçmiş olayları çalma denemesi).

## Migration Strategy

1. Publisher + `pg_notify` trigger.
2. SSE endpoint'i + heartbeat + resume.
3. Approval bildirimleri.
4. Frontend'e geçici istemci.

## Implementation Tasks

### Y-P13-001 — Event publisher
**Create:** `runtime/src/events/{publisher,notify}.ts`. Olay yazımı ve bildirim aynı transaction'da (`pg_notify` commit sonrası tetiklenir).

### Y-P13-002 — SSE stream endpoint'i
**Create:** `sse/stream.ts`. Header'lar: `text/event-stream`, `no-cache`, `X-Accel-Buffering: no`.
**Edge Cases:** İstemci yavaşsa backpressure; proxy buffering; bağlantı sızıntısı.

### Y-P13-003 — Heartbeat
**Create:** `sse/heartbeat.ts` — 15 saniyede bir `:` yorum satırı.

### Y-P13-004 — Resume (`Last-Event-ID`)
**Create:** `sse/resume.ts`. Verilen sequence'tan sonrasını `run_events`'ten okur, sonra canlı akışa geçer.
**Edge Cases:** Çok eski `Last-Event-ID` → tam geçmiş çok büyükse `retry` + snapshot yönlendirmesi.

### Y-P13-005 — Sıra ve tekilleştirme garantileri
Yayın sırası `sequence`'a göre; istemci tarafında `event_id` ile dedup.
**Acceptance:** Kopma/yeniden bağlanma senaryosunda istemci olay kümesi = sunucu olay kümesi (kayıp yok, yinelenen tekilleştiriliyor).

### Y-P13-006 — Approval canlı akışı
Proje düzeyinde onay bildirimleri; `approval.requested` olayı ilgili yetkili rollere ulaşır.

### Y-P13-007 — Yük redaksiyonu
`agent.file_read`/`file_write` olayları içerik taşımaz; yol + hash + karar.
**Negative test:** Olay yükünde dosya içeriği bulunursa test **fail**.

### Y-P13-008 — Bağlantı limitleri + kapanış
Principal başına eşzamanlı bağlantı sınırı; token süresi dolunca kapatma.

### Y-P13-009 — Frontend geçici SSE istemcisi

### Y-P13-010 — Migration'lar 0101–0104

## Parallelizable Tasks

```text
Y-P13-001 ∥ Y-P13-010
Y-P13-006 ∥ Y-P13-007
Y-P13-009 ∥ backend task'ları
```
Sıralı: `001 → 002 → 003 → 004 → 005`.

## Tests

| Suite | İçerik |
|---|---|
| `stream.test.ts` | Header'lar; olay formatı; kapanış |
| `resume.test.ts` | `Last-Event-ID` sonrası kayıpsız devam |
| `ordering.test.ts` | Sequence monotonluğu; sıra dışı olay yok |
| `idempotency.test.ts` | Tekrar gönderim → istemci tekilleştirmesi |
| `sse-auth.test.ts` | Yetkisiz principal → 403; token süresi dolunca kapanma |

## Negative Tests

- Membership'i olmayan principal SSE'ye bağlanır → **403**.
- `Last-Event-ID` ile başka run'ın olaylarını çekme denemesi → **403**.
- Olay yükünde dosya içeriği → test **fail**.
- Eşzamanlı bağlantı limiti aşımı → **429**.
- Token süresi dolduktan sonra akış devam ederse → test **fail** (bağlantı kapanmalı).
- `setInterval` ile üretilmiş sahte olay akışı → grep testi **fail**.

## Security Tests

T-02 (SSE üzerinden cross-tenant sızıntı), T-07 (yük redaksiyonu), T-14 (replay — `Last-Event-ID` ile geçmişe yetkisiz erişim).

## E2E

`tests/e2e/live-run.spec.ts` — bir run başlatılır, tarayıcı SSE'ye bağlanır, ilerleme adımları canlı görünür; ağ kesintisi simüle edilir, yeniden bağlanma sonrası hiçbir olay kaybolmaz; `ASK_APPROVAL` geldiğinde UI onay ister, onay verilir, run devam eder.

## Observability

`sse_connections_active`, `sse_reconnect_total`, `event_latency` (yazımdan yayına), `event_delivery_lag`, `approval_notification_latency`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Proxy buffering | Olaylar gecikmeli gelir | `X-Accel-Buffering: no` + heartbeat; deployment dokümanında nginx/ALB ayarı |
| Bağlantı sızıntısı | Bellek/FD tükenir | Bağlantı limiti + idle timeout + kapanış temizliği |
| `pg_notify` payload limiti | Bildirim düşer | Payload yalnız `run_id`; içerik DB'den okunur |
| Çok-instance | Bir instance olayı kaçırır | `LISTEN` her instance'ta; okuma DB'den (ADR-049) |
| Olay patlaması | İstemci boğulur | Sunucu tarafı batching + istemci tarafı throttle; kanıt akışı etkilenmez |

## Rollback / Recovery

SSE devre dışı bırakılırsa UI, `GET /runs/:id` polling'ine düşer (P15 bunu fallback olarak destekler). Kanıt zinciri etkilenmez — yayın bir görünüm katmanıdır.

## Acceptance Criteria

1. SSE endpoint'i çalışıyor; 18 olay tipi yayınlanıyor.
2. `Last-Event-ID` ile kopma sonrası kayıpsız devam.
3. Sıra ve tekilleştirme garantileri test edilmiş.
4. Onay istekleri canlı bildiriliyor; onay `POST` ile veriliyor.
5. Olay yükleri içerik taşımıyor.
6. SSE membership kontrollü; token süresi dolunca kapanıyor.
7. Bağlantı limitleri uygulanıyor.
8. UI'da `setInterval` ile üretilmiş sahte akış yok (backend tarafı; UI P15).

## Evidence Required

```text
tests/integration/sse/*.test.ts           PASS
tests/e2e/live-run.spec.ts                PASS (kesinti senaryosu dahil)
SSE ham akış örneği                        dosya (id/event/data satırları)
event_latency p95                          metrik
reconnect sonrası olay kümesi karşılaştırması   eşit
```

## Exit Gate

```bash
pnpm test --filter @y/runtime
pnpm run test:integration -- tests/integration/sse
pnpm run test:e2e -- tests/e2e/live-run.spec.ts
pnpm run test:security -- tests/security/sse-auth.spec.ts
```

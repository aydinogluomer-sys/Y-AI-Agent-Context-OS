# Phase 18 — Reliability / Observability / Performance

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P17](P17-security-hardening.md) · [P19 →](P19-cicd-deployment-migration.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P18 |
| **Workstream** | F — Quality / Ops |
| **Dependencies** | P12, P14 |
| **Migration bloğu** | — (partition/retention P14'te başladı) |

## Objective

Sistemi çalıştırılabilir hale getirmek: yapılandırılmış loglar, korelasyon/run/trace ID'leri, metrikler, OpenTelemetry, bağımlılık bazlı sağlık probe'ları, dayanıklılık senaryoları ve ölçek hedefleri.

## Why This Phase Exists

Bugünkü operasyonel yüzey:
- `/health`, `/healthz`, `/readyz` var (`index.ts:913-946`) ama **bağımlılık bazlı değil**; DB dışında hiçbir alt sistemi yansıtmıyor.
- Metrik yok, tracing yok, yapılandırılmış log yok (`sysLogger` var ama korelasyon taşımıyor — P01'de `X-Correlation-Id` eklendi).
- Dayanıklılık senaryoları hiç test edilmedi: worker çökmesi, provider timeout, DB restart, yinelenen olay, kuyruk retry, ağ hatası, process restart, kısmi yazım, stale lock, index kesintisi.
- Ölçek hiç ölçülmedi. `listFiles` her çağrıda <1MB dosyaların tamamını senkron SHA-256'lıyordu (P03'te streaming'e geçti); `GET .../runs/:runId/events` tüm task olaylarını çekip **JS'te** filtreliyordu (P12'de düzeltildi).
- `MockDatabaseConnector` production kod yolunda duruyor (P19'da silinecek).

## Dependencies

P12 (runtime), P14 (kanıt). P15, P16, P17 ile **paralel yürütülebilir**.

## Current Repository Reality

| Konu | Gerçek |
|---|---|
| Health | 3 endpoint, yüzeysel |
| Readiness | DB'ye bakıyor; queue/worker/index/graph/provider durumu yok |
| Metrics | Yok |
| Tracing | Yok |
| Structured logs | Kısmi (`sysLogger`); korelasyon P01'de eklendi |
| Dayanıklılık testleri | Yok |
| Performans ölçümü | Yok |
| Backup/restore | Doküman yok, test edilmemiş |

## Target State

**Health/Readiness (bağımlılık bazlı):**

```text
/healthz   process canlı mı
/readyz    DB · queue · workers · index · graph · event store · CAS · policy store · providers
           her biri: ok | degraded | down  + son kontrol zamanı
           policy store down → readyz degraded (P02 fail-closed ile tutarlı)
```

**Metrikler (master §27):**

```text
context_compile_latency · retrieval_latency · index_latency · agent_run_duration
provider_error_rate · policy_denial_rate · approval_rate · context_tokens
context_reduction_ratio · retrieval_recall · worker_retry_rate
queue_depth · queue_wait_time · chain_verify_duration · sse_connections_active
```

**Ölçek hedefleri (ölçülecek ve bütçelenecek):**

```text
10K · 50K · 100K dosya
1M · 5M · 10M+ LOC
```

## Architecture Decisions

- **ADR-066 (yeni)** — **OpenTelemetry.** Traces + metrics; exporter yapılandırılabilir (OTLP). Alternatif: doğrudan Prometheus client. Seçilen OTel; sebep: tracing ve metrics tek SDK, vendor bağımsız.
- **ADR-067 (yeni)** — **`run_id` birinci sınıf korelasyon anahtarıdır.** Her log, metrik ve trace `run_id` (varsa) + `correlation_id` + `trace_id` taşır. Sebep: bir run'ın hikâyesi üç sistemde de aynı anahtarla izlenebilmeli.
- **ADR-068 (yeni)** — **Readiness gerçeği yansıtır, iyimser değildir.** Bir bağımlılık degraded ise `readyz` degraded döner ve load balancer bunu görür. Sebep: bugünkü "DB var mı" kontrolü, policy store çöktüğünde sistemin fail-closed olduğunu gizler.
- **ADR-069 (yeni)** — **Performans bütçeleri testtir.** Ölçüm raporu değil, eşik; aşımda CI **fail** (nightly).

## Files / Packages Affected

Yeni `packages/observability`, `apps/api/src/routes/admin.ts`, `tests/resilience`, `tests/performance`.

### New Files

```text
packages/observability/package.json
packages/observability/src/{index.ts,logger.ts,metrics.ts,tracing.ts,context.ts}
apps/api/src/health/{healthz.ts,readyz.ts,checks/*.ts}
tests/resilience/{worker-crash,provider-timeout,db-restart,duplicate-event,
                  queue-retry,network-error,process-restart,partial-write,
                  stale-lock,index-interruption}.spec.ts
tests/performance/{index-scale,compile-latency,graph-traversal,retrieval-latency,
                   event-latency,memory,db-size}.spec.ts
docs/operations/{runbook.md,backup-restore.md,scaling.md,slo.md}
scripts/perf/{generate-fixture-repo.ts,measure.ts}
```

### Files to Modify

- Tüm paketler — `sysLogger` yerine `packages/observability` logger'ı; her log `run_id`/`correlation_id` taşır.
- `apps/api/src/index.ts` — mevcut 3 health endpoint'i kanonik implementasyona devreder.

### Files to Delete/Deprecate

- `sysLogger`'ın korelasyonsuz kullanımları

## Database Changes

Yeni tablo yok. P14'te başlayan partition/retention politikaları burada operasyonelleşir:
- `run_events` ve `audit_logs` için otomatik partition oluşturma job'ı
- Retention penceresi + arşivleme (kanıt **silinmez**, soğuk depolamaya taşınır)

## API Changes

```text
GET /healthz                          (auth'suz)
GET /readyz                           (auth'suz, bağımlılık detayı)
GET /metrics                          (korumalı — token veya ağ kısıtı)
GET /api/v1/admin/health              (detaylı, role-gated)
```

## Type / Contract Changes

`HealthStatus`, `DependencyCheck`, `MetricName` (P01'e eklenir).

## Frontend Changes

Advanced → Health yüzeyi gerçek veriye bağlanır (P15'te iskelet kuruldu).

## Backend Changes

Her istek/job bir trace span'i açar; alt sistemler child span üretir.

## Worker Changes

Worker'lar heartbeat'e ek olarak metrik yayınlar; çökme kurtarma senaryoları test edilir.

## Security Changes

- `/metrics` korumalı (açık metrik endpoint'i bilgi sızdırır).
- Loglar redaksiyonlu (`packages/security` redactor'ı logger'a bağlanır).
- Trace attribute'larında sır/PII yok.

## Migration Strategy

1. Observability paketi + logger göçü.
2. Metrikler + tracing.
3. Bağımlılık bazlı readiness.
4. Dayanıklılık test suite'i.
5. Performans fixture'ları + bütçeler.
6. Operasyon dokümanları + backup/restore tatbikatı.

## Implementation Tasks

### Y-P18-001 — Observability paketi
**Create:** `packages/observability/src/*`. Structured logger (JSON), async context (correlation/run/trace), redaksiyon entegrasyonu.

### Y-P18-002 — Logger göçü
Tüm paketlerde `sysLogger` → yeni logger. **Acceptance:** Korelasyon taşımayan log satırı yok.

### Y-P18-003 — Metrikler
15+ metrik (master §27). Histogram/counter/gauge seçimleri dokümante.

### Y-P18-004 — OpenTelemetry tracing
İstek → job → adapter → DB span zinciri. **Acceptance:** Bir run'ın tam trace'i tek `run_id` ile bulunabiliyor.

### Y-P18-005 — Bağımlılık bazlı readiness
**Create:** `health/checks/*.ts` — DB, queue, worker havuzu, index sağlığı, graph sağlığı, event store, CAS, policy store, provider health.
**Acceptance:** Policy store kapalıyken `readyz` **degraded** (bugün ok dönerdi).

### Y-P18-006 — Dayanıklılık suite'i (10 senaryo)
```text
worker crash · provider timeout · DB restart · duplicate event · queue retry
network error · process restart · partial write · stale lock · index interruption
```
Her senaryo için: beklenen davranış + veri kaybı yok + sahte başarı yok.

### Y-P18-007 — Performans fixture üreteci
**Create:** `scripts/perf/generate-fixture-repo.ts` — 10K/50K/100K dosya, 1M/5M/10M LOC sentetik repo'lar (gerçek repo'lar P16'da; burada ölçek için sentetik uygundur).

### Y-P18-008 — Performans bütçeleri
```text
initial index (100K dosya)     hedef belirlenir, aşımda fail
incremental index (1 dosya)    < tam index'in %1'i
context compile                p95 hedefi
graph traversal (depth 3)      p95 hedefi
semantic retrieval             p95 hedefi
event latency (yazım→SSE)      p95 hedefi
memory (worker başına)         tavan
DB size (100K dosya)           tahmin + gerçek
embedding cost (100K dosya)    tahmin + gerçek
```
Hedefler ilk ölçümden sonra kesinleşir; **regresyon toleransı sıfır değil ama tanımlı** (%10).

### Y-P18-009 — Backup / restore
**Create:** `docs/operations/backup-restore.md` + tatbikat.
**Acceptance:** Yedekten geri yükleme **gerçekten denenmiş** ve süresi ölçülmüş; kanıt zinciri geri yükleme sonrası doğrulanıyor.

### Y-P18-010 — Runbook + SLO
**Create:** `docs/operations/{runbook,slo,scaling}.md`. Alarm eşikleri, eskalasyon, kapasite planlaması.

### Y-P18-011 — Partition/retention otomasyonu

### Y-P18-012 — Darboğaz analizi
İlk ölçümlerden sonra en yavaş 3 yolun profillenmesi ve bütçeye alınması.

## Parallelizable Tasks

```text
Y-P18-003 ∥ Y-P18-004 ∥ Y-P18-005
Y-P18-006 ∥ Y-P18-007 + 008
Y-P18-009 ∥ Y-P18-010
```
Sıralı: `001 → 002 → (003∥004∥005)`, `007 → 008 → 012`.

## Tests

| Suite | İçerik |
|---|---|
| `tests/resilience/*.spec.ts` | 10 senaryo |
| `tests/performance/*.spec.ts` | Bütçe eşikleri (nightly) |
| `health.test.ts` | Her bağımlılık için ok/degraded/down |
| `logger.test.ts` | Korelasyon taşınması; redaksiyon |
| `tracing.test.ts` | Span zinciri bütünlüğü |

## Negative Tests

- Policy store kapalı → `readyz` **degraded** (ok değil).
- DB restart sırasında çalışan run → veri kaybı yok, run `degraded` veya retry.
- Yinelenen olay → `UNIQUE(run_id, sequence)` reddi, zaman çizelgesi bozulmuyor.
- Kısmi yazım → hash-before/after ile tespit, geri alma.
- Performans bütçesi aşımı → nightly CI **fail**.
- Korelasyonsuz log satırı → lint/test **fail**.
- `/metrics` auth'suz erişim → **401/403**.

## Security Tests

- `/metrics` erişim kontrolü.
- Log ve trace'lerde sır/PII taraması.

## E2E

`tests/e2e/observability.spec.ts` — bir run başlatılır; log/metric/trace üçlüsünde aynı `run_id` ile izlenebiliyor; `readyz` bağımlılık detayı doğru.

## Observability

Bu fazın konusu. Ek olarak meta-metrik: `observability_export_failure_total`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| OTel collector down | Trace kaybı | Uygulama etkilenmez (fire-and-forget); `export_failure` metriği |
| Metrik kardinalite patlaması | Bellek/maliyet | Label allow-list; `run_id` **label değil**, trace attribute'u |
| Log hacmi | Depolama | Seviye bazlı örnekleme; audit ve security event'ler **örneklenmez** |
| Performans regresyonu | Nightly fail | Bütçe aşımı bloklayıcı; darboğaz profillenir |
| Backup doğrulanmamış | Felakette kayıp | Tatbikat zorunlu (Y-P18-009 acceptance) |

## Rollback / Recovery

Observability katmanı uygulama davranışını değiştirmez; sorun halinde exporter kapatılabilir. Performans bütçeleri ayarlanabilir ama **kaldırılamaz**.

## Acceptance Criteria

1. Yapılandırılmış loglar; her satır correlation/run/trace ID taşıyor.
2. 15+ metrik yayınlanıyor.
3. OTel tracing çalışıyor; bir run'ın tam trace'i izlenebiliyor.
4. `readyz` bağımlılık bazlı ve gerçeği yansıtıyor.
5. 10 dayanıklılık senaryosu test edilmiş ve geçiyor.
6. Performans bütçeleri tanımlı ve ölçülmüş (10K/50K/100K dosya, 1M/5M/10M LOC).
7. Backup/restore **gerçekten denenmiş**; kanıt zinciri geri yükleme sonrası doğrulanıyor.
8. Runbook, SLO ve scaling dokümanları yazılmış.
9. `/metrics` korumalı; loglarda sır yok.

## Evidence Required

```text
tests/resilience/*.spec.ts                 10/10 PASS
tests/performance/*.spec.ts                bütçe raporu
readyz çıktısı (policy store kapalıyken)   degraded
örnek trace (run_id ile)                    ekran görüntüsü/JSON
backup-restore tatbikat kaydı               süre + doğrulama çıktısı
ölçek ölçüm tablosu                         10K/50K/100K, 1M/5M/10M
log örneği                                  korelasyon alanları dolu, sır yok
```

## Exit Gate

```bash
pnpm test --filter @y/observability
pnpm run test:resilience                    # 10 senaryo
pnpm run test:performance                   # bütçeler
pnpm run test:e2e -- tests/e2e/observability.spec.ts
tsx scripts/perf/measure.ts --report
```

Ek zorunluluk: **backup/restore tatbikatı yapılmış** ve kanıtı belgede.

---

## Uygulama Kaydı (2026-08-14)

| Görev | Durum | Kanıt |
|---|---|---|
| Bağımlılık bazlı `/readyz` | Tamam | `observability/health.ts` + 6 probe |
| Metrik kayıt defteri + `/metrics` | Tamam | `observability/metrics.ts`, 14 metrik |
| Probe zaman aşımı ve paralellik | Tamam | 39 test |
| OpenTelemetry tracing | **YAPILMADI** | ek bağımlılık; kapsam kararı |
| Dayanıklılık senaryoları | **YAPILMADI** | canlı ortam gerektiriyor (P19) |
| Performans ölçümü | **YAPILMADI** | gerçek yük gerektiriyor |

### En önemli düzeltme — `/readyz` artık bağımlılık bazlı

P00'da her bileşenin durumu tek bir `dbHealthy` değişkeninden
türetiliyordu:

```ts
worker_runtime: { status: dbHealthy ? "healthy" : "degraded" },
evidence_store: { status: dbHealthy ? "healthy" : "offline" },
event_store:    { status: dbHealthy ? "healthy" : "offline" },
cas_storage:    { status: dbHealthy ? "healthy" : "offline" }
```

Beş "bileşen" tek bir şeyi ölçüyordu. Kuyruk tıkalı, worker'lar ölü,
policy store boş ya da index bozuk olsa bile `readyz` **"ready"**
diyordu. `permission_kernel` ise sabitti — hiçbir şey kontrol
etmiyordu.

Artık altı bileşen kendi sorgusunu çalıştırıyor, kendi gecikmesini
raporluyor ve zaman aşımıyla korunuyor.

### Kararlar

**`healthz` ≠ `readyz`.** Liveness bağımlılık kontrol etmez; DB'ye bakan
bir liveness probe, DB kısa süre yavaşladığında tüm süreçleri yeniden
başlatır ve kesintiyi büyütür.

**`degraded` ayrı bir durumdur ve 200 döner.** Kısmi çalışan bir sistemi
503 ile tamamen kapatmak aşırı tepki olurdu.

**Probe'lar paralel.** Sıralı çalıştırmak süreyi bileşen sayısıyla
çarpardı: 6 × 3sn = 18sn, ki bu her load balancer probe'unun zaman
aşımını aşar.

**Policy store boşsa `degraded`** — P02'nin fail-closed kararıyla aynı
hatta: yetki kararı verilemeyen bir sistem trafik almamalıdır.

### Metrik kayıt defteri bir NİYET BEYANI DEĞİL

14 metrik tanımlı ama **hiçbiri henüz toplanmıyor**. `unmeasured()` bunu
görünür kılar ve `/metrics` çıktısı hangi metriklerin toplanmadığını
açıkça listeler.

Ölçülmemiş metrik **çıktıda görünmez**: sıfırla basmak "ölçtük ve sıfır
çıktı" demek olurdu — P16'da sildiğimiz hatanın aynısı.

Bilinmeyen bir metrik adı sessizce kabul edilmez: adı yanlış yazılmış
bir metrik, sessizce kabul edilirse çıktıda hiç görünmez.

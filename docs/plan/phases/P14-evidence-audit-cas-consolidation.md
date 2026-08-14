# Phase 14 — Evidence / Audit / CAS Consolidation

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P13](P13-realtime-events-and-approvals.md) · [P15 →](P15-ui-product-consolidation.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P14 |
| **Workstream** | D — Evidence Platform |
| **Dependencies** | P12, P13 |
| **Migration bloğu** | `0105`–`0112` |

## Objective

Mevcut kanıt altyapısını (Event Store · Evidence Store · CAS · Audit · Quality Gates) tek bir **PROOF plane**'e birleştirmek: hash chain, imzalı kanıt paketi, gerçek quality gate çalıştırma. Bu modüller **silinmez**, ayrı ürün ekranı olmaktan çıkarılıp headless capability'ye dönüşür.

## Why This Phase Exists

Bu alanın büyük kısmı **gerçek** — planın koruması gereken en değerli varlık:

- `event_records` append-only, `block_event_records_mutation()` trigger'ıyla (`db.ts:1868-1885`), `payload_hash` SHA-256 (`EventStoreService.ts:68`), idempotency unique index.
- `evidence_records` gerçek `content_hash`; `verifyEvidenceRecord` (L463-530) yeniden hesaplayıp karşılaştırıyor.
- `cas_blobs` + `artifact_versions`, `UNIQUE(project_id, cas_hash)` dedup, `parent_version_id` sürüm zinciri.
- Audit log gerçek ve redaksiyonlu.

Ama üç kritik eksik var:

1. **Hash chain yok.** `prev_hash` kolonu yok; olaylar tek tek hash'li ama **dizi olarak** tamper-evident değil. Bir olayı silmek zincirin fark edeceği bir iz bırakmaz (append-only trigger silmeyi engelliyor ama DB'ye doğrudan erişimi olan biri için garanti zayıf).
2. **Authenticity yok.** `EvidenceStoreService` kendi mesajında dürüstçe söylüyor: *"SHA-256 digest matching confirmed; no actor signature was evaluated."* (L530). Bütünlük var, imza yok.
3. **Quality gate çalıştırma yok.** `QualityGateService` caller'ın gönderdiği `{command_type, status, exit_code, raw_output}` verisini kaydediyor (L294-364). **Sunucu hiçbir zaman lint/typecheck/test çalıştırmıyor.** Context pack'teki `quality_gates` dizisi de statik hard-coded komut listesiydi (`context/src/index.ts:1334-1340`, P08'de kaldırıldı).

Ayrıca `EvidenceStoreService.ts:231` gibi noktalarda `enforce()` çağrıları `subject_type:"system"` hard-code ediyordu ve `policy-system-bypass` yüzünden her zaman allow dönüyordu — P02'de kapatıldı, burada doğrulanır.

## Dependencies

P12 (run + event zinciri), P13 (olay yayını).

## Current Repository Reality

Yukarıdaki + `artifacts` ve `connections` tabloları **0 referans** (ölü şema), `debug_logs` P12'de DROP edildi.

## Target State

```text
RUN #Y-84922

Context     ✓ 14 files · 31,284 tokens · 100% provenance
Security    ✓ 3 sensitive sources excluded · 0 secret leak
Agent       Codex
Changes     ✓ 4 files · +181 −43
Tests       ✓ 47 / 47
Boundaries  ✓ no unauthorized mutation
Evidence    B74F8A...
```

Bu özet **hesaplanır**, yazılmaz. Kaynağı: manifest (P09) + mutation kararları (P10) + run olayları (P12) + gate sonuçları (P14).

## Architecture Decisions

- **ADR-052 (yeni)** — **Olay zinciri hash-chained.** Her olay `prev_hash` taşır; `chain_index` monoton. Zincir başı (`chain_head`) run kaydında tutulur. Silinen/değiştirilen olay zinciri kırar ve `verify` bunu tespit eder.
- **ADR-053 (yeni)** — **Evidence imzalanır.** İmzalama anahtarı secret manager'da; `signer_key_id` kayıtta. Alternatifler: (a) yalnız hash (bugünkü), (b) HMAC, (c) asimetrik imza. Seçilen (c). Sebep: kanıtın üçüncü tarafça doğrulanabilmesi gerekir; HMAC doğrulayıcıya sır verir.
- **ADR-054 (yeni)** — **Quality gate'ler Y tarafından çalıştırılır.** Caller'ın bildirdiği sonuç kabul edilmez. Çalıştırma sandbox'ta, komut allow-list'iyle (P10 `command-policy`), gerçek exit code ile. Sebep: "testler geçti" iddiası ancak Y çalıştırdıysa kanıttır.
- **ADR-055 (yeni)** — **CAS içerik depolamada büyük yükler için pluggable backend.** Bugünkü DB-backed CAS korunur (küçük yükler için doğru seçim); >1MB yükler için object storage arayüzü eklenir. Sebep: `payload_text` ile Postgres'i blob store'a çevirmek ölçeklenmez.

## Files / Packages Affected

Yeni `packages/evidence`, mevcut servislerin taşınması, `workers/quality-gate-worker.ts`.

### New Files

```text
packages/evidence/package.json
packages/evidence/src/{index.ts,types.ts}
packages/evidence/src/event-store/{store.ts,chain.ts,verify.ts}
packages/evidence/src/evidence-store/{store.ts,bundle.ts,sign.ts,verify.ts}
packages/evidence/src/cas/{store.ts,backend-db.ts,backend-object.ts}
packages/evidence/src/audit/{log.ts,query.ts}
packages/evidence/src/quality-gates/{runner.ts,sandbox.ts,parsers.ts}
apps/api/src/routes/evidence.ts
migrations/0105_run_events_chain.sql … 0112_drop_dead_tables.sql
packages/evidence/src/__tests__/{chain,sign,verify,cas,gates}.test.ts
tests/security/{event-chain,cas-integrity,audit-actor}.spec.ts
```

### Files to Modify

- `EventStoreService.ts` → `packages/evidence/src/event-store/`; `prev_hash` hesabı eklenir.
- `EvidenceStoreService.ts` → `packages/evidence/src/evidence-store/`; imzalama eklenir; dürüst "no actor signature" mesajı artık geçerli değil (imza var).
- `ArtifactCASService.ts` → `packages/evidence/src/cas/`; backend soyutlaması.
- `QualityGateService.ts` → `packages/evidence/src/quality-gates/`; **runner** eklenir, ingest-only mod kaldırılır.
- `apps/api/src/audit.ts` → `packages/evidence/src/audit/`.

### Files to Delete/Deprecate

- `artifacts` tablosu (0 referans) — **DROP**
- `connections` tablosu (0 referans) — **DROP**
- `context_summaries` · `durable_memories` · `boundary_checks` · `repo_access_logs` (yalnız yazılıyor, hiç okunmuyor) — **DROP**
- `context_packs` (P08'de yazım durdu, P09'da yerini `context_manifests` aldı) — **DROP**
- Quality gate'in "caller sonucu bildirir" API'si — **DELETE**

## Database Changes

```text
0105  run_events        + prev_hash, + chain_index; UNIQUE(run_id, chain_index)
                        chain doğrulama fonksiyonu (SQL)
0106  task_runs         + chain_head_hash, + chain_length
0107  evidence_records  + run_id FK, + signature, + signer_key_id, + signed_at
0108  cas_blobs         + organization_id, + storage_backend, + external_ref
0109  quality_gate_runs + run_id FK, + executed_by_worker_id, + command_hash
                        + sandbox_image
0110  audit_logs        partition (aylık) + retention politikası
0111  evidence_bundles  (run_id, bundle_hash, signature, content_ref) IMMUTABLE
0112  artifacts, connections, context_summaries, durable_memories,
      boundary_checks, repo_access_logs, context_packs   DROP
```

## API Changes

```text
GET  /api/v1/runs/:runId/evidence            kanıt paketi (özet + referanslar)
GET  /api/v1/runs/:runId/evidence/verify     zincir + hash + imza doğrulaması
GET  /api/v1/runs/:runId/timeline            olay zaman çizelgesi
GET  /api/v1/runs/:runId/verification        gate sonuçları (gerçek exit code)
GET  /api/v1/projects/:pid/audit
GET  /api/v1/artifacts/:artifactId           headless CAS erişimi
```
Quality gate "sonuç bildir" endpoint'i → **DELETE**.

## Type / Contract Changes

`EvidenceBundle`, `QualityGateResult`, `AuditEntry`, `ChainVerification` (P01) implemente edilir.

## Frontend Changes

Yok (P15 tek Run Evidence deneyimini kurar). Mevcut `EvidenceStorePanel`, `EventJournalPanel`, `ArtifactCenterPanel`, `QualityGateReportPanel` **gerçek API kullanıyor** ve P15'te birleştirilecek — bu fazda API'leri kanonik yüzeye taşınır.

## Backend Changes

Quality gate çalıştırma bir job'dır; run FSM'inin `verifying` durumunda tetiklenir.

## Worker Changes

`workers/quality-gate-worker.ts` — sandbox'ta gerçek komut çalıştırır (`execFile`, allow-list, timeout, kaynak limiti), çıktıyı CAS'a yazar, exit code'u kaydeder.

## Security Changes

- **T-18 (event forgery):** hash chain + append-only + actor doğrulaması.
- **T-16/T-17 (artifact poisoning / CAS tampering):** yazan principal kaydı + hash doğrulaması.
- **T-19 (audit actor spoofing):** actor daima principal'dan (P02'de kuruldu, burada tüm evidence yolları için doğrulanır).
- Quality gate sandbox: ağ erişimi kısıtlı, dosya sistemi yalnız workspace, kaynak limitleri (T-22).
- İmzalama anahtarı secret manager'da; rotasyon prosedürü dokümante.

## Migration Strategy

1. Hash chain şeması + mevcut olayların zincire bağlanması (geriye dönük `prev_hash` hesabı, tek seferlik job).
2. İmzalama altyapısı + evidence bundle.
3. Quality gate runner + sandbox; ingest-only API kaldırılır.
4. CAS backend soyutlaması.
5. Ölü tabloların DROP'u.

## Implementation Tasks

### Y-P14-001 — Hash chain
**Create:** `event-store/chain.ts`. `prev_hash = önceki olayın payload_hash`; `chain_index` monoton.
**Edge Cases:** Eşzamanlı yazım → `UNIQUE(run_id, chain_index)` + advisory lock ile serileştirme.
**Acceptance:** Zincir doğrulaması O(n) ve deterministik.

### Y-P14-002 — Geriye dönük zincir kurulumu
Mevcut `event_records` satırları için tek seferlik migration job'ı; zincir öncesi kayıtlar `chain_index` NULL ile arşiv olarak işaretlenir (sahte zincir üretilmez).

### Y-P14-003 — Zincir doğrulama
**Create:** `event-store/verify.ts` + SQL fonksiyonu. Kırık halka tespiti + hangi indekste kırıldığı.

### Y-P14-004 — Evidence imzalama
**Create:** `evidence-store/sign.ts`. Asimetrik imza; `signer_key_id`; anahtar rotasyonu.
**Acceptance:** Üçüncü taraf, public key ile doğrulayabiliyor.

### Y-P14-005 — Evidence bundle
**Create:** `evidence-store/bundle.ts`. İçerik: manifest hash, included/excluded, policy kararları, principal, agent kimliği + capabilities, tool çağrıları, komutlar, diff, gate sonuçları, onaylar, artifact'lar, zaman damgaları, commit SHA, zincir başı.
**Acceptance:** Bundle'dan run özeti (§Target State) **hesaplanabiliyor**.

### Y-P14-006 — Quality gate runner
**Create:** `quality-gates/{runner,sandbox,parsers}.ts`.
**Algorithm:** Proje gate tanımı → allow-list doğrulaması → sandbox'ta `execFile` → exit code + stdout/stderr → CAS'a yazım → sonuç kaydı.
**Edge Cases:** Timeout, OOM, sonsuz çıktı (boyut limiti), flaky test (retry politikası **yok** — sonuç neyse o).

### Y-P14-007 — Gate çıktı ayrıştırıcıları
JUnit XML, TAP, `tsc` çıktısı, ESLint JSON → yapılandırılmış sonuç. Ayrıştırılamayan çıktı ham olarak saklanır ve `parsed: false` işaretlenir.

### Y-P14-008 — Ingest-only API'nin kaldırılması
**Negative test:** Caller'ın gönderdiği `status: "passed"` kabul edilmiyor.

### Y-P14-009 — CAS backend soyutlaması
**Create:** `cas/{backend-db,backend-object}.ts`. >1MB yükler object storage'a.

### Y-P14-010 — Audit partition + retention

### Y-P14-011 — Ölü tabloların DROP'u (0112)
**Ön koşul:** Her tablo için "0 okuma, 0 yazma" P00 envanterinden ve güncel grep'ten doğrulanır.

### Y-P14-012 — Kanonik evidence route'ları

## Parallelizable Tasks

```text
Y-P14-001..003 (chain) ∥ Y-P14-006 + 007 (gates) ∥ Y-P14-009 (CAS)
Y-P14-010 ∥ Y-P14-011
```
Sıralı: `001 → 002 → 003`, `004 → 005`, `006 → 007 → 008`.

## Tests

| Suite | İçerik |
|---|---|
| `chain.test.ts` | Zincir kurulumu; eşzamanlı yazım; kırık halka tespiti |
| `sign.test.ts` | İmza üretimi/doğrulaması; anahtar rotasyonu; yanlış anahtar reddi |
| `bundle.test.ts` | Bundle'dan run özeti hesaplanabiliyor; eksik alan → hata |
| `gates.test.ts` | Gerçek komut çalıştırma; exit code; timeout; çıktı limiti |
| `cas.test.ts` | Dedup; hash doğrulaması; backend geçişi |
| `verify.test.ts` | Uçtan uca: zincir + hash + imza |

## Negative Tests

- Olay silme denemesi → trigger reddi **ve** zincir doğrulaması kırık halka bildirir.
- Elle değiştirilmiş `payload_json` → hash uyuşmazlığı.
- Yanlış anahtarla imza → doğrulama reddi.
- Caller'ın bildirdiği gate sonucu → **kabul edilmiyor**.
- Allow-list dışı gate komutu → reddediliyor.
- Gate timeout → `failed`, **`passed` değil**.
- CAS'a farklı içerikle aynı hash yazma denemesi → reddediliyor.
- Audit satırında elle actor → reddediliyor.

## Security Tests

Appendix I: **T-16, T-17, T-18, T-19** + T-22 (gate sandbox).

## E2E

`tests/e2e/evidence.spec.ts` — tam bir run sonrası kanıt paketi çekilir; özet §Target State formatında; `verify` `ok` döner; bir olay elle bozulduğunda `verify` **kırık halka** bildirir; gate sonuçları gerçek exit code taşır.

## Observability

`evidence_bundle_size`, `chain_verify_duration`, `chain_break_total` (0 olmalı — >0 **alarm**), `quality_gate_duration{command}`, `quality_gate_failure_total`, `cas_dedup_ratio`, `cas_storage_bytes{backend}`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Zincir kırılır | `verify` fail | Güvenlik olayı; run `blocked`; operatör incelemesi; kanıt geçersiz sayılır |
| İmzalama anahtarı erişilemez | Evidence yazılamaz | Run `degraded`; kanıt imzasız yazılmaz (fail-closed) |
| Gate sandbox çöker | Sonuç yok | Gate `error`, `passed` değil; run `verifying`'de kalmaz, `failed`'a gider |
| CAS dolar | Yazım hatası | Kota alarmı; object backend'e geçiş |
| Partition bakımı unutulur | Tablo şişer | Otomatik partition oluşturma job'ı + alarm |

## Rollback / Recovery

Hash chain geriye dönük eklendi; devre dışı bırakılamaz (kanıt gerilemesi). İmzalama anahtarı rotasyonu geriye dönük doğrulamayı bozmaz (`signer_key_id` ile eski anahtarlar saklanır). Ölü tablo DROP'ları ayrı commit ve yedek sonrası.

## Acceptance Criteria

1. `run_events` hash-chained; kırık halka tespit ediliyor.
2. Evidence imzalı; üçüncü taraf doğrulayabiliyor.
3. Quality gate'ler **Y tarafından** çalıştırılıyor; caller sonucu kabul edilmiyor.
4. Run özeti kanıttan hesaplanıyor (yazılmıyor).
5. CAS backend soyutlaması var; dedup ve bütünlük korunuyor.
6. Audit partition + retention uygulanıyor.
7. 7 ölü tablo DROP edilmiş.
8. Kanıt modülleri headless; ayrı ürün ekranı değil (UI P15'te tek Run Evidence).

## Evidence Required

```text
tests/security/{event-chain,cas-integrity,audit-actor}.spec.ts   PASS
tests/e2e/evidence.spec.ts                PASS
gerçek gate çıktısı + exit code            kayıt
imza doğrulama çıktısı (public key ile)    kayıt
bozulmuş olay sonrası verify çıktısı       kırık halka indeksi
chain_break_total metriği                  0
```

## Exit Gate

```bash
pnpm test --filter @y/evidence
pnpm run test:integration -- tests/integration/evidence
pnpm run test:security -- tests/security/event-chain.spec.ts tests/security/cas-integrity.spec.ts
pnpm run test:e2e -- tests/e2e/evidence.spec.ts
pnpm --filter @y/db run test:migrations:fresh
pnpm --filter @y/db run test:migrations:upgrade
```

---

## Uygulama Kaydı (2026-08-14)

| Görev | Durum | Kanıt |
|---|---|---|
| Hash zinciri | Tamam | `packages/security/src/evidence/chain.ts` + 30 test |
| Kanonik serileştirme | Tamam | manifest ile aynı gerekçe |
| Zincir doğrulama | Tamam | 3 saldırı ayrı ayrı |
| Şema + append-only | Tamam | migration `0082` |
| Zincirin run'a bağlanması | **YAPILMADI** | run yürütme P12'de bağlanmadı |
| İmzalı export | **YAPILMADI** | P09'un export'uyla ortak anahtar |

### Üç ayrı kontrol, üç farklı saldırı

1. **Sıra boşluğu** → kayıt SİLİNMİŞ
2. **Zincir bağı** → araya kayıt EKLENMİŞ
3. **İçerik hash'i** → kayıt DEĞİŞTİRİLMİŞ

Üçü tek bir "zincir bozuk" kontrolüyle geçilebilirdi. Ayrı tutulmasının
sebebi: hangisinin olduğunu bilmek, olayı incelemenin ilk adımıdır.

### Zincirin SINIRI test edildi ve kayıt altına alındı

Veritabanına **tam yazma yetkisi** olan biri zinciri baştan
hesaplayabilir ve doğrulamadan **geçer**. Bu bir eksiklik değil,
zincirin doğasıdır; buna karşı koruma dış bir çıpa gerektirir (imzalı
periyodik snapshot, harici zaman damgası).

Zincirin gerçekten sağladığı şey **kısmi** değişikliğin tespitidir: bir
kaydı sessizce düzeltmek ya da silmek artık mümkün değil; zinciri baştan
yazmak gerekir ve bu, bir denetimde görünen bir eylemdir.

`chain.test.ts` içinde bu sınırı doğrulayan ayrı bir test var — iddianın
nerede bittiğini kayıt altına almak için.

### Gate

```text
typecheck 0 · vitest 1099 passed | 4 skipped · build OK
secret-scan 0 yeni · drift 8/8
```

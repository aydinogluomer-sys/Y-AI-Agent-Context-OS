# Phase 10 — Change Firewall

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P09](P09-context-provenance-manifest.md) · [P11 →](P11-agent-adapter-layer.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P10 |
| **Workstream** | B — Security / Governance |
| **Dependencies** | P05, P07 |
| **Migration bloğu** | `0085`–`0090` |

## Objective

Task oluşturulduğunda bir **TASK-DERIVED CHANGE BOUNDARY** hesaplamak ve agent'ın her mutation girişimini backend'de `ALLOW` / `DENY` / `ASK_APPROVAL` olarak değerlendirmek.

## Why This Phase Exists

Bugün böyle bir kavram yok. En yakın şeyler:
- `task_boundaries` + `boundary_checks` tabloları (`db.ts:1312-1352`) mevcut ama `boundary_checks` **yalnız yazılıyor, hiç okunmuyor** ve ilgili route'lar `/tasks/*` altında olduğu için 410 ile ölü.
- `change_simulations` (`db.ts:1395`) ve `impact_reports` (L1368) gerçek persist ediyor ama bunlar analiz çıktısı; enforcement değil.
- Repository yazımında `LocalFilesystemRepoAdapter.writeFile` sır kontrolü yapıyor (`repo-adapter.ts:209-218`) ama task sınırı kavramı yok.

Ürün tezinin "CHANGE" sütunu tamamen eksik. Agent bugün (gerçek bir runtime olsaydı) herhangi bir dosyayı değiştirebilirdi.

## Dependencies

P05 (graph — boundary hesabı bağımlılıklardan türer), P07 (policy modeli ve glob altyapısı paylaşılır).

## Current Repository Reality

| Konu | Gerçek |
|---|---|
| Boundary hesabı | Yok |
| `task_boundaries` | Tablo var; `/tasks/*` route'ları 410 olduğu için erişilemez |
| `boundary_checks` | 1 insert (`index.ts:5273`), 0 okuma |
| Mutation interception | Yok (gerçek runtime da yok) |
| Approval | Yok |
| File lock | `FileLockingService` **gerçek** ve çalışır (`file_locks`, expiry + stale release) |
| Impact analizi | `packages/graph` içinde gerçek; P05'te traversal'a taşındı |

## Target State

```text
Task: Fix payment retry race condition

Expected:           packages/payments/**  tests/payments/**
Allowed:            packages/shared/money.ts
Approval required:  migrations/**  infra/**
Denied:             secrets/**  production/**  customer-data/**
```

Her mutation girişimi:

```text
BLOCKED

Agent attempted:  infra/kubernetes/prod.yaml
Reason:           Outside task-derived change boundary.
Action:           Human approval required.
```

**Bu bir frontend uyarısı değildir — backend policy enforcement'tır.**

## Architecture Decisions

- **ADR-038 (yeni)** — **Boundary task'tan türetilir, kullanıcıdan alınmaz.** Girdi: task metni + acceptance criteria + retrieval'ın bulduğu birincil symbol'ler + graph'ta bunların doğrudan bağımlıları/tersleri. Kullanıcı boundary'yi **genişletemez**, yalnız onay verebilir. Sebep: kullanıcının genişletebildiği bir sınır, sınır değildir.
- **ADR-039 (yeni)** — **Enforcement mutation noktasında, plan aşamasında değil.** Agent'ın "niyeti" değil, gerçek yazma girişimi değerlendirilir. Sebep: agent planını sunmayabilir; tek güvenilir nokta dosya sistemi/VCS yazımıdır.
- **ADR-040 (yeni)** — **Onay run'ı bloklar, geçmişi değiştirmez.** `ASK_APPROVAL` → run `awaiting_approval`; onay gelirse mutation uygulanır ve **her iki olay da** event store'a yazılır. Reddedilirse mutation uygulanmaz ve run devam eder veya `blocked` olur.
- **ADR-041 (yeni)** — **hash-before / hash-after zorunlu.** Her yazımda dosyanın önceki ve sonraki hash'i kaydedilir; eşzamanlı değişiklik tespit edilir (T-20).

## Files / Packages Affected

`packages/security/src/change-firewall/*`, `packages/security/src/locks/`, `migrations/`.

### New Files

```text
packages/security/src/change-firewall/{boundary.ts,decide.ts,command-policy.ts,types.ts}
packages/security/src/change-firewall/__tests__/*.test.ts
packages/security/src/approvals/{service.ts,types.ts}
apps/api/src/routes/approvals.ts
apps/api/src/domain/change/*.ts
migrations/0085_change_boundaries.sql … 0090_merge_impact_tables.sql
tests/security/{approval-bypass,write-race,command-injection}.spec.ts
```

### Files to Modify

- `packages/core/src/repo/local-adapter.ts` — `writeFile` Change Firewall kararı olmadan çalışamaz (tip zorunluluğu).
- `packages/security/src/locks/` (FileLockingService) — lease'ler `run_id`'ye bağlanır.

### Files to Delete/Deprecate

- `task_boundaries` / `boundary_checks` → `change_boundaries` / `mutation_decisions` ile değiştirilir (0090'da veri göçü + DROP)
- `POST /projects/:id/change-simulation` → Change Firewall `dry-run` modu
- `impact_reports` / `change_simulations` → `change_boundaries`'e MERGE

## Database Changes

```text
0085  change_boundaries    (task_id, run_id, expected[], allowed[], approval[], denied[],
                            derived_from_json, boundary_hash) IMMUTABLE
0086  mutation_decisions   (run_id, path, operation ENUM(create|modify|delete|rename),
                            decision ENUM(ALLOW|DENY|ASK_APPROVAL), reason, rule_matched,
                            hash_before, hash_after, decided_at)
0087  approval_requests    (run_id, mutation_decision_id, requested_at, requested_by,
                            resolved_at, resolved_by, decision, rationale) 
0088  command_policies     (project_id, allowed_commands[], denied_patterns[])
0089  file_locks           + run_id FK
0090  task_boundaries/boundary_checks/impact_reports/change_simulations → göç + DROP
```

## API Changes

```text
GET  /api/v1/projects/:pid/approvals
GET  /api/v1/approvals/:approvalId
POST /api/v1/approvals/:approvalId/resolve   { decision, rationale }
GET  /api/v1/runs/:runId/boundary
POST /api/v1/projects/:pid/tasks/:tid/boundary/dry-run
```
Legacy `/tasks/:id/boundary*` (zaten 410) ve `/change-simulation` → kaldırılır.

## Type / Contract Changes

`ChangeBoundary`, `MutationDecision`, `ApprovalRequest`, `CommandPolicy` (P01) implemente edilir. **`ChangeBoundary` P12'nin girdisi** — P12 bunu adapter'a verir.

## Frontend Changes

Yok (P15 approval UI'ını kurar). Ancak approval **backend'de** çalışır; UI olmadan API üzerinden onaylanabilir.

## Backend Changes

Repository yazım yolu Change Firewall'dan geçmeden çağrılamaz. Bu bir tip kısıtıdır: `writeFile(path, content, decision: MutationDecision)`.

## Worker Changes

Run executor (P12) her mutation event'inde `decide()` çağırır; sonucu event store'a yazar.

## Security Changes

- **T-11 (approval bypass)** — enforcement backend'de; UI'ya güvenilmez.
- **T-20 (write race)** — hash-before/hash-after + file lease.
- **T-21 (stale lock)** — lease TTL, mevcut `FileLockingService` davranışı korunur ve `run_id`'ye bağlanır.
- **T-22 (command injection)** — `command-policy.ts` allow-list; `execFile` + argüman dizisi; shell yok.
- Boundary immutable → sonradan genişletilip "hep izinliydi" denemez.

## Migration Strategy

1. Boundary türetici (dry-run modunda, enforcement yok) → çıktısı gerçek task'larda gözlemlenir.
2. `decide()` + karar kaydı; hâlâ enforcement yok (shadow mode).
3. Enforcement açılır; approval akışı devreye girer.
4. Eski boundary/impact tabloları göç edip DROP edilir.

**Shadow mode** kasıtlıdır: boundary türeticisinin çok dar veya çok geniş olması, enforcement'tan önce gerçek verilerle ölçülür.

## Implementation Tasks

### Y-P10-001 — Boundary türetici
**Create:** `change-firewall/boundary.ts`.
**Algorithm:**
```text
seedSymbols   = manifest'teki doğrudan symbol referansları
expected      = seedSymbols'ün dosyaları + bunların test dosyaları
allowed       = graph'ta 1 mesafedeki bağımlılıklar (yalnız kaynak dosyalar)
approval      = policy'nin APPROVAL kümesi ∩ (expected ∪ allowed ∪ 2 mesafe)
denied        = policy'nin DENY kümesi   (her zaman kazanır)
```
**Edge Cases:** Boş `expected` (task hiçbir symbol'e bağlanamadı) → boundary üretilmez, run `blocked` (agent serbest bırakılmaz).
**Outputs:** `ChangeBoundary` + `boundary_hash`.

### Y-P10-002 — `decide()` karar fonksiyonu
**Create:** `change-firewall/decide.ts`. **Inputs:** path, operation, boundary, policy. **Outputs:** `MutationDecision`.
**Kural sırası:** `denied > approval > expected/allowed > (hiçbiri) → DENY`.
**Acceptance:** Varsayılan **DENY**; eşleşmeyen her yol reddedilir.

### Y-P10-003 — Command policy
**Create:** `change-firewall/command-policy.ts`. Allow-list'li komut + argüman doğrulaması.
**Security:** Shell metakarakterleri reddedilir; komut `execFile` ile çalıştırılır.

### Y-P10-004 — Approval servisi
**Create:** `approvals/service.ts`, `routes/approvals.ts`.
**Edge Cases:** Onay zaman aşımı (run `blocked`), aynı mutation için tekrarlı onay isteği (idempotent), onaylayanın yetkisi (`requireRole`).
**Security:** Onaylayan **isteği yapan olamaz** (self-approval yasağı) — yapılandırılabilir ama varsayılan kapalı.

### Y-P10-005 — hash-before / hash-after
Her yazımda kaydedilir; `hash_before` beklenenle uyuşmazsa yazım reddedilir (optimistic concurrency).

### Y-P10-006 — Lease entegrasyonu
`file_locks` + `run_id`; mutation öncesi lease alınır, sonra bırakılır; stale lease otomatik geri alınır.

### Y-P10-007 — Shadow mode + telemetri
Enforcement kapalıyken kararlar kaydedilir; `would_have_blocked` metriği ile boundary kalibrasyonu yapılır.

### Y-P10-008 — Enforcement'ın açılması
`writeFile` imzası `MutationDecision` ister; karar `ALLOW` değilse yazım gerçekleşmez.

### Y-P10-009 — Migration'lar 0085–0090 + eski tabloların göçü

## Parallelizable Tasks

```text
Y-P10-001 ∥ Y-P10-003          (boundary vs komut politikası)
Y-P10-004 ∥ Y-P10-005 + 006
```
Sıralı: `001 → 002 → 007 → 008`.

## Tests

| Suite | İçerik |
|---|---|
| `boundary.test.ts` | Fixture task → beklenen boundary; boş expected → blocked |
| `decide.test.ts` | Karar matrisi: 4 küme × 4 operasyon × sınır durumları |
| `command-policy.test.ts` | Allow-list; metakarakter reddi |
| `approval.test.ts` | İstek → onay → uygulama; red → uygulanmama; self-approval reddi |
| `write-race.spec.ts` | Eşzamanlı yazım; hash_before uyuşmazlığı |

## Negative Tests

- Boundary dışı yazım → **engellenir** (yalnız uyarı değil, dosya değişmez).
- `denied` kapsamında yazım → **DENY**, onay bile istenmez.
- Onaysız `ASK_APPROVAL` mutation'ı → uygulanmaz.
- Onaylayan = isteyen → reddedilir.
- Shell metakarakteri içeren komut → reddedilir.
- `hash_before` uyuşmazlığı → yazım reddedilir.
- Boundary'yi API'den genişletme denemesi → 403 (immutable).
- Lease olmadan yazım → reddedilir.

## Security Tests

Appendix I: **T-11, T-20, T-21, T-22** + T-08 (tool escalation'ın dosya ayağı).

## E2E

`tests/e2e/change-firewall.spec.ts` — gerçek bir run'da agent boundary içi bir dosyayı değiştirir (başarılı), boundary dışı bir dosyaya yazmayı dener (engellenir, event yazılır), `approval` kümesinde bir dosyaya yazmayı dener (run `awaiting_approval`), onay verilir (yazım gerçekleşir), tüm kararlar `mutation_decisions`'ta.

## Observability

`mutation_decision_total{decision}`, `approval_rate`, `approval_latency`, `boundary_size`, `would_have_blocked_total` (shadow), `write_race_conflict_total`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Boundary çok dar | Agent meşru işini yapamaz | Shadow mode kalibrasyonu; `approval` kümesi genişletilir (denied değil) |
| Boundary çok geniş | Güvenlik zayıf | Benchmark'ta `unauthorized mutation` metriği bunu yakalar (hard gate = 0) |
| Onay bekleyen run birikir | Kuyruk şişer | Timeout + bildirim; run `blocked` |
| Lease sızıntısı | Dosya kilitli kalır | TTL + stale release (mevcut davranış korunur) |
| Policy store down | Karar verilemez | **DENY** (fail-closed) |

## Rollback / Recovery

Enforcement bir bayrakla shadow mode'a düşürülebilir — ama bu **production'da kullanılamaz**; yalnız kalibrasyon dönemi içindir ve P17 gate'inde bayrak kaldırılır.

## Acceptance Criteria

1. Her task için boundary türetiliyor; immutable ve hash'li.
2. Her mutation girişimi karar kaydı üretiyor.
3. Varsayılan DENY; eşleşmeyen yol reddediliyor.
4. `ASK_APPROVAL` run'ı bloklıyor; onay backend'de uygulanıyor.
5. Boundary dışı yazım gerçekten engelleniyor (dosya değişmiyor).
6. hash-before/hash-after + lease çalışıyor.
7. Komut allow-list'i uygulanıyor; shell yok.
8. Self-approval varsayılan olarak kapalı.

## Evidence Required

```text
tests/security/{approval-bypass,write-race,command-injection}.spec.ts   PASS
tests/e2e/change-firewall.spec.ts                                        PASS
psql: SELECT decision, COUNT(*) FROM mutation_decisions GROUP BY 1       üç değer de temsil
engellenen yazım sonrası dosya hash'i                                    değişmemiş
shadow mode kalibrasyon raporu                                           would_have_blocked analizi
```

## Exit Gate

```bash
pnpm test --filter @y/security
pnpm run test:integration -- tests/integration/change-firewall
pnpm run test:security -- tests/security/approval-bypass.spec.ts tests/security/write-race.spec.ts
pnpm run test:e2e -- tests/e2e/change-firewall.spec.ts
```

**`ChangeBoundary` sözleşmesi bu gate'te donar** — P12 buna bağımlıdır.

---

## Uygulama Kaydı (2026-08-14)

### Tamamlanan görevler

| Görev | Durum | Kanıt |
|---|---|---|
| Y-P10-001 boundary türetme | Tamam | `change-firewall/boundary.ts` + 16 test |
| Y-P10-002 karar motoru | Tamam | `decide.ts` + 15 test |
| Y-P10-003 hash-before/after | Tamam | write-race kontrolü sınır kontrolünden ÖNCE |
| Y-P10-004 komut politikası | Tamam | `command-policy.ts` + 11 test (ALLOWLIST) |
| Y-P10-005 onay şeması | Tamam (şema) | migration `0077`; akış P12 run FSM'ine bağlı |
| writeFile enforcement | Tamam | `changeDecision` ZORUNLU alan — derleme kısıtı |
| Migration'lar | Tamam | `0075`–`0078` |
| Approval servisi + route'lar | **YAPILMADI** | run kavramı P12'de |
| `task_boundaries` göçü + DROP | **YAPILMADI** | P19 |

### Migration numaralandırması

| Plan | Gerçek |
|---|---|
| 0085 change_boundaries | `0075_change_boundaries.sql` |
| 0086 mutation_decisions | `0076_mutation_decisions.sql` |
| 0087 approval_requests | `0077_approval_requests.sql` |
| 0088 command_policies | `0078_command_policies.sql` |
| 0089 file_locks + run_id | **ERTELENDİ** — run tablosu P12'de |
| 0090 eski tabloların göçü + DROP | **ERTELENDİ** — P19 |

### Karar 1 — Boundary task'tan türetilir, kullanıcıdan alınmaz (ADR-038)

Kullanıcı boundary'yi **genişletemez**, yalnız onay verebilir. Sebep
basit: kullanıcının genişletebildiği bir sınır, sınır değildir. Bir agent
"bu dosyayı da eklememe izin ver" diyebilseydi, sınırın tek işlevi bir
tıklama eklemek olurdu.

Türetme girdileri: manifest fragment yolları (agent'ın **gördüğü**
dosyalar), graph'taki doğrudan bağımlılar/tersler, test konvansiyonu ve
policy sınıflandırması.

**Görev metni tek başına yeterli değil** — metin bir niyet beyanıdır, kod
gerçeğinin kendisi değil.

### Karar 2 — Tek dosya glob'u, dizin glob'u değil

`src/a.ts` manifest'te olduğu için `src/**` yazma izni vermek,
boundary'yi anlamsız derecede genişletirdi. Her manifest fragment'ı
**kendi yolu** kadar izin üretir.

Var olmayan test yollarına da izin verilmez: bu, agent'ın oraya yeni
dosya açabilmesi demektir ve ayrı bir karardır.

### Karar 3 — Enforcement mutation noktasında (ADR-039)

Agent'ın "niyeti" değil, **gerçek yazma girişimi** değerlendirilir. Agent
planını sunmayabilir, planından sapabilir ya da planı hiç üretmeyebilir.
Tek güvenilir nokta dosya sistemine yazma anıdır.

Bunun somut biçimi: `LocalRepositoryAdapter.writeFile` artık
`changeDecision` **zorunlu alanını** alıyor. Unutmak bir çalışma zamanı
kontrolü değil, **derleme hatası**. `ASK_APPROVAL` durumunda "onay
bekleniyor" diye geçici izin verilmez — onay geldiğinde YENİ bir karar
alınır.

### Karar 4 — Write-race kontrolü sınır kontrolünden ÖNCE (ADR-041)

Sınır içinde bile olsa, bayat bir hash üzerine yazmak başkasının işini
sessizce siler. "Son yazan kazanır" davranışı, iki agent aynı dosyada
çalıştığında birinin işini yok etmek demektir (T-20).

### Karar 5 — Silme, değiştirmekten farklı muamele görür

`expected` bandında bile silme **onay ister**. Bir değişiklik diff'te
görünür; silme ise dosyanın var olduğunu bilmeyen için görünmezdir.

### Karar 6 — Komut politikası ALLOWLIST

Yasaklı komut listesi tutmak, bilinen kötüleri sayıp geri kalanı serbest
bırakmaktır — ve yeni bir kötü her zaman vardır. Varsayılan politikada
`docker`, `kubectl`, `ssh`, `curl`, `wget`, `rm` **bilerek yok**:
bunlar dış dünyaya etki eder.

Ek savunmalar: komut adında yol ayracı reddedilir (`./git` çalıştırmak
`git` çalıştırmak değildir), argümanlarda kabuk metakarakteri
reddedilir, `--force`/`--hard`/`push` gibi yıkıcı git argümanları
reddedilir.

### Kabul kriterlerinin durumu

| Kriter | Durum | Not |
|---|---|---|
| Boundary task'tan türetiliyor | Evet | 16 test |
| Kullanıcı genişletemiyor | Evet | API'de genişletme yolu yok |
| Mutation backend'de değerlendiriliyor | Evet | `writeFile` derleme kısıtı |
| DENY/ALLOW/ASK_APPROVAL kararı | Evet | 15 test |
| Sınır dışı yazım reddediliyor | Evet | varsayılan izin yok |
| hash-before/after | Evet | race kontrolü önce |
| Komut politikası | Evet | ALLOWLIST + 11 test |
| Onay akışı uçtan uca | **HAYIR** | run FSM'i P12 |
| `boundary_checks` göçü | **HAYIR** | P19 |

### Gate sonuçları

```text
typecheck (loose + strict)   0 hata
vitest                       988 passed | 4 skipped (992)
build                        OK
secret-scan                  0 yeni bulgu
drift (verify-inventories)   8/8 kontrol geçti
```

### Bu fazda kapatılmayanlar

- **Onay servisi ve route'ları.** `approval_requests` şeması hazır ve
  kısıtları (kim/ne zaman/neden üçlüsü zorunlu) tanımlı. Ama bir onay
  akışı run'ı bloklamalı ve run FSM'i **P12'nin konusu**. Şemasız bir
  akış yazmak yerine akışsız bir şema bırakmak daha az yanıltıcıdır.
- **`file_locks` + `run_id`.** Aynı sebep: run tablosu P12'de.
- **`task_boundaries` / `boundary_checks` göçü ve DROP.** Eski tablolar
  duruyor; okuyucuları yok (route'lar 410). P19'da temizlenecek.
- **`tests/security/{approval-bypass,write-race,command-injection}.spec.ts`**
  — birim seviyesinde karşılıkları yazıldı; canlı senaryo P19.

# Phase 17 — Security Hardening

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P16](P16-evaluation-and-benchmark-harness.md) · [P18 →](P18-reliability-observability-performance.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P17 |
| **Workstream** | B — Security / Governance |
| **Dependencies** | P10, P13 |
| **Migration bloğu** | `0117`–`0120` |

## Objective

Threat model'i kapatmak: 24 tehdit vektörünün her biri için mitigation + otomatik test + kabul kriteri. Kalan P0/P1 bulgularını sıfırlamak. Prompt injection trust boundary'sini kesinleştirmek.

## Why This Phase Exists

P02–P14 arasında güvenlik bulgularının çoğu kapandı, ama:

- **P0-10** (SQL interpolasyonu, `ContextObjectStoreService.ts:219`) P09'da düzeltildi — burada regresyon testi kurulur.
- **P0-11** (gömülü DB parolası, `packages/security/src/index.ts:23-25` — `["EJfZexrU6o","YdPpxH"]` runtime'da birleştiriliyor; L48'de Supabase host'u) P03'te koddan silindi, ama **credential hâlâ git geçmişinde** ve rotate edilmedi.
- Prompt injection savunması (T-05) tek bir fazın işi değil: P04 (etiketleme), P07 (universe), P11 (adapter kanal ayrımı), P16 (ölçüm) parçaları birleştirir — **burada kapatılır**.
- Threat model belgesi hiç yazılmadı.
- `scripts/secret-scan.ts` `validate-*` ile başlayan dosyaları ve `scratch/` ağacını atlıyordu (L76) — 15.000 satır muaf. P03'te düzeltildi, burada CI gate'i haline gelir.

Bu faz aynı zamanda **P10'un shadow mode bayrağını kaldırır** — enforcement kalıcı olur.

## Dependencies

P10 (Change Firewall), P13 (olay/onay akışı). P15, P16, P18 ile **paralel yürütülebilir**.

## Current Repository Reality

| Konu | Durum |
|---|---|
| Threat model belgesi | Yok |
| Kapanmış P0'lar | P0-1..8, P0-12 (P02), P0-9 (P03), P0-10 (P09) |
| Açık P0 | **P0-11** — git geçmişindeki credential rotate edilmedi |
| Prompt injection | Parçalı savunma, birleşik test yok |
| Bağımlılık taraması | Yok (CI'da `pnpm audit` adımı yok) |
| SBOM | Yok |
| Rate limit / helmet / CORS | P01'de eklendi, ayarları sertleştirilmedi |

## Target State

Master **Appendix I**'deki 24 tehdit için:

```text
attack · impact · mitigation · automated test · acceptance criterion
```

ve **Security Gate**:

```text
cross-tenant                = impossible
cross-project               = impossible
secret leak                 = zero
path escape                 = zero
policy outage               = fail closed
audit actor                 = authenticated principal
change boundary bypass      = impossible
unsigned worker identity    = denied
P0/P1 açık security finding = 0
```

## Architecture Decisions

- **ADR-063 (yeni)** — **Repository içeriği DATA'dır, instruction değil.** Manifest fragment'ları adapter'a `<untrusted_repository_content>` sınırı içinde verilir; system/admin policy'nin üzerine çıkamaz. Adapter bu ayrımı desteklemiyorsa **capability negotiation'da bunu beyan eder** ve o adapter için ek kısıtlar uygulanır.
- **ADR-064 (yeni)** — **Shadow mode kalıcı olarak kaldırılır.** P10'un kalibrasyon bayrağı bu fazda silinir; enforcement koşulsuzdur.
- **ADR-065 (yeni)** — **Güvenlik testleri ayrı bir CI gate'idir ve atlanamaz.** `continue-on-error` yasak; skip mekanizması yok.

## Files / Packages Affected

`packages/security/**`, `.github/workflows/`, `docs/security-boundaries/`.

### New Files

```text
docs/security-boundaries/threat-model.md          24 vektör × Appendix I formatı
docs/security-boundaries/incident-response.md
docs/security-boundaries/key-rotation-runbook.md
packages/security/src/injection/{boundary.ts,detector.ts,types.ts}
packages/security/src/hardening/{rate-limits.ts,cors.ts,headers.ts}
tests/security/prompt-injection.spec.ts
tests/security/{replay,tool-escalation,mcp-escalation,jwks,supply-chain}.spec.ts
scripts/security/{sbom.ts,dep-audit.ts,false-green-scan.ts}
migrations/0117_security_events.sql … 0120_key_rotation.sql
```

### Files to Modify

- `packages/security/src/change-firewall/` — shadow mode bayrağı **silinir**.
- `.github/workflows/ci.yml` — güvenlik gate'i eklenir (tam pipeline P19'da).
- `apps/api/src/app.ts` — rate limit/CORS/header ayarları sertleştirilir.

### Files to Delete/Deprecate

- Shadow mode konfigürasyonu
- Kalan tüm test muafiyetleri (`secret-scan` exclusion'ları P03'te gitti; burada doğrulanır)

## Database Changes

```text
0117  security_events   (org_id, project_id, run_id, kind, severity, principal_id,
                         detail_json, occurred_at) + idx(kind, occurred_at)
0118  key_registry      (key_id, purpose, algorithm, created_at, rotated_at, revoked_at)
0119  rate_limit_state  (principal_id, bucket, count, window_start)   opsiyonel: Redis yerine PG
0120  audit_logs        + security_event_id FK (ilişkilendirme)
```

## API Changes

```text
GET /api/v1/admin/security/events        (admin-only)
GET /api/v1/admin/security/posture       gate durumu özeti
```

## Type / Contract Changes

`SecurityEvent`, `ThreatId`, `InjectionBoundary` (P01'e eklenir).

## Frontend Changes

Minimum: Advanced → Diagnostics altında güvenlik olayları görünümü (P15'te yer ayrıldı).

## Backend Changes

Güvenlik olayları merkezi olarak `security_events`'e yazılır ve audit ile ilişkilendirilir.

## Worker Changes

Worker kimlik doğrulaması sertleştirilir; imzasız worker **hiçbir** job claim edemez.

## Security Changes

Bu fazın tamamı güvenlik. Tehdit bazlı iş kırılımı aşağıda.

## Migration Strategy

1. Threat model belgesi yazılır (mevcut mitigation'lar haritalanır).
2. Eksik testler yazılır (tehdit başına en az bir negatif test).
3. Kalan P0/P1 kapatılır (credential rotasyonu dahil).
4. Shadow mode kaldırılır.
5. Güvenlik CI gate'i devreye alınır.

## Implementation Tasks

### Y-P17-001 — Threat model belgesi
**Create:** `docs/security-boundaries/threat-model.md`. 24 vektör; her biri için mevcut mitigation'ın **hangi dosyada** olduğu ve **hangi testin** kanıtladığı.
**Acceptance:** Test referansı olmayan mitigation kabul edilmiyor.

### Y-P17-002 — Prompt injection trust boundary
**Create:** `injection/{boundary,detector}.ts`.
**Algorithm:** Manifest fragment'ları adapter'a açık sınırlayıcılarla verilir; sınırlayıcı kaçışı tespit edilir; bilinen enjeksiyon kalıpları (policy override talebi, credential exfiltration talebi) işaretlenir ve olay yazılır — **ama içerik yine de DATA olarak verilir** (sansür değil, izolasyon).
**Acceptance:** P16'nın enjeksiyon görevlerinde policy ihlali = 0.

### Y-P17-003 — Credential rotasyonu (**P0-11 kapanışı**)
**Create:** `key-rotation-runbook.md`.
**Adımlar:** Git geçmişindeki Supabase credential'ı rotate edilir; eski credential iptal edilir; `key_registry` kaydı açılır; geçmiş temizliği (BFG/filter-repo) değerlendirilir ve kararı ADR'ye yazılır.
**Acceptance:** Eski credential ile bağlantı **reddediliyor** (kanıt: bağlantı denemesi çıktısı).

### Y-P17-004 — Eksik tehdit testleri
`replay` (T-14), `tool-escalation` (T-08), `mcp-escalation` (T-09), `jwks` (T-13), `supply-chain` (T-24) suite'leri.

### Y-P17-005 — Shadow mode'un kaldırılması
**Negative test:** Enforcement'ı devre dışı bırakan konfigürasyon yolu **yok**.

### Y-P17-006 — Rate limit / CORS / header sertleştirme
Principal başına ve IP başına limitler; CORS allow-list; HSTS/CSP prod'da; `X-Powered-By` kapalı.

### Y-P17-007 — Bağımlılık taraması + SBOM
**Create:** `scripts/security/{sbom,dep-audit}.ts`. `pnpm audit` gate'i; P0/P1 CVE → **build fail**. SBOM release artifact'ı.

### Y-P17-008 — False-green tarayıcı
**Create:** `scripts/security/false-green-scan.ts`.
**Tespit ettikleri:** `assert(..., true)`, "skip → pass" kalıpları, `setTimeout` ile tamamlanan iş yolları, mock provider başarısı, sabit hash/metrik literal'leri, `catch {}` ile yutulan güvenlik hataları.
**Acceptance:** Kaynak ağacında 0 bulgu; CI gate'i (P19'da bağlanır).

### Y-P17-009 — Güvenlik olayı merkezi kaydı
Tüm firewall reddi, policy hatası, kimlik hatası, boundary ihlali `security_events`'e yazılır ve audit ile ilişkilenir.

### Y-P17-010 — Incident response runbook'u
**Create:** `docs/security-boundaries/incident-response.md`. Sır sızıntısı, zincir kırılması, yetkisiz mutation, credential kaybı senaryoları.

### Y-P17-011 — Güvenlik postürü endpoint'i
`GET /api/v1/admin/security/posture` — Security Gate'in 9 maddesinin canlı durumu.

### Y-P17-012 — Penetrasyon test turu (manuel)
Otomatik testlerin kapsamadığı senaryolar için elle inceleme; bulgular P0/P1/P2 olarak kaydedilir ve kapatılır.

## Parallelizable Tasks

```text
Y-P17-001 ∥ Y-P17-004 ∥ Y-P17-007
Y-P17-002 ∥ Y-P17-006
Y-P17-008 ∥ Y-P17-009
```
Sıralı: `001 → 004`, `003` bağımsız ama **en erken** başlamalı (canlı credential riski).

## Tests

| Suite | Tehdit |
|---|---|
| `idor.spec.ts` | T-01 |
| `tenant-isolation.spec.ts` | T-02 |
| `path-guard.spec.ts` | T-03, T-04 |
| `prompt-injection.spec.ts` | T-05 |
| `malicious-repo.spec.ts` | T-06 |
| `secret-leak.spec.ts` | T-07 |
| `tool-escalation.spec.ts` | T-08 |
| `mcp-escalation.spec.ts` | T-09 |
| `fail-closed.spec.ts` | T-10 |
| `approval-bypass.spec.ts` | T-11 |
| `jwt.spec.ts` · `jwks.spec.ts` | T-12, T-13 |
| `replay.spec.ts` | T-14 |
| `worker-identity.spec.ts` | T-15 |
| `cas-integrity.spec.ts` | T-16, T-17 |
| `event-chain.spec.ts` | T-18 |
| `audit-actor.spec.ts` | T-19 |
| `write-race.spec.ts` | T-20 |
| `stale-lock.spec.ts` | T-21 |
| `command-injection.spec.ts` | T-22 |
| `ssrf.spec.ts` | T-23 |
| `supply-chain.spec.ts` | T-24 |

## Negative Tests

Her tehdit için en az bir "saldırıyı dene" testi (yukarıdaki suite'ler). Ek olarak:

- Enforcement'ı kapatan konfigürasyon → **yok** (grep testi).
- `continue-on-error` içeren güvenlik CI adımı → **yok**.
- Test muafiyeti (`secret-scan` exclusion, skip listesi) → **yok**.
- Eski (rotate edilmiş) credential ile bağlantı → **reddediliyor**.

## Security Tests

Bu fazın tamamı.

## E2E

`tests/e2e/security-posture.spec.ts` — Security Gate'in 9 maddesi canlı sistemde doğrulanır (her biri için gerçek bir saldırı denemesi + beklenen ret).

## Observability

`security_event_total{kind,severity}`, `policy_denial_rate`, `injection_detected_total`, `auth_failure_total{reason}`, `boundary_violation_total`, `dependency_vulnerability_count{severity}`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Yeni CVE | Build fail | Bağımlılık güncellemesi veya risk kabulü (ADR + son kullanma tarihi) |
| Enjeksiyon tespiti false-positive | Meşru içerik işaretlenir | İşaretleme **engelleme değildir**; yalnız olay yazılır |
| Rate limit meşru trafiği keser | 429 | Principal bazlı kotalar + operatör override'ı (audit'li) |
| Rotasyon sonrası kesinti | Bağlantı hatası | Runbook'ta çift-anahtar geçiş penceresi |
| Güvenlik testi flaky | CI gürültüsü | Flaky güvenlik testi **devre dışı bırakılmaz**, düzeltilir |

## Rollback / Recovery

Güvenlik sertleştirmeleri geri alınmaz. Rate limit gibi operasyonel parametreler ayarlanabilir; enforcement kapatılamaz.

## Acceptance Criteria

1. Threat model belgesi 24 vektörü kapsıyor; her mitigation bir teste bağlı.
2. 24 tehdit için otomatik test var ve geçiyor.
3. Security Gate'in 9 maddesi karşılanıyor.
4. **P0/P1 açık bulgu = 0** (P0-11 dahil; credential rotate edilmiş).
5. Shadow mode ve enforcement kapatma yolu yok.
6. False-green tarayıcı 0 bulgu veriyor.
7. Bağımlılık taraması + SBOM CI'da.
8. Incident response ve key rotation runbook'ları yazılmış.
9. Prompt injection: P16 görevlerinde Y policy ihlali = 0.

## Evidence Required

```text
tests/security/*.spec.ts (24 suite)        tümü PASS
tests/e2e/security-posture.spec.ts         PASS
docs/security-boundaries/threat-model.md   24 vektör, test referanslı
scripts/security/false-green-scan.ts       0 bulgu
pnpm audit                                  P0/P1 CVE = 0
SBOM dosyası                                release artifact'ı
credential rotasyon kanıtı                  eski credential reddi çıktısı
P16 enjeksiyon sonucu                       Y ihlal = 0
```

## Exit Gate

```bash
pnpm run test:security                      # 24 suite
pnpm run test:e2e -- tests/e2e/security-posture.spec.ts
tsx scripts/security/false-green-scan.ts    # 0 bulgu
tsx scripts/security/dep-audit.ts           # P0/P1 CVE = 0
tsx scripts/security/sbom.ts
pnpm run secret-scan                        # muafiyetsiz, 0 bulgu
```

**P0/P1 açık bulgu varsa gate geçilmez.** Bu, release'in ön koşuludur.

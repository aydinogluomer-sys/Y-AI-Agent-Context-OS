# Phase 07 — Context Firewall

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P06](P06-hybrid-retrieval-engine.md) · [P08 →](P08-dynamic-context-compiler.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P07 |
| **Workstream** | B — Security / Governance |
| **Dependencies** | P02, P04 |
| **Migration bloğu** | `0073`–`0077` |

## Objective

Güvenliği retrieval'dan **sonra** çalışan bir filtre olmaktan çıkarıp retrieval pipeline'ının **içine** gömmek. Task başına bir **ALLOWED CONTEXT UNIVERSE** hesaplamak ve retrieval'ın bu kümenin dışına çıkmasını yapısal olarak imkânsız kılmak.

## Why This Phase Exists

Bugün böyle bir kavram yok. Erişim kontrolü dağınık:
- `LocalFilesystemRepoAdapter.validatePath` dosya bazında denylist uyguluyor (`repo-adapter.ts:131-152`) — repository katmanında, retrieval'da değil.
- `PermissionKernelService.validateResourceBoundary` (L179-202) yalnız `resource_type === "file"` için ve yalnız birkaç sabit dosya adı için çalışıyor.
- Retrieval hiçbir policy kontrolü yapmıyor; `POST /context/isolated-retrieve` (`index.ts:3562`) proje kimliğini **gövdeden** alıyordu (P02'de silindi).

Sonuç: bir chunk bir kez index'lendiyse, retrieval onu aday olarak görebiliyor. "Agent denied context'in içeriğini hiçbir aşamada almamalıdır" garantisi yok.

## Dependencies

P02 (Principal + policy modeli), P04 (`chunks` + sır işaretleri). P06 ile **paralel yürütülmelidir** — P06'nın ADR-027'si bu fazın ön-filtresini varsayar.

## Current Repository Reality

| Konu | Gerçek |
|---|---|
| Allowed universe | Kavram yok |
| Policy modeli | `policies`/`policy_versions` P02'de kuruldu; glob tabanlı ALLOW/APPROVAL/DENY kuralları henüz yok |
| Dosya sınıflandırma | `files.is_generated`, `is_minified` P03'te eklendi; `contains_secret` P04'te chunk düzeyinde |
| Retrieval filtresi | Yok |
| Kernel `resource` kontrolü | Yalnız `.env`, `secrets.json`, `credentials.json`, `*.pem`, `*.key` (sabit liste) |

## Target State

```text
AllowedContextUniverse = f(
  Principal, Organization, ProjectMembership, Role,
  RepositoryPolicy, FileClassification, Task
)

→ { allow: Glob[], approval: Glob[], deny: Glob[], policyVersion, universeHash }
```

Örnek:

```text
ALLOW      src/**  tests/**  docs/**
APPROVAL   migrations/**  infra/**
DENY       secrets/**  production/**  customer-data/**
```

**Yapısal garanti:** `AllowedContextUniverse` retrieval sorgusuna **SQL predicate** olarak enjekte edilir. DENY kapsamındaki chunk'lar aday havuzuna girmez; embedding'leri hesaplanmaz; içerikleri okunmaz.

## Architecture Decisions

- **ADR-027** (P06 ile ortak) — Firewall ön-filtre, son filtre değil.
- **ADR-028 (yeni)** — **Universe SQL predicate'ine derlenir.** Alternatifler: (a) aday listesini bellekte filtrelemek, (b) her chunk için kernel çağrısı, (c) glob'ları `LIKE`/regex predicate'ine derleyip sorguya gömmek. Seçilen (c). Sebep: (a) DENY içeriğini zaten belleğe getirir — kabul edilemez; (b) N+1 ve yavaş. Sonuç: glob dilinin ifade gücü, derlenebilir bir alt kümeyle sınırlanır (`**`, `*`, `?`, karakter sınıfı; geri referans yok).
- **ADR-029 (yeni)** — **DENY her zaman kazanır ve APPROVAL retrieval'da DENY gibi davranır.** Onay bekleyen kaynak, onay verilene kadar context'e **girmez**; onaylandığında yeni bir compile tetiklenir. Sebep: "önce göster, sonra onayla" provenance'ı bozar.
- **ADR-030 (yeni)** — **Universe immutable ve run'a bağlı.** Compile sırasında hesaplanır, `universeHash` manifest'e yazılır; policy sonradan değişse bile o run'ın kanıtı değişmez.

## Files / Packages Affected

`packages/security/src/context-firewall/*`, `packages/context/src/retrieval/*`, `migrations/`.

### New Files

```text
packages/security/src/context-firewall/{universe.ts,glob.ts,compile-predicate.ts,classify.ts,types.ts}
packages/security/src/context-firewall/__tests__/*.test.ts
migrations/0073_policy_rules.sql … 0077_context_universes.sql
tests/security/context-firewall.spec.ts
```

### Files to Modify

- `packages/context/src/retrieval/{lexical,semantic,symbol,hybrid}.ts` — hepsi `universePredicate` parametresi **zorunlu** alır (opsiyonel değil).
- `packages/security/src/permission-kernel/` — `validateResourceBoundary`'nin sabit dosya listesi kaldırılır; universe'e devreder.
- `workers/embedding-worker.ts` — DENY kapsamındaki chunk'lar için embedding üretmez.

### Files to Delete/Deprecate

- `PermissionKernelService.validateResourceBoundary` sabit dosya adı listesi (L179-202) — universe tarafından kapsanır.

## Database Changes

```text
0073  policy_rules        (policy_version_id, effect ENUM(allow|approval|deny),
                           resource_glob, resource_kind, priority)
0074  file_classifications (snapshot_id, path, kind ENUM(source|test|doc|adr|config|
                           migration|infra|secret|generated|minified|vendor), confidence)
0075  context_universes    (run_id, policy_version, universe_hash, allow[], approval[], deny[])
                           IMMUTABLE (update/delete trigger)
0076  chunks + universe_bucket  (denormalize edilmiş sınıflandırma — predicate hızlandırma)
0077  chunks + contains_secret bayrağının indexlenmesi
```

## API Changes

```text
GET  /api/v1/projects/:pid/policies                      (P02'de açıldı, kural yönetimi burada)
POST /api/v1/projects/:pid/policies/:id/simulate         "bu policy şu task'ta neyi kapatır?"
GET  /api/v1/runs/:runId/context/universe                (advanced — universe + hash)
```

## Type / Contract Changes

`AllowedContextUniverse`, `PolicyRule`, `Effect`, `FileClassification`, `UniversePredicate` (P01) implemente edilir.

## Frontend Changes

Yok (P15 Policies yüzeyini kurar).

## Backend Changes

`compileContext` akışının **ilk** adımı universe hesabıdır; retrieval kanalları universe olmadan çağrılamaz (tip zorunluluğu).

## Worker Changes

Embedding worker universe'e uyar: DENY'li chunk embed edilmez. Bu, sır içeriğinin harici embedding sağlayıcısına gönderilmesini de engeller.

## Security Changes

- **T-07 (secret leakage)** için birincil savunma.
- Dosya sınıflandırma: `secret`, `infra`, `vendor`, `generated` sınıfları otomatik tespit edilir ve varsayılan policy şablonlarında DENY/APPROVAL'a düşer.
- Universe hesaplanamıyorsa (policy store erişilemez) → **compile reddedilir** (fail-closed, T-10).

## Migration Strategy

1. `policy_rules` + glob derleyici + sınıflandırıcı.
2. Universe hesaplayıcı; `context_universes` immutable tablosu.
3. Retrieval kanallarına zorunlu predicate parametresi (derleme hatası ile zorlanır).
4. Embedding worker'a universe kontrolü.
5. Varsayılan policy şablonları (Developer / Platform Engineer / Admin).

## Implementation Tasks

### Y-P07-001 — Glob dili + predicate derleyici
**Create:** `glob.ts`, `compile-predicate.ts`. **Algorithm:** Glob → `path LIKE` / `path ~` predicate'i; öncelik sırası `deny > approval > allow`; en uzun eşleşme kazanır.
**Edge Cases:** Kaçış karakterleri, `**` çoklu segment, büyük/küçük harf duyarlılığı (platform bağımsız: **her zaman duyarlı**).
**Security:** Glob'dan üretilen SQL parametrelidir; kullanıcı girdisi doğrudan SQL'e girmez.

### Y-P07-002 — Dosya sınıflandırıcı
**Create:** `classify.ts`. **Inputs:** path, dil, içerik ipuçları, `.gitignore`/`.gitattributes`, `is_generated`/`is_minified`.
**Outputs:** `FileClassification` + confidence. **Acceptance:** `secrets/`, `.env*`, `*.pem`, `infra/`, `terraform/`, `k8s/`, `vendor/`, `node_modules/` doğru sınıflanıyor.

### Y-P07-003 — Universe hesaplayıcı
**Create:** `universe.ts`. **Inputs:** Principal, project, task, policy version, sınıflandırmalar.
**Outputs:** `AllowedContextUniverse` + `universeHash = sha256(canonical_json)`.
**Acceptance:** Aynı girdi → aynı hash (determinism, P09 girdisi).

### Y-P07-004 — Retrieval entegrasyonu (zorunlu parametre)
**Modify:** 4 retrieval modülü. **Acceptance:** Universe olmadan retrieval çağrısı **derlenmiyor**.

### Y-P07-005 — Embedding worker filtresi
**Negative test:** DENY'li chunk için embedding satırı oluşmuyor.

### Y-P07-006 — Policy simülasyonu
**Create:** `POST /policies/:id/simulate` — verilen task için hangi kaynakların ALLOW/APPROVAL/DENY olacağını içerik göstermeden raporlar.

### Y-P07-007 — Varsayılan policy şablonları
Developer / Platform Engineer / Admin için başlangıç kural setleri; `secrets/**`, `production/**`, `customer-data/**` her şablonda DENY.

### Y-P07-008 — Migration'lar 0073–0077

### Y-P07-009 — Immutability trigger'ları
`context_universes` için UPDATE/DELETE engelleme (mevcut `block_event_records_mutation()` örüntüsü).

## Parallelizable Tasks

```text
Y-P07-001 ∥ Y-P07-002        (glob derleyici vs sınıflandırıcı)
Y-P07-006 ∥ Y-P07-007
```
Sıralı: `001 + 002 → 003 → 004 → 005`.

## Tests

| Suite | İçerik |
|---|---|
| `glob.test.ts` | 100+ glob/path çifti; öncelik sırası; kaçış |
| `classify.test.ts` | Fixture ağacında sınıflandırma doğruluğu |
| `universe.test.ts` | Determinism (aynı girdi → aynı hash); rol farkı → farklı universe |
| `context-firewall.spec.ts` | DENY'li dosya hiçbir kanaldan aday olmuyor |
| `predicate.test.ts` | Derlenmiş SQL predicate'i beklenen satırları döndürüyor |

## Negative Tests

- `secrets/prod.env` → hiçbir retrieval kanalında aday **değil** (lexical, semantic, symbol, graph genişletme dahil).
- APPROVAL kapsamındaki dosya onaysız → aday **değil**.
- Policy store erişilemez → compile **reddediliyor** (boş universe ile devam etmiyor).
- Universe'ü baypas etmeye çalışan doğrudan SQL sorgusu → integration testi **fail** eder.
- Graph genişletmesi DENY'li bir node'a ulaşırsa → o node **dışlanır** ve `exclusions`'a `policy_denied` sebebiyle yazılır (P09).

## Security Tests

Appendix I: **T-07** (birincil), **T-10** (fail-closed), T-02 (universe org-scoped).

## E2E

`tests/e2e/context-firewall.spec.ts` — fixture repo'da `secrets/` dizini oluşturulur; sır içeren dosya index'lenir; bir task için compile çalıştırılır; manifest'te bu dosya **yok** ve `exclusions` içinde `policy_denied` sebebiyle **var**; dosya içeriği hiçbir yanıtta geçmiyor.

## Observability

`policy_denial_rate`, `universe_compile_latency`, `excluded_by_policy_total{reason}`, `approval_pending_sources_total`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Policy store down | Compile reddi | Doğru davranış; `readyz` degraded + operatör alarmı |
| Aşırı geniş DENY | Boş context | Compile "insufficient context" ile başarısız olur, boş manifest üretmez |
| Yanlış sınıflandırma | Meşru dosya DENY'de | Sınıflandırma confidence'ı düşükse APPROVAL'a düşer, DENY'e değil |
| Glob performansı | Yavaş sorgu | `universe_bucket` denormalizasyonu + index; predicate karmaşıklık sınırı |

## Rollback / Recovery

Policy sürümleri versiyonlu; hatalı bir policy önceki sürüme döndürülebilir. `context_universes` immutable olduğu için geçmiş run'ların kanıtı etkilenmez.

## Acceptance Criteria

1. `AllowedContextUniverse` her compile'da hesaplanıyor ve hash'i manifest'e yazılıyor.
2. DENY kapsamındaki içerik hiçbir retrieval kanalında aday olmuyor (SQL predicate seviyesinde).
3. DENY'li chunk için embedding üretilmiyor.
4. APPROVAL retrieval'da DENY gibi davranıyor.
5. Policy store erişilemezse compile reddediliyor.
6. Universe deterministik.
7. Policy simülasyonu içerik sızdırmadan çalışıyor.
8. `context_universes` immutable.

## Evidence Required

```text
tests/security/context-firewall.spec.ts     PASS
tests/e2e/context-firewall.spec.ts          PASS
psql: SELECT COUNT(*) FROM chunks c JOIN ... WHERE deny AND embedding IS NOT NULL   = 0
universe_hash determinism testi              PASS
excluded_by_policy örnek manifest kaydı      dosya
```

## Exit Gate

```bash
pnpm test --filter @y/security
pnpm run test:integration -- tests/integration/context-firewall
pnpm run test:security -- tests/security/context-firewall.spec.ts
pnpm run test:e2e -- tests/e2e/context-firewall.spec.ts
```

Ek zorunluluk: **DENY içeriğinin okunmadığı** yalnız test ile değil, sorgu planı incelemesiyle de kanıtlanır (predicate'in index kullanarak satırı hiç getirmediği).

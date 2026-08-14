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

---

## Uygulama Kaydı (2026-08-14)

### Tamamlanan görevler

| Görev | Durum | Kanıt |
|---|---|---|
| Y-P07-001 glob dili + predicate derleyici | Tamam | `context-firewall/glob.ts`, `universe.ts` |
| Y-P07-002 dosya sınıflandırıcı | Tamam | `context-firewall/classify.ts` |
| Y-P07-003 universe hesaplayıcı | Tamam | `computeUniverse()` + determinizm testleri |
| Y-P07-004 retrieval entegrasyonu (zorunlu parametre) | Tamam | `RetrievalSpec.universe` opsiyonel değil |
| Y-P07-005 embedding worker filtresi | Tamam | `deniedGlobs` zorunlu alan + 3 test |
| Y-P07-006 policy simülasyonu | **YAPILMADI** | aşağıya bakınız |
| Y-P07-007 varsayılan policy şablonları | Kısmen | sınıflandırıcı önerileri var, şablon tabloları P15'te |
| Y-P07-008 migration'lar | Tamam | `0068`–`0071` |
| Y-P07-009 immutability trigger'ları | Tamam | `0070` — UPDATE/DELETE engelli |

### Migration numaralandırması

| Plan | Gerçek |
|---|---|
| 0073 policy_rules | `0068_policy_rules.sql` |
| 0074 file_classifications | `0069_file_classifications.sql` |
| 0075 context_universes | `0070_context_universes.sql` |
| 0076 chunks + universe_bucket | `0071_chunks_universe_bucket.sql` |
| 0077 contains_secret index | `0071` içinde birleştirildi |

### Karar 1 — Universe SQL predicate'ine derlenir (ADR-028)

Üç seçenek vardı:

1. **Aday listesini bellekte filtrelemek.** KABUL EDİLEMEZ: DENY
   içeriğini zaten belleğe getirmiş olursunuz. "Agent denied context'in
   içeriğini hiçbir aşamada almamalıdır" garantisi, içerik okunduğu anda
   kaybolur.
2. **Her chunk için kernel çağrısı.** N+1 ve yavaş; ayrıca aday
   listesinin kendisi bir sızıntıdır (hangi dosyaların var olduğunu
   söyler).
3. **Glob'ları SQL predicate'ine derleyip sorguya gömmek.** SEÇİLEN.

Bedeli: glob dilinin ifade gücü sınırlıdır. `**`, `*`, `?` ve karakter
sınıfları desteklenir; alternasyon (`{a,b}`), negasyon (`!(x)`) ve
extglob **desteklenmez** ve `assertSupportedGlob` bunları REDDEDER.
Sessizce kısmen eşleştirmek, kural yazan kişinin yazdığını sandığı
kuraldan farklı bir kural uygulamak olurdu.

Predicate iki katmanlıdır: `LIKE ANY` (indeks kullanabilen kaba eleme) +
`~ ANY` (kesin eşleşme). Yalnız regex her satırı tarardı; yalnız LIKE
`*` ile `**` farkını kaybederdi.

**Glob metni SQL gövdesine GİRMEZ** — parametre olarak geçer. Aksi halde
policy yazma yetkisi olan bir kullanıcı SQL enjeksiyonu yapabilirdi.

### Karar 2 — APPROVAL retrieval'da DENY gibi davranır (ADR-029)

Onay bekleyen bir kaynak, onay verilene kadar context'e **girmez**.
"Önce göster, sonra onayla" provenance'ı bozar: içerik zaten modele
gitmişse onayın anlamı kalmaz. Onay verildiğinde YENİ bir compile
tetiklenir ve o compile'ın kendi universe'ü olur.

### Karar 3 — DENY her zaman kazanır, daha özgül bir ALLOW bile yenemez

`allow: src/secrets/keys.ts` + `deny: src/secrets/**` ikilisinde sonuç
DENY'dir. "Bu dizinde her şey serbest AMA şu dosya yasak" ifadesi ancak
böyle güvenli olur. Hiçbir kurala uymayan yol da **reddedilir**: yeni
eklenen bir dizinin sessizce erişilebilir olması kabul edilemez.

### Karar 4 — Belirsizlik ALLOW'a değil APPROVAL'a düşer

Sınıflandırma bir tahmindir. Asimetri bilinçlidir: yanlış bir DENY'in
bedeli **gecikme**, yanlış bir ALLOW'un bedeli **sızıntıdır**. Güven
eşiğin altındaysa DENY yerine APPROVAL uygulanır — ama ALLOW asla
yükseltilmez.

### Karar 5 — `universe_bucket` bir güvenlik sınırı DEĞİLDİR

Denormalize kolon yalnızca hızlandırmadır; kesin karar her zaman glob
predicate'inindir. Bayat bir bucket yanlış sonuç üretemez, yalnızca
sorguyu yavaşlatır. Bu ayrım migration dosyasında yazılıdır; aksi halde
bir gün biri onu tek savunma hattı sanabilir.

### P00'da kaçan dosyalar artık yakalanıyor

Eski `validateResourceBoundary` yalnız beş sabit ada bakıyordu
(`.env`, `secrets.json`, `credentials.json`, `*.pem`, `*.key`).
Sınıflandırıcı testleri şunları da yakalıyor:
`terraform/prod.tfvars`, `k8s/deployment.yaml`, `infra/main.tf`,
`Dockerfile`, `node_modules/**`, `vendor/**`, `ssh/id_rsa`,
`certs/server.pem`.

### Yapılmayan — Y-P07-006 policy simülasyonu

`POST /policies/:id/simulate` yazılmadı. Simülasyonun anlamlı bir çıktı
üretebilmesi için bir task ve o task'ın aday kümesi gerekiyor; aday
üretimi ise compile akışına bağlı ve o akış **P08'de** kuruluyor.

Bugün yazılabilecek şey, gerçek adaylar yerine dosya listesi üzerinde
çalışan bir yaklaşımdı — yani simülasyonun **simülasyonu**. Bir policy
aracının yanlış sonuç vermesi, olmamasından tehlikelidir: kullanıcı ona
bakıp "bu dosya zaten kapalı" der ve kontrol etmez.

**Kapanma koşulu:** P08 compile akışı kurulduğunda, gerçek aday kümesi
üzerinden.

### Kabul kriterlerinin durumu

| # | Kriter | Durum | Not |
|---|---|---|---|
| 1 | Universe her compile'da hesaplanıyor, hash manifest'e yazılıyor | Kısmi | Hesaplayıcı ve tablo hazır; compile akışına bağlanma P08 |
| 2 | DENY hiçbir kanalda aday olmuyor (SQL seviyesinde) | Evet | 4 kanalda `compilePredicate` + `assertFirewallRespected` |
| 3 | DENY'li chunk için embedding üretilmiyor | Evet | `deniedGlobs` zorunlu + sorgu predicate'i |
| 4 | APPROVAL retrieval'da DENY gibi | Evet | `compilePredicate` bloklanan kümeye ekliyor |
| 5 | Policy store erişilemezse compile reddediliyor | Kısmi | `FirewallError` sınıfı ve fail-closed davranış hazır; compile akışı P08 |
| 6 | Universe deterministik | Evet | 6 determinizm testi |
| 7 | Policy simülasyonu | **HAYIR** | P08'e bağlı, yukarıya bakınız |
| 8 | `context_universes` immutable | Evet | migration `0070` trigger'ları |

### Gate sonuçları

```text
typecheck (loose + strict)   0 hata
vitest                       839 passed | 4 skipped (843)
build                        OK
secret-scan                  0 yeni bulgu
drift (verify-inventories)   8/8 kontrol geçti
```

### Yan düzeltme — sır tarayıcısı

Gate P07'de bir false positive daha yakaladı: çok seviyeli özellik
erişimi (`existing.candidate.containsSecret`). Tek seviyeli erişim için
kural vardı, çok seviyeli için yoktu. Her segmenti tanımlayıcı biçiminde
olan noktalı zincir bir **özellik erişimidir**; gömülü sır ise her zaman
literaldir. Kural genişletildi, regresyon testi eklendi ve JWT'nin
(noktalı ama gerçek bir sır) hâlâ yakalandığı ayrıca doğrulandı.

### Bu fazda kapatılmayanlar

- **`tests/security/context-firewall.spec.ts` ve e2e** — canlı şema
  gerektirir, P19.
- **Policy CRUD API'si** — `policy_rules` tablosu hazır; yönetim yüzeyi
  P15 Policies ekranıyla birlikte.
- **`validateResourceBoundary`'nin sabit listesinin silinmesi** — kernel
  hâlâ eski listeyi kullanıyor. Universe onu kapsıyor ama kernel'in
  kendisi P10 Change Firewall'da yeniden yazılacak; iki kez dokunmamak
  için orada birleştirilecek.

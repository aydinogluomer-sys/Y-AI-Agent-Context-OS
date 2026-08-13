# Phase 19 — CI/CD / Deployment / Migration

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P18](P18-reliability-observability-performance.md) · [P20 →](P20-final-production-acceptance.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P19 |
| **Workstream** | F — Quality / CI / Ops |
| **Dependencies** | P15, P17, P18 |
| **Migration bloğu** | `0121`–`0125` |

## Objective

Gerçek exit code üreten tam bir CI pipeline'ı kurmak; legacy yüzeyi silmek; deployment hedeflerini (local · Docker · single-node · cloud · enterprise) yapılandırmak; migration'ları (fresh + upgrade) güvence altına almak.

## Why This Phase Exists

Mevcut CI'da (`.github/workflows/ci.yml`) yapısal sorunlar var:

1. **E2E hiç çalışmıyor.** `pnpm run test:e2e:install` Chromium'u kuruyor, sonra workflow `build` ile bitiyor. `test:e2e` adımı **yok**.
2. **Migration'lar testlerden sonra.** `test:deterministic` adımı `db:migrate`'ten **önce** koşuyor; yani validation suite şemasız bir DB'ye karşı çalışıyor ve DB dalları sandbox/skip yoluna düşüp yine de exit 0 veriyor.
3. **`test:db` hiç yok.** Skip marker'larında fail eden tek suite CI'da çalışmıyor.
4. **Lint yok.** `"lint": "tsc --noEmit"` — typecheck ile aynı. `.eslintrc.json` var ama eslint bağımlılığı ve adımı yok.
5. **`qa:debug-tags` CI'da yok** — README'de commit-bloklayıcı gate olarak tanımlı olmasına rağmen.
6. **Çift lockfile** (P01'de çözüldü).
7. Coverage yok, artifact upload yok, concurrency group yok, `permissions:` bloğu yok, SAST/dependency scan yok (P17'de eklendi).

Ayrıca legacy yüzey hâlâ ayakta: `apps/api/src/index.ts` (7.170 satır) ve `MockDatabaseConnector`.

## Dependencies

P15 (UI cutover), P17 (güvenlik gate'leri), P18 (performans/dayanıklılık suite'leri).

## Current Repository Reality

Yukarıdaki + `MockDatabaseConnector` (`db.ts:562+`) regex tabanlı SQL emülatörü hâlâ production kod yolunda; `ALLOW_OFFLINE_API_BOOT` bayrağı `startup-policy.ts`'te.

## Target State

**CI kapıları (master §36):**

```text
install --frozen · lint · typecheck · unit · contract · integration
fresh migration · upgrade migration · security · E2E · build
secret scan · dependency audit · feature registry validation · false-green scan
```

Her adım **gerçek exit code** üretir. `continue-on-error` yok. Skip = failure.

**Deployment hedefleri:**

```text
local development       pnpm dev + docker compose (postgres, idp, otel)
Docker development      tam compose
single-node production  docker compose + reverse proxy
cloud production        container image + managed Postgres + secret manager
enterprise/private      air-gapped kurulum notları
```

## Architecture Decisions

- **ADR-070 (yeni)** — **Mock DB silinir.** Test yolu gerçek Postgres kullanır (testcontainers veya CI service). Alternatif: mock'u test-only tutmak. Reddedildi; sebep: mock, `MockDatabaseConnector.runMigrations()` gibi noktalarda migration'ları **uygulanmış sayıyor** ve testlerin yanlış yeşil vermesinin ana kaynağı.
- **ADR-071 (yeni)** — **`ALLOW_OFFLINE_API_BOOT` silinir.** DB olmadan boot etmek geliştirici kolaylığı değil, sessiz bozukluk kaynağıdır.
- **ADR-072 (yeni)** — **Typed + validated environment config.** `zod` şeması; eksik/zorunlu değişkende **boot fail**. Bugün `config.ts:57-81` hiçbir doğrulama yapmıyor ve `GEMINI_API_KEY` yoksa literal `"MY_GEMINI_API_KEY"`, `APP_URL` yoksa hard-coded bir Cloud Run URL'i (`config.ts:63`) kullanıyor.
- **ADR-073 (yeni)** — **Secret manager zorunlu (production).** `.env`'e sır yazan hiçbir kod yolu kalmaz (P0-2 kapandı); production'da secret manager referansı.

## Files / Packages Affected

`.github/workflows/`, `docker/`, `apps/api/src/config.ts`, `apps/api/src/db.ts`, `docs/operations/`.

### New Files

```text
.github/workflows/{ci.yml (yeniden yazım),nightly.yml,release.yml}
docker/{Dockerfile.api,Dockerfile.worker,Dockerfile.web}
docker/compose/{dev.yml,single-node.yml}
deploy/{cloud/README.md,enterprise/README.md}
apps/api/src/config/{schema.ts,load.ts}
scripts/ci/{validate-feature-registry.ts,check-no-skips.ts,drift-detect.ts}
migrations/0121_cleanup_legacy.sql … 0125_final_constraints.sql
docs/deployment/{local.md,docker.md,single-node.md,cloud.md,enterprise.md,upgrade.md}
```

### Files to Modify

- `apps/api/src/config.ts` → `config/{schema,load}.ts`; zod doğrulaması; hard-coded fallback'ler silinir.
- `package.json` — script'ler kanonikleştirilir; eslint eklenir.
- `playwright.config.js` — E2E gerçekten çalışacak şekilde (CI projesi, retries, artifact).

### Files to Delete/Deprecate

```text
apps/api/src/index.ts                     LEGACY router (7.170 satır)  → DELETE
MockDatabaseConnector (db.ts:562+)        → DELETE
startup-policy.ts ALLOW_OFFLINE_API_BOOT  → DELETE
scripts/validate-vault.ts + validate-segment-*.ts + validate-stage-*.ts
  (assert(true) ve skip-then-pass içeren ~15.000 satır)  → DELETE
scripts/validation-suite.ts               → DELETE (yerine vitest + gerçek suite'ler)
scripts/build-and-run-segments.ts         → DELETE (segment üreteci)
Y_UI_SURFACE feature flag'i               → DELETE
docs/audit/* eski raporlar                → arşive taşınır
```

**Legacy silme ön koşulu:** kanonik `/api/v1/*` yüzeyi Appendix J'deki tüm işlevleri karşılıyor ve E2E'ler geçiyor olmalı.

## Database Changes

```text
0121  legacy tabloların son temizliği (P14'te DROP edilmeyenler)
0122  eksik FK ve NOT NULL kısıtlarının tamamlanması
0123  RLS politikalarının tüm kritik tablolarda etkinleştirilmesi
0124  index optimizasyonu (P18 ölçümlerine göre)
0125  final constraint doğrulaması (orphan satır kontrolü)
```

## API Changes

Legacy `/api/*` yüzeyi **tamamen kaldırılır**. Yalnız `/api/v1/*` + infra endpoint'leri kalır.

## Type / Contract Changes

`EnvConfig` zod şeması; runtime doğrulama.

## Frontend Changes

`Y_UI_SURFACE` flag'i kaldırılır; v2 tek yüzey.

## Backend Changes

`server.ts` yalnız `createApp()` + kanonik router'ları mount eder; `apps/api/src/index.ts` silinir.

## Worker Changes

Worker'lar ayrı container image'ları olarak paketlenir.

## Security Changes

- Mock DB ve offline boot kaldırılınca "yerel geliştirmede güvenlik kapalı" yolu tamamen kapanır.
- Env doğrulaması: production'da `JWT_*`, `OIDC_*`, `DATABASE_URL`, secret manager ayarları **zorunlu**; eksikse boot fail.
- CI'da `permissions:` en az yetki; release imzalama.

## Migration Strategy

1. CI yeniden yazılır (doğru sıra, tüm gate'ler).
2. Env config doğrulaması.
3. Docker image'ları + compose dosyaları.
4. Legacy silme (ayrı commit, E2E doğrulamasından sonra).
5. Deployment dokümanları + upgrade prosedürü.

## Implementation Tasks

### Y-P19-001 — CI yeniden yazımı
**Doğru sıra:**
```yaml
install --frozen-lockfile
lint (eslint) + typecheck
unit (vitest)
contract
db:migrate:fresh          ← testlerden ÖNCE
integration               ← gerçek PG
db:migrate:upgrade        ← prod-benzeri veriden
security (24 suite)
e2e (playwright, GERÇEKTEN çalışır)
build
secret-scan · dep-audit · sbom
feature-registry-validate · false-green-scan · drift-detect
```
**Acceptance:** Her adım gerçek exit code; `continue-on-error` yok; concurrency group + `permissions: read-all` (gerekli yerde yükseltilir).

### Y-P19-002 — Nightly workflow
Performans bütçeleri (P18) + benchmark (P16) + tam E2E matrisi.

### Y-P19-003 — Release workflow
Sürüm etiketleme, image build/push, SBOM, imzalama, release notu, migration çalıştırma sırası.

### Y-P19-004 — ESLint
Gerçek eslint kurulumu + kurallar: paketler arası relative import yasağı (P01), `any` yasağı (public API'lerde), `Math.random()` ile ID yasağı, handler içinde ad-hoc authz yasağı (P02 ADR-017).

### Y-P19-005 — Env config doğrulaması
**Create:** `config/{schema,load}.ts`. Hard-coded fallback'ler (`"MY_GEMINI_API_KEY"`, Cloud Run URL'i, `postgresql://y_user:safe_pass@localhost:5432/y_vault`) **silinir**.
**Negative test:** Production'da zorunlu değişken eksikse boot **fail**.

### Y-P19-006 — Mock DB ve offline boot'un silinmesi
**Negative test:** `ENABLE_MOCK_DB` ve `ALLOW_OFFLINE_API_BOOT` kaynak ağacında yok.

### Y-P19-007 — Legacy router'ın silinmesi
`apps/api/src/index.ts` silinir. **Ön koşul:** Appendix J kapsama kontrolü + tüm E2E'ler yeşil.

### Y-P19-008 — Sahte validation script'lerinin silinmesi
`validate-vault.ts`, `validate-segment-*.ts`, `validate-stage-*.ts`, `validation-suite.ts`, `build-and-run-segments.ts`.
**Ön koşul:** Bu script'lerin kanıtladığı iddiaların **gerçek testlerle** karşılanmış olması (P01–P18 boyunca yazıldı).

### Y-P19-009 — Feature registry doğrulayıcı
**Create:** `scripts/ci/validate-feature-registry.ts`. Her `PASS` kaydı için: implementation dosyası var mı, testler gerçekten var ve son koşuda geçti mi, evidence referansı geçerli mi, commit SHA ve timestamp dolu mu.
**Acceptance:** Kanıtsız `PASS` → CI **fail**.

### Y-P19-010 — Drift detector
**Create:** `scripts/ci/drift-detect.ts` (P00'un üç doğrulama scriptinin genelleştirilmesi). Route sayısı, nav item sayısı, tablo kullanımı envanterle uyuşmalı.

### Y-P19-011 — Docker image'ları + compose
API, worker, web için ayrı image'lar; dev ve single-node compose.

### Y-P19-012 — Deployment dokümanları
`local · docker · single-node · cloud · enterprise` + `upgrade.md`.
**Acceptance:** Her doküman **sıfırdan izlenerek** doğrulanmış (kanıt: kurulum logu).

### Y-P19-013 — Migration güvencesi
Fresh + upgrade her CI koşusunda; upgrade prod-benzeri anonim veri seti üzerinde.

### Y-P19-014 — Dokümantasyon senkronizasyonu
`README`, `architecture`, `local development`, `deployment`, `security model`, `threat model`, `agent adapters`, `repository adapters`, `context compiler`, `policy language`, `evidence model`, `API`, `operations`, `incident response`, `backup/restore`, `upgrade` — hepsi production gerçekliğiyle eşleşir.
**Acceptance:** Doküman "tamamlandı" diyorsa kod bunu kanıtlıyor (P00'un çelişki listesi kapanmış).

## Parallelizable Tasks

```text
Y-P19-001 ∥ Y-P19-011 (docker) ∥ Y-P19-012 (docs)
Y-P19-004 ∥ Y-P19-005
Y-P19-009 ∥ Y-P19-010
```
Sıralı: `001 → 002 → 003`, `006 → 007 → 008` (silme sırası kritik).

## Tests

| Suite | İçerik |
|---|---|
| `config.test.ts` | Zod şeması; eksik değişken; production katılığı |
| `migrations fresh/upgrade` | Her CI koşusunda |
| CI'ın kendisi | Bir "kasıtlı kırık" PR ile her gate'in gerçekten fail ettiği doğrulanır |
| `drift-detect.test.ts` | Envanter uyuşmazlığı yakalanıyor |
| `feature-registry.test.ts` | Kanıtsız PASS yakalanıyor |

## Negative Tests

- **Gate doğrulaması:** Her CI gate'i için kasıtlı bir hata enjekte edilir ve pipeline'ın **fail ettiği** kanıtlanır (lint hatası, tip hatası, kırık test, kırık migration, güvenlik ihlali, E2E kırığı, sır ekleme, kanıtsız PASS).
- Production'da `DATABASE_URL` yoksa → boot **fail** (bugün boş string ile devam ediyordu).
- `ENABLE_MOCK_DB` set edilse bile etkisi yok (kod silindi).
- Legacy `/api/tasks` çağrısı → **404** (410 değil; route tamamen yok).
- Skip marker'ı içeren test çıktısı → `check-no-skips` **fail**.

## Security Tests

P17 suite'i CI gate'i olarak koşar; `permissions:` en az yetki; release imzalama doğrulaması.

## E2E

CI'da **gerçekten çalışır**: `tests/e2e/**` tamamı, artifact (trace/video/screenshot) upload'lı.

## Observability

CI metrikleri: adım süreleri, flaky test oranı, gate fail dağılımı.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| E2E flaky | Kırmızı CI | Flaky test **devre dışı bırakılmaz**; trace ile kök neden bulunur |
| Legacy silme erken | Kırık işlev | Appendix J kapsama kontrolü ön koşul; E2E yeşil olmadan silinmez |
| Upgrade migration prod'da farklı | Kesinti | Prod-benzeri veri seti + staging provası |
| CI süresi uzar | Yavaş geri bildirim | Paralel job'lar; benchmark ve performans nightly'ye |
| Env katılığı deploy'u bozar | Boot fail | Doğru davranış; deployment dokümanında zorunlu değişken listesi |

## Rollback / Recovery

- Image tabanlı deploy → önceki image'a dönüş.
- Migration'lar `-- +down` ile geri alınabilir; **veri kaybı riski olan DROP'lar** ayrı, onaylı adımlardır.
- Legacy silme geri alınmaz (silme öncesi kapsama kontrolü bu yüzden zorunlu).

## Acceptance Criteria

1. CI 15 gate'i **doğru sırada** çalıştırıyor; her biri gerçek exit code üretiyor.
2. E2E CI'da **gerçekten koşuyor**.
3. Fresh + upgrade migration her koşuda test ediliyor.
4. Lint (gerçek eslint) devrede.
5. Mock DB, offline boot, legacy router, sahte validation script'leri **silinmiş**.
6. Env config zod ile doğrulanıyor; hard-coded fallback yok.
7. Feature registry doğrulayıcı ve drift detector CI'da.
8. 5 deployment hedefi dokümante ve **sıfırdan doğrulanmış**.
9. Her gate için "kasıtlı kırık" testi pipeline'ın fail ettiğini kanıtlıyor.
10. Dokümantasyon production gerçekliğiyle eşleşiyor.

## Evidence Required

```text
CI koşu logu (tam pipeline)               tüm gate'ler yeşil
kasıtlı-kırık PR'ları                      her gate için fail kanıtı
E2E artifact'ları                          trace/video
fresh + upgrade migration logları          her ikisi de
deployment doğrulama logları               5 hedef
silinen satır sayısı                        git diff --stat
grep -rn "ENABLE_MOCK_DB\|ALLOW_OFFLINE_API_BOOT"   boş
feature registry doğrulama çıktısı          kanıtsız PASS = 0
```

## Exit Gate

```bash
# Tam pipeline yerel olarak
pnpm install --frozen-lockfile
pnpm run lint && pnpm run typecheck
pnpm test && pnpm run test:contract
pnpm run db:migrate:fresh && pnpm run test:integration
pnpm run db:migrate:upgrade
pnpm run test:security
pnpm run test:e2e
pnpm run build
pnpm run secret-scan && tsx scripts/security/dep-audit.ts
tsx scripts/ci/validate-feature-registry.ts
tsx scripts/security/false-green-scan.ts
tsx scripts/ci/drift-detect.ts
```

Hepsi exit 0 **ve** GitHub Actions'ta aynı pipeline yeşil.

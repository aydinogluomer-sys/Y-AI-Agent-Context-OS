# Phase 01 — Canonical Architecture & Domain Contracts

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P00](P00-truth-audit-and-scope-freeze.md) · [P02 →](P02-identity-tenant-authorization.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P01 |
| **Workstream** | Tüm ekip (senkron) |
| **Dependencies** | P00 |

## Objective

Sonraki 19 fazın üzerine yazacağı sözleşmeleri dondurmak: domain tipleri, paket sınırları, kanonik API app factory'si, migration altyapısı ve test altyapısı. Bu fazdan sonra hiçbir faz "önce şu tipi tanımlamam lazım" diye beklememelidir.

## Why This Phase Exists

Bugün `packages/shared/src/index.ts` 2.110 satır DTO içeriyor ama bunlar mevcut simüle edilmiş dünyanın tipleri. `Principal`, `Membership`, `SymbolRecord`, `ContextManifest`, `ChangeBoundary`, `RunState`, `AgentCapabilities` gibi kanonik domain tipleri yok. Paralel workstream'ler (A–F) ancak ortak sözleşme üzerinde çakışmadan çalışabilir.

Ayrıca iki altyapı borcu buradan temizlenir: **migration'ların kod içinde string olması** ve **unit test framework'ünün hiç olmaması**.

## Dependencies

P00 (envanter — hangi tipin gerçekten kullanıldığını bilmek için).

## Current Repository Reality

| Konu | Durum |
|---|---|
| Domain tipleri | `packages/shared/src/index.ts` — 2.110 satır, mevcut (simüle) dünyanın DTO'ları |
| App factory | Yok. `server.ts` doğrudan `express()` kurup `apiRouter` mount ediyor |
| Güvenlik middleware | Yok: helmet, cors, rate-limit, body-limit hiçbiri kurulu değil (`package.json`'da bağımlılık yok) |
| Migration | `apps/api/src/db.ts:1070-2174` — inline string array, 35 versiyon, `.sql` dosyası yok |
| Unit test | Framework yok. `packages/context/test/retrieval-isolation.test.ts` el yazımı, çağrılmıyor |
| ID üretimi | `Math.random().toString(36).substring(2,11)` — 15+ çağrı noktası (`index-job-service.ts:215`, `apps/api/src/index.ts:1239,1569,3067,3102,3298`, `audit.ts:57`, `WorkerRuntimeService.ts:188,890`, `graph/src/index.ts:124`, …) |
| Paket bağımlılıkları | `packages/graph/src/index.ts:14` workspace alias'ını atlayıp `../../core/src/static-analysis` relative path'i kullanıyor |
| Ölü paketler | `packages/connectors` (15 satır, 0 importer), `packages/ui` (17 satır, 0 importer) |
| Lockfile | Hem `package-lock.json` hem `pnpm-lock.yaml` — CI pnpm kullanıyor |

## Target State

```text
packages/shared/src/
├── index.ts              (re-export barrel)
├── identity.ts       NEW Principal · User · Organization · Membership · Role · ProjectScope
├── repository.ts     NEW Repository · RepositoryConnection · Snapshot · FileRecord
├── symbols.ts        NEW SymbolRecord · SymbolType · LanguageId
├── graph.ts          NEW GraphNode · GraphEdge · EdgeType · TraversalSpec
├── retrieval.ts      NEW Candidate · RankedCandidate · RankingSignal · RankingExplanation
├── policy.ts         NEW Policy · PolicyVersion · PolicyDecision · AllowedContextUniverse
├── context.ts        NEW ContextFragment · CompiledContext · ContextManifest · ManifestItem
│                          ManifestExclusion · TokenBudget · TokenizerId
├── change.ts         NEW ChangeBoundary · MutationDecision · ApprovalRequest
├── agent.ts          NEW AgentAdapter · AgentCapabilities · AgentSession · AgentEvent
├── run.ts            NEW RunState (12) · TaskRun · RunEvent · RunEventType
├── evidence.ts       NEW EvidenceBundle · QualityGateResult · AuditEntry
├── provenance.ts     NEW ProvenanceMode · ProductionResult<T> · SimulatedResult<T>
└── errors.ts         NEW DomainError hiyerarşisi + error code enum

apps/api/src/
├── app.ts            NEW createApp(deps): Express   (helmet/cors/rate-limit/body-limit/correlation)
├── middleware/       NEW error.ts · correlation.ts   (authn/authz P02'de)
└── domain/           NEW (boş iskelet, fazlar doldurur)

migrations/           NEW 0001_*.sql … 0035_*.sql  (mevcut şemanın birebir dışa aktarımı)
packages/db/src/      NEW migration runner (dosya tabanlı, transactional, +down desteği)

vitest.workspace.ts   NEW
packages/*/vitest.config.ts  NEW
```

## Architecture Decisions

- **ADR-001** — Paralel kanonik yüzey + cutover (master §3).
- **ADR-003** — Dosya tabanlı migration'lar (master Appendix K.1).
- **ADR-011** — vitest.
- **ADR-013 (yeni)** — **ID üretimi `crypto.randomUUID()`**. `Math.random()` tabanlı PK üretimi ~44 bit entropi taşıyor ve tahmin edilebilir; audit/evidence kayıtlarında bu bir bütünlük riskidir. Tek `newId()` helper'ı `packages/shared/src/ids.ts` içinde toplanır.
- **ADR-014 (yeni)** — **Tek paket yöneticisi: pnpm**. `package-lock.json` silinir. İki lockfile CI ile yerel geliştirme arasında sessiz sürüm sapması üretiyor.
- **ADR-015 (yeni)** — **Provenance mode type-level ayrımı**. Production DTO ile simulation DTO aynı tip olamaz (master §7).

## Files / Packages Affected

`packages/shared`, `apps/api/src`, yeni `packages/db`, yeni `migrations/`, kök yapılandırma dosyaları.

### New Files

```text
packages/shared/src/{identity,repository,symbols,graph,retrieval,policy,context,change,agent,run,evidence,provenance,errors,ids}.ts
apps/api/src/app.ts
apps/api/src/middleware/{error.ts,correlation.ts}
packages/db/{package.json,src/index.ts,src/runner.ts,src/types.ts}
migrations/0001_projects_foundation.sql … 0035_artifact_cas_mvp.sql
vitest.workspace.ts
packages/{shared,security,core,context,graph}/vitest.config.ts
docs/adr/ADR-001..ADR-015.md
```

### Files to Modify

- `packages/shared/src/index.ts` — barrel export'a dönüşür; mevcut tipler korunur (breaking değişiklik yok, additive).
- `apps/api/src/db.ts` — `migrationVersions` array'i **kaldırılır**, `packages/db` runner'ı çağrılır. `MockDatabaseConnector` bu fazda kalır (P19'da silinir).
- `server.ts` — `createApp()` kullanır; express kurulumunu kendi yapmayı bırakır.
- `packages/graph/src/index.ts:14` — relative import → `@y/core` alias'ı.
- `package.json` — `vitest`, `helmet`, `cors`, `express-rate-limit` eklenir; `test` script'i vitest'e bağlanır.
- ID üreten 15+ çağrı noktası → `newId()`.

### Files to Delete/Deprecate

- `packages/connectors/` — **DELETE** (15 satır stub, 0 importer)
- `packages/ui/` — **DELETE** (17 satır sabit obje, 0 importer)
- `package-lock.json` — **DELETE** (ADR-014)
- `packages/context/test/retrieval-isolation.test.ts` — **MIGRATE** → gerçek vitest testine dönüştürülür (silinmez; içeriği değerli)

## Database Changes

**Şema değişmez.** Yalnızca migration'ların **taşınması**:

1. `apps/api/src/db.ts:1070-2174` içindeki 35 versiyon, birebir SQL içerikleriyle `migrations/0001_*.sql` … `migrations/0035_*.sql` dosyalarına çıkarılır.
2. `schema_migrations` ledger'ı korunur; dosya adındaki numara ile eski `version` string'i arasındaki eşleme `migrations/MAPPING.md`'de tutulur.
3. Runner, ledger'da zaten kayıtlı olan versiyonları atlar → **mevcut veritabanları etkilenmez**.

## API Changes

Fonksiyonel değişiklik yok. `createApp()` şu middleware'leri ekler (davranış değiştirmeden, yalnız sertleştirerek):

```text
helmet()                      güvenlik header'ları
cors({ origin: allowlist })   şu an CORS hiç yapılandırılmamış
express.json({ limit:"1mb" }) şu an limit yok
rateLimit(...)                şu an yok
correlationId()               her isteğe X-Correlation-Id
errorHandler()                en sona kayıtlı (bugün /providers/health bundan önce kayıtlı → kapsam dışı)
```

## Type / Contract Changes

Tümü **additive**. Kritik tipler:

```ts
// identity.ts
interface Principal {
  sub: string; userId: string; orgId: string;
  roles: Role[]; kind: "user" | "service" | "worker";
  tokenId: string;                       // jti — replay koruması
}

// run.ts
type RunState =
  | "created" | "queued" | "preparing_context" | "awaiting_policy" | "ready"
  | "running" | "awaiting_approval" | "verifying" | "completed"
  | "failed" | "cancelled" | "blocked" | "degraded";

// context.ts
interface ContextManifest {
  manifestHash: string;                  // sha256(canonical_json)
  compilerVersion: string;
  policyVersion: number;
  deterministicInputsHash: string;       // (commit, task, policy, config)
  items: ManifestItem[];
  exclusions: ManifestExclusion[];
  budget: { limit: number; used: number; tokenizerId: TokenizerId };
}

// change.ts
type MutationDecision = "ALLOW" | "DENY" | "ASK_APPROVAL";

// provenance.ts
type ProvenanceMode = "PRODUCTION" | "DEMO" | "FIXTURE" | "SIMULATED";
```

**Kural:** `ContextManifest` ve `RunEvent` P01'den sonra yalnız additive değişir; breaking değişiklik yeni ADR ister (master §6.1).

## Frontend Changes

Yok. (`apps/web` P15'e kadar dokunulmaz — ID helper'ı hariç, o da frontend'de kullanılmıyor.)

## Backend Changes

`server.ts` `createApp()` kullanır; `apps/api/src/index.ts` **değişmeden** mount edilmeye devam eder (legacy yüzey korunur).

## Worker Changes

`workers/index-worker.ts` `newId()` helper'ını kullanır. Başka değişiklik yok (rewrite P04'te).

## Security Changes

- helmet / CORS allow-list / body limit / rate limit — **ilk kez** ekleniyor.
- `newId()` ile tahmin edilebilir PK üretimi ortadan kalkar.
- Error handler'ın en sonda kayıtlı olması sağlanır (bugün `GET /providers/health` error handler'dan **sonra** kayıtlı, yani hatası yakalanmıyor — `index.ts:7137` vs `7155`).

## Migration Strategy

1. `migrations/` dosyaları üretilir, runner yazılır.
2. Runner **fresh** (boş DB) ve **upgrade** (mevcut ledger'lı DB) senaryolarında test edilir.
3. `db.ts`'teki array kaldırılır. Aynı commit'te iki senaryo da CI'da koşar.
4. Geri dönüş: array `git revert` ile geri gelir; ledger uyumlu olduğu için veri kaybı yok.

## Implementation Tasks

### Y-P01-001 — Domain tip modülleri
**Create:** `packages/shared/src/{identity,repository,symbols,graph,retrieval,policy,context,change,agent,run,evidence,provenance,errors}.ts`
**Modify:** `packages/shared/src/index.ts` (barrel)
**Acceptance:** `tsc --noEmit` temiz; mevcut hiçbir import kırılmadı.

### Y-P01-002 — ID helper + çağrı noktası göçü
**Create:** `packages/shared/src/ids.ts` → `newId(prefix?: string): string` (`crypto.randomUUID()`)
**Modify:** 15+ çağrı noktası (P00 envanterinden liste).
**Negative test:** `Math.random()` içeren PK üretimi kalmadığını doğrulayan grep testi.

### Y-P01-003 — App factory + güvenlik middleware
**Create:** `apps/api/src/app.ts`, `middleware/{error,correlation}.ts`
**Modify:** `server.ts`
**Edge Cases:** Vite dev middleware'i ile helmet CSP çakışması — dev'de CSP gevşetilir, prod'da sıkı.
**Acceptance:** Mevcut tüm legacy route'lar aynı yanıtları veriyor (smoke karşılaştırması).

### Y-P01-004 — Migration dosyalarına çıkarma
**Create:** `migrations/0001..0035_*.sql`, `migrations/MAPPING.md`
**Acceptance:** Fresh DB'de üretilen şema, eski array ile üretilen şemayla **birebir aynı** (`pg_dump --schema-only` diff'i boş).

### Y-P01-005 — `packages/db` migration runner
**Create:** `packages/db/src/{index,runner,types}.ts`
**Algorithm:** Dosyaları sıralı oku → `schema_migrations`'ta olmayanları tek transaction'da uygula → `-- +up` / `-- +down` bölümlerini ayrıştır.
**Edge Cases:** Kısmi uygulama (transaction rollback), eşzamanlı runner (advisory lock).
**Acceptance:** Fresh + upgrade testleri geçiyor; ikinci çalıştırma no-op.

### Y-P01-006 — `db.ts` sadeleştirme
**Modify:** `apps/api/src/db.ts` — `migrationVersions` kaldırılır, `runMigrations()` runner'a devreder.
**Acceptance:** `npm run db:migrate` ve boot-time migration aynı sonucu veriyor.

### Y-P01-007 — vitest altyapısı
**Create:** `vitest.workspace.ts`, paket başına `vitest.config.ts`
**Modify:** `package.json` — `"test": "vitest run"`, `"test:watch": "vitest"`
**Acceptance:** `pnpm test` çalışıyor; en az bir gerçek test var (Y-P01-008).

### Y-P01-008 — İlk gerçek testler
**Create:** `packages/shared/src/__tests__/ids.test.ts`, `packages/db/src/__tests__/runner.test.ts`
**Migrate:** `packages/context/test/retrieval-isolation.test.ts` → vitest formatına.
**Acceptance:** 3 test dosyası `pnpm test` ile koşuyor; hiçbiri `assert(true)` içermiyor.

### Y-P01-009 — Ölü paketlerin silinmesi
**Delete:** `packages/connectors/`, `packages/ui/`
**Modify:** `pnpm-workspace.yaml`, `tsconfig.json` path'leri
**Acceptance:** `tsc --noEmit` ve build temiz.

### Y-P01-010 — Tek lockfile
**Delete:** `package-lock.json`
**Modify:** `.gitignore` (npm lockfile'ını engelle), `README.md` (pnpm zorunluluğu)
**Acceptance:** `pnpm install --frozen-lockfile` CI'da geçiyor.

### Y-P01-011 — Paket sınırı düzeltmesi
**Modify:** `packages/graph/src/index.ts:14` — relative import → `@y/core`
**Acceptance:** Hiçbir paket başka paketin `src/` yoluna relative path ile erişmiyor (lint kuralı ile korunur).

### Y-P01-012 — ADR kayıtları
**Create:** `docs/adr/ADR-001..ADR-015.md`
**Acceptance:** Her ADR `Decision / Alternatives / Chosen / Reason / Consequences` formatında.

## Parallelizable Tasks

```text
Y-P01-001 (tipler) ∥ Y-P01-004+005 (migration) ∥ Y-P01-007 (vitest)
Y-P01-009 ∥ Y-P01-010 ∥ Y-P01-011
```

Sıralı: `001 → 002` (ID helper tipleri kullanır), `004 → 005 → 006`, `007 → 008`.

## Tests

| Test | Kapsam |
|---|---|
| `ids.test.ts` | Format, benzersizlik (10⁶ örnekte çakışma yok), prefix davranışı |
| `runner.test.ts` | Fresh apply, idempotent re-run, kısmi hata → rollback, advisory lock altında eşzamanlı çalıştırma |
| `app.test.ts` | helmet header'ları mevcut, body limit aşımı 413, rate limit 429, correlation id yanıtta |
| `schema-parity.test.ts` | Eski array ile yeni dosyaların ürettiği şema `pg_dump` diff'i boş |

## Negative Tests

- Body limit'i aşan istek → **413** (bugün limitsiz, bellek tüketiyor).
- Rate limit üstü istek → **429**.
- CORS allow-list dışı origin → preflight **reddedilir**.
- `Math.random()` ile PK üreten kod eklenirse grep testi **fail**.
- Migration dosyasına `-- +down` eklenmezse runner testi **fail**.

## Security Tests

- helmet header seti (`X-Content-Type-Options`, `X-Frame-Options`, HSTS prod'da) doğrulanır.
- Error handler'ın stack trace sızdırmadığı (prod modda) doğrulanır.

## E2E

Regression koruması: mevcut legacy yüzeyin smoke davranışı `createApp()` sonrası değişmemeli. `tests/e2e/legacy-smoke.spec.ts` — `/api/healthz`, `/api/db/status` ve iki proje-kapsamlı route'un yanıt şeması karşılaştırılır.

## Observability

`correlationId()` middleware'i her isteğe `X-Correlation-Id` ekler ve `sysLogger`'a bağlar. Tam yapılandırılmış logging P18'de.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Migration parity kırılır | `pg_dump` diff boş değil | Dosyaya çıkarma hatalı → SQL'i birebir kopyala, elle düzenleme yapma |
| helmet CSP dev'i bozar | Vite HMR çalışmaz | Dev'de CSP devre dışı, prod'da açık |
| Rate limit test suite'ini boğar | 429'lar | Test ortamında yüksek limit, ama **kapalı değil** |
| Tip göçü breaking olur | `tsc` hataları | Tüm yeni tipler additive; mevcut export'lar silinmez |

## Rollback / Recovery

Her task ayrı commit. Migration göçü tek revert ile geri alınabilir (ledger uyumlu). `createApp()` revert'ü `server.ts`'i eski haline döndürür.

## Acceptance Criteria

1. 13 domain tip modülü mevcut, `tsc --noEmit` temiz.
2. `newId()` kullanımda; `Math.random()` tabanlı PK üretimi = 0.
3. `createApp()` helmet/cors/rate-limit/body-limit/correlation/error ile çalışıyor; legacy yüzey davranışı değişmemiş.
4. 35 migration `.sql` dosyası mevcut; fresh + upgrade testleri geçiyor; şema parity diff'i boş.
5. `pnpm test` çalışıyor, en az 3 gerçek test dosyası var, `assert(true)` yok.
6. `packages/connectors` ve `packages/ui` silinmiş; build temiz.
7. Tek lockfile (`pnpm-lock.yaml`).
8. Paketler arası relative `src/` import'u yok.
9. ADR-001…ADR-015 yazılmış.

## Evidence Required

```text
pnpm test                          çıktı, 0 fail
pnpm run typecheck                 çıktı, 0 error
pg_dump --schema-only diff         boş
tests/e2e/legacy-smoke.spec.ts     PASS
grep -rn "Math.random()" --include=*.ts | grep -i "id"    boş
ls migrations/*.sql | wc -l        35
```

## Exit Gate

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm --filter @y/db run test:migrations:fresh
pnpm --filter @y/db run test:migrations:upgrade
pnpm run build
```

Hepsi exit 0. **Bu gate geçmeden hiçbir workstream paralel başlayamaz** — sözleşmeler burada donar.

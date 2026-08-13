# Phase 03 — Secure Repository Ingestion

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P02](P02-identity-tenant-authorization.md) · [P04 →](P04-static-analysis-and-symbols.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P03 |
| **Workstream** | A — Context Intelligence |
| **Dependencies** | P02 |
| **Migration bloğu** | `0046`–`0052` |

## Objective

Gerçek Git repository'lerini bağlamak, klonlamak, senkronize etmek ve güvenli biçimde okumak. Local + GitHub + GitLab adapter'ları; genişletilebilir `RepositoryAdapter` sözleşmesi.

## Why This Phase Exists

Repository'de **hiç Git entegrasyonu yok**. `child_process`, `simple-git`, `isomorphic-git`, `nodegit` — hiçbiri yok. `ReadOnlyGitHubRepoAdapter` (`packages/core/src/repo-adapter.ts:423-522`) her metotta `ok:false` döner ve `readFile` (L468) `"E_コネクター未設定: GitHub Remote Connector requires authentication credentials..."` literal'ini üretir. `getChangedFiles` `E_UNSUPPORTED` (L382-390); `getDiff` Git'e hiç bakmadan iki string'i satır satır karşılaştırır (`createSafeTextDiff`, L45-62).

Y bir "AI coding agent context plane" iddiasındayken repository'ye bağlanamıyor. Bu, golden path'in ilk kopuk halkası.

## Dependencies

P02 (org/project scope, credential sahipliği).

## Current Repository Reality

| Konu | Gerçek |
|---|---|
| Git | **Yok** |
| Local adapter | `LocalFilesystemRepoAdapter` (`repo-adapter.ts:76-420`) — **gerçek** ve path güvenliği iyi |
| Path güvenliği | realpath containment + symlink escape (L112-158), denylist (`.env`, `secrets.json`, `credentials.json`, `*.pem`, `*.key`), dizin bloğu (`node_modules`, `dist`, `build`, `.next`, `out`, `target`), 5MB limit (L177), binary detect (NUL, L65-73), read-time redaksiyon (L187) |
| Adapter seçimi | `repo-adapter-service.ts:22-46` — `repo_sources` satırı yoksa **`new LocalFilesystemRepoAdapter(".")`** = sunucunun cwd'si (**P0-9**) |
| `configure-local` | `index.ts:4632` keyfi mutlak `root_path` kabul ediyor (**P0-9**) |
| `logAccess` kırık | `repo-adapter-service.ts:104-120` `audit_logs`'ta olmayan kolonlara yazıyor, `await` try/catch'siz → `/repo/file`, `/repo/files` gerçek PG'de **500** |
| Ölü guard | `index.ts:6876-6890` `validatePath`'i try/catch'e sarıyor ama fonksiyon **throw etmiyor**, `{valid,error}` döndürüyor → guard ölü kod |
| `listFiles` maliyeti | Her listelemede <1MB tüm dosyaları SHA-256'lıyor, senkron (L293-296) |
| Secret scanner | `packages/security/src/index.ts:17-51` — regex zinciri; **L23-25 gerçek bir DB parolasını iki parçadan birleştiriyor** (P0-11), L48 Supabase host'u hard-code |

## Target State

```ts
interface RepositoryAdapter {
  connect(cfg): Promise<ConnectResult>;
  clone(target): Promise<SnapshotRef>;
  fetch(): Promise<SnapshotRef>;
  checkout(ref): Promise<SnapshotRef>;
  listFiles(opts): AsyncIterable<FileRecord>;
  readFile(path): Promise<FileContent>;
  gitStatus(): Promise<GitStatus>;
  gitDiff(a, b): Promise<Diff>;
  changedFiles(a, b): Promise<string[]>;
  currentCommit(): Promise<string>;
  branch(): Promise<string>;
  repositoryMetadata(): Promise<RepoMetadata>;
  disconnect(): Promise<void>;
  capabilities(): AdapterCapabilities;   // read-only vs write-capable ayrı set
}
```

- `local` · `github` · `gitlab` implementasyonları, aynı contract test suite'ine tabi.
- Credential'lar secret manager referansı olarak saklanır; **düz metin asla DB'de veya `.env`'de değil**.
- Snapshot modeli: her ingestion bir `repository_snapshots(repository_id, commit_sha)` satırıdır; index ve graph bu snapshot'a bağlanır.

## Architecture Decisions

- **ADR-006** — `isomorphic-git` + native `git` CLI hibriti. Native `git` yalnız `execFile` ile, argüman dizisi halinde, **shell olmadan** (T-22).
- **ADR-018 (yeni)** — **Repository root'u kullanıcı seçmez.** Local adapter yalnız sunucunun yönettiği `WORKSPACE_ROOT/<org>/<project>/<repo>` altında çalışır. Alternatifler: (a) keyfi path (bugünkü), (b) allow-list'li path, (c) yönetilen workspace. Seçilen (c). Sebep: (a) ve (b) her ikisi de operatör hatasıyla arbitrary-file-read'e dönüşüyor. Sonuç: "yerel klasörü bağla" akışı, klasörün workspace'e klonlanmasıyla çalışır.
- **ADR-019 (yeni)** — **Ingestion HTTP request içinde çalışmaz.** Clone/fetch/index job kuyruğuna girer (P12 kuyruğunun öncülü; bu fazda mevcut `index_jobs` örüntüsü kullanılır).

## Files / Packages Affected

`packages/core/src/repo/*`, `packages/core/src/git/*`, `packages/security/src/secret-scanner`, `apps/api/src/routes/repositories.ts`, `migrations/`.

### New Files

```text
packages/core/src/repo/{adapter.ts,local-adapter.ts,github-adapter.ts,gitlab-adapter.ts,registry.ts}
packages/core/src/git/{git-cli.ts,iso-git.ts,diff.ts}
packages/core/src/ingestion/{snapshot-service.ts,workspace.ts}
packages/security/src/path-guard/index.ts        (repo-adapter.ts:112-158'den çıkarılır)
packages/security/src/secret-scanner/index.ts    (yeniden yazım, gömülü sır yok)
apps/api/src/routes/repositories.ts
apps/api/src/domain/repository/*.ts
migrations/0046_repositories.sql … 0052_drop_repo_sources.sql
packages/core/src/repo/__tests__/adapter-contract.test.ts   (3 adapter'a da uygulanır)
tests/security/{path-guard,malicious-repo,ssrf}.spec.ts
```

### Files to Modify

- `packages/core/src/repo-adapter.ts` → içerik `repo/local-adapter.ts` + `path-guard`'a bölünür; dosya kaldırılır.
- `packages/core/src/repo-adapter-service.ts` → `repo/registry.ts`; default `"."` davranışı **silinir**, adapter yoksa hata.
- `packages/security/src/index.ts` — gömülü parola parçaları (L23-25) ve Supabase host'u (L48) **silinir**; pattern tabanlı tarayıcıya geçilir.

### Files to Delete/Deprecate

- `POST /projects/:id/repo/configure-local` (**P0-9**) → `POST /api/v1/projects/:pid/repositories` ile değiştirilir
- `ReadOnlyGitHubRepoAdapter` stub'ı
- `index.ts:6876-6890` ölü guard bloğu
- `repo_sources` tablosu (0052)

## Database Changes

```text
0046  repositories             (org_id, project_id, kind, url, default_branch, created_by)
0047  repository_connections   (repository_id, credential_ref, scopes)   ← düz metin yok
0048  repository_snapshots     (repository_id, commit_sha, branch, ingested_at) UNIQUE(repo, sha)
0049  files                    (snapshot_id, path, content_hash, language, size,
                                is_binary, is_generated, is_minified) + idx(snapshot, path)
0050  repo_access_logs         REPLACE → audit_logs'a devredilir (tablo DROP)
0051  index_jobs               + snapshot_id, + job_type
0052  repo_sources             veri göçü → repositories, ardından DROP
```

## API Changes

`/api/v1/projects/:pid/repositories` CRUD + `/sync` + `/index-status` + `/tree` + `/file` (Appendix J). Legacy `/repo/*` route'ları 410 + `Sunset`.

## Type / Contract Changes

`Repository`, `RepositoryConnection`, `Snapshot`, `FileRecord`, `AdapterCapabilities`, `GitStatus`, `Diff` (P01 tipleri) implemente edilir.

## Frontend Changes

Yok (P15). Mevcut `apps/web/src/lib/api/adapter.ts` geçici olarak kanonik endpoint'lere yönlendirilir.

## Backend Changes

`RepositoryRegistry` adapter seçimini `repositories.kind`'a göre yapar. Adapter yoksa **hata** (bugün sessizce cwd'yi repo sayıyor).

## Worker Changes

Yeni `workers/ingestion-worker.ts`: clone/fetch/checkout + snapshot + `files` doldurma. `index-worker.ts` rewrite'ı P04'te.

## Security Changes

- **P0-9 kapanır** (yönetilen workspace).
- **P0-11 kapanır** (gömülü sır silinir + ilgili credential rotate edilir — operatör görevi, runbook'a yazılır).
- Yeni: SSRF koruması (repo URL allow-list, private IP bloğu, DNS rebinding) — **T-23**.
- Yeni: malicious repo limitleri (boyut, derinlik, dosya sayısı, timeout, disk kotası) — **T-06**.
- `execFile` + argüman dizisi; shell yok — **T-22**.
- `logAccess` düzeltilir (audit şeması P02'de genişledi) → `/repo/file` 500'ü biter.

## Migration Strategy

1. Adapter contract + local adapter (mevcut güvenlik kodunu koruyarak) yazılır.
2. Workspace yöneticisi + snapshot servisi.
3. GitHub, sonra GitLab adapter'ı.
4. `repo_sources` verisi `repositories`'e taşınır; legacy route'lar 410.

## Implementation Tasks

### Y-P03-001 — `RepositoryAdapter` contract + registry
**Create:** `repo/adapter.ts`, `repo/registry.ts`. **Acceptance:** Contract test suite'i 3 adapter'a da uygulanabiliyor.

### Y-P03-002 — PathGuard'ın ayrıştırılması
**Create:** `packages/security/src/path-guard/`. **Algorithm:** Mevcut `repo-adapter.ts:112-158` mantığı korunur, test kapsamı genişletilir. **Security:** 50+ traversal/symlink payload'ı.

### Y-P03-003 — Yönetilen workspace
**Create:** `ingestion/workspace.ts` — `WORKSPACE_ROOT/<org>/<project>/<repo>`. **Edge Cases:** Disk kotası, eşzamanlı clone, kalıntı dizin temizliği.

### Y-P03-004 — Git servisi
**Create:** `git/git-cli.ts` (`execFile`, shell yok), `git/iso-git.ts`, `git/diff.ts`. **Security:** Argüman allow-list'i; kullanıcı girdisi asla flag pozisyonuna gelmez.

### Y-P03-005 — Local adapter (rewrite)
**Create:** `repo/local-adapter.ts`. Mevcut güvenlik davranışı korunur; `listFiles` **streaming** olur (senkron toplu hash'leme kaldırılır).

### Y-P03-006 — GitHub adapter
**Create:** `repo/github-adapter.ts`. REST + shallow clone. **Edge Cases:** rate limit, büyük repo, LFS, private repo izinleri.

### Y-P03-007 — GitLab adapter
**Create:** `repo/gitlab-adapter.ts`. Aynı contract.

### Y-P03-008 — Snapshot servisi + `files` doldurma
**Create:** `ingestion/snapshot-service.ts`. **Outputs:** `repository_snapshots` + `files` satırları; generated/minified sınıflandırması.

### Y-P03-009 — Ingestion worker
**Create:** `workers/ingestion-worker.ts`. Job FSM + retry + idempotency.

### Y-P03-010 — Secret scanner yeniden yazımı
**Modify:** `packages/security/src/index.ts` — gömülü sırlar silinir; entropy + pattern tabanlı tarama; `validate-*` ve `scratch/` muafiyeti **kaldırılır** (bugün `scripts/secret-scan.ts:76` bunları atlıyor).

### Y-P03-011 — Kanonik repository route'ları
**Create:** `routes/repositories.ts` + `domain/repository/*`

### Y-P03-012 — Migration'lar 0046–0052 + `logAccess` düzeltmesi

## Parallelizable Tasks

```text
Y-P03-002 ∥ Y-P03-010            (farklı security alt modülleri)
Y-P03-006 ∥ Y-P03-007            (contract donduktan sonra)
Y-P03-012 ∥ Y-P03-004
```
Sıralı: `001 → 003 → 004 → 005 → (006∥007) → 008 → 009 → 011`.

## Tests

| Suite | İçerik |
|---|---|
| `adapter-contract.test.ts` | 13 metodun tamamı, 3 adapter × aynı beklentiler |
| `path-guard.spec.ts` | traversal, symlink escape, denylist, mutlak path |
| `git-cli.test.ts` | clone/fetch/checkout/diff/changedFiles gerçek fixture repo üzerinde |
| `snapshot-service.test.ts` | Aynı commit iki kez → tek snapshot; farklı commit → yeni snapshot |
| `secret-scanner.test.ts` | Bilinen sır formatları; false-positive oranı |

## Negative Tests

- Workspace dışına path → **reddedilir**.
- Symlink ile `/etc` → **reddedilir**.
- 5MB üstü dosya → içerik döndürülmez, meta döner.
- Binary dosya → içerik döndürülmez.
- Private IP'ye repo URL'i → **reddedilir** (SSRF).
- Adapter yapılandırılmamış proje → **hata** (bugün cwd'yi okuyor).
- `.env` okuma denemesi → **reddedilir** ve audit'e yazılır.

## Security Tests

Appendix I: **T-03, T-04, T-06, T-22, T-23** + T-07'nin repo tarafı.

## E2E

`tests/e2e/repo-connect.spec.ts` — gerçek bir fixture Git repo'su (test container içinde bare repo) bağlanır, klonlanır, snapshot oluşur, dosya ağacı listelenir, `.env` erişimi engellenir.

## Observability

`index_latency`, `clone_duration`, `repo_size_bytes`, `ingestion_failure_total{reason}`; `readyz`'de workspace disk durumu.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Clone yarıda kesilir | Kısmi workspace | Snapshot yazılmaz; workspace temizlenir; job retry |
| Rate limit (GitHub) | 403/429 | Exponential backoff + job requeue; kullanıcıya görünür durum |
| Devasa repo | Disk dolar | Kota kontrolü clone öncesi; aşımda job `blocked` |
| Credential geçersiz | 401 | Repository `disconnected` durumuna geçer, audit + kullanıcı bildirimi |
| Symlink döngüsü | Sonsuz gezinme | `realpath` + ziyaret seti + derinlik limiti |

## Rollback / Recovery

`repo_sources` DROP'u (0052) en sona bırakılır ve veri göçü doğrulandıktan sonra ayrı commit'te uygulanır. Adapter'lar registry üzerinden seçildiği için eski davranışa dönüş tek satırlık registry değişikliğidir (ama `"."` default'u **geri getirilmez**).

## Acceptance Criteria

1. Gerçek bir Git repo'su (local + GitHub + GitLab) bağlanıp klonlanabiliyor.
2. `changedFiles(a,b)` gerçek `git diff` sonucu döndürüyor.
3. Snapshot + `files` tabloları doluyor.
4. Adapter contract testi 3 adapter'da da geçiyor.
5. Workspace dışına erişim imkânsız; `configure-local` silinmiş.
6. `/repo/file` gerçek PG'de 200 (bugün 500).
7. Kaynak kodda gömülü sır = 0; secret-scan muafiyeti yok.
8. Ingestion HTTP request içinde çalışmıyor.

## Evidence Required

```text
adapter-contract.test.ts × 3 adapter        PASS
tests/e2e/repo-connect.spec.ts              PASS
tests/security/{path-guard,malicious-repo,ssrf}.spec.ts   PASS
psql: SELECT commit_sha FROM repository_snapshots         gerçek SHA
git log çıktısı ile karşılaştırma            eşleşiyor
pnpm run secret-scan                        0 bulgu, muafiyetsiz
```

## Exit Gate

```bash
pnpm test --filter @y/core
pnpm run test:integration -- tests/integration/repo
pnpm run test:e2e -- tests/e2e/repo-connect.spec.ts
pnpm run test:security -- tests/security/path-guard.spec.ts tests/security/ssrf.spec.ts
pnpm run secret-scan
```

Ek: **P0-9 ve P0-11 kapalı** olarak işaretli ve teste bağlı.

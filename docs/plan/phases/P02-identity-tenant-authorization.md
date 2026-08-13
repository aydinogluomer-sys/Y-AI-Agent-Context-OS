# Phase 02 — Identity / Tenant / Authorization Foundation

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P01](P01-canonical-architecture-and-contracts.md) · [P03 →](P03-secure-repository-ingestion.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P02 |
| **Workstream** | B — Security / Governance |
| **Dependencies** | P01 |
| **Migration bloğu** | `0036`–`0045` |

## Objective

Production-grade çok kullanıcılı kimlik ve yetkilendirme temeli kurmak: OIDC + JWKS doğrulama, `organizations`/`users`/`memberships` modeli, DB-backed authorization, fail-closed Permission Kernel. **7 P0 güvenlik bulgusunu kapatmak.**

## Why This Phase Exists

Bugün authorization tamamen token claim'i ve env değişkeni. DB-backed kontrol fonksiyonu (`auth.ts:398-430`) yazılmış, import edilmiş (`index.ts:82`) ve **hiç çağrılmıyor**; üstelik var olmayan bir tabloyu (`project_memberships(user_id)`) sorguluyor ve hatayı `catch {}` ile yutuyor. `GET /api/auth/dev-session` auth'suz olarak `role:"admin"`, `projectIds:["*"]` token dağıtıyor ve yerel `.env` bunu etkinleştiren bayrağı taşıyor.

Bu fazdan önce hiçbir güvenlik iddiası anlamlı değildir. Context Firewall (P07) ve Change Firewall (P10) principal'a bağımlıdır.

## Dependencies

P01 (Principal/Membership sözleşmeleri, app factory, migration runner).

## Current Repository Reality

| Konu | Gerçek |
|---|---|
| JWT doğrulama | `apps/api/src/auth.ts` — **el yazımı**, `jsonwebtoken`/`jose` bağımlılığı yok |
| HS256 anahtarı | `JWT_SECRET \|\| Y_API_AUTH_TOKEN` (`auth.ts:201`) — paylaşımlı API token'ı imzalama anahtarı olabiliyor |
| JWKS | `fetchJwksPublicKey` (`auth.ts:32-76`) ve `validateApiAuthTokenAsync` (L372-394) var; request path'i **sync** `authenticateBearerHeader`'ı çağırıyor (`index.ts:122`) → JWKS **ölü kod**. Tek tüketici `/db/configure` (L1035) ve o bile cache'i sync doğrulayıcıya bağlamıyor |
| Authorization | `principalCanAccessProject` (`auth.ts:398-406`) — saf array üyeliği, `"*"` wildcard |
| DB-backed authz | `principalCanAccessProjectAsync` (L408-430) — **hiç çağrılmıyor**, `project_memberships(user_id)` tablosu yok, hata yutuluyor |
| Membership şeması | `memberships(id, project_id, user_email, role)` (`db.ts:1086-1098`) — **0 okuma, 0 yazma** |
| Tenant modeli | **Yok.** Hiçbir tabloda `organization_id`/`tenant_id` kolonu yok |
| Dev bypass | `GET /auth/dev-session` (`index.ts:100`) auth middleware'inden **önce** kayıtlı; `ENABLE_MOCK_DB=true` + non-prod ile admin token dağıtır |
| Audit actor | `getAuditActor` import edilmiş, **hiç çağrılmıyor**. Hard-coded actor'lar: `"User-Aydinoglu"` (L1263, 3574, 3605), `"developer"` (L980, 1002, 1148, 1181, 1202, 4667), `"anonymous-actor"` (L567) |
| Permission Kernel fallback | `PermissionKernelService.ts:67` — `NODE_ENV=test \|\| CI=true \|\| ALLOW_STATIC_POLICY_FALLBACK \|\| DETERMINISTIC_TEST_MODE` iken DB hatasında **statik allow listesi** |
| Kernel subject | Çağrıların çoğu `subject_type:"system"` hard-code ediyor; `policy-system-bypass` (`db.ts:2090`) `allow / system / * / *` → her zaman allow |
| `permissions/evaluate` | Client'ın `subject` nesnesini spread ediyor (`index.ts:4402`) |
| Kırık endpoint | `GET /projects/:id/permission-policies` var olmayan `project_id`/`is_system` kolonlarını sorguluyor → gerçek PG'de her zaman 500 |
| Frontend auth | `lib/api/auth-bootstrap.ts` — global `fetch` monkey-patch, dev-session token'ı `sessionStorage`'da. Login UI yok, 401 handler yok |

## Target State

- OIDC Authorization Code + PKCE akışı; access token `jose` ile JWKS üzerinden **async** doğrulanır.
- `organizations` → `org_memberships` → `projects` → `project_memberships` zinciri DB'de; authorization **yalnız** DB'den okunur.
- Permission Kernel fail-closed: policy store erişilemezse DENY + security event + `readyz` degraded. Statik allow fallback **yok**.
- Audit actor daima `req.principal.sub`.
- `service_identities` ile worker/agent kimlikleri imzalı.
- Dev bypass yolu **silinir**; yerine yerel geliştirme için gerçek OIDC (Keycloak/dev issuer) docker-compose ile gelir.

## Architecture Decisions

- **ADR-002** — OIDC + `jose` + DB-backed membership.
- **ADR-016 (yeni)** — **Dev bypass yerine gerçek IdP.** Alternatifler: (a) dev token'ı korumak, (b) test-only bayrak, (c) yerel Keycloak. Seçilen: (c). Sebep: dev bypass'ı korumanın her varyantı üretime sızma riski taşıyor (bugünkü `.env` bunun kanıtı). Sonuç: yerel geliştirme `docker compose up idp` gerektirir.
- **ADR-017 (yeni)** — **Authorization tek noktadan.** Tüm proje-kapsamlı erişim `requireProjectScope` middleware'inden geçer; handler içinde ad-hoc kontrol yasak. Lint kuralı ile korunur.

## Files / Packages Affected

`apps/api/src/middleware`, `apps/api/src/routes`, `packages/security`, `migrations/`, `apps/web/src/lib/auth`.

### New Files

```text
apps/api/src/middleware/authn.ts          jose + JWKS + Principal üretimi
apps/api/src/middleware/authz.ts          requireOrgScope · requireProjectScope · requireRole
apps/api/src/middleware/tenant.ts         SET LOCAL app.current_org (RLS)
apps/api/src/routes/auth.ts               /api/v1/auth/me · /logout
apps/api/src/routes/orgs.ts               org CRUD + members
apps/api/src/routes/projects.ts           kanonik proje CRUD + members
apps/api/src/domain/identity/*.ts         use-case katmanı
packages/security/src/permission-kernel/  refactor hedefi
migrations/0036_organizations.sql … 0045_drop_legacy_memberships.sql
docker/idp/docker-compose.yml             yerel OIDC (dev)
tests/security/{jwt,idor,tenant-isolation,fail-closed,audit-actor}.spec.ts
```

### Files to Modify

- `apps/api/src/index.ts` — `/auth/dev-session` **silinir**; legacy auth middleware kanonik authn'e devreder (legacy route'lar korunur ama artık gerçek principal ister).
- `apps/api/src/auth.ts` — el yazımı JWT doğrulama **silinir**; dosya `middleware/authn.ts`'e taşınır.
- `PermissionKernelService.ts` — statik fallback silinir (L67-147); subject `req.principal`'dan türetilir; `policy-system-bypass` seed'i kaldırılır.
- `apps/api/src/audit.ts` — `logAction` zorunlu `principalId` alır.
- `apps/web/src/lib/api/auth-bootstrap.ts` → `lib/auth/oidc.ts` ile değiştirilir.

### Files to Delete/Deprecate

- `GET /api/auth/dev-session` (**P0-1**)
- `POST /api/db/configure` (**P0-2**) — SSRF + `.env` yazımı; `/api/v1/admin/db/status` okuma-only karşılığıyla değiştirilir
- `apps/web/src/hooks/useWorkspace.ts` (**P0-12**) — DB parolasını state'e yazıyor
- `apps/api/src/scripts/list-env.ts` — env değer uzunluğu oracle'ı

## Database Changes

```text
0036  organizations
0037  users                                  (oidc_sub UNIQUE, email, display_name)
0038  org_memberships                        (org_id, user_id, role) UNIQUE
0039  project_memberships                    (project_id, user_id, role) UNIQUE
0040  service_identities                     (kind, public_key, org_id)
0041  projects        + organization_id NOT NULL FK        ← kod bunu zaten okuyor
0042  tasks           + organization_id, + assigned_to     ← kod bunu zaten okuyor
0043  audit_logs      + organization_id, + actor_principal_id NOT NULL,
                      + category, + actor_role, + FK project_id   ← kod bunları yazıyor
0044  policies/policy_versions               (permission_policies REPLACE)
                      + organization_id, + project_id, + is_system  ← kod bunları okuyor
0045  memberships → project_memberships veri göçü, ardından DROP
```

Ayrıca `0044` seed'inden `policy-system-bypass` **çıkarılır** (P0-6).

**Upgrade migration'ı** `memberships.user_email` → `users.oidc_sub` eşlemesini yapamayan satırlar için bir `orphaned_memberships` raporu üretir ve **başarısız olmaz**; operatör bunları elle bağlar.

## API Changes

| Endpoint | Değişiklik |
|---|---|
| `GET /api/v1/auth/me` | NEW |
| `POST /api/v1/auth/logout` | NEW |
| `/api/v1/orgs*` | NEW (CRUD + members) |
| `/api/v1/projects*` | NEW (kanonik, membership doğrulamalı) |
| `GET /api/auth/dev-session` | **DELETE** |
| `POST /api/db/configure` | **DELETE** |
| `GET /api/config/inspect` | **DELETE** → `/api/v1/admin/health` (sır alanı yok) |
| `GET /api/audit-logs` | **REPLACE** → `/api/v1/projects/:pid/audit` (proje-kapsamlı) |
| `POST /projects/:id/permissions/evaluate` | **REPLACE** → subject artık principal'dan; client subject'i yok sayılır |
| Unscoped IDOR route'ları (P0-8, 9 adet) | **DELETE** |

## Type / Contract Changes

`Principal`, `Organization`, `Membership`, `Role`, `ProjectScope`, `ServiceIdentity` (P01'de tanımlandı) burada implemente edilir. `AuditEntry.actorPrincipalId` zorunlu olur.

## Frontend Changes

Minimum, P15'i beklemeden: `lib/auth/oidc.ts` (PKCE akışı), token yenileme, 401 handler. `auth-bootstrap.ts` monkey-patch'i kaldırılır. **UI yeniden tasarımı P15'te.**

## Backend Changes

Legacy `apps/api/src/index.ts` artık kanonik `authn` middleware'ini kullanır. Bu, legacy route'ların da gerçek principal istemesi demektir — dev-session gittiği için yerel geliştirme IdP'siz çalışmaz (kasıtlı).

## Worker Changes

`workers/index-worker.ts` statik `INDEX_WORKER_TOKEN` yerine `service_identities` tabanlı imzalı kimlik kullanır (T-15).

## Security Changes

Kapanan P0'lar: **P0-1, P0-2, P0-3, P0-4, P0-5, P0-6, P0-7, P0-8, P0-12.**
(P0-9 → P03, P0-10 → P17, P0-11 → P17.)

## Migration Strategy

1. Kanonik authn/authz middleware'i yazılır ve **yalnız** `/api/v1/*` üzerinde çalışır.
2. Yeni tablolar + veri göçü uygulanır.
3. Legacy `/api/*` yüzeyi kanonik authn'e bağlanır; `dev-session` silinir.
4. Kernel fallback ve `system` bypass kaldırılır.
5. Unscoped route'lar silinir; frontend'in çağırdığı olanlar için 410 + `Link` header (P15 bunları zaten değiştirecek).

## Implementation Tasks

### Y-P02-001 — `jose` tabanlı authn middleware
**Create:** `middleware/authn.ts`. **Algorithm:** JWKS remote key set (TTL cache) → `jwtVerify` (sabit `algorithms`, `issuer`, `audience`) → `Principal`. **Edge Cases:** JWKS erişilemez → 503 (fail-closed), `kid` bulunamaz → 401, saat kayması ±60s. **Security:** `alg:none`, HS/RS confusion, JWKS URI allow-list.

### Y-P02-002 — DB-backed authz middleware
**Create:** `middleware/authz.ts`. `requireOrgScope`, `requireProjectScope`, `requireRole`. **Algorithm:** `project_memberships` + `org_memberships` join'i, istek başına tek sorgu + request-scoped cache. **Acceptance:** Hiçbir handler `principal.projectIds` dizisine bakmıyor.

### Y-P02-003 — Tenant middleware + RLS
**Create:** `middleware/tenant.ts` → `SET LOCAL app.current_org`. **Acceptance:** RLS açık tablolarda cross-org sorgu 0 satır döner.

### Y-P02-004 — Migration'lar 0036–0045
**Acceptance:** Fresh + upgrade testleri; `orphaned_memberships` raporu üretiliyor.

### Y-P02-005 — Kanonik auth/org/project route'ları
**Create:** `routes/{auth,orgs,projects}.ts` + `domain/identity/*`

### Y-P02-006 — Permission Kernel fail-closed refactor
**Modify:** `PermissionKernelService.ts` — L67-147 statik fallback **silinir**; DB hatası → DENY + `SECURITY_POLICY_STORE_UNAVAILABLE` event + readiness degraded. Subject `req.principal`'dan. `loadPolicies`'teki `|| "*"` defaultu (L52-59) **kaldırılır** (malformed satır wildcard allow üretiyordu).
**Negative test:** Policy store kapalıyken her istek DENY.

### Y-P02-007 — `permission-policies` endpoint'i düzeltme
**Modify:** `index.ts:4377` sorgusu; `0044` ile gelen `project_id`/`is_system` kolonlarına dayanır. **Acceptance:** Gerçek PG'de 200 dönüyor (bugün 500).

### Y-P02-008 — Audit actor zorunluluğu
**Modify:** `audit.ts` + tüm hard-coded actor çağrıları. **Negative test:** Actor'ı elle set etmeye çalışan kod grep testiyle **fail** eder.

### Y-P02-009 — P0 endpoint'lerinin silinmesi
**Delete:** `dev-session`, `db/configure`, `config/inspect`, 9 unscoped route, `list-env.ts`, `useWorkspace.ts`.

### Y-P02-010 — Service identity + worker auth
**Create:** `service_identities` kullanımı; worker token'ı imzalı kimliğe bağlanır.

### Y-P02-011 — Frontend OIDC
**Create:** `apps/web/src/lib/auth/oidc.ts`. **Delete:** `auth-bootstrap.ts`.

### Y-P02-012 — Yerel IdP compose
**Create:** `docker/idp/docker-compose.yml` + `docs/local-development.md` güncellemesi.

## Parallelizable Tasks

```text
Y-P02-001 ∥ Y-P02-004 (migration) ∥ Y-P02-012 (IdP compose)
Y-P02-006 ∥ Y-P02-008
Y-P02-011 ∥ backend task'ları (farklı app)
```
Sıralı: `001 → 002 → 003 → 005`, `004 → 007`, `002 → 009`.

## Tests

| Suite | İçerik |
|---|---|
| `tests/security/jwt.spec.ts` | `alg:none`, HS/RS confusion, süresi geçmiş, `nbf` gelecekte, yanlış `iss`/`aud`, bilinmeyen `kid`, `sub` yok |
| `tests/security/idor.spec.ts` | Her kanonik proje route'u için başka org/proje id'siyle **403** |
| `tests/security/tenant-isolation.spec.ts` | RLS altında cross-org okuma 0 satır |
| `tests/security/fail-closed.spec.ts` | Policy store kapalı → tüm kararlar DENY, `readyz` degraded |
| `tests/security/audit-actor.spec.ts` | Her audit satırında `actor_principal_id` = doğrulanmış principal |
| `middleware/__tests__/authz.test.ts` | Membership matrisi (owner/admin/member/viewer × org/project) |

## Negative Tests

- `dev-session` isteği → **404** (route yok).
- `POST /api/db/configure` → **404**.
- Membership'i olmayan kullanıcı proje okuma → **403** (200 değil).
- `permissions/evaluate` gövdesine `subject_type:"system"` → yok sayılır, principal'ın gerçek subject'i kullanılır.
- `CI=true` ortamında policy store hatası → **DENY** (bugün allow).

## Security Tests

Appendix I: **T-01, T-02, T-10, T-12, T-13, T-14, T-15, T-19** bu fazda otomatikleşir.

## E2E

`tests/e2e/auth-flow.spec.ts` — OIDC login → org seçimi → proje listesi → yetkisiz projeye erişim denemesi (403) → logout → korumalı sayfa 401.

## Observability

- `auth_failure_total{reason}` metriği
- `policy_denial_rate` metriği
- `SECURITY_POLICY_STORE_UNAVAILABLE` event'i + `readyz` bağımlılık raporu

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| JWKS erişilemez | Tüm istekler 503 | Doğru davranış (fail-closed). TTL cache son iyi anahtarı `maxAge` süresince kullanır |
| Membership göçü eksik | Kullanıcılar 403 | `orphaned_memberships` raporu + operatör runbook'u |
| RLS yanlış politika | Boş sonuçlar | Her RLS'li tablo için pozitif+negatif test zorunlu |
| Legacy route'lar authn'e bağlanınca kırılır | Frontend 401 | Beklenen; P15'e kadar geliştirme IdP ile yapılır |

## Rollback / Recovery

Migration'lar `-- +down` ile geri alınabilir; `memberships` DROP'u **son migration**'dır ve ayrı bir onaydan sonra uygulanır (veri kaybı riski). Middleware değişiklikleri feature flag'siz ama tek commit'te revert edilebilir.

## Acceptance Criteria

1. Tüm authorization kararları DB'den; `principal.projectIds` dizisine bakan kod = 0.
2. `dev-session`, `db/configure`, `config/inspect`, 9 unscoped route silinmiş.
3. Permission Kernel'de statik allow fallback ve `system` bypass yok.
4. Audit satırlarında hard-coded actor = 0.
5. `GET /projects/:id/permission-policies` gerçek PG'de 200.
6. `tests/security/*` 6 suite geçiyor.
7. OIDC E2E akışı geçiyor.
8. `organizations`/`users`/`org_memberships`/`project_memberships`/`service_identities` şemada.

## Evidence Required

```text
tests/security/*.spec.ts                    tümü PASS, çıktı kayıtlı
tests/e2e/auth-flow.spec.ts                 PASS
grep -rn "projectIds" apps/api/src          yalnız Principal tipi tanımında
grep -rn "dev-session\|db/configure"        boş
psql: SELECT COUNT(*) FROM project_memberships   > 0 (göç kanıtı)
orphaned_memberships raporu                 dosya
```

## Exit Gate

```bash
pnpm run typecheck
pnpm test
pnpm run test:integration -- tests/security
pnpm run test:e2e -- tests/e2e/auth-flow.spec.ts
pnpm --filter @y/db run test:migrations:fresh
pnpm --filter @y/db run test:migrations:upgrade
```

Ek zorunluluk: **P0-1, P0-2, P0-3, P0-4, P0-5, P0-6, P0-7, P0-8, P0-12 kapalı** olarak `docs/audit/.../06-security-findings.md` içinde işaretli ve her biri bir teste bağlı.

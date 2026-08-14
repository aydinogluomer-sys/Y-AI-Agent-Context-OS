# 06 — Güvenlik Bulguları

> Baseline commit: `7c171de274cdeda08ceec5dbad81c320fa617f12`
> Sınıflandırma: **P0** = release blocker · **P1** = production-critical · **P2** = kozmetik

Envanterden türeyen ölçüt: 184 route'un **34'i** yalnız
bearer token kontrolünden geçiyor (proje kapsamı doğrulaması yok);
72 tablonun **42'inde** tenant izolasyon kolonu yok.

## P0 — Release blocker

| # | Bulgu | Konum | Attack | Impact | Mitigation (faz) | Test |
|---|---|---|---|---|---|---|
| P0-1 | `GET /api/auth/dev-session` auth'suz `role:"admin"`, `projectIds:["*"]` token dağıtır | `apps/api/src/index.ts:100`, `auth.ts:111-129` | Porta erişen herkes token ister | Tam admin | P02 (silinir) | `tests/security/jwt.spec.ts` |
| P0-2 | `POST /api/db/configure` connection string alır, global `db`'yi değiştirir, **düz metin parolayı `.env`'e yazar** | `apps/api/src/index.ts:1024-1140` | Saldırgan kendi PG'sine yönlendirir | SSRF + credential harvest + kalıcı config zehirlenmesi | P02 (silinir) | `tests/security/ssrf.spec.ts` |
| P0-3 | HS256 JWT anahtarı `JWT_SECRET \|\| Y_API_AUTH_TOKEN` | `apps/api/src/auth.ts:201` | Paylaşımlı token ile JWT forge | Rol ve proje yükseltme | P02 (jose + JWKS) | `tests/security/jwt.spec.ts` |
| P0-4 | DB-backed authz fonksiyonu import edilip **hiç çağrılmıyor**; hedeflediği `project_memberships(user_id)` tablosu yok, hata yutuluyor | `apps/api/src/auth.ts:398-430`, `index.ts:82` | — | Cross-project izolasyon DB'de hiç doğrulanmıyor | P02 | `tests/security/idor.spec.ts` |
| P0-5 | Permission Kernel `CI=true` iken DB hatasında **statik allow listesine** düşer | `apps/api/src/PermissionKernelService.ts:67-147` | Policy store'u düşür | Allow-by-default | P02 (fallback silinir) | `tests/security/fail-closed.spec.ts` |
| P0-6 | `enforce()` çağrıları `subject_type:"system"` hard-code ediyor; seed policy `allow / system / * / *` | `EvidenceStoreService.ts:231`, `EventStoreService.ts:205`, `ArtifactCASService.ts:442/513/628/667` | — | Mevcut enforcement noktaları her zaman allow | P02 | `tests/security/fail-closed.spec.ts` |
| P0-7 | `permissions/evaluate` client'ın `subject` nesnesini spread ediyor | `apps/api/src/index.ts:4402` | `subject_type:"system"` gönder | Allow + sahte audit | P02 | `tests/security/approval-bypass.spec.ts` |
| P0-8 | 34 route proje kapsamı doğrulaması yapmıyor (`/audit-logs` tüm projelerin logunu döndürüyor) | `02-api-inventory.csv` (guard=bearer-only) | Başka projenin id'si | IDOR / cross-project | P02 | `tests/security/idor.spec.ts` |
| P0-9 | `repo/configure-local` keyfi mutlak `root_path` kabul eder; yapılandırılmamışsa root `"."` = sunucu cwd'si | `apps/api/src/index.ts:4632`, `repo-adapter-service.ts:22-46` | Root'u `/` yap | Keyfi dizin okuma | P03 (yönetilen workspace) | `tests/security/path-guard.spec.ts` |
| P0-10 | `source_table` SQL'e string interpolation ile giriyor | `ContextObjectStoreService.ts:219` | FROM clause kontrolü | Veri sızıntısı | P09 | regresyon testi |
| P0-11 | Kaynak kodda **parçalanmış gerçek DB parolası** ve Supabase host'u | `packages/security/src/index.ts:23-25,48` | Git geçmişi okunur | Credential ifşası | P03 (kod) + P17 (rotasyon) | `secret-scan` |
| P0-12 | `config/inspect` yanıtı regex'lenip **düz metin DB parolası React state'ine** yazılıyor | `apps/web/src/hooks/useWorkspace.ts:103-127` | DOM incelemesi | Credential ifşası | P02 | bundle taraması |
| P0-13 | Agent run tamamen sahte: dört event yazıp `status:"completed"` dönüyor | `apps/api/src/index.ts:296-377` | — | Ürün iddiası gerçek değil | P12 | `tests/e2e/real-run.spec.ts` |

## P1 — Production-critical

| # | Bulgu | Konum | Faz |
|---|---|---|---|
| P1-1 | 27 route `router.all(["/tasks","/tasks/*"])` tarafından gölgelenmiş; frontend hâlâ çağırıyor | `apps/api/src/index.ts:166` | P12/P15 |
| P1-2 | Şema↔kod drift'i (5 kalem) gerçek 500'ler üretiyor | `07-schema-drift.md` | P02 |
| P1-3 | CI E2E'yi kuruyor ama çalıştırmıyor; migration'lar testlerden sonra | `.github/workflows/ci.yml` | P19 |
| P1-4 | Mock DB production kod yolunda; `ENABLE_MOCK_DB` yerel `.env`'de `true` | `apps/api/src/db.ts:562+` | P19 |
| P1-5 | 161 sahte başarı bulgusu (115 P0) | `10-false-green-findings.csv` | P17/P19 |
| P1-6 | helmet / CORS / rate limit / body limit yok | `server.ts` | P01 |
| P1-7 | Primary key'ler `Math.random()` ile üretiliyor | 60 çağrı noktası | P01 |
| P1-8 | Event store'da hash chain yok | `event_records` | P14 |
| P1-9 | Çift lockfile (npm + pnpm) | kök | P01 |

## P2 — Kozmetik

| # | Bulgu |
|---|---|
| P2-1 | `index.html` başlığı "My Google AI Studio App" |
| P2-2 | `docs/architecture-and-design/implemention.md` dosya adı yazım hatası |
| P2-3 | Karışık dil hata mesajları (`E_コネクター未設定`) |

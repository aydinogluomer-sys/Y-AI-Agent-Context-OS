# Y — AI Agent Context OS: Bütüncül Güncel Kod Denetimi ve Uygulama Yol Haritası

**Belge sürümü:** 2.3  
**Tarih:** 4 Ağustos 2026  
**Repository:** `aydinogluomer-sys/Y-AI-Agent-Context-OS`  
**Varsayılan dal:** `main`  
**Denetlenen HEAD:** `bb6f0a455afe1db94110b4abfbf659c82979b91d`  
**Karşılaştırma tabanı:** `5a4278d79b284188a36a22e61281c898a39ab277`  
**Denetim türü:** Güncel commit diff'i + ana kaynak dosyalarının bütüncül statik denetimi + GitHub teslimat/CI denetimi  
**Production kararı:** `REJECT`  
**Security release gate:** `FAIL`

---

## 1. Kesin Sonuç

Değişiklikler tamamen ve doğru biçimde uygulanmamıştır.

Son commit üç alana müdahale etmiştir:

1. JWT doğrulama
2. Eski unscoped task route'unun engellenmesi
3. Repository path containment

Ancak statik kaynak kod denetimine göre:

- JWT düzeltmesi `RS256` için imza doğrulaması yapmadığından kritik authentication bypass içermektedir.
- Eski `PATCH /tasks/:id` yolu 410 ile engellenmiş olsa da güvenli canonical PATCH route'u eklenmemiştir.
- Çok sayıda `/tasks/:id/*` alt route'u project authorization olmadan çalışmaya devam etmektedir.
- Project listeleme ve mutation yolları gerçek membership/organization filtresi kullanmamaktadır.
- Audit actor değerleri hâlâ hard-coded veya kullanıcı kontrollüdür.
- Permission Kernel boş policy store ve test/CI fallback durumlarında fail-open davranabilmektedir.
- Chat Cockpit, Mission Control ve genel modül panelleri hâlâ simülasyondur.
- `/api/simulate-task` gerçek repository okumadan uydurma dosya ve metrik üretmektedir.
- Semantic retrieval, tokenizer ve context graph tamamlanmamıştır.
- CI, PR, required status check ve gerçek E2E kanıtı yoktur.

V2.2 planındaki dokuz P0 maddeden hiçbiri bütün kapanış kriterleriyle doğrulanmış değildir.

```text
P0 fully closed: 0 / 9
P0 partially addressed: 3 / 9
P0 untouched or materially open: 6 / 9
```

---

## 2. Denetim Metodu ve Sınırlar

### 2.1 Yapılan Kontroller

GitHub üzerinden doğrudan şunlar incelenmiştir:

- Repository metadata
- Default branch ve güncel HEAD
- Son commit zinciri
- `5a4278d... → bb6f0a4...` karşılaştırması
- Güncel commit diff'i
- Ana authentication kodu
- API router ve project/task route'ları
- Permission Kernel
- Local ve GitHub repository adapter'ları
- Chat Cockpit
- AI Mission Control
- Genel modül simülasyon paneli
- `/api/simulate-task`
- Context retrieval ve token budget
- Graph katmanı
- Provider registry
- Task FSM
- Event, Evidence, CAS ve Worker servisleri
- Validation scriptleri
- Secret scanner
- Feature Registry
- Navigation registry
- GitHub branch, PR, workflow ve status check durumu

### 2.2 Çalıştırılamayan Kontroller

Bu denetim ortamında:

- `gh` komutu kurulu değildir.
- Standart `git clone` çağrısı ortamın DNS kısıtı nedeniyle `github.com` adresini çözememiştir.
- Repository üzerinde GitHub Actions workflow run veya status check bulunmamaktadır.

Bu nedenle aşağıdaki komutların gerçekten çalıştığı iddia edilmemektedir:

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run test:deterministic
pnpm run test:db
pnpm run test:e2e
pnpm run secret-scan
```

Bu belge:

```text
Güncel GitHub kaynak kodu statik denetimi
+ commit karşılaştırması
+ teslimat/CI denetimi
```

niteliğindedir.

Runtime sonucu:

```text
BLOCKED / UNVERIFIED
```

---

## 3. Güncel Repository Durumu

| Alan | Güncel durum |
| --- | --- |
| Default branch | `main` |
| Güncel HEAD | `bb6f0a455afe1db94110b4abfbf659c82979b91d` |
| Aktif branch sayısı | 1 |
| Pull request | Yok |
| HEAD status check | Yok |
| HEAD workflow run | Yok |
| `.github/workflows/ci.yml` | Yok |
| Bağımsız review kanıtı | Yok |
| Runtime test kanıtı | Yok |
| Production readiness | `REJECT` |

Son commit yalnız şu dosyaları değiştirmiştir:

```text
apps/api/src/auth.ts
apps/api/src/index.ts
packages/core/src/repo-adapter.ts
docs/audit/Y_AI_Agent_Context_OS_Duzeltme_Plani_v2.2_2026-08-04.md
```

Hiçbir auth, authorization, path security, integration veya E2E test dosyası güncellenmemiştir.

---

## 4. Son Commit Değerlendirmesi

### 4.1 JWT Değişikliği Kararı

**Commit iddiası:** Kriptografik JWT signature validation  
**Gerçek durum:** `PARTIAL / CRITICAL SECURITY FAILURE`

Olumlu değişiklikler:

- `alg: none` reddediliyor.
- HS256 HMAC karşılaştırması eklenmiş.
- Basit `exp` ve `sub` kontrolü eklenmiş.
- Geçersiz format için 401 yanıtı eklenmiş.

Kritik kusurlar:

1. `RS256` allowlist'e alınmış fakat RS256 imzası doğrulanmamaktadır.
2. RS256 token payload'ı decode edildikten sonra authenticated principal oluşturulmaktadır.
3. `issuer` doğrulaması yoktur.
4. `audience` doğrulaması yoktur.
5. `nbf` doğrulaması yoktur.
6. `exp` claim'i zorunlu değildir.
7. Sayısal olmayan `exp` reddedilmemektedir.
8. `role`, `project_ids` ve `org_id` claimleri doğrudan güvenilir kabul edilmektedir.
9. `project_ids: ["*"]` global proje erişimi üretebilmektedir.
10. `Y_API_AUTH_TOKEN`, JWT HMAC secret için fallback olarak yeniden kullanılmaktadır.
11. Token revocation/session doğrulaması yoktur.
12. JWT güvenlik testleri eklenmemiştir.

Örnek saldırı yüzeyi:

```json
{
  "alg": "RS256",
  "typ": "JWT"
}
```

ve:

```json
{
  "sub": "attacker",
  "role": "admin",
  "project_ids": ["*"],
  "org_id": "target-org"
}
```

şeklindeki uydurma token, mevcut kaynak kod yolunda RS256 imzası doğrulanmadan principal üretebilir.

**Karar:** P0-01 kapanmamıştır.

---

### 4.2 Legacy Task Route Değişikliği Kararı

**Commit iddiası:** Unscoped task routes 410 Gone ile deprecated  
**Gerçek durum:** `PARTIAL / FUNCTIONAL REGRESSION / REMAINING IDOR`

Olumlu değişiklik:

```text
/tasks
/tasks/:id
```

exact route'ları erken middleware ile 410 dönmektedir.

Kalan problemler:

- Güvenli `PATCH /projects/:projectId/tasks/:taskId` route'u eklenmemiştir.
- Eski `router.patch("/tasks/:id")` kodu dosyada hâlâ durmaktadır.
- Exact route erken 410 nedeniyle erişilemez olsa da dead unsafe code temizlenmemiştir.
- Task güncelleme fonksiyonu güvenli canonical replacement olmadan kaldırılmıştır.
- Aşağıdaki alt route'lar exact 410 kalıbına yakalanmaz:

```text
/tasks/:id/boundary
/tasks/:id/boundary/lock
/tasks/:id/boundary/check
/tasks/:id/pause
/tasks/:id/resume-state
/tasks/:id/resume-state/latest
/tasks/:id/resume-payload
/tasks/:id/resume-schedules
/tasks/:id/handoffs
```

- Bu route'ların bir bölümü task ID üzerinden project ID bulmakta, fakat authenticated principal'ın o project'e üye olduğunu doğrulamamaktadır.
- Frontend API client bu unscoped route'ları çağırmaya devam etmektedir.
- Transition route'u `x-actor` header'ına ve request body actor alanlarına güvenmektedir.

**Karar:** P0-02 kapanmamıştır.

---

### 4.3 Repository Containment Değişikliği Kararı

**Commit iddiası:** Realpath relative containment hardening  
**Gerçek durum:** `MEANINGFUL IMPROVEMENT / PARTIAL`

Doğru yapılanlar:

- Root için `realpath` kullanılmıştır.
- Hedef mevcut değilse en yakın mevcut parent bulunmaktadır.
- `path.relative()` ile root escape kontrolü yapılmaktadır.
- Secret içeren write reddedilmektedir.
- Temp file + rename yaklaşımı uygulanmıştır.

Eksikler:

- `mkdirSync()` sonrasında ve `renameSync()` öncesinde containment tekrar doğrulanmamaktadır.
- Kontrol ile yazma arasında symlink race/TOCTOU penceresi vardır.
- File lease veya fencing token yoktur.
- Temp file hata durumunda temizlenmeyebilir.
- Durable write için `fsync` yaklaşımı yoktur.
- Git changed-files, branch, commit ve PR işlemleri yoktur.
- GitHub adapter açıkça stub durumundadır.

**Karar:** P0-06 kısmen ilerlemiştir, kapanmamıştır.

---

## 5. P0 Bulguları

### 5.1 P0-01 — RS256 Authentication Bypass

**Dosya:** `apps/api/src/auth.ts`  
**Önem:** Kritik

`RS256` kabul edilmekte ancak public key/JWKS ile imza doğrulanmamaktadır.

#### P0-01 Zorunlu Düzeltme

- Manuel JWT parser kaldırılmalı.
- `jose` veya eşdeğer güvenilir kütüphane kullanılmalı.
- Yalnız tek, açıkça yapılandırılmış algoritma ailesi kabul edilmeli.
- `issuer`, `audience`, `exp`, `nbf`, `sub` zorunlu doğrulanmalı.
- JWKS key rotation desteklenmeli.
- `role` ve project membership DB üzerinden çözülmeli.
- Wildcard project claim kaldırılmalı.
- Session/revocation kontrolü eklenmeli.

#### P0-01 Kapanış Testleri

- Forged RS256
- Invalid HS256 signature
- `alg: none`
- Wrong issuer
- Wrong audience
- Expired token
- Missing expiration
- Future `nbf`
- Missing subject
- Invalid role
- Wildcard project claim
- Revoked session

---

### 5.2 P0-02 — Unscoped Task Alt Route'larında IDOR

**Dosyalar:**

- `apps/api/src/index.ts`
- `apps/web/src/lib/api/tasks.ts`

Exact `/tasks/:id` engeli, nested task route'larını güvenli hale getirmemektedir.

#### P0-02 Zorunlu Düzeltme

Bütün task route'ları aşağıdaki formata taşınmalıdır:

```text
/projects/:projectId/tasks/:taskId/...
```

Zorunlu middleware zinciri:

```text
authentication
→ organization scope
→ project membership
→ task ownership
→ Permission Kernel
→ operation
→ principal-derived audit
```

Eski direct aliases tamamen kaldırılmalıdır.

---

### 5.3 P0-03 — Project Listeleme İzolasyonu Yok

**Dosya:** `apps/api/src/index.ts`

`GET /projects` bütün project kayıtlarını döndürmektedir.

`POST /projects` için organization veya admin policy zorunluluğu görünmemektedir.

#### P0-03 Zorunlu Düzeltme

- Organization tablosu ve user membership doğrulanmalı.
- Project listesi membership join ile filtrelenmeli.
- Organization dışı admin erişimi reddedilmeli.
- Create/update/delete için açık role policy uygulanmalı.
- Cross-organization negatif test yazılmalı.

---

### 5.4 P0-04 — Audit Actor Güvenilir Değil

**Dosya:** `apps/api/src/index.ts`

Kodda bulunan örnek değerler:

```text
User-Aydinoglu
developer
human-operator
patch_interceptor
system-patch-interceptor
anonymous-actor
x-actor
```

#### P0-04 Zorunlu Düzeltme

User işlemleri için actor yalnız:

```typescript
req.authPrincipal.actorId
```

üzerinden gelmelidir.

System ve worker actor'ları:

- İmzalı service identity
- İmzalı worker identity
- Server-side sabit principal type

ile üretilmelidir.

Request header veya body actor alanı audit identity belirleyememelidir.

---

### 5.5 P0-05 — Permission Kernel Tam Fail-Closed Değil

**Dosya:** `apps/api/src/PermissionKernelService.ts`

Mevcut kusurlar:

- DB sorgusu başarılı olup zero-row dönerse static allow list devreye girmektedir.
- `CI=true` geniş fallback'i açabilmektedir.
- Environment flag ile static fallback açılabilmektedir.
- Admin/system/task/worker wildcard allow policy'leri vardır.
- Eksik subject/resource scope değerleri reddedilmemektedir.

#### P0-05 Zorunlu Düzeltme

```text
Policy store error → DENY
Policy store empty → DENY
Policy malformed → DENY
Unknown condition → DENY
Required scope missing → DENY
Scope mismatch → DENY
```

Static policy fixture yalnız test constructor dependency'si olarak inject edilmelidir.

---

### 5.6 P0-06 — Repository Write TOCTOU Riski

**Dosya:** `packages/core/src/repo-adapter.ts`

Containment iyileştirilmiştir; ancak write öncesi ikinci doğrulama yoktur.

#### P0-06 Zorunlu Düzeltme

- Directory FD tabanlı güvenli write yaklaşımı değerlendirilmelidir.
- `mkdir` sonrası parent `realpath` tekrar kontrol edilmelidir.
- Temp write sonrası rename öncesi containment tekrar kontrol edilmelidir.
- Symlink policy deny-by-default olmalıdır.
- Lease/fencing token zorunlu olmalıdır.
- Hata halinde temp cleanup yapılmalıdır.

---

### 5.7 P0-07 — Chat Cockpit Hâlâ Sahte Runtime

**Dosya:** `apps/web/src/App.tsx`

Mevcut davranış:

- `mockNodes` ve `mockLinks`
- Keyword response generator
- Browser-side ABAC simülasyonu
- Browser-side secret regex
- Sabit DB, AST, token ve test iddiaları
- `setTimeout` tabanlı stage akışı
- Gerçek session persistence yok
- Provider stream yok
- Evidence persistence yok
- Refresh restore yok

#### P0-07 Zorunlu Düzeltme

```text
Chat session
→ persisted message
→ run dispatch
→ context retrieval
→ provider stream
→ tool events
→ evidence
→ assistant persistence
→ refresh restore
```

Demo modu production DTO'dan ayrılmalıdır.

---

### 5.8 P0-08 — Mission Control False Success Üretiyor

**Dosya:** `apps/web/src/components/AIMissionControlPanel.tsx`

Sabit olarak gösterilen iddialar:

- 14 modül bulundu
- 384.204 token tarandı
- 120.500 tokena sıkıştırıldı
- Claude/Gemini/Security Council oy verdi
- Secret scan temiz
- File lock boş
- Evidence hash üretildi
- Handoff paketi mühürlendi

API error sonrasında local simulation üretilip status `complete` yapılmaktadır.

#### P0-08 Zorunlu Düzeltme

- Sabit simulationSteps production yolundan kaldırılmalı.
- Backend event stream kullanılmalı.
- Error terminal state `failed` olmalı.
- Fallback terminal state ayrı olmalı.
- Event ID, run ID ve evidence ID zorunlu olmalı.
- Refresh sonrasında event replay yapılmalı.

---

### 5.9 P0-09 — Simulate-Task Gerçek Repository Analizi Yapmıyor

**Dosya:** `server.ts`

Endpoint:

- Clone/fetch yapmıyor.
- File tree okumuyor.
- Repo adapter kullanmıyor.
- Context index sorgulamıyor.
- Graph service kullanmıyor.
- Uydurma file path üretiyor.
- Provider error durumunda HTTP 200 mock döndürüyor.
- 50K policy ile çelişen 120K/150K budget değerleri kullanıyor.

#### P0-09 Zorunlu Düzeltme

Demo endpoint:

```text
POST /api/demo/simulate-task
```

Gerçek endpoint:

```text
POST /api/projects/:projectId/tasks/:taskId/runs
GET /api/projects/:projectId/tasks/:taskId/runs/:runId/events
POST /api/projects/:projectId/tasks/:taskId/runs/:runId/cancel
```

Production'da demo endpoint kapalı olmalıdır.

---

## 6. P1 Bulguları

### 6.1 P1-01 — Semantic Retrieval Gerçek Semantic Değil

**Dosyalar:**

- `packages/context/src/index.ts`
- `packages/context/src/search-server.ts`

`mockSemanticSearchFallback()` lexical overlap ve keyword hit üretmektedir.

Search server içindeki `semantic_score`, gerçek embedding/vector distance yerine bu fallback'ten türetilmektedir.

#### P1-01 Hedef

- Embedding provider contract
- `pgvector` veya eşdeğer vector store
- Project-scoped vector query
- Lexical + vector hybrid rank
- Model/version provenance
- Retrieval benchmark
- Explainable scoring

---

### 6.2 P1-02 — Context Graph Hook Stub

**Dosya:** `packages/context/src/index.ts`

`stubGraphTraversal()` boş ilişki listesi döndürmektedir.

Graph paketindeki BFS impact trace iyileştirilmiştir; ancak Context OS retrieval zinciri bu gerçek graph traversal'a bağlanmamıştır.

#### P1-02 Hedef

- Graph service injection
- Direct ve reverse dependency
- Transit traversal
- Cycle guard
- Depth/fan-out limit
- Edge filtering
- Project isolation
- Provenance manifest

---

### 6.3 P1-03 — Tokenizer Gerçek Değil

**Dosyalar:**

- `packages/context/src/index.ts`
- `packages/context/src/search-server.ts`

Token tahmini:

```typescript
Math.ceil(content.length / 4)
```

şeklindedir.

Ek olarak:

```text
Canonical hard limit: 50K
MAX_TOKEN_BUDGET: 250K
UI/API fallback: 120K–150K
```

değerleri birlikte bulunmaktadır.

#### P1-03 Hedef

- Provider/model tokenizer adapter
- Tek canonical budget policy
- System/tool/output reserve
- Safety margin
- Hard rejection
- Budget manifest
- Türkçe/UTF-8 corpus testi

---

### 6.4 P1-04 — Provider Registry Eksik

**Dosya:** `packages/providers/src/index.ts`

Mevcut durum:

- Yalnız Gemini
- Streaming yok
- Health probe yok
- Context limit `null`
- Pricing `null`
- Credential varsa status `ready`
- UI'da Claude/DeepSeek/Model Council iddiaları

#### P1-04 Hedef

- Gerçek connectivity probe
- Timeout ve circuit breaker
- Rate limit classification
- Streaming
- Capability negotiation
- Güncel model metadata
- UI/provider capability uyumu

---

### 6.5 P1-05 — Readiness False Positive

**Dosya:** `apps/api/src/index.ts`

`/readyz` yalnız DB durumuna göre HTTP kodu üretmektedir.

Aşağıdaki alanlar gerçek probe olmadan healthy gösterilmektedir:

```text
worker_runtime
permission_kernel
evidence_store
event_store
cas_storage
```

#### P1-05 Hedef

Her bileşen için gerçek probe:

- DB
- Migration
- Policy store
- Queue
- Worker heartbeat
- Event store
- Evidence store
- CAS
- Provider
- Secret manager

---

### 6.6 P1-06 — DB Configuration Endpoint Riskli

**Dosya:** `apps/api/src/index.ts`

Production'da kapalıdır; ancak diğer ortamlarda:

- Browser'dan raw DB credential alır.
- Process environment değiştirir.
- `.env` dosyasına plaintext connection string yazar.
- Migration çalıştırır.
- Açık admin role/approval kontrolü görünmez.

#### P1-06 Hedef

Endpoint kaldırılmalı ve deployment secret manager kullanılmalıdır.

---

### 6.7 P1-07 — GitHub Repository Adapter Stub

**Dosya:** `packages/core/src/repo-adapter.ts`

Eksik yetenekler:

- Remote file read
- File tree
- Changed files
- Git diff
- Fetch
- Commit SHA
- Branch
- Commit
- Pull request

Bu eksik kapanmadan ürün gerçek GitHub repository context OS olarak çalışamaz.

---

### 6.8 P1-08 — Production Authentication UX Yok

**Dosya:** `apps/web/src/lib/api/auth-bootstrap.ts`

Frontend yalnız:

```text
/api/auth/dev-session
```

çağırıp token'ı `sessionStorage` içine yazmaktadır.

Eksikler:

- Login
- Logout
- Refresh
- Session expiry
- Revocation
- Organization selection
- Project membership
- Production bootstrap
- CSRF/session security

---

## 7. P2 Bulguları

### 7.1 P2-01 — UI Registry Gerçeklikle Çelişiyor

**Dosyalar:**

- `apps/web/src/app/navigation.ts`
- `apps/web/src/components/ModuleSimulationPanel.tsx`
- `docs/audit/feature-registry.yaml`

Navigation type tanımı onlarca öğeyi placeholder olarak sınıflandırırken, aynı navigation item'ları `status: "implemented"` olarak işaretlenmektedir.

`ModuleSimulationPanel`:

- Statik dosyalar
- Statik graph
- Statik migration
- Statik agent ağı
- Statik CAS blob
- `setTimeout`
- `Math.random` fake hash

kullanmaktadır.

Feature Registry Security Kernel için `SECURITY_HARDENED` demektedir; bu mevcut risklerle uyumlu değildir.

---

### 7.2 P2-02 — Testler Davranış Kanıtlamıyor

**Dosyalar:**

- `scripts/validate-ai-cockpit.ts`
- `scripts/run-validation-suite.ts`
- `scripts/validate-stage-35.ts`

Problemler:

- AI cockpit testi yalnız kaynak dosyada string aramaktadır.
- Test, deterministic local fallback'in varlığını zorunlu tutmaktadır.
- Deterministic runner test mode env değerlerini kendisi açmaktadır.
- DB olmayan Stage 35 yolu schema doğrulaması için `assert(true)` kullanmaktadır.
- Gerçek browser E2E yoktur.
- Gerçek JWT negative testleri yoktur.
- Gerçek cross-project IDOR matrix testi yoktur.

---

### 7.3 P2-03 — Secret Scanner Güvenilir Değil

**Dosya:** `scripts/secret-scan.ts`

Scanner:

- `.env` ve bütün local env varyasyonlarını atlamaktadır.
- Kendi dosyasını atlamaktadır.
- Bütün `validate-*` dosyalarını atlamaktadır.
- Sınırlı regex setine sahiptir.
- Kendi içinde gerçek secret biçimine benzeyen sabit pattern taşımaktadır.

Tracked files ve Git diff tabanlı tarama yapılmalıdır.

---

### 7.4 P2-04 — Lint Gerçek Lint Değil

**Dosya:** `package.json`

```json
"lint": "tsc --noEmit"
```

ESLint bulunmamaktadır.

---

### 7.5 P2-05 — TypeScript Strict Değil

**Dosya:** `tsconfig.json`

Eksikler:

- `strict`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `noImplicitOverride`
- `useUnknownInCatchVariables`

Mevcut riskli ayarlar:

```json
{
  "allowJs": true,
  "skipLibCheck": true
}
```

---

### 7.6 P2-06 — API Router Monolitik

**Dosya:** `apps/api/src/index.ts`

Tek dosya authentication, DB admin, projects, tasks, quality gates, evidence, events, context, agents, workers, CAS ve debug route'larını birlikte taşımaktadır.

Bu yapı:

- Route ordering hatalarını
- Middleware atlamalarını
- Audit actor tutarsızlıklarını
- Unscoped alias'ları
- Test izolasyonu sorunlarını

kolaylaştırmaktadır.

---

### 7.7 P2-07 — Audit Belgeleri Güncel Değil

V2.2 planı:

```text
İncelenen HEAD: 5a4278d...
```

demektedir.

Güncel HEAD:

```text
bb6f0a4...
```

Eski v2 ve v2.1 belgeleri repository'de durmaktadır.

Tek canonical belge ve audit index kullanılmalıdır.

---

## 8. Korunacak Gerçek Bileşenler

Sistem tamamen yeniden yazılmamalıdır.

Aşağıdaki alanlarda korunabilecek gerçek temel vardır:

| Bileşen | Karar |
| --- | --- |
| Task FSM | Korunmalı ve auth principal'a bağlanmalı |
| Event Store | Korunmalı ve gerçek run stream'e bağlanmalı |
| Evidence Store | Korunmalı ve UI evidence linklerine bağlanmalı |
| Artifact CAS | Korunmalı, integration ve concurrency testleri eklenmeli |
| Worker Runtime | Korunmalı, heartbeat/readiness bağlanmalı |
| Graph persistence | Korunmalı, Context retrieval'a bağlanmalı |
| Context classification/ranking | Korunmalı, gerçek tokenizer/vector ile tamamlanmalı |
| Audit framework | Korunmalı, actor identity düzeltilmeli |
| Monorepo package ayrımı | Korunmalı |

---

## 9. Güncel Modül Durum Matrisi

| Modül | Durum | Not |
| --- | --- | --- |
| Authentication | `SECURITY_RISK` | RS256 bypass, claim trust |
| Production auth UX | `MISSING` | Dev session only |
| Project authorization | `SECURITY_RISK` | Global list, no DB membership |
| Task CRUD | `PARTIAL/BROKEN` | Update route blocked, replacement missing |
| Nested task routes | `SECURITY_RISK` | Unscoped aliases remain |
| Audit identity | `SECURITY_RISK` | Hard-coded/header/body actors |
| Permission Kernel | `SECURITY_RISK` | Empty store/test fallback fail-open |
| Local repo adapter | `PARTIAL` | Better containment, TOCTOU remains |
| GitHub repo adapter | `STUB` | Remote operations unavailable |
| Chat Cockpit | `SIMULATED` | Browser keyword engine |
| Mission Control | `SIMULATED` | Fixed fake stages |
| General module panels | `SIMULATED` | Static state and timers |
| Real run orchestration | `MISSING` | No session/run/event chain |
| Context token budget | `PARTIAL` | Conflicting limits |
| Tokenizer | `STUB/HEURISTIC` | Character/4 |
| Semantic retrieval | `FALLBACK` | Lexical only |
| Context graph traversal | `STUB` | Empty traversal hook |
| Graph impact trace | `PARTIAL/PASS FOUNDATION` | BFS added |
| Provider registry | `PARTIAL` | Gemini only, no real health |
| Task FSM | `REAL/PARTIAL` | Good domain base |
| Event Store | `REAL/PARTIAL` | Not wired to main UI |
| Evidence Store | `REAL/PARTIAL` | Not wired to main UI |
| Artifact CAS | `REAL/PARTIAL` | DB proof incomplete |
| Worker Runtime | `REAL/PARTIAL` | Readiness not probed |
| Readiness | `FALSE_POSITIVE` | Static healthy fields |
| Tests | `FALSE_GREEN_RISK` | String checks/simulation |
| Secret scan | `PARTIAL` | Large exclusions |
| CI/CD | `MISSING` | No workflow/status |
| Feature Registry | `UNRELIABLE` | Unverified service/status claims |
| Production readiness | `REJECT` | Release blocked |

---

## 10. Uygulama Yol Haritası

### 10.1 Dalga 0 — Acil Güvenlik Durdurma

#### Dalga 0 İşleri

1. RS256 kabulünü hemen kapat veya gerçek JWKS doğrulaması uygula.
2. Manuel JWT parser'ı `jose` ile değiştir.
3. `issuer`, `audience`, `exp`, `nbf`, `sub` zorunlu yap.
4. Role/project membership'i DB'den çöz.
5. Wildcard project access'i kaldır.
6. Bütün `/tasks/:id/*` route'larını envanterle.
7. Unscoped nested task route'larını kapat.
8. Canonical project-scoped replacement route'ları ekle.
9. Audit actor'ı `authPrincipal` üzerinden üret.
10. Permission Kernel empty/error/malformed durumlarını deny yap.

#### Dalga 0 Gate

```text
Forged JWT rejected
Cross-project route matrix rejected
Empty policy store denied
No user-controlled audit actor
No unscoped task mutation/read route
```

Dalga 0 tamamlanmadan başka feature geliştirmesi yapılmamalıdır.

---

### 10.2 Dalga 1 — Tenant ve Repository Sınırları

#### Dalga 1 İşleri

1. Organization/user/project membership modelini tamamla.
2. Project list/create/update/delete policy'lerini uygula.
3. Repo adapter write öncesi ikinci containment doğrulaması ekle.
4. Symlink deny policy uygula.
5. Lease/fencing token ekle.
6. GitHub read adapter'ı gerçek connector ile uygula.
7. Changed files ve diff desteği ekle.
8. Branch/commit/PR yeteneklerini ayrı read-write adapter'a koy.

#### Dalga 1 Gate

```text
Cross-organization isolation PASS
Repo prefix/symlink/TOCTOU tests PASS
Public/private GitHub fixture read PASS
Capability report matches real operations
```

---

### 10.3 Dalga 2 — Sahte Başarıların Kaldırılması

#### Dalga 2 İşleri

1. Chat keyword generator'ı production yolundan kaldır.
2. Mission Control `simulationSteps` dizisini kaldır.
3. ModuleSimulationPanel'i açık demo alanına taşı.
4. Demo DTO ile production DTO'yu ayır.
5. Provider/DB/worker hatasını `failed` göster.
6. Fake hash, metric, test ve audit iddialarını kaldır.
7. Feature Registry'yi gerçek `SIMULATED/PARTIAL/BLOCKED` durumlarına çek.

#### Dalga 2 Gate

```text
No backend event → no success
Provider failure → failed
Demo mode visibly labeled
Production cannot import demo fixtures
```

---

### 10.4 Dalga 3 — Gerçek Agent Run Zinciri

#### Dalga 3 İşleri

1. Chat session tabloları.
2. Message persistence.
3. Agent run FSM.
4. Queue/worker dispatch.
5. SSE veya WebSocket event stream.
6. Cancellation.
7. Retry/idempotency.
8. Context pack reference.
9. Provider delta events.
10. Tool call events.
11. Evidence links.
12. Refresh restore.

#### Dalga 3 Gate

```text
Task create
→ run queued
→ context selected
→ provider invoked
→ events streamed
→ evidence persisted
→ completed/failed
→ refresh restored
```

---

### 10.5 Dalga 4 — Gerçek Context OS

#### Dalga 4 İşleri

1. Model tokenizer abstraction.
2. AST/section-aware chunking.
3. Stable chunk IDs ve source spans.
4. Embedding pipeline.
5. `pgvector`.
6. Hybrid lexical/vector retrieval.
7. Real graph traversal.
8. Cycle/fan-out/depth guards.
9. Single 50K policy.
10. Pack provenance manifest.
11. Pack persistence ve consumption ledger.

#### Dalga 4 Gate

```text
Hard 50K never exceeded
Same input/config → same manifest hash
Vector retrieval benchmark passes
Graph transit/reverse/cycle tests pass
Full source lineage available
```

---

### 10.6 Dalga 5 — Provider, Health ve Admin Güvenliği

#### Dalga 5 İşleri

1. Provider connectivity probe.
2. Streaming provider contract.
3. Rate-limit/error taxonomy.
4. Circuit breaker.
5. Capability/model metadata.
6. Real worker heartbeat probe.
7. Event/Evidence/CAS probe.
8. Permission store probe.
9. `/db/configure` endpointini kaldır.
10. Secret manager/deployment env kullan.

#### Dalga 5 Gate

```text
Every ready component is actually probed
Required dependency down → 503
Optional provider down → degraded
No browser-written plaintext DB secret
```

---

### 10.7 Dalga 6 — Test ve CI Gerçekliği

#### Dalga 6 İşleri

1. ESLint.
2. TypeScript strict migration.
3. Unit test framework.
4. Contract tests.
5. Ephemeral PostgreSQL integration.
6. Migration fresh/upgrade tests.
7. Security negative matrix.
8. Playwright E2E.
9. Secret scanning on tracked files/diff.
10. Feature Registry validator.
11. GitHub Actions.
12. Branch protection.

#### Dalga 6 Gate

```text
install-frozen
lint
typecheck
unit
contract
integration-postgres
migration-fresh
migration-upgrade
security
build
e2e
secret-scan
feature-registry-validation
```

tamamı yeşil olmalıdır.

---

### 10.8 Dalga 7 — Dokümantasyon ve Release

#### Dalga 7 İşleri

1. Eski v2/v2.1 belgelerini `DEPRECATED` yap veya kaldır.
2. Tek canonical audit index oluştur.
3. Feature Registry'ye commit SHA ve CI run ID ekle.
4. Her PASS için evidence linki ekle.
5. Release sign-off süreci oluştur.
6. Güncel audit HEAD ile eşleşsin.

#### Dalga 7 Gate

```text
FALSE_PASS_COUNT = 0
STALE_AUDIT_HEAD_COUNT = 0
PLACEHOLDER_IMPLEMENTED_COUNT = 0
PASS_WITHOUT_CI_COUNT = 0
```

---

## 11. Önerilen Commit Sırası

1. `fix(auth): reject unverifiable JWTs and verify issuer audience expiry and signature`
2. `fix(authz): replace all unscoped task routes with project-scoped endpoints`
3. `fix(tenancy): enforce organization and membership isolation on project routes`
4. `fix(audit): derive actors from authenticated and signed service principals`
5. `fix(permission): deny empty malformed and unavailable policy stores`
6. `fix(repo): close symlink race and add lease-fenced atomic writes`
7. `feat(github-adapter): implement authenticated remote repository reads and diffs`
8. `fix(ui): remove production fake-success flows and isolate demo surfaces`
9. `feat(runtime): add persisted sessions runs event streaming and evidence`
10. `feat(context): add tokenizer vector retrieval and real graph traversal`
11. `fix(health): replace static readiness with component probes`
12. `fix(admin): remove browser database credential persistence`
13. `test: add authz security integration and playwright suites`
14. `ci: add required quality and release gates`
15. `docs(audit): publish canonical v2.3 evidence-backed audit`

Her commit:

- Tek mantıksal kapsam
- İlgili test
- Negatif test
- Evidence
- Feature Registry güncellemesi

taşımalıdır.

---

## 12. Zorunlu Test Matrisi

### 12.1 Authentication Testleri

- Forged RS256
- Invalid HS256
- `alg: none`
- Wrong issuer
- Wrong audience
- Missing/expired `exp`
- Future `nbf`
- Missing `sub`
- Invalid role
- Wildcard project
- Revoked session
- Key rotation

### 12.2 Authorization Testleri

- Project list isolation
- Cross-organization access
- Direct task IDOR
- Nested task route IDOR
- Task-project mismatch
- Missing project scope
- Empty membership
- Admin organization boundary
- Header actor spoof
- Body actor spoof

### 12.3 Permission Testleri

- DB outage
- Empty policy table
- Malformed policy
- Unknown condition
- Missing subject scope
- Missing resource scope
- Task mismatch
- Worker mismatch
- Override replay

### 12.4 Repository Testleri

- `../` traversal
- Prefix collision
- Existing symlink escape
- Missing target under symlink parent
- Nested symlink
- Race before rename
- Windows path
- Secret write
- Size limit
- Binary file
- Temp cleanup
- Lease conflict

### 12.5 Runtime Testleri

- Session create
- Message persist
- Run start
- Context select
- Provider stream
- Tool event
- Evidence event
- Provider 429
- Provider timeout
- DB down
- Cancellation
- Retry
- Worker crash
- Refresh restore
- No fake completion

### 12.6 Context Testleri

- Model tokenizer
- Türkçe corpus
- 50K hard limit
- AST chunk boundaries
- Stable IDs
- Vector similarity
- Hybrid ranking
- Cross-project vector isolation
- Graph cycle
- Reverse traversal
- Provenance manifest

### 12.7 E2E Testleri

- Login
- Organization/project selection
- Project list isolation
- Task create/update
- Run lifecycle
- Event stream
- Evidence view
- Failure state
- Refresh restore
- Logout
- Session expiry
- Reduced motion
- Keyboard navigation

---

## 13. Production Release Gate

Production release yalnız aşağıdakilerin tamamı sağlandığında açılabilir:

- JWT imzası güvenilir kütüphane ile doğrulanıyor.
- Issuer/audience/time claims zorunlu.
- Role ve membership DB kaynaklı.
- Bütün task route'ları project scoped.
- Project listesi tenant scoped.
- Audit actor principal kaynaklı.
- Permission Kernel tam fail-closed.
- Repo adapter race/symlink testleri yeşil.
- GitHub adapter gerçek.
- Chat ve Mission Control gerçek backend eventleri kullanıyor.
- Demo production'dan ayrılmış.
- Gerçek tokenizer/vector/graph uygulanmış.
- Readiness gerçek probe kullanıyor.
- Browser DB credential endpointi kaldırılmış.
- CI aktif.
- PostgreSQL integration aktif.
- Security matrix yeşil.
- Playwright E2E yeşil.
- Feature Registry kanıtlı.
- Canonical audit HEAD ile eşleşiyor.
- PR review ve required checks mevcut.

```text
Herhangi bir P0 açık → RELEASE BLOCKED
CI yok → RELEASE BLOCKED
Security negative tests yok → RELEASE BLOCKED
E2E yok → RELEASE BLOCKED
Fake success production'da mevcut → RELEASE BLOCKED
```

---

## 14. Nihai Hüküm

Son commit bazı güvenlik niyetlerini doğru yönde taşımaktadır; özellikle:

- Local path containment iyileşmiştir.
- Exact legacy task route engellenmiştir.
- HS256 için signature karşılaştırması eklenmiştir.

Bununla birlikte bu değişiklikler kapanış kriterlerini karşılamamaktadır.

En kritik mevcut durumlar:

```text
RS256 authentication bypass
Unscoped nested task routes
No DB-backed membership authorization
Untrusted audit actors
Permission policy fail-open paths
Simulated core product UX
No real repository analysis
No CI or runtime evidence
```

Bu repository'nin doğru stratejisi tamamen yeniden yazmak değildir.

Doğru strateji:

```text
Mevcut gerçek domain servislerini koru.
Güvenlik ve tenancy katmanını önce kapat.
Sahte başarı yollarını kaldır.
Gerçek run/event/evidence zincirini bağla.
Context OS motorunu tokenizer/vector/graph ile tamamla.
CI ve E2E kanıtı olmadan hiçbir PASS üretme.
```

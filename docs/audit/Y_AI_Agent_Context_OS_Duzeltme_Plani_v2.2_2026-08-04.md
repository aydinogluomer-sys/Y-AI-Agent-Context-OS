# Y — AI Agent Context OS: Zorunlu Düzeltme ve Üretime Hazırlık Planı

**Belge sürümü:** 2.2  
**Tarih:** 4 Ağustos 2026  
**Repository:** `aydinogluomer-sys/Y-AI-Agent-Context-OS`  
**İncelenen dal:** `main`  
**İncelenen HEAD:** `5a4278d79b284188a36a22e61281c898a39ab277`  
**Durum:** Uygulanması zorunlu onarım planı  
**Production kararı:** `REJECT`

---

## 1. Belgenin Amacı

Bu belge, GitHub üzerindeki güncel `main` dalı, son commitler ve kritik ana kaynak dosyaları incelendikten sonra hazırlanmıştır.

Amaç:

1. Yanlış veya eksik yapılan düzeltmeleri netleştirmek.
2. Güvenlik açıklarını önem sırasına göre kapatmak.
3. Simülasyon ile gerçek runtime davranışını ayırmak.
4. Production readiness için teknik kabul kriterlerini tanımlamak.
5. Ajanın yalnız yüzeysel değişiklikler yapmasını engellemek.

Bu belge, kod değişikliği yapılmadan yalnız dokümantasyon güncellenerek kapatılamaz.

---

## 2. Yönetici Özeti

Repository tamamen boş değildir ve korunması gereken gerçek backend/domain bileşenleri vardır.

Ancak güncel durumda:

- JWT authentication kritik biçimde güvensizdir.
- Chat Cockpit gerçek AI veya agent runtime kullanmamaktadır.
- AI Mission Control hâlâ sahte başarı logları üretmektedir.
- Task route'larında project authorization açığı sürmektedir.
- Audit actor değerleri güvenilir principal'dan gelmemektedir.
- Permission Kernel bazı durumlarda fail-open davranabilmektedir.
- Repository adapter path containment tam güvenli değildir.
- GitHub repository adapter hâlâ stub durumundadır.
- Semantic retrieval gerçek embedding/vector retrieval değildir.
- CI/CD ve gerçek E2E kanıtı yoktur.
- Readiness endpoint bazı bileşenleri sorgulamadan sağlıklı göstermektedir.

Kesin sonuç:

```text
Production readiness: REJECT
Security release gate: FAIL
```

---

## 3. Uygulama Kuralları

- Her kritik değişiklik ayrı branch veya ayrı mantıksal commit olarak uygulanmalıdır.
- Commit mesajı gerçekten yapılan işi aşmamalıdır.
- Test çalıştırılmadan hiçbir madde `PASS` yapılmamalıdır.
- Simülasyon sonucu gerçek runtime sonucu gibi gösterilmemelidir.
- Güvenlik hataları fallback ile başarıya çevrilmemelidir.
- Production hata durumunda sistem fail-closed davranmalıdır.
- Her P0 düzeltmesi için en az bir negatif test yazılmalıdır.
- Ana branch'e yalnız CI yeşil olduğunda merge yapılmalıdır.
- Eski audit belgeleri kaldırılmalı veya açıkça `DEPRECATED` olarak işaretlenmelidir.

---

## 4. P0 — Acil Güvenlik ve Doğruluk Düzeltmeleri

### 4.1 P0-01 — Güvensiz JWT Authentication Kaldırılmalı

**Dosya:** `apps/api/src/auth.ts`  
**İlgili commit:** `5a4278d79b284188a36a22e61281c898a39ab277`

#### P0-01 Mevcut Hata

Kod JWT'nin yalnız payload bölümünü Base64 decode etmektedir.

Doğrulanmayan alanlar:

- İmza
- `issuer`
- `audience`
- `exp`
- `nbf`
- Algoritma
- Güvenilir JWKS veya secret
- Token revocation
- Organization ve project claim bütünlüğü

Bu nedenle saldırgan kendi JWT payload'ını oluşturup admin rolü ve wildcard project erişimi kazanabilir.

#### P0-01 Zorunlu Düzeltme

Tercihen `jose` kullanılmalıdır.

```typescript
const { payload } = await jwtVerify(token, jwks, {
  issuer: EXPECTED_ISSUER,
  audience: EXPECTED_AUDIENCE,
  algorithms: ["RS256"],
});

if (!payload.sub) {
  throw new AuthenticationError("JWT subject is missing.");
}
```

Ek kurallar:

- `alg: none` engellenmeli.
- Yalnız allowlist algoritmalar kabul edilmeli.
- Claim şeması doğrulanmalı.
- `project_ids` doğrudan güvenilmemeli.
- Project erişimi DB membership üzerinden çözülmeli.
- `role` server-side policy ile doğrulanmalı.
- `organization_id` zorunlu olmalı.
- Expired token 401 dönmeli.
- Invalid signature 401 dönmeli.
- Unknown issuer 401 dönmeli.
- Wrong audience 401 dönmeli.

#### P0-01 Kapanış Kriterleri

- Sahte imzalı token reddedilir.
- `alg: none` token reddedilir.
- Süresi geçmiş token reddedilir.
- Yanlış issuer ve audience reddedilir.
- Admin claim'i server-side membership olmadan yetki üretmez.
- Wildcard project claim'i doğrudan kabul edilmez.
- Negatif security testleri CI'da geçer.

---

### 4.2 P0-02 — Project-Scoped Task Authorization Zorunlu Olmalı

**Dosya:** `apps/api/src/index.ts`

#### P0-02 Mevcut Hata

Şu route project scope kullanmamaktadır:

```text
PATCH /tasks/:id
```

Task ID üzerinden kayıt bulunmakta fakat authenticated principal'ın task'ın bağlı olduğu project'e erişimi zorunlu olarak doğrulanmamaktadır.

#### P0-02 Zorunlu Düzeltme

Canonical route:

```text
PATCH /projects/:projectId/tasks/:taskId
```

Route zinciri:

```text
Authenticate principal
→ Require organization
→ Require project membership
→ Verify task belongs to project
→ Evaluate Permission Kernel
→ Apply mutation
→ Persist audit
```

Eski route:

- Kaldırılmalı veya
- Geçici olarak `410 Gone` dönmeli

#### P0-02 Kapanış Kriterleri

- Kullanıcı kendi projesindeki task'ı güncelleyebilir.
- Başka project task ID'si 403 döner.
- Geçersiz project-task eşleşmesi 404 veya 403 döner.
- `/tasks/:id` mutation kabul etmez.
- IDOR testi CI'da geçer.

---

### 4.3 P0-03 — Project Listesi Principal'a Göre Filtrelenmeli

**Dosya:** `apps/api/src/index.ts`

#### P0-03 Mevcut Hata

`GET /projects` bütün projeleri listeleyebilir.

#### P0-03 Zorunlu Düzeltme

Sorgu authenticated principal'ın organization ve membership alanlarına göre filtrelenmelidir.

```sql
SELECT p.*
FROM projects p
JOIN project_memberships pm ON pm.project_id = p.id
WHERE pm.user_id = $1
  AND p.organization_id = $2
ORDER BY p.created_at DESC;
```

Admin rolü organization sınırı dışında listeleme yapmamalıdır.

#### P0-03 Kapanış Kriterleri

- Kullanıcı yalnız üyesi olduğu projeleri görür.
- Cross-organization proje listesi görünmez.
- Empty membership boş liste döner.
- Admin organization sınırı içinde çalışır.

---

### 4.4 P0-04 — Audit Actor Authenticated Principal'dan Gelmeli

**Dosya:** `apps/api/src/index.ts`

#### P0-04 Kaldırılacak Değerler

- `User-Aydinoglu`
- `developer`
- `human-operator`
- `patch_interceptor`
- `system-patch-interceptor`
- Kullanıcı kontrollü `x-actor`

#### P0-04 Zorunlu Düzeltme

```typescript
const principal = requireAuthenticatedPrincipal(req);

const auditActor = {
  actorId: principal.actorId,
  organizationId: principal.organizationId,
  sessionId: principal.sessionId,
  authenticationType: principal.authenticationType,
};
```

İzin verilen özel actor tipleri:

- `system`
- İmzalı worker identity
- İmzalı service identity

#### P0-04 Kapanış Kriterleri

- Her user mutation kaydı gerçek principal ID'sini taşır.
- `x-actor` audit actor'ı değiştiremez.
- Worker işlemleri signed worker identity kullanır.
- Anonymous actor yalnız gerçekten anonymous eventlerde kullanılır.

---

### 4.5 P0-05 — Permission Kernel Tam Fail-Closed Olmalı

**Dosya:** `apps/api/src/PermissionKernelService.ts`

#### P0-05 Mevcut Hata

- Policy tablosu boşsa static allow rules devreye girebilir.
- Eksik subject/resource scope değerleri reddedilmemektedir.
- `CI === true` static fallback için yeterli kabul edilmektedir.
- Environment variable ile geniş allow fallback açılabilmektedir.

#### P0-05 Zorunlu Düzeltme

```text
Policy query error → DENY
Policy table empty → DENY
Required subject scope missing → DENY
Required resource scope missing → DENY
Unknown policy condition → DENY
Malformed policy → DENY
```

Static fixture yalnız explicit unit-test dependency injection ile kullanılmalıdır.

#### P0-05 Kapanış Kriterleri

- DB outage bütün korumalı işlemleri reddeder.
- Empty policy table bütün korumalı işlemleri reddeder.
- Eksik project/task/worker scope reddedilir.
- CI gerçek fail-closed davranışı test eder.
- Security readiness `degraded` olur.

---

### 4.6 P0-06 — Repository Path Containment Güvenli Olmalı

**Dosya:** `packages/core/src/repo-adapter.ts`

#### P0-06 Mevcut Hata

Aşağıdaki yöntem güvenli değildir:

```typescript
target.startsWith(root)
```

Henüz var olmayan bir dosyanın parent dizinindeki symlink escape kontrolü de eksiktir.

#### P0-06 Zorunlu Düzeltme

1. Root path `realpath` ile çözülmeli.
2. Hedef mevcutsa target `realpath` ile çözülmeli.
3. Hedef yoksa en yakın mevcut parent `realpath` ile çözülmeli.
4. `path.relative(realRoot, realTargetOrParent)` kullanılmalı.
5. Sonuç `..` ile başlıyorsa veya absolute ise reddedilmeli.
6. Symlink policy açıkça tanımlanmalı.
7. Atomic write sırasında temp file aynı güvenli dizinde oluşturulmalı.
8. Rename öncesi containment yeniden doğrulanmalı.

```typescript
const relative = path.relative(realRoot, realTarget);
const escaped =
  relative === ".." ||
  relative.startsWith(`..${path.sep}`) ||
  path.isAbsolute(relative);

if (escaped) {
  throw new PermissionDeniedError("Repository boundary escape blocked.");
}
```

#### P0-06 Kapanış Kriterleri

- `/repo` ile `/repo-evil` prefix saldırısı engellenir.
- Symlink parent üzerinden yeni dosya yazımı engellenir.
- Nested symlink zinciri engellenir.
- Windows path varyasyonları test edilir.
- TOCTOU senaryosu için write öncesi ikinci doğrulama vardır.

---

### 4.7 P0-07 — Chat Cockpit Sahte AI Yanıtı Üretmemeli

**Dosya:** `apps/web/src/App.tsx`

#### P0-07 Mevcut Hata

Frontend:

- Keyword eşleştiriyor.
- Sabit DB/test/audit metinleri döndürüyor.
- Sabit token ve codebase metrikleri gösteriyor.
- Gerçek API çağırmadan başarı raporu üretiyor.
- `setTimeout` ile runtime taklidi yapıyor.

#### P0-07 Zorunlu Düzeltme

```text
Create session
→ Persist user message
→ Create run
→ Retrieve context
→ Invoke provider/agent
→ Stream events
→ Persist assistant message
→ Persist evidence
→ Restore after refresh
```

Demo modu ayrı tutulmalıdır:

```text
DEMO MODE — NO REAL EXECUTION
```

Production DTO ile demo DTO aynı olmamalıdır.

#### P0-07 Kapanış Kriterleri

- Gerçek API çağrısı olmadan assistant success oluşmaz.
- Provider error UI'da `failed` görünür.
- Mesajlar refresh sonrası geri gelir.
- Event stream gerçek backend eventlerinden beslenir.
- Sabit test/DB/audit iddiaları kaldırılır.

---

### 4.8 P0-08 — AI Mission Control Gerçek Event Stream Kullanmalı

**Dosya:** `apps/web/src/components/AIMissionControlPanel.tsx`

#### P0-08 Kaldırılacak Sahte Loglar

- 14 modül bulundu.
- 384.204 token tarandı.
- 120.500 tokena sıkıştırıldı.
- Claude/Gemini/Security Council oy kullandı.
- Secret scan 0 eşleşme.
- File lock boş.
- Sabit evidence hash.
- Handoff paketi mühürlendi.

#### P0-08 Zorunlu Düzeltme

Frontend yalnız şu backend eventlerini tüketmelidir:

- `run.queued`
- `run.started`
- `context.selection.started`
- `context.selection.completed`
- `provider.request.started`
- `provider.response.delta`
- `tool.call.started`
- `tool.call.completed`
- `evidence.created`
- `run.failed`
- `run.completed`

API error:

```text
status = failed
```

olmalıdır; local simulation ile `complete` yapılmamalıdır.

#### P0-08 Kapanış Kriterleri

- Her UI adımı backend event ID taşır.
- Sahte zamanlama dizisi kaldırılır.
- Hata success olarak gösterilmez.
- Event replay refresh sonrası mümkündür.

---

### 4.9 P0-09 — `/api/simulate-task` Production Yolundan Çıkarılmalı

**Dosya:** `server.ts`

#### P0-09 Mevcut Hata

Endpoint:

- Repo clone/fetch yapmıyor.
- Gerçek dosya ağacı okumuyor.
- Context index kullanmıyor.
- Graph servisi kullanmıyor.
- Uydurma dosya yolları üretiyor.
- Provider hata verirse HTTP 200 mock sonuç dönüyor.
- 150K token budget kullanarak canonical 50K policy ile çelişiyor.

#### P0-09 Zorunlu Düzeltme

```text
POST /api/demo/simulate-task
POST /api/projects/:projectId/tasks/:taskId/runs
```

Demo endpoint yalnız non-production ortamda açık olmalıdır.

Gerçek run endpointi:

```text
Repo adapter
→ File discovery
→ Context index
→ Graph traversal
→ Pack builder
→ Provider
→ Event store
→ Evidence store
```

zincirini kullanmalıdır.

#### P0-09 Kapanış Kriterleri

- Production'da demo endpoint 404 veya 403 döner.
- Provider error typed domain error döner.
- Uydurma file path üretimi kaldırılır.
- Token budget tek canonical policy'den gelir.
- Gerçek repository fixture ile integration testi vardır.

---

## 5. P1 — Mimari Tamamlama Düzeltmeleri

### 5.1 P1-01 — Gerçek Semantic Retrieval Uygulanmalı

**Dosya:** `packages/context/src/index.ts`

#### P1-01 Mevcut Durum

`mockSemanticSearchFallback()` yalnız lexical overlap ve keyword hit hesabı yapmaktadır.

#### P1-01 Zorunlu Hedef

- Embedding provider abstraction
- PostgreSQL `pgvector` veya eşdeğer vector store
- Lexical + vector hybrid rank
- Metadata filtering
- Project isolation
- Explainable score
- Threshold
- Top-K
- Embedding model/version kaydı
- Query provenance

#### P1-01 Kapanış Kriterleri

- Semantic similarity gerçek vector distance kullanır.
- Fallback açıkça lexical olarak işaretlenir.
- Cross-project vector sonuçları dönmez.
- Retrieval benchmark testi bulunur.

---

### 5.2 P1-02 — Context Graph Traversal Stub Kaldırılmalı

**Dosya:** `packages/context/src/index.ts`

#### P1-02 Zorunlu Hedef

- Graph service dependency injection
- Direct dependency
- Reverse dependency
- Transit traversal
- Cycle protection
- Depth limit
- Fan-out limit
- Edge type filtering
- Project scope
- Provenance

#### P1-02 Kapanış Kriterleri

- Stub fonksiyon production export'undan çıkarılır.
- Fixture graph üzerinde transit sonuçlar doğrulanır.
- Cycle testi geçer.
- Max depth ve max nodes uygulanır.

---

### 5.3 P1-03 — Gerçek Model Tokenizer Kullanılmalı

**Dosya:** `packages/context/src/index.ts`

#### P1-03 Mevcut Hata

```typescript
Math.ceil(content.length / 4)
```

yalnız kaba tahmindir.

#### P1-03 Zorunlu Hedef

- Provider/model bazlı tokenizer adapter
- Tokenizer version
- UTF-8 ve Türkçe test corpus'u
- Hard limit
- Output reserve
- Tool reserve
- System prompt reserve
- Safety margin
- Over-budget explicit failure

#### P1-03 Kapanış Kriterleri

- Aynı model ve input deterministik token sayısı üretir.
- 50K hard limit hiçbir yolda aşılmaz.
- Pack sonucunda budget manifest bulunur.

---

### 5.4 P1-04 — Readiness Endpoint Gerçek Probe Kullanmalı

**Dosya:** `apps/api/src/index.ts`

#### P1-04 Zorunlu Hedef

`/healthz` yalnız process liveness kontrol etmelidir.

`/readyz` şu bileşenleri gerçek olarak sorgulamalıdır:

- DB bağlantısı
- Migration durumu
- Permission policy store
- Worker heartbeat
- Event store
- Evidence store
- CAS storage
- Queue
- Provider availability
- Secret manager

#### P1-04 Kapanış Kriterleri

- Worker down ise readiness 503.
- DB down ise readiness 503.
- Permission store down ise readiness 503.
- Provider optional ise `degraded`, required ise 503.
- Statik `healthy` değerleri kaldırılır.

---

### 5.5 P1-05 — GitHub Repository Adapter Uygulanmalı

**Dosya:** `packages/core/src/repo-adapter.ts`

#### P1-05 Zorunlu Yetenekler

- Clone
- Fetch
- Default branch discovery
- Commit SHA resolution
- File tree
- File read
- Changed files
- Diff
- Branch create
- Commit
- Pull request
- Read-only ve read-write capability ayrımı
- Rate-limit handling
- Authentication error handling

#### P1-05 Kapanış Kriterleri

- Public repo read integration testi.
- Private repo authenticated read testi.
- Invalid token testi.
- Branch/commit/PR contract testleri.
- Capability çıktısı gerçek implementasyonla uyumlu.

---

### 5.6 P1-06 — DB Configuration Endpoint Güvenli Hale Getirilmeli

**Dosya:** `apps/api/src/index.ts`

#### P1-06 Zorunlu Hedef

Tercih edilen çözüm:

- Endpoint kaldırılır.
- Secret manager veya deployment environment kullanılır.

Geçici local bootstrap gerekiyorsa:

- Yalnız local development.
- Explicit local flag.
- Admin principal.
- CSRF koruması.
- Loopback-only binding.
- Secret loglanmaması.
- `.env` plaintext persistence olmaması.
- Otomatik migration için ayrı approval.

#### P1-06 Kapanış Kriterleri

- Staging/production ortamında endpoint yok.
- Credential response veya audit loga yazılmaz.
- `.env` dosyasına server üzerinden secret yazılmaz.

---

## 6. P2 — Kalite, Test ve Bakım Düzeltmeleri

### 6.1 P2-01 — Gerçek ESLint Kurulmalı

**Dosya:** `package.json`

```json
{
  "lint": "eslint . --max-warnings=0",
  "typecheck": "tsc --noEmit"
}
```

Ek kurallar:

- TypeScript ESLint
- React hooks
- Import boundary rules
- No floating promises
- Security rules
- No explicit `any`
- Unused import detection

---

### 6.2 P2-02 — TypeScript Strict Mode Uygulanmalı

**Dosya:** `tsconfig.json`

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "useUnknownInCatchVariables": true,
  "noFallthroughCasesInSwitch": true
}
```

---

### 6.3 P2-03 — API Router Modüllere Ayrılmalı

**Dosya:** `apps/api/src/index.ts`

```text
apps/api/src/routes/auth.ts
apps/api/src/routes/projects.ts
apps/api/src/routes/tasks.ts
apps/api/src/routes/evidence.ts
apps/api/src/routes/events.ts
apps/api/src/routes/context.ts
apps/api/src/routes/graph.ts
apps/api/src/routes/artifacts.ts
apps/api/src/routes/admin.ts
apps/api/src/middleware/auth.ts
apps/api/src/middleware/project-scope.ts
apps/api/src/middleware/error-handler.ts
```

---

### 6.4 P2-04 — Feature Registry Kanıt Standardı Güçlendirilmeli

**Dosya:** `docs/audit/feature-registry.yaml`

İzin verilen durumlar:

```text
SIMULATED
PLACEHOLDER
BACKEND_ONLY
PARTIAL
BLOCKED
BROKEN
PASS
```

PASS için zorunlu alanlar:

```yaml
implementation:
tests:
  unit:
  integration:
  e2e:
  security:
evidence:
commit_sha:
verified_at:
known_gaps: []
```

---

### 6.5 P2-05 — Eski Audit Belgeleri Temizlenmeli

**Klasör:** `docs/audit/`

- Eski v2.0 dosya kaldırılmalı veya `DEPRECATED_` prefix'i almalı.
- Canonical belge sürümü iç metadata ile eşleşmeli.
- `İncelenen HEAD` güncel SHA olmalı.
- Tek canonical audit belgesi tanımlanmalı.
- Audit index canonical dosyaya link vermeli.

---

## 7. Zorunlu CI Pipeline

Yeni dosya:

```text
.github/workflows/ci.yml
```

Zorunlu işler:

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
e2e
build
secret-scan
feature-registry-validation
```

Branch protection:

- CI required
- Direct push kapalı
- Review zorunlu
- Force push kapalı
- Required status checks aktif
- Stale approval dismissal aktif

---

## 8. Zorunlu Test Matrisi

### 8.1 Authentication Test Paketi

- Invalid signature
- `alg: none`
- Expired token
- Wrong issuer
- Wrong audience
- Missing subject
- Invalid role
- Wildcard project claim
- Revoked session
- Cross-organization access

### 8.2 Authorization Test Paketi

- Project list isolation
- Task IDOR
- Task-project mismatch
- Missing scope
- Empty policy store
- Policy DB outage
- Worker identity mismatch
- Admin organization boundary

### 8.3 Repository Adapter Test Paketi

- Path traversal
- Prefix collision
- Symlink escape
- Missing target under symlink parent
- Atomic write
- Secret rejection
- Binary file
- Size limit
- Windows path
- TOCTOU mitigation

### 8.4 Chat ve Runtime Test Paketi

- Session create
- Message persist
- Provider stream
- Tool event
- Evidence event
- Provider failure
- Retry
- Cancellation
- Refresh restore
- No fake completion

### 8.5 Context Test Paketi

- Real tokenizer
- 50K hard limit
- AST-aware chunking
- Vector retrieval
- Hybrid ranking
- Graph traversal
- Cycle guard
- Provenance
- Deterministic manifest

### 8.6 E2E Test Paketi

- Login
- Project list isolation
- Project select
- Task create
- Run start
- Event stream
- Run failure
- Evidence display
- Refresh restore
- Logout
- Session expiry

---

## 9. Önerilen Commit Sırası

1. `fix(auth): replace unverified JWT payload parsing with cryptographic verification`
2. `fix(authz): enforce organization and project scope on project and task routes`
3. `fix(audit): derive actors from authenticated principals and signed service identities`
4. `fix(permission): enforce fail-closed behavior for empty, invalid, or unavailable policy stores`
5. `fix(repo-adapter): harden containment, symlink handling, atomic writes, and secret rejection`
6. `fix(ui): remove fake success flows and isolate explicit demo mode`
7. `feat(runtime): connect task runs to context, provider, event, and evidence services`
8. `feat(context): add tokenizer-aware packs, vector retrieval, and graph traversal`
9. `ci: add required lint, integration, security, build, and e2e gates`
10. `docs(audit): publish canonical v2.2 audit and deprecate stale reports`

---

## 10. Release Gate

Production release yalnız aşağıdaki koşulların tamamı sağlandığında açılabilir:

- JWT doğrulama güvenli.
- IDOR testleri yeşil.
- Project list isolation yeşil.
- Audit actor principal tabanlı.
- Permission Kernel fail-closed.
- Repo adapter traversal testleri yeşil.
- Chat gerçek backend kullanıyor.
- Mission Control gerçek event stream kullanıyor.
- Production'da demo endpoint kapalı.
- Provider error success olarak gösterilmiyor.
- Real tokenizer uygulanmış.
- Semantic retrieval gerçek vector tabanlı.
- Context graph stub kaldırılmış.
- CI workflow aktif.
- Integration PostgreSQL testi aktif.
- Playwright E2E aktif.
- Feature Registry yalnız kanıtlı PASS içeriyor.
- Eski audit dosyaları deprecated veya kaldırılmış.
- Güncel audit belgesi HEAD SHA ile eşleşiyor.

```text
Herhangi bir P0 açık → RELEASE BLOCKED
Herhangi bir security test başarısız → RELEASE BLOCKED
CI yok → RELEASE BLOCKED
Gerçek E2E yok → RELEASE BLOCKED
Simülasyon production sonucu gibi görünüyorsa → RELEASE BLOCKED
```

---

## 11. Tamamlanma Tanımı

Bir madde yalnız şu zincir tamamlandığında kapatılabilir:

```text
Kod değişikliği
→ Unit test
→ Negatif test
→ Integration test
→ Security test
→ E2E
→ CI PASS
→ Commit SHA
→ Evidence
→ Feature Registry güncellemesi
→ Audit belgesi güncellemesi
```

Aşağıdakiler tamamlanma sayılmaz:

- Commit mesajı yazılmış olması
- Typecheck geçmesi
- UI'ın açılması
- Mock fallback sonucu
- Sabit başarı logu
- Kaynak kodda beklenen string bulunması
- Dokümana PASS yazılması
- Simülasyonun deterministik olması
- Provider hatasının local fallback ile gizlenmesi

---

## 12. Nihai Uygulama Sırası

```text
1. JWT authentication bypass
2. Task ve project authorization
3. Audit identity
4. Permission Kernel fail-closed
5. Repo adapter containment
6. Sahte Chat ve Mission Control başarı yolları
7. Gerçek task run/event/evidence zinciri
8. Semantic retrieval ve graph
9. CI, security testleri ve E2E
10. Canonical audit cleanup
```

Mevcut `main` dalı production'a alınmamalıdır. Bütün P0 maddeleri kapatılmadan P1 geliştirmeleri tamamlanmış kabul edilmemelidir.

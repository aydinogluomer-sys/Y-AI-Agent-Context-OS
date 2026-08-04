# Y — AI Agent Context OS: Güncel Kaynak Kod Denetimi, Üretim Hazırlığı Kararı ve Onarım Yol Haritası


**Belge sürümü:** 2.0  
**Tarih:** 4 Ağustos 2026  
**Repository:** `aydinogluomer-sys/Y-AI-Agent-Context-OS`  
**İncelenen dal:** `main`  
**İncelenen HEAD:** `7b56b03d766411f263af9164f74a6ac9b6a3ad60`  
**Belgenin statüsü:** Önceki denetim ve onarım Markdown dosyalarının yerine geçer.

---

## 1. Belgenin Amacı

Bu belge, repository'nin ilk kez GitHub'a yüklenmiş olmasından kaynaklanan commit geçmişi yanılgısını ortadan kaldırmak için hazırlanmıştır.

Değerlendirme:

- Commit sayısına,
- Son commit farkına,
- Repository boyutu metadatasına,
- Dokümantasyondaki “PASS”, “verified”, “implemented” veya “frozen” ifadelerine

dayandırılmamıştır.

Bunun yerine doğrudan `main` dalındaki gerçek uygulama dosyaları incelenmiştir:

- Frontend uygulama kodu
- API router ve servisler
- Authentication ve authorization
- Permission Kernel
- Context OS çekirdeği
- Graph katmanı
- Repository adapter'ları
- Provider registry
- Test/validation scriptleri
- Feature registry ve navigasyon tanımları
- Secret tarama ve konfigürasyon sistemi

Bu belge iki amacı birlikte taşır:

1. Mevcut sistemin gerçekte hangi parçalarının çalışır durumda olduğunu ayırmak.
2. Sistemi production seviyesine getirmek için uygulanması gereken onarım sırasını tanımlamak.

---

## 2. Denetim Kapsamı ve Sınırlamalar

### 2.1 İncelenen ana dosyalar

#### Repository kökü

- `package.json`
- `tsconfig.json`
- `server.ts`
- `.gitignore`

#### Frontend

- `apps/web/src/App.tsx`
- `apps/web/src/app/navigation.ts`
- `apps/web/src/components/AIMissionControlPanel.tsx`
- `apps/web/src/lib/api/ai.ts`
- `apps/web/src/lib/api/auth-bootstrap.ts`

#### Backend/API

- `apps/api/src/index.ts`
- `apps/api/src/auth.ts`
- `apps/api/src/config.ts`
- `apps/api/src/PermissionKernelService.ts`

#### Çekirdek paketler

- `packages/context/src/index.ts`
- `packages/core/src/repo-adapter.ts`
- `packages/graph/src/index.ts`
- `packages/providers/src/index.ts`

#### Test ve kalite altyapısı

- `scripts/run-validation-suite.ts`
- `scripts/validation-suite.ts`
- `scripts/validate-ai-cockpit.ts`
- `scripts/validate-stage-35.ts`
- `scripts/secret-scan.ts`
- `docs/audit/feature-registry.yaml`

### 2.2 Çalıştırılamayan kontroller

Denetim ortamında GitHub CLI bulunmadığı ve standart `git clone` çağrısı DNS çözümleme kısıtına takıldığı için aşağıdakiler bu ortamda fiilen çalıştırılamamıştır:

- `pnpm install`
- `npm install`
- `npm run typecheck`
- `npm run build`
- `npm run test:deterministic`
- `npm run test:db`
- Tarayıcı tabanlı E2E
- Gerçek PostgreSQL integration
- Gerçek Gemini provider çağrısı

Bu nedenle belge:

- Kaynak kod statik incelemesine,
- API ve servis zinciri analizine,
- Test kodlarının doğrulama kapasitesine,
- GitHub'daki workflow/status durumuna

dayanır.

**Bu belge runtime PASS belgesi değildir.**

---

## 3. Yönetici Özeti

### 3.1 Kesin sonuç

Y — AI Agent Context OS:

- Boş repository değildir.
- Yalnız tasarım demosu değildir.
- Kayda değer backend ve domain koduna sahiptir.
- PostgreSQL, task FSM, evidence, event, CAS, permission ve graph katmanlarında gerçek implementasyon içerir.

Ancak mevcut durumda:

- Ana Chat Cockpit gerçek ajan çalıştırmamaktadır.
- AI Mission Control sahte ilerleme ve başarı logları üretmektedir.
- Repository analizi gerçek dosya ağacından yapılmamaktadır.
- Semantic retrieval ve graph traversal'ın kritik parçaları fallback/stub durumundadır.
- Production authentication tamamlanmamıştır.
- Project authorization bazı route'larda atlanabilmektedir.
- Permission Kernel veritabanı hatasında fail-closed davranmamaktadır.
- Repo adapter güvenlik sertleştirmesi eksiktir.
- Feature Registry gerçek durumla çelişmektedir.
- Testler production davranışını yeterli ölçüde kanıtlamamaktadır.
- GitHub Actions/CI kanıtı bulunmamaktadır.

### 3.2 Production kararı

```text
Production readiness: REJECT
```

Bu karar, projenin değersiz veya yeniden yazılması gerektiği anlamına gelmez.

Doğru yorum:

```text
Çekirdek backend korunmalı.
Simülasyon ve gerçek çalışma yolları kesin biçimde ayrılmalı.
Ana kullanıcı akışları gerçek backend zincirine bağlanmalı.
Güvenlik, test ve CI katmanları yeniden yapılandırılmalı.
```

---

## 4. Gerçek Olarak Mevcut Olan Bileşenler

Aşağıdaki alanlarda yalnız görsel kabuk değil, gerçek domain/backend kodu bulunmaktadır.

### 4.1 Project ve Task veri akışı

`apps/api/src/index.ts` içinde:

- Project oluşturma
- Project okuma
- Project güncelleme
- Project silme
- Task oluşturma
- Task listeleme
- Task arama
- Task metrikleri
- Task state transition
- Status history

gibi gerçek SQL tabanlı endpointler bulunmaktadır.

### 4.2 Task Lifecycle / FSM

Task durum değişikliklerinin doğrudan keyfi güncellenmesini engelleyen ve canonical transition yoluna yönlendiren kod bulunmaktadır.

Bu olumlu bir temel olmakla birlikte bütün task route'ları aynı project authorization zincirini kullanmamaktadır.

### 4.3 Evidence ve Event katmanı

Repository'de:

- `EvidenceStoreService`
- `EventStoreService`
- Evidence oluşturma
- Evidence listeleme
- Evidence doğrulama
- Quality-gate run kayıtları
- Audit yardımcıları

bulunmaktadır.

### 4.4 Artifact / CAS

Artifact sürümleme, hash, deduplication, quarantine ve secret taraması için gerçek servis ve test kodu bulunmaktadır.

Ancak DB bağlantısı olmadığında testlerin gerçek şema doğrulamasını simüle edebilmesi production kanıtını geçersiz kılmaktadır.

### 4.5 Permission Kernel

Permission rule yükleme, condition evaluation, boundary kontrolü, override kaydı ve audit üretimi için gerçek servis bulunmaktadır.

Sorun implementasyonun olmaması değil, hata durumundaki güvenlik politikasıdır.

### 4.6 Graph persistence

Graph node ve edge CRUD, project ownership kontrolü ve DB persistence kodu bulunmaktadır.

Ancak gerçek impact traversal ve transit analiz eksiktir.

### 4.7 Context işlemleri

Aşağıdaki gerçek fonksiyonlar mevcuttur:

- Kaynak sınıflandırma
- Checksum
- Token tahmini
- Chunk oluşturma
- Lexical overlap
- Authority/recency scoring
- Missing-context detection
- Confidence hesabı
- Context pack yapılandırma
- Doküman ve session log sıkıştırma

Ana eksik, bu kodların gerçek tokenizer, semantic vector retrieval ve graph traversal ile tamamlanmamış olmasıdır.

---

## 5. Kritik Bulgular

---

### P0-01 — Chat Cockpit gerçek ajan çalıştırmıyor

**Dosya:** `apps/web/src/App.tsx`

#### Mevcut davranış — P0-01 — Chat Cockpit gerçek ajan çalıştırmıyor

Chat sistemi:

- Mesajları yalnız React state içinde tutuyor.
- Gerçek chat/session persistence kullanmıyor.
- Gerçek streaming endpoint çağırmıyor.
- Gerçek model çağrısı yapmıyor.
- Anahtar kelimelere göre hazırlanmış cevaplar döndürüyor.
- `setTimeout` ile motor çalışıyormuş izlenimi veriyor.
- Sabit graph node/edge kullanıyor.
- Mock file attachment kullanıyor.
- Sabit token ve codebase metrikleri gösteriyor.
- Rastgele karakterlerden sahte “SHA-256” üretip audit kaydı gibi sunuyor.

#### Etki — P0-01 — Chat Cockpit gerçek ajan çalıştırmıyor

Kullanıcı, gerçek bir agent/runtime/evidence işlemi yapılmış olduğunu düşünebilir.

#### Gerekli düzeltme — P0-01 — Chat Cockpit gerçek ajan çalıştırmıyor

Chat Cockpit şu zincire bağlanmalıdır:

```text
Session create
→ User message persist
→ Task/agent dispatch
→ Context retrieval
→ Provider stream
→ Tool call event
→ Evidence/event persist
→ UI stream
→ Refresh sonrası session restore
```

#### Kapanış kriteri — P0-01 — Chat Cockpit gerçek ajan çalıştırmıyor

- Tarayıcıdan mesaj gönderilir.
- Backend session oluşturur.
- Mesaj DB'de kalıcıdır.
- Provider veya local agent gerçek event üretir.
- Event stream UI'a gelir.
- Sayfa yenilendiğinde geçmiş geri yüklenir.
- Provider hatası “success” olarak gösterilmez.

---

### P0-02 — AI Mission Control sahte başarı yolu kullanıyor

**Dosya:** `apps/web/src/components/AIMissionControlPanel.tsx`

#### Mevcut davranış — P0-02 — AI Mission Control sahte başarı yolu kullanıyor

Gerçek API çağrısından önce sabit loglar oynatılmaktadır:

- ABAC doğrulandı.
- 14 kaynak modül bulundu.
- 384.204 token tarandı.
- 120.500 tokena sıkıştırıldı.
- Model council oy kullandı.
- Secret scan temiz.
- File lock boşta.
- Evidence hash üretildi.
- Handoff paketi mühürlendi.

API başarısız olsa dahi local simulation oluşturulup durum `complete` yapılmaktadır.

#### Etki — P0-02 — AI Mission Control sahte başarı yolu kullanıyor

Operasyonel hata ile başarı birbirinden ayrılamaz.

#### Gerekli düzeltme — P0-02 — AI Mission Control sahte başarı yolu kullanıyor

Frontend yalnız backend'den gelen gerçek eventleri göstermelidir.

İzin verilen durumlar:

- `queued`
- `running`
- `blocked`
- `awaiting_approval`
- `failed`
- `cancelled`
- `completed`
- `degraded`

Local demo modu kullanılacaksa UI üzerinde açıkça:

```text
DEMO DATA — NOT EXECUTED
```

etiketi bulunmalıdır.

---

### P0-03 — `/api/simulate-task` repository analizi yapmıyor

**Dosya:** `server.ts`

#### Mevcut davranış — P0-03 — `/api/simulate-task` repository analizi yapmıyor

Endpoint:

- Repository clone/fetch yapmıyor.
- Repo adapter kullanmıyor.
- Gerçek dosya listesi okumuyor.
- Context index sorgulamıyor.
- Graph servisi çağırmıyor.
- Task/evidence kaydı oluşturmuyor.
- Provider yoksa hard-coded sonuç döndürüyor.
- Provider hata verirse yine HTTP 200 ile mock sonuç döndürüyor.

#### Gerekli düzeltme — P0-03 — `/api/simulate-task` repository analizi yapmıyor

Endpoint ya tamamen kaldırılmalı ya da adı ve kontratı dürüst hale getirilmelidir:

```text
/api/demo/simulate-task
```

Gerçek görev endpointi ayrı olmalıdır:

```text
POST /api/projects/:id/tasks
POST /api/projects/:id/tasks/:taskId/runs
GET  /api/projects/:id/tasks/:taskId/events
```

Provider veya repository hatası:

- HTTP 4xx/5xx,
- typed error,
- audit event,
- retryable/non-retryable sınıflandırması

ile dönmelidir.

---

### P0-04 — Production authentication tamamlanmamış

**Dosyalar:**

- `apps/api/src/auth.ts`
- `apps/web/src/lib/api/auth-bootstrap.ts`

#### Mevcut yapı — P0-04 — Production authentication tamamlanmamış

Authentication yalnız:

1. Environment variable'dan gelen tek shared bearer token.
2. Mock DB ve non-production modunda üretilen development token.

üzerinden çalışmaktadır.

Eksikler:

- Gerçek kullanıcı login
- Logout
- Refresh/session renewal
- User identity
- Organization membership
- Project membership
- Role assignment
- Session revocation
- Multi-user audit attribution
- Production frontend bootstrap

#### Risk — P0-04 — Production authentication tamamlanmamış

Shared token ele geçirilirse bütün yetkili eylemler aynı principal gibi görünür.

#### Gerekli düzeltme — P0-04 — Production authentication tamamlanmamış

Supabase Auth, OIDC veya eşdeğer production auth uygulanmalıdır.

Backend principal şu alanları gerçek token claimlerinden çözmelidir:

```text
user_id
organization_id
project_memberships
roles
session_id
authentication_method
issued_at
expires_at
```

---

### P0-05 — Bazı task route'ları project scope zincirini atlıyor

**Dosya:** `apps/api/src/index.ts`

Örnek:

```text
PATCH /tasks/:id
```

Bu route project ID taşımamakta ve `requireProjectScope` middleware'i kullanmamaktadır.

Task DB'den bulunduğunda bağlı project'in authenticated principal'a ait olduğu aynı route içinde zorunlu olarak doğrulanmalıdır.

#### Gerekli düzeltme — P0-05 — Bazı task route'ları project scope zincirini atlıyor

Canonical route:

```text
PATCH /projects/:projectId/tasks/:taskId
```

olmalıdır.

Her entity operation için:

```text
principal membership
→ project scope
→ entity ownership
→ domain policy
→ mutation
→ audit
```

zinciri zorunlu hale getirilmelidir.

---

### P0-06 — Audit aktörleri güvenilir principal'dan gelmiyor

**Dosya:** `apps/api/src/index.ts`

Kod içinde sabit veya dışarıdan güvenilmez aktör değerleri vardır:

- `User-Aydinoglu`
- `developer`
- `human-operator`
- `patch_interceptor`
- `x-actor`

#### Risk — P0-06 — Audit aktörleri güvenilir principal'dan gelmiyor

Audit ledger gerçek kullanıcı eylemini temsil etmeyebilir.

#### Gerekli düzeltme — P0-06 — Audit aktörleri güvenilir principal'dan gelmiyor

Audit actor yalnız server-side authenticated principal'dan alınmalıdır.

İstisnalar:

- `system`
- İmzalı worker identity
- İmzalı service identity

Header ile actor seçimi kaldırılmalıdır.

---

### P0-07 — Permission Kernel policy store hatasında fail-closed değil

**Dosya:** `apps/api/src/PermissionKernelService.ts`

#### Mevcut davranış — P0-07 — Permission Kernel policy store hatasında fail-closed değil

DB'den policy yüklenemezse geniş static allow policy'ler dönmektedir:

- Admin wildcard
- System wildcard
- Task file wildcard
- Worker lock wildcard

#### Risk — P0-07 — Permission Kernel policy store hatasında fail-closed değil

Policy DB arızası authorization genişlemesine neden olabilir.

#### Gerekli düzeltme — P0-07 — Permission Kernel policy store hatasında fail-closed değil

Production davranışı:

```text
Policy store unavailable
→ deny
→ readiness degraded
→ security event
→ admin alert
```

olmalıdır.

Static fallback yalnız açık test fixture'ında kullanılmalıdır.

---

### P0-08 — DB yapılandırma endpointi secret'ı `.env` dosyasına yazıyor

**Dosya:** `apps/api/src/index.ts`

#### Mevcut davranış — P0-08 — DB yapılandırma endpointi secret'ı `.env` dosyasına yazıyor

`POST /db/configure`:

- Browser'dan connection string alıyor.
- Test bağlantısı kuruyor.
- Process environment değiştiriyor.
- Workspace root `.env` dosyasına düz metin credential yazıyor.
- Migration çalıştırıyor.

#### Risk — P0-08 — DB yapılandırma endpointi secret'ı `.env` dosyasına yazıyor

- Secret leakage
- Remote configuration takeover
- Yanlış DB'ye migration
- Shared token ile yönetimsel eylem
- Audit attribution problemi
- Dosya sistemi write riski

#### Gerekli düzeltme — P0-08 — DB yapılandırma endpointi secret'ı `.env` dosyasına yazıyor

Production'da bu endpoint kaldırılmalıdır.

Alternatif:

- Deployment secret manager
- Environment injection
- One-time admin bootstrap
- Short-lived approval
- No plaintext persistence
- No browser-visible credential echo

---

### P0-09 — Repo Adapter path ve symlink sertleştirmesi eksik

**Dosya:** `packages/core/src/repo-adapter.ts`

#### Sorunlar — P0-09 — Repo Adapter path ve symlink sertleştirmesi eksik

- `startsWith(rootPath)` containment tek başına güvenli değildir.
- `realpath` doğrulaması yoktur.
- Symlink hedef kontrolü yoktur.
- Atomic write yoktur.
- Lease/fencing token kontrolü write anında uygulanmamaktadır.
- Secret bulunan içerik reddedilmek yerine sessizce değiştirilip yazılmaktadır.
- GitHub adapter açıkça stub durumundadır.

#### Gerekli düzeltme — P0-09 — Repo Adapter path ve symlink sertleştirmesi eksik

- `fs.realpath`
- `path.relative`
- Symlink deny veya explicit safe policy
- Temp file + atomic rename
- File lock/lease token
- Hash-before/hash-after
- Secret detection failure
- Explicit redaction preview
- Git adapter contract testleri

---

### P0-10 — Feature Registry sahte PASS üretiyor

**Dosyalar:**

- `docs/audit/feature-registry.yaml`
- `apps/web/src/app/navigation.ts`

Feature Registry bütün kategorileri `PASS` göstermektedir.

Ancak navigasyon kaynak kodu aynı özelliklerin büyük bölümünü açıkça `Placeholders` olarak tanımlamaktadır.

#### Gerekli düzeltme — P0-10 — Feature Registry sahte PASS üretiyor

Status alanları gerçek duruma çevrilmelidir:

- `SIMULATED`
- `PLACEHOLDER`
- `PARTIAL`
- `BACKEND_ONLY`
- `BROKEN`
- `BLOCKED`
- `PASS`

PASS için zorunlu alanlar:

```yaml
entry_points:
api_routes:
services:
persistence:
policies:
unit_tests:
integration_tests:
e2e_tests:
security_tests:
evidence:
commit_sha:
verified_at:
```

---

## 6. P1 Bulguları

### P1-01 — Token hesabı gerçek tokenizer kullanmıyor

**Dosya:** `packages/context/src/index.ts`

Mevcut yöntem:

```text
token = ceil(character_count / 4)
```

Bu yalnız kaba tahmindir.

Gerekli:

- Provider/model bazlı tokenizer
- Tokenizer version kaydı
- UTF-8 ve çok dilli test corpus'u
- Hard-limit enforcement
- Over-budget explicit error

---

### P1-02 — Chunking AST veya token boundary kullanmıyor

Mevcut chunking sabit karakter bloklarına göre yapılmaktadır.

Riskler:

- Fonksiyon ortasında bölme
- Import/export ilişkisinin kopması
- Markdown section ayrımının kaybolması
- Minified dosyada anlamsız chunk
- Token budget sapması

Gerekli:

- Language-aware parser
- Symbol-level chunking
- Markdown heading boundary
- Stable chunk ID
- Source span
- Overlap policy
- Binary/minified fallback

---

### P1-03 — Semantic retrieval yalnız lexical fallback

`mockSemanticSearchFallback` gerçek embedding/vector search değildir.

Gerekli:

- Embedding provider abstraction
- Vector store veya PostgreSQL `pgvector`
- Lexical + semantic hybrid rank
- Query intent
- Dependency distance
- Provenance
- Explainable score

---

### P1-04 — Graph traversal stub

`stubGraphTraversal` boş relationship listesi döndürmektedir.

Gerekli:

- Direct dependency
- Reverse dependency
- Transit traversal
- Depth limit
- Cycle detection
- Fan-out budget
- Project isolation
- Confidence
- Incremental invalidation

---

### P1-05 — Impact trace recursive değil

**Dosya:** `packages/graph/src/index.ts`

`calculateImpactTrace()` yalnız birinci seviye outgoing edge'leri eklemektedir.

Gerekli:

- BFS/DFS
- Reverse edge mode
- Maximum depth
- Maximum nodes
- Cycle guard
- Edge type filtering
- Risk score
- Recommended tests

---

### P1-06 — Provider registry UI ile uyuşmuyor

Backend yalnız Google Gemini provider içerirken UI:

- Claude
- DeepSeek
- Model council

seçenekleri göstermektedir.

Gerekli:

- Gerçek provider adapter
- Capability negotiation
- Model availability
- Pricing metadata
- Context limit
- Streaming
- Health probe
- Rate limit classification

Desteklenmeyen provider UI'da seçilememelidir.

---

### P1-07 — Provider health yalnız credential varlığını kontrol ediyor

`connect()` gerçek connectivity veya model availability testi yapmamaktadır.

Gerekli:

- Lightweight provider probe
- Timeout
- Auth error
- Quota/rate-limit
- Region/model unavailable
- Last successful check
- Circuit breaker

---

### P1-08 — Context token limitleri tutarsız

Kodda:

```text
Default pack: 50K
API config: 150K
Maximum: 250K
UI simulation: farklı sabit değerler
```

bulunmaktadır.

Tek canonical budget policy tanımlanmalıdır.

Örnek:

```text
hard_pack_limit
provider_input_limit
reserved_output_tokens
system_prompt_reserve
tool_call_reserve
safety_margin
```

---

### P1-09 — Local AI fallback gerçek veri gibi görünebilir

**Dosya:** `apps/web/src/lib/api/ai.ts`

Local fallback:

- Sabit milyonlarca token
- Sabit file path
- Sabit risk ve model önerileri
- Sabit production blocker anlatısı

üretmektedir.

Bu yalnız demo fixture olarak tutulmalıdır.

Production sonuç tipi ile aynı kontratı kullanmamalıdır.

---

### P1-10 — Health endpoint kapsamı eksik

Health yanıtı ağırlıklı olarak DB durumuna odaklanmaktadır.

Gerçek sistem health/readiness şu bileşenleri kapsamalıdır:

- API
- Database
- Migration
- Queue
- Worker
- File lock
- CAS
- Graph index
- Provider
- Secret manager
- Event store
- Evidence store

`/healthz` ve `/readyz` ayrılmalıdır.

---

## 7. P2 Bulguları

### P2-01 — Root package adı hâlâ örnek proje adı

`package.json`:

```json
{
  "name": "react-example",
  "version": "0.0.0"
}
```

Repository kimliğiyle uyumlu hale getirilmelidir.

---

### P2-02 — `lint` gerçek lint değildir

Mevcut:

```json
"lint": "tsc --noEmit"
```

Gerekli:

- ESLint
- Import boundary rules
- No floating promises
- No explicit any
- Security lint
- React hooks
- Node rules

---

### P2-03 — TypeScript strictness düşük

`tsconfig.json` içinde:

- `strict` yok
- `allowJs: true`
- `skipLibCheck: true`

Gerekli kademeli hedef:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "useUnknownInCatchVariables": true
}
```

---

### P2-04 — API router aşırı büyük

`apps/api/src/index.ts` çok fazla sorumluluğu tek dosyada toplamaktadır.

Bölünmesi gereken alanlar:

```text
routes/auth
routes/projects
routes/tasks
routes/evidence
routes/quality-gates
routes/database-admin
routes/context
routes/graph
routes/artifacts
middleware/auth
middleware/project-scope
middleware/error-handler
```

---

### P2-05 — Secret scanner istisnaları fazla geniş

Scanner:

- `.env*`
- kendi dosyası
- validate scriptleri

gibi yüksek riskli alanları atlamaktadır.

Tarama:

- Tracked files
- Git diff
- Generated artifacts
- Workflow logs
- Test fixtures

için ayrı policy ile yapılmalıdır.

Gerçek fixture secret'ları sentetik ve açıkça işaretli olmalıdır.

---

### P2-06 — `.gitignore` environment kapsamı zayıf

Yalnız `.env` ignore edilmektedir.

Gerekli:

```gitignore
.env
.env.*
!.env.example
scratch/
```

`.env.example` yalnız placeholder içermelidir.

---

## 8. Modül Durum Matrisi

| Modül | Mevcut durum | Karar |
| --- | --- | --- |
| Project CRUD | Gerçek SQL/API var | PARTIAL |
| Task CRUD | Gerçek SQL/API var | PARTIAL |
| Task FSM | Gerçek domain logic var | PARTIAL |
| Evidence Store | Gerçek servis/API var | PARTIAL |
| Event Store | Gerçek servis/API var | PARTIAL |
| Artifact/CAS | Gerçek servis var | PARTIAL |
| Permission Kernel | Gerçek servis var | SECURITY HARDENING REQUIRED |
| Graph persistence | Gerçek DB servis var | PARTIAL |
| Impact analysis | Yalnız sınırlı direct traversal | INCOMPLETE |
| Context classification | Gerçek | PARTIAL |
| Context ranking | Lexical/heuristic | PARTIAL |
| Context pack builder | Var, fakat limit/tokenizer tutarsız | PARTIAL |
| Semantic retrieval | Lexical fallback | FALLBACK |
| Graph traversal | Stub | STUB |
| Chat Cockpit | Frontend simülasyonu | SIMULATED |
| AI Mission Control | Sahte log + fallback başarı | SIMULATED |
| Repository analysis | Gerçek clone/index yok | MISSING |
| Local filesystem adapter | Kısmi | SECURITY HARDENING REQUIRED |
| GitHub repo adapter | Stub/unavailable | STUB |
| Authentication | Shared token/dev session | INCOMPLETE |
| Multi-user membership | Yok veya tamamlanmamış | MISSING |
| Provider registry | Gemini only | PARTIAL |
| Model council | UI simülasyonu | SIMULATED |
| Feature Registry | Gerçeklikle çelişiyor | FALSE PASS |
| Deterministic tests | Kısmi kaynak/fixture doğrulaması | FALSE GREEN RISK |
| DB tests | Skip/simulation riski | BLOCKED/UNVERIFIED |
| Browser E2E | Kanıt yok | MISSING |
| CI/CD | Workflow/status kanıtı yok | MISSING |
| Production readiness | Kritik eksikler mevcut | REJECT |

---

## 9. Onarım Sırası

### Dalga 0 — Gerçeklik ve güven kapısı

#### Amaç — Dalga 0 — Gerçeklik ve güven kapısı

Sistemin yapmadığı işlemleri yapmış gibi göstermesini durdurmak.

#### İşler — Dalga 0 — Gerçeklik ve güven kapısı

1. Feature Registry'deki bütün `PASS` kayıtlarını sıfırdan sınıflandır.
2. Chat Cockpit sahte yanıtlarını demo fixture'a taşı.
3. Mission Control sabit başarı loglarını kaldır.
4. Fallback sonucunu `DEMO_RESULT` tipiyle ayır.
5. Provider/API hatasını başarıya çevirmeyi bırak.
6. UI'da demo, degraded ve real modları görünür yap.

#### Gate — Dalga 0 — Gerçeklik ve güven kapısı

- Hiçbir UI yüzeyi gerçek event olmadan `completed` gösteremez.
- Demo data production DTO'su olarak kullanılamaz.
- Registry yalnız kanıtlı alanlarda PASS verir.

---

### Dalga 1 — Authentication ve authorization

#### İşler — Dalga 1 — Authentication ve authorization

1. Gerçek identity provider entegrasyonu.
2. User, organization, membership tabloları.
3. Project membership resolution.
4. Route'ları `/projects/:projectId/...` altında canonical hale getirme.
5. Sabit audit actor'larını kaldırma.
6. `x-actor` güvenini kaldırma.
7. Role/policy negative testleri.
8. Session revoke ve expiry.

#### Gate — Dalga 1 — Authentication ve authorization

- Başka project task ID'siyle doğrudan istek 403.
- Audit actor token principal ile eşleşiyor.
- Shared admin token production kullanıcı oturumu olarak kullanılamıyor.

---

### Dalga 2 — Permission Kernel fail-closed

#### İşler — Dalga 2 — Permission Kernel fail-closed

1. Policy DB error → deny.
2. Static fallback yalnız test environment.
3. Eksik project/task/worker scope → deny.
4. Admin override için signed approval.
5. Policy version ve checksum.
6. Security readiness state.
7. Cross-project matrix testleri.

#### Gate — Dalga 2 — Permission Kernel fail-closed

- Policy store kapatıldığında bütün korumalı eylemler reddedilir.
- Readiness degraded olur.
- Security audit event oluşur.

---

### Dalga 3 — Repository adapter ve güvenli dosya sistemi

#### İşler — Dalga 3 — Repository adapter ve güvenli dosya sistemi

1. Realpath containment.
2. Symlink policy.
3. Atomic writes.
4. File lease/fencing token.
5. Size/quota/depth sınırları.
6. Secret bulunan write'ı reddetme.
7. Git adapter:
   - clone
   - fetch
   - status
   - diff
   - changed files
8. GitHub read-only adapter gerçek implementasyonu.
9. Adapter contract suite.

#### Gate — Dalga 3 — Repository adapter ve güvenli dosya sistemi

- Traversal/symlink escape testleri geçer.
- Secret içeren write kaynak dosyayı sessizce değiştirmez.
- Fixture repo gerçek clone/index sürecinden geçer.

---

### Dalga 4 — Gerçek Context OS

#### İşler — Dalga 4 — Gerçek Context OS

1. Canonical tokenizer abstraction.
2. AST/section-aware chunking.
3. Stable chunk ID ve source span.
4. Embedding/vector retrieval.
5. Hybrid ranking.
6. Gerçek graph traversal.
7. Hard 50K policy.
8. Provenance manifest.
9. Pack persistence.
10. Pack consumption ledger.

#### Gate — Dalga 4 — Gerçek Context OS

- 50K üzerindeki corpus deterministik biçimde limit altında paketlenir.
- Zorunlu context kaybolmaz.
- Aynı input/config aynı manifest hash'i üretir.
- Kaynaktan pack'e ve pack'ten kaynağa lineage izlenebilir.

---

### Dalga 5 — Gerçek agent/task runtime

#### İşler — Dalga 5 — Gerçek agent/task runtime

1. Agent run tablosu.
2. Queue/worker dispatch.
3. Run FSM.
4. Streaming events.
5. Cancellation.
6. Retry/idempotency.
7. Approval gates.
8. Provider invocation.
9. Tool-call events.
10. Handoff package.

#### Gate — Dalga 5 — Gerçek agent/task runtime

```text
Create task
→ queued
→ running
→ tool/provider event
→ evidence
→ completed/failed
→ refresh restore
```

uçtan uca çalışır.

---

### Dalga 6 — Frontend gerçek entegrasyon

#### İşler — Dalga 6 — Frontend gerçek entegrasyon

1. Chat session API.
2. Mission Control event stream.
3. Real context pack viewer.
4. Real graph viewer.
5. Permission denied UI.
6. Provider unavailable UI.
7. Loading/empty/error/degraded.
8. Refresh persistence.
9. A11y ve reduced motion.
10. Placeholder route'ları gerçek modüllere dönüştürme.

#### Gate — Dalga 6 — Frontend gerçek entegrasyon

Playwright E2E bütün ana kullanıcı akışlarını doğrular.

---

### Dalga 7 — Test ve CI

#### Zorunlu CI işleri

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

#### Yasaklar

- DB yoksa `assert(true)`
- Başarısız provider yerine PASS mock
- Kaynak metni içeriyor diye E2E PASS
- Skip marker ile deterministic PASS
- Build olmadan release PASS

---

## 10. Zorunlu Test Matrisi

### Unit

- Token budget
- Chunk ID determinism
- Ranking
- Permission decisions
- FSM transitions
- Path normalization
- Secret detection
- Graph traversal
- Cost calculations

### Contract

- Repo adapter
- Provider adapter
- Queue
- CAS
- Event store
- Evidence store
- Auth principal resolver

### Integration

- PostgreSQL fresh migration
- PostgreSQL upgrade migration
- Cross-project isolation
- Task lifecycle
- Evidence integrity
- CAS deduplication
- Graph incremental update
- Context pack persistence

### E2E

- Login
- Project select
- Task create
- Agent run
- Event stream
- Approval
- Failure/retry
- Context pack view
- Evidence view
- Refresh restore
- Logout/session expiry

### Security

- IDOR
- Cross-tenant
- Policy store outage
- Path traversal
- Symlink escape
- Secret leakage
- Admin endpoint authorization
- Replay
- Shared token abuse
- File lock bypass

### Resilience

- Worker crash
- Provider timeout
- DB timeout
- Duplicate event
- Queue retry
- Partial write
- Process restart
- Stale lock

---

## 11. Feature Registry İçin Yeni Şema

```yaml
- id: Y-00-CHAT-COCKPIT
  category: Mission Control
  feature: Chat Cockpit
  status: SIMULATED
  implementation:
    ui:
      - apps/web/src/App.tsx
    api: []
    services: []
    persistence: []
    policies: []
  tests:
    unit: []
    integration: []
    e2e: []
    security: []
  evidence: []
  known_gaps:
    - No persistent chat session
    - No provider stream
    - No real context retrieval
    - No evidence persistence
  acceptance_criteria:
    - Persistent session
    - Real backend stream
    - Failure state
    - Refresh restore
  commit_sha: null
  verified_at: null
```

PASS validator şu şartları zorlamalıdır:

```text
status == PASS
AND implementation entry point exists
AND automatic happy-path test exists
AND negative test exists
AND E2E exists when UI exists
AND evidence exists
AND commit SHA exists
AND verification date exists
```

---

## 12. İlk Uygulanacak Dosya Bazlı Değişiklikler

### İlk paket

#### `docs/audit/feature-registry.yaml`

- Bütün mevcut PASS kayıtlarını gerçek durumlara çevir.
- Placeholder ve simulated alanları açıkça işaretle.

#### `apps/web/src/App.tsx`

- Keyword response generator'ı production yolundan çıkar.
- Mock graph ve mock attachment'ı demo moduna taşı.
- Chat'i gerçek API client katmanına ayır.

#### `apps/web/src/components/AIMissionControlPanel.tsx`

- Sabit simulationSteps loglarını kaldır.
- Event stream tüket.
- API hatasında `failed` göster.

#### `server.ts`

- `/api/simulate-task` endpointini `/api/demo/simulate-task` olarak ayır.
- Production route'unda mock fallback'i kaldır.
- Gerçek task run endpointlerini API router'a taşı.

#### `apps/api/src/auth.ts`

- Shared token modelini yalnız operator/bootstrap kullanımına indir.
- Gerçek user principal adapter ekle.

#### `apps/api/src/index.ts`

- Router'ı modüllere ayır.
- Bütün task route'larını project scope altına al.
- Audit actor'ı principal'dan çöz.
- `/db/configure` production yolunu kaldır.

#### `apps/api/src/PermissionKernelService.ts`

- DB error fallback'ini deny yap.
- Eksik boundary ID'lerini deny yap.

#### `packages/core/src/repo-adapter.ts`

- Realpath/symlink/atomic write/lease kontrolü ekle.
- Secret write davranışını explicit failure yap.
- GitHub adapter implementasyonunu başlat.

#### `packages/context/src/index.ts`

- Tokenizer interface.
- AST-aware chunker.
- Semantic search interface.
- Graph traversal dependency injection.
- Tek canonical 50K limit.

#### `scripts/validate-ai-cockpit.ts`

- Kaynak string testi olmaktan çıkar.
- Playwright E2E'ye dönüştür veya kaldır.

#### `scripts/validate-stage-35.ts`

- DB yoksa PASS üretme.
- Integration testi DB olmadan `BLOCKED`/non-zero dönmeli.

#### `.github/workflows/ci.yml`

- Gerçek CI matrix ekle.

---

## 13. Yerel Doğrulama Komutları

Repository yerel makinede açıldığında önce gerçek scriptleri doğrula:

```bash
git status --short
git rev-parse HEAD
node --version
corepack --version
pnpm --version
cat package.json
```

Kurulum:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Mevcut baseline:

```bash
pnpm run typecheck
pnpm run build
pnpm run test:deterministic
pnpm run test:db
pnpm run secret-scan
```

Yeni kalite kapıları eklendikten sonra:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run test:contract
pnpm run test:integration
pnpm run test:security
pnpm run test:e2e
pnpm run build
pnpm run audit:feature-registry
```

Her komut için:

- Exit code
- stdout
- stderr
- test sayısı
- skip sayısı
- duration
- commit SHA

kanıt olarak kaydedilmelidir.

---

## 14. Kabul Edilmeyecek “Tamamlandı” Beyanları

Aşağıdakiler PASS sayılmaz:

- UI paneli açılıyor.
- Buton tıklanıyor.
- Route 200 dönüyor.
- Mock DB çalışıyor.
- Provider yokken fallback sonuç geliyor.
- Dosyada beklenen string bulunuyor.
- Service method mevcut.
- `assert(true)` geçiyor.
- Stage dokümanı “verified” diyor.
- Feature Registry PASS diyor.
- Typecheck tek başına geçiyor.
- Sabit loglar başarı gösteriyor.
- Local simulation “deterministic” diye production sonucu gibi sunuluyor.

Bir özellik yalnız şu zincirle PASS olur:

```text
Real user entry
→ Authenticated principal
→ Project scope
→ Policy
→ Domain logic
→ Persistence/provider/worker
→ Event/evidence
→ Error/recovery
→ Automated tests
→ Manual verification
```

---

## 15. Nihai Karar

### Korunacak alanlar

- Domain servisleri
- Task FSM yaklaşımı
- Evidence/Event mimarisi
- CAS temeli
- Graph persistence
- Context classification/ranking temeli
- Audit yaklaşımı
- Monorepo paket ayrımı

### Yeniden bağlanacak alanlar

- Chat
- Mission Control
- Context pack UI
- Graph UI
- Provider UI
- Health UI
- Navigation placeholder'ları

### Sertleştirilecek alanlar

- Authentication
- Project authorization
- Permission Kernel
- Repo adapter
- DB admin işlemleri
- Secret management
- Test altyapısı
- CI

### Son hüküm

```text
Sistem tamamen yeniden yazılmamalı.
Çekirdek backend üzerine production-grade güvenlik, gerçek runtime ve gerçek UI entegrasyonu kurulmalı.
Mevcut haliyle production yayınına uygun değildir.
```

---

## 16. Bu Belgenin Kullanım Kuralı

Bu belge, aşağıdaki eski dosyaların yerine geçer:

- Önceki bağımsız denetim Markdown'u
- Önceki genel onarım/runbook Markdown'u

Yeni değişikliklerden sonra doğrulama yapılırken:

1. Güncel HEAD SHA kaydedilir.
2. Bu belgedeki her P0/P1/P2 bulgu dosya bazında yeniden kontrol edilir.
3. Runtime testleri çalıştırılır.
4. Yalnız kanıt üreten maddeler kapatılır.
5. Belge yeni SHA ve sonuçlarla revize edilir.

**Kaynak kod değişmeden yalnız doküman güncellenerek hiçbir bulgu kapatılamaz.**

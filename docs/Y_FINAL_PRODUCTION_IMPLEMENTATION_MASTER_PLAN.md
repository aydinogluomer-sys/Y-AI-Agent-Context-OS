# Y — AI Agent Context OS
# FINAL PRODUCTION IMPLEMENTATION MASTER PLAN

> **Canonical product direction:** AI Software Engineering Agent Context + Governance Control Plane
> **Teknik konumlandırma:** Context + Change Firewall for AI Coding Agents
> **Üç sütun:** CONTROL — CONTEXT — PROOF

| Alan | Değer |
|---|---|
| Belge sürümü | 1.0 |
| Oluşturulma tarihi | 2026-08-13 |
| Audit baseline commit | `9f10f70` (`main`) |
| Audit yöntemi | Kaynak kod okuması + route/schema/grep doğrulaması |
| Faz sayısı | 21 (P00 → P20) |
| Belge yapısı | Bu omurga + `docs/plan/phases/PXX-*.md` faz dosyaları |
| Durum | Implementation'a hazır — production koduna henüz dokunulmadı |

---

## 0. BU BELGE HAKKINDA

### 0.1 Amaç

Bu belge, Y'yi bugünkü halinden **production release**'e götüren tek kanonik yol haritasıdır. Bu belgeyi ve `docs/plan/phases/` altındaki faz dosyalarını takip eden bir kıdemli mühendis veya Claude Code oturumu, başka hiçbir roadmap belgesine ihtiyaç duymadan projeyi bitirebilmelidir.

### 0.2 Bu belgenin kanıt standardı

Repository'deki **hiçbir** mevcut belgeye, `PASS`, `verified`, `implemented`, `production-ready`, faz numarası veya feature registry kaydına güvenilmemiştir.

Bu belgedeki her "mevcut durum" iddiası aşağıdakilerden en az biriyle doğrulanmıştır:

- İlgili kaynak dosyanın okunması (dosya + satır referansı verilmiştir),
- Route/handler kayıt sırasının doğrulanması,
- `apps/api/src/db.ts` içindeki inline migration SQL'inin kolon kolon karşılaştırılması,
- Grep ile çağrı sayımı (bir fonksiyon import ediliyor ama çağrılmıyorsa bu ayrıca not edilmiştir).

**Kod ile doküman çeliştiğinde kod esas alınmıştır.** Çelişkiler §1.6'da listelenmiştir.

### 0.3 Belge topolojisi

```text
docs/
├── Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md   ← bu dosya (omurga + matrisler + Appendix A–N)
└── plan/phases/
    ├── P00-truth-audit-and-scope-freeze.md
    ├── P01-canonical-architecture-and-contracts.md
    ├── P02-identity-tenant-authorization.md
    ├── P03-secure-repository-ingestion.md
    ├── P04-static-analysis-and-symbols.md
    ├── P05-persistent-knowledge-graph.md
    ├── P06-hybrid-retrieval-engine.md
    ├── P07-context-firewall.md
    ├── P08-dynamic-context-compiler.md
    ├── P09-context-provenance-manifest.md
    ├── P10-change-firewall.md
    ├── P11-agent-adapter-layer.md
    ├── P12-real-agent-runtime.md
    ├── P13-realtime-events-and-approvals.md
    ├── P14-evidence-audit-cas-consolidation.md
    ├── P15-ui-product-consolidation.md
    ├── P16-evaluation-and-benchmark-harness.md
    ├── P17-security-hardening.md
    ├── P18-reliability-observability-performance.md
    ├── P19-cicd-deployment-migration.md
    └── P20-final-production-acceptance.md
```

Her faz dosyası §5.3'teki 30 başlıklı zorunlu şablonu taşır.

### 0.4 Task ID şeması

```text
Y-PNN-TTT
     │   └── faz içi sıra numarası (001'den başlar, deterministik)
     └────── faz numarası (00–20)

Örnek: Y-P06-014 — Implement hybrid ranking
```

Task ID'leri değişmez. Bir task iptal edilirse ID yeniden kullanılmaz; `CANCELLED` olarak işaretlenir.

---

## 1. TRUTH AUDIT — REPOSITORY'NİN GERÇEK DURUMU

> Bu bölümün genişletilmiş hali: [P00 — Truth Audit & Scope Freeze](plan/phases/P00-truth-audit-and-scope-freeze.md)

### 1.1 Fiziksel topoloji

| Katman | Gerçek durum |
|---|---|
| HTTP listener | `server.ts` — tek `express()` app, `app.listen` (L310) |
| API mount | `server.ts:15` → `app.use("/api", apiRouter)` |
| `apps/api` | **Server değil.** `apps/api/src/index.ts` yalnızca `apiRouter` + `apiReady` export eder |
| API router boyutu | `apps/api/src/index.ts` = **7.170 satır**, tek `Router()`, ~200 route inline |
| Web app | `apps/web/src/App.tsx` (970 satır, tek component). `src/App.tsx` 3 satırlık re-export shim'dir |
| Router (frontend) | **Yok.** `useState<TabId>` + `switch (activeTab)` — react-router repo'da hiç yok |
| Workspace paketleri | `packages/{shared,security,core,context,graph,agents,providers,connectors,ui,node-domexception}` |
| Worker | `workers/index-worker.ts` — ayrı process, `npm run worker:index` ile manuel başlatılır |
| Schema | **Hiç `.sql` dosyası yok.** 35 migration, `apps/api/src/db.ts` içinde inline string array (`migrationVersions`, L1070-2174) |

### 1.2 Subsystem gerçeklik tablosu

| Subsystem | Verdict | Kanıt |
|---|---|---|
| Audit log | **REAL** | `audit_logs` (`db.ts:1182`), `apps/api/src/audit.ts`, redaksiyon uygulanıyor |
| Event Store | **REAL (append-only)** | `event_records` + `block_event_records_mutation()` trigger (`db.ts:1868-1885`); **hash chain yok** (`prev_hash` kolonu yok) |
| Evidence Store | **REAL** | `EvidenceStoreService.ts:94` SHA-256, `verifyEvidenceRecord` L463-530 yeniden hesaplayıp karşılaştırıyor. Integrity var, **authenticity yok** |
| Artifact CAS | **REAL (DB-backed)** | `cas_blobs` + `artifact_versions`, `UNIQUE(project_id, cas_hash)` dedup |
| Context Object Store | **REAL** | `context_objects` + `refs`, SHA-256 dedup, stale/quarantine lifecycle |
| File Locking | **REAL** | `file_locks`, expiry + stale release |
| Worker Registry | **REAL (bookkeeping)** | `worker_registry`, `FOR UPDATE SKIP LOCKED` claim (`index-job-service.ts:311-331`) |
| Knowledge Graph | **REAL, persisted** | `graph_nodes`/`graph_edges`; retrieval skorlamasında kullanılıyor. Ama **manuel sync**, ve filesystem'den değil `context_items`'tan üretiliyor |
| Static analysis | **REAL, TypeScript-only** | `TypeScriptASTParser` gerçek `typescript` compiler kullanıyor (`static-analysis.ts:193`). Diğer diller regex fallback; dil `typescript`/`javascript` olarak hard-code |
| Path security | **REAL** | realpath containment + symlink escape (`repo-adapter.ts:112-158`), denylist, 5MB limit, binary detect, read-time redaksiyon |
| Repository ingestion (Git) | **ABSENT** | Repo'da **hiç Git entegrasyonu yok**. `child_process`/`simple-git`/`isomorphic-git` yok. `ReadOnlyGitHubRepoAdapter` her metodda `ok:false` döner |
| Chunking | **REAL ama character-based** | `content.slice(i, i + charsPerChunk)`, `charsPerToken = 4` (`packages/context/src/index.ts:317-344`) |
| Symbol index | **ABSENT** | `symbols` tablosu yok. `POST /static-analysis/analyze-file` sonucu yalnızca HTTP response'ta döner, hiçbir INSERT yok. Sadece `exports` alanı `graph_nodes.metadata`'ya sızıyor |
| Semantic retrieval | **SIMULATED** | `mockSemanticSearchFallback()` = keyword overlap (`context/src/index.ts:634-666`). `context_chunks.embedding_id` **her zaman NULL** |
| "BM25" | **Yanlış isimlendirme** | `scoreKeywordBM25` = `matches/queryWords*40 + 15`. IDF yok, TF yok, length norm yok |
| Tokenizer | **SIMULATED** | İki tutarsız tahminci: `estimateTokens` (byte/word heuristic) ve `chars/4`. Gerçek BPE yok |
| Token budget | **Hard-coded 50.000** | 3 ayrı yerde; ayrıca çelişen `4000` default (`retrieval-ranking-service.ts:287`) |
| Context manifest | **PARTIAL + FABRICATED** | Gerçek reason code'lar var; ama `direct_dependencies`/`reverse_dependencies` literal stub, `recent_diffs` uydurma (`author: "User-Aydinoglu", line_changes: "+45 -12"`), `quality_gates` statik dizi, `metadata.secret_scanned: true` koşulsuz |
| **Agent runtime** | **FAKED** | `POST /projects/:projectId/tasks/:taskId/runs` (`index.ts:296-377`) 4 event yazıp `status: "completed"` döner. **Hiçbir şey çalıştırmaz.** `selectedItemsCount: 3` literal |
| Agent adapters (Claude Code / Codex) | **ABSENT** | `@anthropic-ai/*` ve `openai` dependency yok. Tek gerçek provider `@google/genai`, yalnızca `server.ts`'in `/api/simulate-task`'ı kullanıyor |
| Provider health | **SIMULATED** | `GET /providers/health` sadece `process.env` varlığına bakar; "Live Connectivity Probes" yorumu yanlış |
| Quality gates | **REAL storage, NO execution** | `QualityGateService` caller'ın gönderdiği `{status, exit_code, raw_output}` verisini kaydeder. Sunucu hiçbir zaman lint/typecheck/build çalıştırmaz |
| Real-time (SSE/WS) | **ABSENT** | `text/event-stream` yok, `EventSource` yok, WebSocket app kodu yok, browser polling de yok |
| UI | **103/113 fabricated** | 113 nav item, 11 gerçek `case`. Kalan 102 + chat-cockpit → `ModuleSimulationPanel` / `setTimeout` teatrosu |

### 1.3 P0 GÜVENLİK BULGULARI (release blocker)

| # | Bulgu | Konum | Etki |
|---|---|---|---|
| **P0-1** | `GET /api/auth/dev-session` **auth'suz**, `role:"admin"`, `projectIds:["*"]` token dağıtır. `ENABLE_MOCK_DB=true` + non-prod yeterli. **Yerel `.env` dosyasında `ENABLE_MOCK_DB=true` yazıyor** | `apps/api/src/index.ts:100-115`, `auth.ts:111-129` | Porta erişen herkes tam admin |
| **P0-2** | `POST /api/db/configure` gövdeden connection string alır, global `db`'yi runtime'da değiştirir, **düz metin parolayı `<cwd>/.env`'e yazar**, ardından migration çalıştırır | `index.ts:1024-1140` | SSRF + credential harvest + kalıcı config zehirlenmesi |
| **P0-3** | HS256 JWT anahtarı `JWT_SECRET \|\| Y_API_AUTH_TOKEN`. `JWT_SECRET` yoksa **paylaşımlı API token'ı JWT imzalama anahtarı olur** | `auth.ts:201` | Token sahibi `role:"admin"` + istediği `project_ids` ile JWT üretir |
| **P0-4** | Authorization **tamamen token claim'i / env**. DB-backed kontrol `principalCanAccessProjectAsync` **import edilip hiç çağrılmıyor**; hedeflediği `project_memberships(user_id)` tablosu **yok** (şemada `memberships(user_email)` var), hata `catch {}` ile yutuluyor | `auth.ts:398-430`, `index.ts:82` | Cross-project izolasyon DB tarafından hiç doğrulanmıyor |
| **P0-5** | Permission Kernel `NODE_ENV=test \|\| CI=true \|\| ALLOW_STATIC_POLICY_FALLBACK \|\| DETERMINISTIC_TEST_MODE` iken DB hatasında **statik allow listesine** düşer | `PermissionKernelService.ts:67-147` | `CI=true` set eden her deployment allow-by-default olur |
| **P0-6** | `enforce()` çağrılarının neredeyse tamamı subject'i `{subject_type:"system"}` olarak hard-code ediyor; seed policy `policy-system-bypass` = `allow / system / * / *` | `EvidenceStoreService.ts:231`, `EventStoreService.ts:205`, `ContextObjectStoreService.ts:273`, `ArtifactCASService.ts:442/513/628/667`, `repo-adapter-service.ts:132`, `db.ts:2090` | Mevcut enforcement noktalarının çoğu **her zaman allow** döner |
| **P0-7** | `POST /projects/:id/permissions/evaluate` client'ın gönderdiği `subject` nesnesini spread ediyor (`...subject`) | `index.ts:4402` | Caller `subject_type:"system"` veya `roles:["admin"]` set edip allow alabilir; `PERMISSION_BYPASS_USED` audit satırı yazdırır |
| **P0-8** | Unscoped route'lar `principalCanAccessProject` çağırmıyor: `PATCH/DELETE /context-items/:id`, `POST /context-packs/:id/rehydrate`, `POST /context/isolated-retrieve`, `GET /audit-logs` (tüm projelerin logu), `/resume-schedules/*`, `/agent-sessions/:id`, `/handoffs/:id` | `index.ts:3235, 3366, 4831, 3562, 1194, 5963, 5982, 6044, 6103-6141` | IDOR / cross-project okuma-yazma |
| **P0-9** | `POST /projects/:id/repo/configure-local` keyfi mutlak `root_path` kabul eder; `RepoAdapterService` bunu `LocalFilesystemRepoAdapter`'a verir. Yapılandırılmamışsa default root `"."` = **sunucunun kendi cwd'si** | `index.ts:4632`, `repo-adapter-service.ts:22-46` | API keyfi dizin okuyucusuna dönüşür (denylist içi kısmi koruma var) |
| **P0-10** | `ContextObjectStoreService.ts:219` client kaynaklı `source_table` değerini SQL'e string interpolation ile koyuyor | `index.ts:2443/2459` | FROM clause attacker-controlled; hata `catch` ile yutuluyor |
| **P0-11** | `packages/security/src/index.ts:23-25` **gerçek bir DB parolasını** iki parçaya bölüp runtime'da birleştiriyor (`["EJfZexrU6o","YdPpxH"]`); L48'de Supabase project ref hard-code | git history | Sır git geçmişinde, önemsiz şekilde geri çevrilebilir |
| **P0-12** | `useWorkspace.ts:103-127` `GET /api/config/inspect` yanıtını regex'leyip **düz metin DB parolasını React state'e** yazıyor | `apps/web/src/hooks/useWorkspace.ts` | Parola DOM'da bir `<input>` value'sunda |

### 1.4 Kırık kod ↔ şema drift'i (gerçek 500'ler)

| Kod beklentisi | Şema gerçeği | Sonuç |
|---|---|---|
| `projects.organization_id` (`index.ts:189-191`) | kolon yok | `GET /api/projects` — `org_id` taşıyan her JWT principal için **500 (42703)** |
| `tasks.assigned_to` (`index.ts:237`) | kolon yok | `PATCH /projects/:pid/tasks/:tid {assigned_to}` → 500 |
| `permission_policies.project_id` / `.is_system` (`index.ts:4377`) | ikisi de yok | `GET /projects/:id/permission-policies` gerçek Postgres'te **her zaman 500** (UI bunu çağırıyor) |
| `audit_logs(category, actor_role, is_approved_by_human)` (`repo-adapter-service.ts:104-120`) | kolonlar yok, `await` try/catch'siz | `safeReadFile`/`safeListFiles` throw eder → `/repo/file`, `/repo/files` gerçek Postgres'te 500 (yalnızca mock DB'de çalışır) |
| `project_memberships(project_id, user_id)` (`auth.ts:419`) | yalnızca `memberships(user_email)` | DB-backed authz kalıcı olarak `false` döner, hata yutulur |

### 1.5 Ölü şema ve ölü kod

**Hiç okunmayan/yazılmayan tablolar:** `memberships` (0 referans — DB'deki tek membership modeli, kullanılmıyor), `artifacts`, `connections`.
**Yalnızca yazılan, hiç okunmayan:** `context_summaries`, `durable_memories`, `boundary_checks`, `repo_access_logs`.
**Okunan ama hiç yazılmayan:** `debug_logs` (`AgentDebugService` process-static `Map` kullanıyor → restart'ta kayıp).

**Ölü frontend kodu:** `apps/web/src/features/landing/*` (0 importer), `hooks/useKnowledgeGraph.ts`, `hooks/useSecurityVault.ts`, `modules/command/ProjectDashboard.tsx`, `App.tsx:709 renderPlaceholderView` (tanımlı, hiç çağrılmıyor), ve `cockpitLaunched=true` başlangıç değeri yüzünden tek gizli butonun arkasında kalan ~2.300 satırlık `LandingPage`+`CyberCanvas` sinematiği.

**Ölü route'lar:** `router.all(["/tasks","/tasks/*"])` → 410 (`index.ts:166-173`) daha sonra kaydedilen ~25 `/tasks/...` handler'ını öldürüyor. Frontend hâlâ bunlardan 10+ tanesini çağırıyor (`apps/web/src/lib/api/tasks.ts:76-196`) → sessizce 410.

**Client↔server sözleşme kırıkları:** `WorkerRuntimeDashboard.tsx` `/workers/claim-job`, `/complete-job`, `/fail-job`, `/activate` çağırıyor; sunucuda `/workers/claim`, `/complete`, `/fail` var, `/activate` hiç yok → 404.

### 1.6 Doküman ↔ kod çelişkileri

| İddia | Kaynak | Gerçek |
|---|---|---|
| "15 kategori ve 78 UI route" | `docs/audit/02-route-inventory.md` | 15 kategori, **113 item** |
| 12 API endpoint | `docs/audit/03-api-inventory.md` | **~200 route** |
| "Tüm 15 kategori PASS" | `docs/audit/10-feature-traceability-matrix.md` | 103/113 ekran fabrikasyon |
| "162 assertion, 0 failure" | `docs/audit/08-test-inventory.md` | Assertion'ların önemli kısmı `assert("...", true)` |
| Stage 27–35 "SUCCESSFUL PASS" | `docs/stages/*.md` | Dayandığı suite CI'da **migration'lardan önce** çalışıyor; DB dalları sandbox'a düşüyor |
| "Phase 8 Cockpit UX Overhaul tamamlandı" | `README.md:332` | `awwwards-loop/state.json`: `"hardGatesPassed": false, "lastScore": null` |
| `qa-debug-tags` "fdescribe/fit reddeder" | `README.md:84` | Script'te bu stringler **yok** |
| `test:db` "0 failure, 0 skip ile geçti" | `implementation.md:25` | `test:db` CI'da **hiç çalışmıyor** |

### 1.7 Test ve CI gerçekliği

- **Unit test framework yok.** vitest/jest/mocha yok, `*.test.ts` runner yok. `packages/context/test/retrieval-isolation.test.ts` el yazımı bir assert scripti ve **hiçbir yerden çağrılmıyor**.
- **E2E:** `tests/e2e/smoke.spec.ts` — 2 test. `expect(status).toBeLessThan(400)` (boş sayfa geçer) ve `expect(status).toBeLessThan(500)` (401 ve 404 geçer).
- **CI:** `.github/workflows/ci.yml` — typecheck ✓, secret-scan ✓, `test:deterministic` (migration'lardan **önce**), `db:migrate`, Playwright **kurulur ama çalıştırılmaz**, build ✓. `test:e2e` adımı hiç yok. `test:db` hiç yok. Lint yok (`lint` = `tsc --noEmit`, eslint dependency'si yok).
- **`assert(..., true)` sayımı:** `validate-vault.ts` 21, `validate-segment-20-26.ts` 10, `validate-segment-19-21.ts` 8, `validate-stage-34.ts` 6, `validate-stage-35.ts` 6.
- **Skip detector'da delik:** `validation-suite.ts:16-23` regex'leri `"Skipping real DB assertions."` (stage 32, 33) ifadesini yakalamıyor → bu skip'ler strict modda bile görünmez.
- **`secret-scan.ts`** `validate-*` ile başlayan her dosyayı ve `scratch/` ağacını atlıyor → 15.000 satır script sır taramasından muaf.

### 1.8 Scope freeze kararı

Aşağıdakiler **primary product scope dışıdır** ve bu planda ayrı ürün alanı olarak geliştirilmeyecektir (Appendix N):

```text
multi-agent council / agent social UI     cinematic mission control
standalone CAS ürünü                       standalone event explorer
standalone artifact manager                dekoratif cybernetic UI
particle/canvas landing deneyimi           40+ ayrı dashboard
```

Bunların bir kısmı **headless backend capability** olarak korunur (Appendix E), bir kısmı silinir.

---

## 2. CANONICAL ARCHITECTURE (HEDEF)

```text
                         Developer / Team
                                │
                                ▼
        ┌───────────────────────────────────────────────┐
        │                     Y                          │
        │      Context + Governance Control Plane        │
        │                                                │
        │  CONTROL          CONTEXT           PROOF      │
        │  ───────          ───────           ─────      │
        │  Identity         Repo Intel        Events     │
        │  Membership       AST/Symbols       Evidence   │
        │  Policies         Graph             CAS        │
        │  Context FW       Retrieval         Audit      │
        │  Change FW        Compiler          Gates      │
        │  Approvals        Manifest                     │
        └───────────────────────┬───────────────────────┘
                                │  AgentAdapter
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
        Claude Code          Codex          Other adapters
```

Detaylı ASCII mimari: **Appendix A**. Veri akışı: **Appendix B**. Modül haritası: **Appendix C**.

### 2.1 Golden path (production'da gerçek çalışması zorunlu)

```text
Login → Org/Project → Repo Connect → Ingestion → Static Analysis → AST/Symbol Index
  → Dependency Graph → Hybrid Index → Task Create → Identity + Scope → Policy Resolution
  → Task Understanding → Candidate Discovery → Hybrid Retrieval → Graph Expansion
  → Security Filtering → Ranking → Token Budget → Compilation → Manifest
  → Agent Dispatch → Tool/File/Command Events → Change Firewall → Approval
  → Tests / Quality Gates → Evidence → Audit → Persistent Run Result
```

Bu zincirin tek bir halkası simülasyon kalırsa proje **tamamlanmış sayılmaz**.

### 2.2 Yedi çekirdek capability

```text
1. Repository Intelligence     → P03, P04, P05
2. Task-Aware Retrieval        → P06
3. Context Compiler            → P08
4. Context Firewall            → P07
5. Change Firewall             → P10
6. Agent Integration           → P11, P12, P13
7. Evidence + Governance       → P14
```

---

## 3. MIGRATION STRATEGY — PARALEL KANONİK YÜZEY + CUTOVER

**Karar (ADR-001).** Mevcut 7.170 satırlık `apps/api/src/index.ts` ve 113 sekmeli UI yerinde refactor edilmeyecek; **yanına kanonik yüzey kurulacak** ve faz faz cutover yapılacaktır.

```text
apps/api/src/
├── index.ts                    LEGACY — faz faz boşaltılır, P19'da silinir
├── app.ts                  NEW  kanonik Express app factory (helmet/cors/rate-limit/body-limit)
├── routes/                 NEW  kanonik API yüzeyi
│   ├── auth.ts  orgs.ts  projects.ts  repositories.ts
│   ├── tasks.ts  runs.ts  context.ts  policies.ts
│   ├── approvals.ts  evidence.ts  admin.ts
├── middleware/             NEW  authn, authz, tenant-scope, error, correlation-id
└── domain/                 NEW  use-case katmanı (route'lar ince kalır)

apps/web/src/
├── App.tsx                     LEGACY switch — P15'te kaldırılır
├── surfaces/               NEW  5 birincil yüzey
│   ├── projects/  tasks/  context/  policies/  evidence/
├── advanced/               NEW  role-gated ileri araçlar
└── (legacy 113 tab)            ADVANCED / HIDDEN / DELETE — Appendix E'ye göre
```

**Cutover kuralları:**

1. Yeni route'lar `/api/v1/*` altında doğar. Legacy `/api/*` yüzeyi korunur ama **yeni özellik almaz**.
2. Her fazın exit gate'i, o fazın kanonik route'larının gerçek Postgres'e karşı integration testiyle geçmesidir.
3. Bir legacy route'un yerini kanonik karşılığı aldığında legacy route **410 + `Sunset` header** döner (Appendix J).
4. Frontend cutover'ı `Y_UI_SURFACE=v2` feature flag'iyle yapılır; flag P15 exit gate'inde default `true` olur, P19'da flag silinir.
5. **Hiçbir fazda** legacy ve kanonik yüzey aynı tabloya farklı invariant'larla yazamaz. Ortak yazım noktaları `domain/` katmanına taşınır.

**ADR kaydı.** Her fazda alınan mimari kararlar `docs/adr/ADR-NNN-*.md` olarak `Decision / Alternatives / Chosen / Reason / Consequences` formatında yazılır.

---

## 4. TEKNOLOJİ KARARLARI (gerekçeli)

| Konu | Karar | Gerekçe |
|---|---|---|
| **Queue** | **PostgreSQL-backed queue** (`FOR UPDATE SKIP LOCKED`) | Repo'da zaten çalışan bir örüntü var (`index-job-service.ts:311-331`). Redis/BullMQ yeni bir operasyonel bağımlılık, yeni bir failure domain ve yeni bir backup hedefi getirir. Golden path'in ihtiyacı olan throughput (proje başına onlarca run/saat) Postgres queue için fazlasıyla yeterli. Ölçek gerekirse P18'de yeniden değerlendirilir — **ADR-004** |
| **Real-time** | **SSE** (`text/event-stream`) | Trafik tek yönlü (server→client). WebSocket iki yönlülük, ayrı auth el sıkışması, proxy/LB uyumsuzluğu ve heartbeat yönetimi getirir. Approval yanıtları normal `POST` ile döner. Reconnect `Last-Event-ID` ile — **ADR-005** |
| **Git erişimi** | **`isomorphic-git` + native `git` CLI hibriti** | Local adapter için native `git` (hızlı, `git diff`/`log` doğrudan), hosted API'ler (GitHub/GitLab) için REST + shallow clone. `child_process` çağrıları allow-list'li argüman dizisiyle (`execFile`, shell yok) — **ADR-006** |
| **Parser** | **tree-sitter** (TS/JS/TSX/JSX/Python/SQL/YAML/JSON/Markdown) | Mevcut `typescript` compiler parser'ı TS için korunur; çok dilli genişleme için tree-sitter tek tutarlı arayüz sunar. Plugin contract'ı `LanguageParser` interface'i — **ADR-007** |
| **Vector store** | **pgvector** (aynı Postgres) | `context_chunks.embedding_id` kolonu zaten var ama hep NULL. Ayrı vector DB, cross-store tenant izolasyonu ve iki fazlı tutarlılık problemi yaratır. pgvector ile embedding ve policy aynı transaction'da kalır — **ADR-008** |
| **Embedding sağlayıcı** | Provider-agnostic `EmbeddingProvider` interface | Vendor-neutral ürün tezi embedding'e de uygulanır; tek sağlayıcıya hard-code edilmez — **ADR-009** |
| **Tokenizer** | Provider başına gerçek tokenizer, `Tokenizer` interface arkasında | `chars/4` bütçe hesabını sistematik olarak yanıltıyor. Deterministik manifest gerçek sayım gerektirir — **ADR-010** |
| **Unit test runner** | **vitest** | Vite zaten bağımlılık; ESM/TS yapılandırması sıfıra yakın; workspace desteği paket başına test verir — **ADR-011** |
| **Auth** | OIDC (Authorization Code + PKCE) + **async** JWKS + DB-backed membership | `auth.ts`'teki JWKS kodu zaten var ama request path'inde ölü. `jose` kütüphanesine geçilir; el yazımı JWT doğrulama silinir — **ADR-002** |
| **Frontend routing** | **react-router** (URL = state) | Bugün URL hiç değişmiyor: deep-link, geri/ileri ve refresh imkânsız. Run/evidence paylaşılabilir link olmadan governance ürünü olmaz — **ADR-012** |

---

## 5. FAZ HARİTASI

### 5.1 Faz indeksi

| Faz | Başlık | Workstream | Bağımlılık | Dosya |
|---|---|---|---|---|
| **P00** | Truth Audit & Scope Freeze | — | — | [P00](plan/phases/P00-truth-audit-and-scope-freeze.md) |
| **P01** | Canonical Architecture & Domain Contracts | tümü | P00 | [P01](plan/phases/P01-canonical-architecture-and-contracts.md) |
| **P02** | Identity / Tenant / Authorization Foundation | B | P01 | [P02](plan/phases/P02-identity-tenant-authorization.md) |
| **P03** | Secure Repository Ingestion | A | P02 | [P03](plan/phases/P03-secure-repository-ingestion.md) |
| **P04** | Static Analysis & Symbol Intelligence | A | P03 | [P04](plan/phases/P04-static-analysis-and-symbols.md) |
| **P05** | Persistent Knowledge Graph | A | P04 | [P05](plan/phases/P05-persistent-knowledge-graph.md) |
| **P06** | Hybrid Retrieval Engine | A | P05 | [P06](plan/phases/P06-hybrid-retrieval-engine.md) |
| **P07** | Context Firewall | B | P02, P04 | [P07](plan/phases/P07-context-firewall.md) |
| **P08** | Dynamic Context Compiler | A | P06, P07 | [P08](plan/phases/P08-dynamic-context-compiler.md) |
| **P09** | Context Provenance / Manifest | A+D | P08 | [P09](plan/phases/P09-context-provenance-manifest.md) |
| **P10** | Change Firewall | B | P05, P07 | [P10](plan/phases/P10-change-firewall.md) |
| **P11** | Agent Adapter Layer | C | P01 | [P11](plan/phases/P11-agent-adapter-layer.md) |
| **P12** | Real Agent Runtime | C | P09, P10, P11 | [P12](plan/phases/P12-real-agent-runtime.md) |
| **P13** | Real-Time Events & Approvals | C+D | P12 | [P13](plan/phases/P13-realtime-events-and-approvals.md) |
| **P14** | Evidence / Audit / CAS Consolidation | D | P12, P13 | [P14](plan/phases/P14-evidence-audit-cas-consolidation.md) |
| **P15** | UI/UX Product Consolidation | E | P09, P13, P14 | [P15](plan/phases/P15-ui-product-consolidation.md) |
| **P16** | Evaluation & Benchmark Harness | F | P12, P14 | [P16](plan/phases/P16-evaluation-and-benchmark-harness.md) |
| **P17** | Security Hardening | B | P10, P13 | [P17](plan/phases/P17-security-hardening.md) |
| **P18** | Reliability / Observability / Performance | F | P12, P14 | [P18](plan/phases/P18-reliability-observability-performance.md) |
| **P19** | CI/CD / Deployment / Migration | F | P15, P17, P18 | [P19](plan/phases/P19-cicd-deployment-migration.md) |
| **P20** | Final Production Acceptance | tümü | P16, P19 | [P20](plan/phases/P20-final-production-acceptance.md) |

### 5.2 Dependency graph

```text
                              P00
                               │
                              P01
                               │
                              P02 ──────────────┬──────────────┐
                               │                │              │
                              P03              P07            P11
                               │                │              │
                              P04 ──────────────┤              │
                               │                │              │
                              P05 ──────┬───────┤              │
                               │        │       │              │
                              P06       │       │              │
                               │        │       │              │
                               └────────┴──►   P08             │
                                                │              │
                                               P09 ────────────┤
                                                │              │
                                        P05+P07─┴──► P10 ──────┤
                                                               │
                                                              P12
                                                               │
                                                              P13
                                                               │
                                                              P14
                                                    ┌──────────┼──────────┐
                                                    ▼          ▼          ▼
                                                   P15        P16        P18
                                                    │          │          │
                                          P10+P13─► P17        │          │
                                                    │          │          │
                                                    └────► P19 ◄──────────┘
                                                            │
                                                           P20
```

### 5.3 Her faz dosyasının zorunlu şablonu

```text
Phase ID · Objective · Why This Phase Exists · Dependencies
Current Repository Reality · Target State · Architecture Decisions
Files / Packages Affected · New Files · Files to Modify · Files to Delete/Deprecate
Database Changes · API Changes · Type / Contract Changes
Frontend Changes · Backend Changes · Worker Changes · Security Changes
Migration Strategy · Implementation Tasks · Parallelizable Tasks
Tests · Negative Tests · Security Tests · E2E · Observability
Failure Modes · Rollback / Recovery · Acceptance Criteria · Evidence Required · Exit Gate
```

### 5.4 Critical path

```text
P00 → P01 → P02 → P03 → P04 → P05 → P06 → P08 → P09 → P12 → P13 → P14 → P15 → P19 → P20
```

**Kritik yol dışındaki fazlar** (P07, P10, P11, P16, P17, P18) kendi bağımlılıkları karşılandığı anda paralel yürütülebilir. Ancak **P07 → P08** ve **P10 → P12** bağları kritik yolun kalitesini belirler: bunlar geciktirilirse P12 yeniden yazılır. Bu yüzden P07 ve P10, kritik yol fazlarıyla **eşzamanlı** başlatılmalıdır.

---

## 6. PARALEL WORKSTREAM PLANI

| WS | Ad | Fazlar | Birincil sahiplik alanı |
|---|---|---|---|
| **A** | Context Intelligence | P03, P04, P05, P06, P08, P09 | `packages/core`, `packages/context`, `packages/graph` |
| **B** | Security / Governance | P02, P07, P10, P17 | `apps/api/src/middleware`, `packages/security` |
| **C** | Runtime / Agent Integration | P11, P12, P13 | `packages/adapters` (NEW), `packages/runtime` (NEW), `workers/` |
| **D** | Evidence Platform | P09 (persist), P13 (event contract), P14 | `packages/evidence` (NEW) |
| **E** | UI/UX | P15 | `apps/web/src/surfaces`, `apps/web/src/advanced` |
| **F** | Quality / CI / Ops | P16, P18, P19 | `.github/workflows`, `tests/`, `packages/observability` (NEW) |

### 6.1 Çakışma kuralları (aynı dosyada paralel task yasağı)

| Dosya | Tek sahibi olan faz | Kural |
|---|---|---|
| `apps/api/src/db.ts` (migration array) | Sırayla: P02 → P03 → P04 → P05 → P06 → P09 → P10 → P12 | Migration numaraları çakışamaz; her faz kendi bloğunu alır (Appendix K.1) |
| `apps/api/src/index.ts` | Yalnızca **silme** yönünde değiştirilir | Yeni route asla buraya eklenmez; legacy route kapatma tek commit'te |
| `apps/web/src/App.tsx` | P15 | P15 öncesi hiçbir faz bu dosyaya dokunmaz |
| `packages/shared/src/index.ts` | P01 (ilk sözleşmeler), sonra additive | Breaking değişiklik ADR gerektirir |
| `.github/workflows/ci.yml` | P19 (sahip), diğer fazlar sadece **step ekler** | Mevcut step'ler değiştirilmez |

### 6.2 Integration point'leri

```text
P02 → P07   : Principal + Membership + ProjectScope sözleşmesi
P04 → P05   : SymbolRecord — P05 graph node'ları bu tipten üretir
P05 → P06   : GraphTraversal API  expand(seed, depth, budget)
P06 → P08   : RankedCandidate[] sözleşmesi
P07 → P06/P08: AllowedContextUniverse — retrieval'a girdi, compiler'a filtre
P08 → P09   : CompiledContext → ContextManifest dönüşümü
P09 → P12   : manifest_hash → run kaydı
P10 → P12   : ChangeBoundary → mutation interception
P11 → P12   : AgentAdapter interface (capability negotiation)
P12 → P13   : Run event contract (event_type enum)
P13 → P15   : SSE stream sözleşmesi
P14 → P15   : Run evidence read model
```

---

## 7. FALSE GREEN YASAĞI

Aşağıdakilerin hiçbiri PASS sayılmaz ve hiçbir exit gate'i geçemez:

```text
assert(true)                    DB yoksa skip + pass          provider yoksa mock success
route 200 dönüyor               button render oluyor          source file'da string var
setTimeout tamamlandı           hard-coded event              fake hash
fake metrics                    mock graph                    simulation completed
```

**Zorunlu ayrım.** Simülasyon gerekiyorsa type ve UI seviyesinde açıkça ayrılır:

```ts
// packages/shared/src/index.ts (P01)
type ProvenanceMode = "PRODUCTION" | "DEMO" | "FIXTURE" | "SIMULATED";

interface ProductionRunResult { mode: "PRODUCTION"; /* ... */ }
interface SimulatedRunResult  { mode: "SIMULATED"; simulationReason: string; /* ... */ }
// Production DTO ile simulation DTO aynı tip OLAMAZ.
```

UI'da `mode !== "PRODUCTION"` olan her yüzey kalıcı ve kapatılamaz bir rozet gösterir.

### 7.1 Feature Registry yeniden doğrulama

`docs/audit/feature-registry.yaml` tamamen yeniden üretilir. Statüler:

```text
MISSING · STUB · SIMULATED · PARTIAL · BACKEND_ONLY · UI_ONLY · BLOCKED · BROKEN · PASS
```

`PASS` için **hepsi** zorunlu: implementation · persistence (gerekiyorsa) · policy (gerekiyorsa) · unit test · integration test · E2E (user-facing ise) · negative test · evidence · commit SHA · verification timestamp.

Registry P19'da CI gate'i olur: `scripts/validate-feature-registry.ts` her `PASS` kaydının test referanslarının gerçekten var olduğunu ve son commit'te geçtiğini doğrular.

---

## 8. NASIL ÇALIŞILIR

1. Faz dosyasını aç, `Current Repository Reality` bölümünü **kodla doğrula** (bu belge `9f10f70`'e göre yazıldı; drift olabilir).
2. Task'ları sırayla uygula. `Parallelizable Tasks` bölümündekiler eşzamanlı yürütülebilir.
3. Her task için `Tests` bölümündeki testleri **task ile aynı commit'te** yaz.
4. Faz sonunda `Exit Gate` komutlarını çalıştır, çıktıyı `Evidence Required` formatında kaydet.
5. Exit gate geçmeden bir sonraki faza **geçilmez**. Kritik yol dışındaki fazlar paralel yürüyebilir ama kendi gate'lerinden muaf değildir.
6. Belirsizlikte: repository'yi incele → mimari niyeti çıkar → production-grade en basit çözümü seç → ADR yaz → ilerle.

---
---

# APPENDIX

---

## APPENDIX A — FINAL ARCHITECTURE DIAGRAM

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│                                  CLIENTS                                       │
│   Web UI (5 surface)      CLI          MCP client        CI integration        │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                │ HTTPS  (OIDC access token)
┌───────────────────────────────▼───────────────────────────────────────────────┐
│                          API EDGE  (apps/api/src/app.ts)                       │
│   helmet · cors · rate-limit · body-limit · correlation-id · error handler      │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────────────────┐
│                         AUTHN / AUTHZ MIDDLEWARE                               │
│   OIDC JWKS verify (jose)  →  Principal                                        │
│   DB-backed membership     →  OrgScope + ProjectScope                          │
│   FAIL CLOSED: policy store down → DENY + security event + readyz degraded      │
└───────────────────────────────┬───────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────────────────┐
│                       DOMAIN / USE-CASE LAYER (apps/api/src/domain)             │
│                                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Repository  │  │   Context    │  │    Run       │  │  Governance  │        │
│  │  Management  │  │   Compile    │  │ Orchestration│  │  Approvals   │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
└─────────┼─────────────────┼─────────────────┼─────────────────┼────────────────┘
          │                 │                 │                 │
┌─────────▼─────────────────▼─────────────────▼─────────────────▼────────────────┐
│                             CAPABILITY PACKAGES                                 │
│                                                                                 │
│  packages/core          packages/context        packages/graph                  │
│  ├ RepoAdapter          ├ Retrieval             ├ GraphBuilder                  │
│  ├ Git (iso-git/CLI)    ├ ContextFirewall       ├ Traversal (BFS/DFS)           │
│  ├ Ingestion            ├ Ranker                ├ Invalidation                  │
│  ├ Parsers (tree-sitter)├ TokenBudget           └ ImpactAnalysis                │
│  └ SymbolIndexer        ├ Compiler                                              │
│                         └ ManifestBuilder                                       │
│                                                                                 │
│  packages/security      packages/adapters       packages/runtime                │
│  ├ PermissionKernel     ├ AgentAdapter iface    ├ RunFSM                        │
│  ├ ChangeFirewall       ├ ClaudeCodeAdapter     ├ PgQueue                       │
│  ├ SecretScanner        ├ CodexAdapter          ├ WorkerPool                    │
│  └ PathGuard            └ CapabilityNegotiation └ IdempotencyGuard              │
│                                                                                 │
│  packages/evidence      packages/observability                                  │
│  ├ EventStore (hash chain)  ├ Logger (structured)                               │
│  ├ EvidenceStore            ├ Metrics                                           │
│  ├ ArtifactCAS              └ Tracing (OTel)                                    │
│  ├ AuditLog                                                                     │
│  └ QualityGateRunner                                                            │
└─────────┬────────────────────────────────┬─────────────────────┬───────────────┘
          │                                │                     │
┌─────────▼──────────┐        ┌────────────▼─────────┐  ┌────────▼──────────────┐
│    PostgreSQL      │        │   Worker processes    │  │   Agent processes     │
│  + pgvector        │◄──────►│  index · embed ·      │  │  Claude Code / Codex  │
│  + job queue       │        │  graph · run · gate   │  │  (sandboxed exec)     │
│  (SKIP LOCKED)     │        └───────────────────────┘  └───────────────────────┘
└────────────────────┘
```

---

## APPENDIX B — FINAL DATA FLOW

```text
[1] TASK CREATE
    POST /api/v1/projects/:pid/tasks
    → Principal doğrulanır (JWKS)  → membership DB'den okunur
    → task kaydı (status=created)   → audit(TASK_CREATED, actor=principal.sub)

[2] POLICY RESOLUTION
    PolicyResolver(principal, project, task)
    → ALLOWED CONTEXT UNIVERSE  { allow[], approval[], deny[], policy_version }
    → TASK-DERIVED CHANGE BOUNDARY { expected[], allowed[], approval[], denied[] }
    → her ikisi de run'a immutable olarak bağlanır

[3] CONTEXT COMPILE                                 (worker: context-compiler)
    seed       = TaskUnderstanding(title, description, acceptance_criteria)
    candidates = HybridRetrieval(seed)              lexical ⊕ semantic ⊕ symbol
    candidates = GraphExpand(candidates, depth, node_budget, fan_out_budget)
    candidates = ContextFirewall.filter(candidates, universe)     ← DENY hiç okunmaz
    ranked     = Ranker.score(candidates)           14 sinyal, explainable
    budget     = TokenBudget(provider_limit − system − tools − output − margin)
    compiled   = Compiler.fit(ranked, budget)       gerçek tokenizer ile
    manifest   = ManifestBuilder.build(compiled)    her fragment: hash + reason + policy
    → manifest_hash = sha256(canonical_json(manifest))
    → DETERMINISM: (commit, task, policy_version, compiler_version, config) ⇒ aynı hash

[4] AGENT DISPATCH                                  (worker: run-executor)
    adapter = AdapterRegistry.resolve(project.agent_preference)
    caps    = adapter.negotiate()                   model · ctx limit · tools · MCP
    session = adapter.start(manifest, changeBoundary)

[5] EXECUTION LOOP                                  (her olay için)
    agent → tool_call / file_read / file_write / command
        ├─ file_read  → ContextFirewall.assert(path)        ihlal → BLOCK + event
        ├─ file_write → ChangeFirewall.decide(path)         ALLOW | DENY | ASK_APPROVAL
        │                   └─ ASK_APPROVAL → run.status=awaiting_approval → SSE → UI
        ├─ command    → CommandPolicy.decide(argv)          allow-list
        └─ her olay   → EventStore.append(hash-chained)  +  SSE broadcast

[6] VERIFY                                          (worker: quality-gate)
    QualityGateRunner.execute(project.gates)        gerçek exit code
    → test/lint/typecheck çıktıları CAS'a yazılır

[7] EVIDENCE + AUDIT
    EvidenceBundle {
      manifest_hash, included[], excluded[+reason], policy_decisions[],
      principal, agent identity + caps, tool_calls[], commands[], diff,
      gate results[], approvals[], artifacts[], timestamps, commit_sha
    }
    → content_hash = sha256(canonical_json(bundle))
    → EventStore chain head ile bağlanır (tamper-evident)

[8] READ BACK
    GET /api/v1/runs/:id            → run + manifest + evidence (persist'ten)
    Browser refresh → tam restore    (hiçbir state yalnızca bellekte değil)
```

---

## APPENDIX C — FINAL MODULE MAP (backend capabilities)

| Paket | Modül | Rol | UI görünürlüğü |
|---|---|---|---|
| `packages/shared` | DTO / enum / error types | Sözleşme | — |
| `packages/security` | PermissionKernel | Policy decision (fail-closed) | ADVANCED |
| | ChangeFirewall | Mutation boundary enforcement | PRIMARY (Runs içinde) |
| | ContextFirewall | Allowed context universe | PRIMARY (Context içinde) |
| | SecretScanner | Sır tespiti + redaksiyon | HIDDEN |
| | PathGuard | realpath/symlink/traversal | HIDDEN |
| `packages/core` | RepoAdapter (local/GitHub/GitLab) | Repository erişimi | PRIMARY (Projects) |
| | GitService | clone/fetch/checkout/diff/log | HIDDEN |
| | IngestionService | Snapshot + değişiklik tespiti | ADVANCED |
| | LanguageParser registry | tree-sitter + TS compiler | HIDDEN |
| | SymbolIndexer | Symbol persist + invalidation | ADVANCED |
| | IndexJobService | Job queue + claim | ADVANCED |
| `packages/context` | HybridRetrieval | Aday üretimi | HIDDEN |
| | Ranker | 14 sinyalli explainable skor | ADVANCED |
| | TokenBudget | Model-aware bütçe | PRIMARY |
| | Tokenizer registry | Gerçek tokenizer | HIDDEN |
| | ContextCompiler | Deterministik derleme | PRIMARY |
| | ManifestBuilder | Provenance | PRIMARY |
| `packages/graph` | GraphBuilder | Node/edge üretimi | HIDDEN |
| | Traversal | BFS/DFS/reverse/transitive | ADVANCED |
| | Invalidation | Incremental güncelleme | HIDDEN |
| | ImpactAnalysis | Etki yarıçapı | ADVANCED |
| `packages/adapters` | AgentAdapter interface | Vendor-neutral sözleşme | — |
| | ClaudeCodeAdapter / CodexAdapter | First-class execution | PRIMARY |
| | CapabilityNegotiation | model/ctx/tool/MCP/health | ADVANCED |
| `packages/runtime` | RunFSM | 12 durumlu state machine | PRIMARY (Runs) |
| | PgQueue | SKIP LOCKED kuyruk | ADVANCED |
| | WorkerPool | Crash/stale lock recovery | ADVANCED |
| | ApprovalService | İnsan onayı | PRIMARY |
| `packages/evidence` | EventStore | Append-only + hash chain | PRIMARY (Timeline) |
| | EvidenceStore | Run kanıt paketi | PRIMARY |
| | ArtifactCAS | İçerik adresli depo | HIDDEN |
| | AuditLog | Actor = authenticated principal | ADVANCED |
| | QualityGateRunner | Gerçek komut çalıştırma | PRIMARY (Verification) |
| `packages/observability` | Logger / Metrics / Tracing | OTel | ADVANCED (Health) |

---

## APPENDIX D — FINAL UI INFORMATION ARCHITECTURE

```text
PRIMARY NAVIGATION (5 + 1)

┌─ Projects ────────────────────────────────────────────────────────────┐
│  Project list → Project detail                                         │
│    Repositories (connect / status / index health)                      │
│    Connected agents (Claude Code · Codex · health · capabilities)      │
│    Policy binding · Team (membership + roles)                          │
└────────────────────────────────────────────────────────────────────────┘
┌─ Tasks / Runs ───────────────────────────── ANA ÜRÜN YÜZEYİ ──────────┐
│  Task list → Task detail → Run                                         │
│    Run progression:  Context ✓ · Policy ✓ · Agent ● · Tests · Evidence │
│    Live event stream (SSE) · Approval prompts · Blocked mutations      │
└────────────────────────────────────────────────────────────────────────┘
┌─ Context ─────────────────────────────────────────────────────────────┐
│  31,284 / 50,000 budget   ·   14 sources selected                      │
│  Why?  6 direct deps · 3 tests · 2 ADRs · 2 reverse deps · 1 recent     │
│  7 sources excluded by policy                                          │
│  [Advanced] Inspect Manifest · Inspect Dependency Graph · Inspect Rank  │
└────────────────────────────────────────────────────────────────────────┘
┌─ Policies ────────────────────────────────────────────────────────────┐
│  Role-based policy builder (READ / APPROVAL / DENY glob'ları)          │
│  Policy versions · Diff · Simulation ("bu policy şu task'ta ne yapar?")│
└────────────────────────────────────────────────────────────────────────┘
┌─ Evidence / Audit ────────────────────────────────────────────────────┐
│  Run Evidence (tek tutarlı deneyim):                                   │
│    Overview · Context · Changes · Timeline · Verification · Audit      │
└────────────────────────────────────────────────────────────────────────┘
┌─ Settings ────────────────────────────────────────────────────────────┐
│  Organization · Members · Providers · Tokens · Notifications           │
└────────────────────────────────────────────────────────────────────────┘

ADVANCED (role-gated, progressive disclosure — ana navigasyonu kirletmez)
   Providers · Indexes · Workers · Locks · Health · Diagnostics · Graph Explorer

ROLE MAPPING
   Developer         : Projects · Tasks/Runs · Evidence
   Platform Engineer : + Context · Policies · Audit · Settings
   System Admin      : + Advanced
```

---

## APPENDIX E — OLD → NEW MODULE MIGRATION MAP

`Action`: `KEEP` · `HEADLESS` · `MERGE` · `REFACTOR` · `DEPRECATE` · `DELETE` · `REPLACE`
`UI Visibility`: `PRIMARY` · `ADVANCED` · `HIDDEN` · `NONE`

### E.1 Backend modülleri

| Modül | Mevcut durum | Ürün değeri | Final rol | UI | Action | Hedef | Faz |
|---|---|---|---|---|---|---|---|
| `apps/api/src/index.ts` (7.170 satır) | Monolit router | — | Parçalanır | NONE | REPLACE | `apps/api/src/routes/*` + `domain/*` | P01–P19 |
| `apps/api/src/auth.ts` | El yazımı JWT, JWKS ölü | Yüksek | OIDC + jose | NONE | REPLACE | `middleware/authn.ts`, `middleware/authz.ts` | P02 |
| `PermissionKernelService.ts` | Çalışıyor, fail-open kaçağı + `system` bypass | Çok yüksek | Kanonik policy engine | ADVANCED | REFACTOR | `packages/security/src/permission-kernel/` | P02, P07, P17 |
| `repo-adapter.ts` (Local) | Gerçek, path güvenliği iyi | Yüksek | Local adapter | HIDDEN | KEEP + REFACTOR | `packages/core/src/repo/local-adapter.ts` | P03 |
| `ReadOnlyGitHubRepoAdapter` | Saf stub | Yüksek | Gerçek GitHub adapter | HIDDEN | REPLACE | `packages/core/src/repo/github-adapter.ts` | P03 |
| — (yok) | — | Yüksek | GitLab adapter | HIDDEN | NEW | `packages/core/src/repo/gitlab-adapter.ts` | P03 |
| `static-analysis.ts` (TS AST) | Gerçek | Yüksek | TS parser plugin | HIDDEN | KEEP + REFACTOR | `packages/core/src/parsers/typescript.ts` | P04 |
| `RegexFallbackParser` | Diğer diller | Düşük | Silinir | NONE | REPLACE | tree-sitter parser'ları | P04 |
| `packages/context` chunking | Character-based | Orta | AST-aware chunking | HIDDEN | REPLACE | `packages/context/src/chunking/` | P04 |
| `mockSemanticSearchFallback` | Keyword overlap, adı yanlış | Negatif | Gerçek embedding | NONE | DELETE | `packages/context/src/retrieval/semantic.ts` | P06 |
| `scoreKeywordBM25` | BM25 değil | Orta | Gerçek BM25 | HIDDEN | REPLACE | `packages/context/src/retrieval/lexical.ts` | P06 |
| `RetrievalRankingService` | 3 sabit strateji | Yüksek | 14 sinyalli explainable ranker | ADVANCED | REFACTOR | `packages/context/src/ranking/` | P06 |
| `CANONICAL_TOKEN_BUDGET` (50K sabit) | Hard-code, kullanılmıyor | Orta | Dinamik bütçe motoru | PRIMARY | REPLACE | `packages/context/src/budget/` | P08 |
| `estimateTokens` / `chars/4` | İki tutarsız tahminci | Negatif | Gerçek tokenizer | HIDDEN | REPLACE | `packages/context/src/tokenizer/` | P08 |
| `buildContextPack` | Uydurma alanlar taşıyor | Negatif | Deterministik compiler | PRIMARY | REPLACE | `packages/context/src/compiler/` | P08, P09 |
| `KnowledgeGraphService` | Gerçek ama manuel sync, `context_items` kaynaklı | Yüksek | Symbol kaynaklı incremental graph | ADVANCED | REFACTOR | `packages/graph/src/` | P05 |
| `impact_reports` / `change_simulations` | Gerçek persist | Orta | Change Firewall girdisi | HIDDEN | MERGE | `packages/security/src/change-firewall/` | P10 |
| `packages/agents/*` | DB bookkeeping, model çağırmıyor | Orta | Run runtime'a devredilir | HIDDEN | MERGE | `packages/runtime/src/` | P12 |
| `AgentDebugService` (static Map) | Restart'ta kayıp | Düşük | Event Store'a devredilir | NONE | DELETE | `EventStore` | P12 |
| `packages/providers` (Gemini) | Yalnız `/simulate-task` kullanıyor | Orta | Provider registry (embedding + tokenizer) | ADVANCED | REFACTOR | `packages/providers/src/` | P08, P11 |
| — (yok) | — | Kritik | Claude Code adapter | PRIMARY | NEW | `packages/adapters/src/claude-code/` | P11 |
| — (yok) | — | Kritik | Codex adapter | PRIMARY | NEW | `packages/adapters/src/codex/` | P11 |
| `POST /tasks/:id/runs` (fake) | Simülasyon | Negatif | Gerçek run FSM | PRIMARY | REPLACE | `packages/runtime/src/run-fsm.ts` | P12 |
| `server.ts` `/api/simulate-task` | 140 satır uydurma | Negatif | — | NONE | DELETE | — | P15 |
| `EventStoreService` | Gerçek, hash chain yok | Çok yüksek | Hash-chained event store | PRIMARY | REFACTOR | `packages/evidence/src/event-store/` | P14 |
| `EvidenceStoreService` | Integrity var, authenticity yok | Çok yüksek | İmzalı evidence | PRIMARY | REFACTOR | `packages/evidence/src/evidence-store/` | P14 |
| `ArtifactCASService` | Gerçek, DB-backed | Yüksek | CAS | HIDDEN | KEEP | `packages/evidence/src/cas/` | P14 |
| `ContextObjectStoreService` | Gerçek + SQL injection riski | Orta | Manifest fragment store | HIDDEN | MERGE | `packages/context/src/store/` | P09, P17 |
| `FileLockingService` | Gerçek | Orta | Change Firewall lease'i | HIDDEN | KEEP | `packages/security/src/locks/` | P10 |
| `WorkerRuntimeService` | Gerçek bookkeeping | Yüksek | Worker pool | ADVANCED | REFACTOR | `packages/runtime/src/workers/` | P12 |
| `QualityGateService` | Yalnız depolama | Yüksek | Gerçek komut çalıştırıcı | PRIMARY | REFACTOR | `packages/evidence/src/quality-gates/` | P14 |
| `IndexJobService` / `IncrementalIndexService` | Gerçek queue örüntüsü | Yüksek | Kanonik job queue temeli | ADVANCED | REFACTOR | `packages/runtime/src/queue/` | P12 |
| `workers/index-worker.ts` | Dosya sayıyor, index'lemiyor | Negatif | Gerçek index worker | NONE | REPLACE | `workers/index-worker.ts` (rewrite) | P04 |
| `packages/connectors` | 15 satır stub, 0 importer | Yok | — | NONE | DELETE | — | P01 |
| `packages/ui` | 2 sabit obje, 0 importer | Yok | — | NONE | DELETE | — | P15 |
| `MockDatabaseConnector` | Regex SQL emülatörü | Negatif | — | NONE | DELETE | testcontainers/gerçek PG | P19 |
| `db.ts` inline migration array | 35 versiyon, `.sql` yok | Orta | Dosya bazlı migration | NONE | REFACTOR | `migrations/NNNN_*.sql` + runner | P01 |

### E.2 Frontend modülleri

| Modül | Mevcut | Final rol | UI | Action | Hedef | Faz |
|---|---|---|---|---|---|---|
| `apps/web/src/App.tsx` switch (113 tab) | Tek component, router yok | Silinir | NONE | REPLACE | `surfaces/` + react-router | P15 |
| `ModuleSimulationPanel.tsx` (102 ekran) | Tam fabrikasyon | Silinir | NONE | DELETE | — | P15 |
| `AIMissionControlPanel.tsx` | Sinematik + sahte konsey | Gerçek Run yüzeyi | PRIMARY | REPLACE | `surfaces/tasks/RunDetail.tsx` | P15 |
| chat-cockpit (`App.tsx:424-673`) | Ağ çağrısı yok, tamamen sahte | Silinir | NONE | DELETE | — | P15 |
| `IndexJobOrchestratorPanel.tsx` | Gerçek API | Admin aracı | ADVANCED | KEEP + REFACTOR | `advanced/indexes/` | P15 |
| `ArtifactCenterPanel.tsx` (1.242 satır) | Gerçek API | Evidence'a gömülür | HIDDEN | MERGE | `surfaces/evidence/` | P15 |
| `PermissionKernelPanel.tsx` | Gerçek API (endpoint 500) | Policy builder | PRIMARY | REFACTOR | `surfaces/policies/` | P02, P15 |
| `EvidenceStorePanel.tsx` · `EventJournalPanel.tsx` | Gerçek API | Run Evidence sekmeleri | PRIMARY | MERGE | `surfaces/evidence/` | P15 |
| `FileLockingPanel.tsx` | Gerçek API | Admin aracı | ADVANCED | KEEP | `advanced/locks/` | P15 |
| `QualityGateReportPanel.tsx` | Gerçek API | Verification sekmesi | PRIMARY | MERGE | `surfaces/evidence/Verification.tsx` | P15 |
| `ImpactAnalysisPanel.tsx` | Gerçek API | Context → Inspect Graph | ADVANCED | MERGE | `surfaces/context/` | P15 |
| `WorkerRuntimeDashboard.tsx` | Gerçek API + 4 kırık çağrı | Admin aracı | ADVANCED | REFACTOR | `advanced/workers/` | P12, P15 |
| `LandingPage` · `CyberCanvas` · `SymmetryHud` · `ControlTerminal` · `motion/*` | Ulaşılamaz (~2.300 satır) | — | NONE | DELETE | — | P15 |
| `features/landing/*` (particle engine) | 0 importer | — | NONE | DELETE | — | P15 |
| `hooks/useKnowledgeGraph.ts` · `useSecurityVault.ts` | 0 importer | — | NONE | DELETE | — | P15 |
| `hooks/useWorkspace.ts` | DB parolasını state'e yazıyor | — | NONE | DELETE | Settings → Providers | P02, P15 |
| `lib/api/*` (7 modül, ortak wrapper yok) | Tekrarlı fetch, `any` dönüş | Tipli API client | — | REPLACE | `lib/api/client.ts` + generated types | P15 |
| `lib/api/auth-bootstrap.ts` (fetch monkey-patch) | dev-session token'ı sessionStorage'a | Gerçek OIDC akışı | — | REPLACE | `lib/auth/oidc.ts` | P02, P15 |
| `src/App.tsx` shim · `index.html` başlığı | "My Google AI Studio App" | Düzeltilir | — | REFACTOR | — | P15 |

**Hiçbir mevcut modül sahipsiz bırakılmamıştır.** 113 nav item'ın tamamı Appendix F'de route bazında haritalanmıştır.

---

## APPENDIX F — UI ROUTE MIGRATION MATRIX

Legend — Current Status: `REAL` (canlı API) · `HYBRID` · `FAKE` (tamamı client literal).

### Kategori 00 — Görev Kontrol (Mission Control)

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/chat` | FAKE | Hayır | — | Ağ çağrısı yok; `setTimeout` + canned markdown; sahte SHA üretiyor | DELETE |
| `/dashboard` | HYBRID | Evet | **Tasks/Runs → Run Detail** | Tek ürün-anlamlı mission control; sinematik ve sahte konsey çıkarılır | REPLACE |
| `/active-project` | FAKE | Hayır | Projects (proje seçici) | Ayrı ekran gerektirmiyor | MERGE |
| `/system-health` | FAKE | Evet | **Advanced → Health** | Gerçek healthz/readyz/queue/worker verisiyle | REPLACE |
| `/budget` | FAKE | Evet | **Context** (bütçe başlığı) | Bütçe Context yüzeyinin ilk satırı | MERGE |
| `/cost-chart` | FAKE | Kısmen | **Context → Advanced** | Gerçek token/maliyet metriklerinden | REPLACE |

### Kategori 01 — Projeler ve Çalışma Alanı

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/projects` | FAKE | Evet | **Projects** | Birincil yüzey | REPLACE |
| `/memberships` | FAKE | Evet | **Projects → Team** | DB-backed membership (P02) | REPLACE |
| `/scoped-paths` · `/allowed-paths` · `/boundaries` | FAKE | Evet | **Policies** | Üçü aynı kavram: allowed context universe | MERGE |
| `/repo-adapter` | FAKE | Evet | **Projects → Repositories** | Gerçek connect/clone/index | REPLACE |
| `/explorer` | FAKE | Kısmen | **Context → Advanced** | Dosya gezgini ayrı ürün yüzeyi değil | MERGE |

### Kategori 02 — Context OS

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/index-jobs` | **REAL** | Evet | **Advanced → Indexes** | Operatör aracı, birincil değil | KEEP + REFACTOR |
| `/ctx-objects` · `/ctx-items` · `/ctx-chunks` · `/registry` | FAKE | Hayır | **Context → Inspect Manifest** | Depolama detayı kullanıcı yüzeyi değil | MERGE |
| `/pack-builder` | FAKE | Evet | **Context** | Bütçe + seçim + "Why?" tek ekranda | REPLACE |
| `/ratios` · `/ranking` | FAKE | Evet | **Context → Inspect Ranking** | Explainable ranking (P06) | REPLACE |
| `/export` | FAKE | Evet | **Context → Export Manifest** | Manifest indirme gerçek özellik | REPLACE |

### Kategori 03 — Graph Intelligence

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/impact-analysis` | **REAL** | Evet | **Context → Inspect Graph** | Change Firewall'ın açıklaması | MERGE |
| `/dependency-graph` · `/ast-map` · `/symbols` · `/resolver` · `/radius` | FAKE | Kısmen | **Context → Inspect Graph** (tek ekran) | 5 ekran tek graph explorer'a iner | MERGE |
| `/incremental-idx` | FAKE | Evet | **Advanced → Indexes** | Index sağlığının parçası | MERGE |
| `/recovery` | FAKE | Hayır | — | Parser hata kurtarma bir davranış, ekran değil | DELETE |

### Kategori 04 — Artifact / CAS

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/artifacts` | **REAL** | Evet | **Evidence → Changes/Artifacts** | Run kanıtının parçası | MERGE |
| `/blobs` · `/dedup` · `/hash-verify` · `/integrity-audit` · `/ws-files` | FAKE | Hayır | **Evidence** (headless CAS) | CAS ayrı ürün değil | DELETE (backend HEADLESS) |
| `/quarantine` | FAKE | Evet | **Advanced → Diagnostics** | Nadir operatör işlemi | MERGE |

### Kategori 05 — Task Lifecycle

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/tasks` | FAKE | Evet | **Tasks/Runs** | Ana ürün yüzeyi | REPLACE |
| `/backlog` · `/active-tasks` · `/verified` · `/closed` | FAKE | Hayır | **Tasks/Runs** (filtre) | Durum bir filtredir, sayfa değil | MERGE |
| `/fsm` | FAKE | Evet | **Advanced → Diagnostics** | FSM görünümü geliştirici aracı | MERGE |
| `/file-locks` | **REAL** | Evet | **Advanced → Locks** | Operatör aracı | KEEP |

### Kategori 06 — Agent Network (8 route)

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/dispatcher` · `/ctx-builder` · `/developer` · `/qa-agent` · `/director` | FAKE | **Hayır** | — | Scope freeze: multi-agent council kapsam dışı. Kaynak 5 elemanlı literal dizi | DELETE |
| `/checkpoints` · `/handoff` | FAKE | Kısmen | **Runs → Timeline** | Session/handoff run geçmişinin parçası | MERGE |
| `/autochecks` | FAKE | Hayır | — | Karşılığı yok | DELETE |

### Kategori 07 — Security Kernel

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/security` | **REAL** (endpoint 500) | Evet | **Policies** | Birincil yüzey; endpoint P02'de düzeltilir | REFACTOR |
| `/abac-matrix` · `/policies` · `/default-deny` · `/read-only` | FAKE | Evet | **Policies** (tek builder) | 4 ekran tek policy builder'a iner | MERGE |
| `/human-approval` | FAKE | Evet | **Tasks/Runs → Approvals** | Onay run akışının içindedir | REPLACE |
| `/traversal-guard` · `/redactor` | FAKE | Hayır | — (HEADLESS) | Davranış, ekran değil; kanıtı Evidence'ta görünür | DELETE (backend KEEP) |

### Kategori 08 — Evidence / Audit

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/evidence` | **REAL** | Evet | **Evidence → Overview** | Birincil yüzey | REFACTOR |
| `/events` | **REAL** | Evet | **Evidence → Timeline** | Tek tutarlı run deneyimi | MERGE |
| `/event-store` · `/ledger` · `/signed-logs` | FAKE | Hayır | **Evidence** (headless) | Ayrı sayfalar yerine tek Run Evidence | DELETE |
| `/health-gauge` · `/corruption` | FAKE | Evet | **Advanced → Diagnostics** | Bütünlük doğrulaması operatör işi | MERGE |

### Kategori 09 — Worker Runtime

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/workers` | **REAL** (4 kırık çağrı) | Evet | **Advanced → Workers** | Endpoint isimleri P12'de düzeltilir | REFACTOR |
| `/index-sync` · `/ast-jobs` | FAKE | Evet | **Advanced → Indexes** | Index sağlığına birleşir | MERGE |
| `/git-tracking` | FAKE | Evet | **Projects → Repositories** | Gerçek git durumu (P03) | REPLACE |
| `/load` · `/telemetry` | FAKE | Evet | **Advanced → Health** | Gerçek metriklerle (P18) | REPLACE |

### Kategori 10 — Database / Migrations (6 route)

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/db-status` · `/migrations` | FAKE | Evet | **Advanced → Diagnostics** | Gerçek `/api/v1/admin/db/status` verisiyle | REPLACE |
| `/db-pool` · `/schema` · `/tables` | FAKE | Hayır | — | Şema tarayıcı ürün yüzeyi değil | DELETE |
| `/dev-reset` | FAKE | **Hayır** | — | Yıkıcı işlem UI'dan sunulmaz; yalnız CLI + guardrail | DELETE |

### Kategori 11 — Providers / Connectors (5 route)

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/connectors` · `/credentials` | FAKE | Evet | **Settings → Providers** | Gerçek credential yönetimi (secret manager) | REPLACE |
| `/model-routing` · `/google-sdk` | FAKE | Evet | **Advanced → Providers** | Capability negotiation çıktısı (P11) | REPLACE |
| `/saas-sync` | FAKE | Hayır | — | İlgisiz SaaS connector'ları kapsam dışı | DELETE |

### Kategori 12 — QA / Validation (15 route)

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/quality-gates` | **REAL** | Evet | **Evidence → Verification** | Gerçek gate sonuçları | MERGE |
| `/test-runner` · `/test-det` · `/test-db` | FAKE | **Hayır** | — | **Test çalıştırmayan bir "Test Koşturucu" ürünün en tehlikeli yalanı.** Gerçek sonuçlar CI'dan ve Verification'dan gelir | DELETE |
| `/secret-scan` · `/debug-gate` | FAKE | Hayır | — (HEADLESS) | CI gate'i, ekran değil | DELETE |
| `/manual-qa` | FAKE | Hayır | — | Doküman, ekran değil | DELETE |
| `/stage-27` … `/stage-35` (9 route) | FAKE | **Hayır** | — | Uydurma "PASS" çıktısı basan 9 ekran | DELETE |

### Kategori 13 — Dokümantasyon (8 route)

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/docs/*` (8 route) | FAKE | Hayır | — | Gerçek `docs/*.md` dosyaları var ama bu ekranlar onları okumuyor | DELETE |

### Kategori 14 — Governance / Kernel Debt (5 route)

| Current Route | Status | Keep? | New Surface | Reason | Migration |
|---|---|---|---|---|---|
| `/gov/audit` | FAKE | Evet | **Evidence → Audit** | Gerçek audit log | REPLACE |
| `/gov/human-review` | FAKE | Evet | **Tasks/Runs → Approvals** | Onay akışı | MERGE |
| `/gov/debt` · `/gov/awareness` | FAKE | Hayır | — | `docs/security-boundaries/kernel-debt-register.md` yeterli | DELETE |
| `/gov/signoff` | FAKE | **Hayır** | — | **Lokal React state ile "release sign-off" yapılabiliyor.** Sign-off CI/CD gate'idir | DELETE |

### F.1 Sonuç: final primary sidebar

```text
Projects
Tasks / Runs
Context
Policies
Evidence
─────────────
Settings
─────────────
Advanced ▸        (yalnız Platform Engineer / System Admin)
  Providers · Indexes · Workers · Locks · Health · Diagnostics · Graph Explorer
```

**113 route → 6 birincil + 7 advanced.** Silinen: 68. Birleştirilen: 31. Korunan/refactor: 14.

---

## APPENDIX G — PARALLEL WORKSTREAMS

```text
Zaman ──────────────────────────────────────────────────────────────────────►

P00 ─ P01  (tüm ekip, senkron — sözleşmeler burada donar)
   │
   ├── WS-B ── P02 ────┬── P07 ──────────────┬── P10 ──────┬── P17 ──────┐
   │                    │                     │             │             │
   ├── WS-A ── P03 ─ P04 ─ P05 ─ P06 ─ P08 ─ P09 ──────────┤             │
   │                                                        │             │
   ├── WS-C ── P11 ─────────────────────────────────────── P12 ─ P13 ────┤
   │                                                                      │
   ├── WS-D ─────────────────────────────────── P14 ─────────────────────┤
   │                                                                      │
   ├── WS-E ─────────────────────────────────────────── P15 ─────────────┤
   │                                                                      │
   └── WS-F ─────────────────────────── P16 ─ P18 ──────────────────── P19 ─ P20
```

| Eşzamanlı çalışabilen | Koşul |
|---|---|
| P02 ∥ P11 | P11 yalnızca adapter interface + capability negotiation; auth'a bağımlı değil |
| P03 ∥ P07 | Farklı paketler (`core` vs `security`); ortak nokta yalnız `packages/shared` tipleri |
| P05 ∥ P07 | — |
| P06 ∥ P10 | P10 graph'ı okur ama yazmaz |
| P16 ∥ P17 ∥ P18 | Üçü de P14 sonrası; farklı dosya kümeleri |
| P15 ∥ P17 | UI ile security hardening farklı katmanlar |

| **Paralel yapılamayacak** | Sebep |
|---|---|
| P04 ∥ P05 | P05 `SymbolRecord` şemasını tüketir; şema donmadan graph yazılamaz |
| P08 ∥ P09 | Manifest compiler'ın son adımıdır; aynı çıktı üzerinde çalışırlar |
| P12 ∥ P13 | P13 P12'nin ürettiği event contract'ına bağlıdır |
| Herhangi iki faz ∥ migration bloğu | Migration numarası çakışması (§6.1) |
| P15 ∥ herhangi bir `App.tsx` değişikliği | P15 bu dosyanın tek sahibidir |

---

## APPENDIX H — FULL TEST MATRIX

`U` unit · `C` contract · `I` integration · `S` security · `R` resilience · `E` E2E · `B` benchmark

| Capability | U | C | I | S | R | E | B | Faz |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| OIDC token doğrulama (JWKS, exp/nbf/iss/aud, alg) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | P02 |
| DB-backed membership + role resolution | ✓ | | ✓ | ✓ | | ✓ | | P02 |
| Cross-tenant / cross-project izolasyon | | | ✓ | ✓ | | ✓ | | P02, P17 |
| Permission Kernel fail-closed | ✓ | ✓ | ✓ | ✓ | ✓ | | | P02, P17 |
| Repository connect (local/GitHub/GitLab) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | P03 |
| Git clone/fetch/checkout/diff | ✓ | ✓ | ✓ | ✓ | ✓ | | | P03 |
| Path security (realpath, symlink, traversal) | ✓ | | ✓ | ✓ | | | | P03, P17 |
| Secret detection + redaksiyon | ✓ | | ✓ | ✓ | | | | P03, P17 |
| AST/symbol extraction (9 dil) | ✓ | ✓ | ✓ | | | | | P04 |
| Symbol persistence + invalidation | ✓ | | ✓ | | ✓ | | | P04 |
| Incremental index (changed files → changed symbols) | ✓ | | ✓ | | ✓ | | ✓ | P04 |
| Graph build / traversal / cycle detection | ✓ | ✓ | ✓ | | | | ✓ | P05 |
| Graph incremental invalidation | ✓ | | ✓ | | ✓ | | | P05 |
| Lexical retrieval (gerçek BM25) | ✓ | | ✓ | | | | ✓ | P06 |
| Semantic retrieval (pgvector) | ✓ | ✓ | ✓ | | | | ✓ | P06 |
| Hybrid ranking explainability | ✓ | | ✓ | | | ✓ | ✓ | P06 |
| Context Firewall (allowed universe) | ✓ | | ✓ | ✓ | | ✓ | | P07 |
| DENY içeriğinin hiçbir aşamada okunmaması | ✓ | | ✓ | ✓ | | ✓ | | P07, P17 |
| Token budget hesabı (model-aware) | ✓ | ✓ | ✓ | | | | ✓ | P08 |
| Gerçek tokenizer doğruluğu | ✓ | ✓ | | | | | ✓ | P08 |
| Manifest determinism (aynı girdi → aynı hash) | ✓ | | ✓ | | | ✓ | | P09 |
| Manifest provenance %100 kapsama | ✓ | | ✓ | ✓ | | ✓ | ✓ | P09 |
| Excluded-with-reason kaydı | ✓ | | ✓ | ✓ | | | | P09 |
| Change boundary hesabı | ✓ | | ✓ | ✓ | | ✓ | | P10 |
| Mutation ALLOW/DENY/ASK_APPROVAL kararı | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | P10 |
| Boundary bypass imkânsızlığı | | | ✓ | ✓ | | ✓ | | P10, P17 |
| Agent adapter capability negotiation | ✓ | ✓ | ✓ | | ✓ | | | P11 |
| Claude Code adapter gerçek execution | | ✓ | ✓ | | ✓ | ✓ | ✓ | P11, P12 |
| Codex adapter gerçek execution | | ✓ | ✓ | | ✓ | ✓ | ✓ | P11, P12 |
| Run FSM geçişleri (12 durum) | ✓ | | ✓ | | ✓ | ✓ | | P12 |
| Queue claim / retry / idempotency | ✓ | ✓ | ✓ | | ✓ | | | P12 |
| Worker crash + stale lock recovery | | | ✓ | | ✓ | | | P12, P18 |
| SSE event ordering + reconnect | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | P13 |
| Approval akışı (request → resolve) | ✓ | | ✓ | ✓ | | ✓ | | P13 |
| Event hash chain tamper detection | ✓ | | ✓ | ✓ | | | | P14 |
| Evidence bundle bütünlüğü + imza | ✓ | ✓ | ✓ | ✓ | | ✓ | | P14 |
| CAS dedup + integrity | ✓ | ✓ | ✓ | ✓ | | | | P14 |
| Quality gate gerçek exit code | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | P14 |
| Audit actor = authenticated principal | ✓ | | ✓ | ✓ | | | | P14, P17 |
| 5 birincil yüzey render + veri | | | | | | ✓ | | P15 |
| Role-based UI görünürlüğü | ✓ | | ✓ | ✓ | | ✓ | | P15 |
| Refresh sonrası tam restore | | | | | ✓ | ✓ | | P15 |
| Prompt injection direnci | | | ✓ | ✓ | | ✓ | ✓ | P17 |
| Threat model kapanışı (24 vektör) | | | ✓ | ✓ | | | | P17 |
| Fresh migration + upgrade migration | | | ✓ | | ✓ | | | P19 |
| Native vs Y benchmark | | | | | | | ✓ | P16 |

### H.1 Test altyapısı kuralları

- **Integration testleri gerçek PostgreSQL kullanır** (testcontainers veya CI service). `MockDatabaseConnector` P19'da silinir; test yolu mock DB'ye **düşemez**.
- **Contract testleri** her adapter için hem gerçek hem sahte implementasyona karşı aynı suite'i çalıştırır.
- **Negative test zorunluluğu:** her `PASS` iddiası için en az bir "yapılmaması gerekeni yapmayı dene" testi.
- **Skip = failure.** `STRICT_DB_TESTS` kaldırılır; skip mekanizması testlerden tamamen çıkarılır.

---

## APPENDIX I — SECURITY MATRIX

| # | Threat | Attack | Impact | Mitigation | Automated Test | Acceptance |
|---|---|---|---|---|---|---|
| T-01 | IDOR | Başka projenin `:id`'siyle istek | Cross-project veri sızıntısı | Her route'ta `requireProjectScope` + DB membership | `tests/security/idor.spec.ts` — her kanonik route için 403 | Kapsama %100 route |
| T-02 | Cross-tenant | `org_id` claim'i değiştirilerek | Tenant sınırı ihlali | `organization_id` her tabloda + query'lerde zorunlu predicate + RLS | `tests/security/tenant-isolation.spec.ts` | Sızıntı = 0 |
| T-03 | Path traversal | `../../etc/passwd` | Keyfi dosya okuma | `PathGuard` realpath containment | `tests/security/path-guard.spec.ts` (50+ payload) | Escape = 0 |
| T-04 | Symlink escape | Repo içinde `/etc`'ye symlink | Keyfi dosya okuma | realpath + `lstat` kontrolü | Aynı suite | Escape = 0 |
| T-05 | Prompt injection (repo içeriği) | Kaynak/Markdown içinde "IGNORE ALL POLICIES" | Policy bypass | Repo içeriği **DATA** olarak işaretlenir; system/admin policy'nin üstüne çıkamaz; adapter'a ayrı kanalda verilir | `tests/security/prompt-injection.spec.ts` + P16 benchmark | Policy ihlali = 0 |
| T-06 | Malicious repository | Devasa/derin/zip-bomb repo | DoS | Size/depth/file-count limitleri, timeout, quota | `tests/security/malicious-repo.spec.ts` | Kaynak tükenmesi yok |
| T-07 | Secret leakage | `.env` context'e girer | Sır agent'a gider | Context Firewall DENY + SecretScanner + read-time redaksiyon | `tests/security/secret-leak.spec.ts` | **Leak = 0 (P0)** |
| T-08 | Tool escalation | Agent izin verilmeyen tool ister | Yetki aşımı | Tool allow-list, capability negotiation | `tests/security/tool-escalation.spec.ts` | Escalation = 0 |
| T-09 | MCP escalation | MCP üzerinden ek yetenek | Yetki aşımı | MCP sunucu allow-list + tool filtresi | Aynı suite | Escalation = 0 |
| T-10 | Policy bypass | Policy store erişilemez | Fail-open | **FAIL CLOSED**: DENY + security event + `readyz` degraded | `tests/security/fail-closed.spec.ts` | DB down → tüm istekler DENY |
| T-11 | Approval bypass | Onay beklemeden mutation | Yetkisiz değişiklik | Mutation intercept backend'de; UI'ya güvenilmez | `tests/security/approval-bypass.spec.ts` | Bypass = 0 |
| T-12 | JWT confusion | `alg:none`, HS/RS karışıklığı | Kimlik sahtekârlığı | `jose` + sabit algoritma listesi + JWKS `kid` eşleşmesi | `tests/security/jwt.spec.ts` | Tüm varyantlar 401 |
| T-13 | JWKS attacks | Sahte JWKS endpoint, cache poisoning | Kimlik sahtekârlığı | JWKS URI allow-list, TLS, TTL'li cache, `kid` doğrulaması | Aynı suite | Kabul = 0 |
| T-14 | Replay | Aynı token/isteğin tekrarı | Yetkisiz işlem | `jti` + idempotency key + nonce | `tests/security/replay.spec.ts` | Tekrar reddedilir |
| T-15 | Worker impersonation | Sahte worker kimliği | Job hijack | Worker kimliği imzalı; imzasız = DENY | `tests/security/worker-identity.spec.ts` | İmzasız = DENY |
| T-16 | Artifact poisoning | Sahte artifact enjeksiyonu | Kanıt bozulması | CAS hash doğrulaması + yazan principal kaydı | `tests/security/cas-integrity.spec.ts` | Doğrulanmamış artifact reddedilir |
| T-17 | CAS tampering | Blob içeriğinin değiştirilmesi | Kanıt bozulması | `content_hash` yeniden hesaplama + append-only | Aynı suite | Tespit %100 |
| T-18 | Event forgery | Sahte event ekleme | Audit bozulması | Hash chain + append-only trigger + actor doğrulaması | `tests/security/event-chain.spec.ts` | Zincir kırığı tespit edilir |
| T-19 | Audit actor spoofing | `actor` alanının uydurulması | Sorumluluk kaybı | Actor **daima** `req.principal.sub`'dan; API'den kabul edilmez | `tests/security/audit-actor.spec.ts` | Hard-coded actor = 0 |
| T-20 | Repository write race | Eşzamanlı yazım | Veri kaybı | File lock/lease + `hash-before`/`hash-after` + atomic write | `tests/security/write-race.spec.ts` | Kayıp yazım = 0 |
| T-21 | Stale lock | Worker çöktü, kilit kaldı | Deadlock | Lease TTL + otomatik release + audit | `tests/resilience/stale-lock.spec.ts` | Otomatik kurtarma |
| T-22 | Command injection | Agent komutu shell'e sızar | RCE | `execFile` + argüman dizisi + allow-list; **shell yok** | `tests/security/command-injection.spec.ts` | Injection = 0 |
| T-23 | SSRF | `/db/configure`-benzeri, webhook, repo URL | İç ağ erişimi | URL allow-list, private IP bloğu, DNS rebinding koruması. **`/db/configure` silinir** | `tests/security/ssrf.spec.ts` | İç ağ erişimi = 0 |
| T-24 | Supply chain | Kötü niyetli bağımlılık | Kod yürütme | Lockfile pin, `pnpm audit` gate, tek paket yöneticisi, SBOM | CI adımı | P0/P1 CVE = 0 |

### I.1 Security gate (release öncesi zorunlu)

```text
cross-tenant                = impossible
cross-project               = impossible
secret leak                 = zero
path escape                 = zero
policy outage               = fail closed
audit actor                 = authenticated principal
change boundary bypass      = impossible
unsigned worker identity    = denied
P0/P1 açık security finding = 0
```

---

## APPENDIX J — FINAL API SURFACE

Kanonik yüzey `/api/v1/*`. Tüm route'lar authenticated principal gerektirir (`/healthz`, `/readyz` hariç). Tüm proje-kapsamlı route'lar DB-backed membership doğrulamasından geçer.

```text
IDENTITY / TENANCY
  GET    /api/v1/auth/me
  POST   /api/v1/auth/logout
  GET    /api/v1/orgs
  POST   /api/v1/orgs
  GET    /api/v1/orgs/:orgId/members
  POST   /api/v1/orgs/:orgId/members
  DELETE /api/v1/orgs/:orgId/members/:userId

PROJECTS
  GET    /api/v1/orgs/:orgId/projects
  POST   /api/v1/orgs/:orgId/projects
  GET    /api/v1/projects/:projectId
  PATCH  /api/v1/projects/:projectId
  DELETE /api/v1/projects/:projectId
  GET    /api/v1/projects/:projectId/members
  POST   /api/v1/projects/:projectId/members

REPOSITORIES
  GET    /api/v1/projects/:projectId/repositories
  POST   /api/v1/projects/:projectId/repositories            (connect: local|github|gitlab)
  GET    /api/v1/projects/:projectId/repositories/:repoId
  DELETE /api/v1/projects/:projectId/repositories/:repoId
  POST   /api/v1/projects/:projectId/repositories/:repoId/sync
  GET    /api/v1/projects/:projectId/repositories/:repoId/index-status
  GET    /api/v1/projects/:projectId/repositories/:repoId/tree
  GET    /api/v1/projects/:projectId/repositories/:repoId/file    (policy-filtered)

TASKS / RUNS
  GET    /api/v1/projects/:projectId/tasks
  POST   /api/v1/projects/:projectId/tasks
  GET    /api/v1/projects/:projectId/tasks/:taskId
  PATCH  /api/v1/projects/:projectId/tasks/:taskId
  POST   /api/v1/projects/:projectId/tasks/:taskId/runs
  GET    /api/v1/projects/:projectId/runs
  GET    /api/v1/runs/:runId
  POST   /api/v1/runs/:runId/cancel
  GET    /api/v1/runs/:runId/events            (SSE, Last-Event-ID)
  GET    /api/v1/runs/:runId/diff

CONTEXT
  POST   /api/v1/projects/:projectId/tasks/:taskId/context/compile
  GET    /api/v1/runs/:runId/context/manifest
  GET    /api/v1/runs/:runId/context/manifest/export
  GET    /api/v1/runs/:runId/context/ranking     (advanced)
  GET    /api/v1/runs/:runId/context/graph       (advanced)

POLICIES
  GET    /api/v1/projects/:projectId/policies
  POST   /api/v1/projects/:projectId/policies
  GET    /api/v1/projects/:projectId/policies/:policyId/versions
  POST   /api/v1/projects/:projectId/policies/:policyId/simulate
  GET    /api/v1/runs/:runId/policy-decisions

APPROVALS
  GET    /api/v1/projects/:projectId/approvals
  GET    /api/v1/approvals/:approvalId
  POST   /api/v1/approvals/:approvalId/resolve   { decision, rationale }

EVIDENCE / AUDIT
  GET    /api/v1/runs/:runId/evidence
  GET    /api/v1/runs/:runId/evidence/verify
  GET    /api/v1/runs/:runId/timeline
  GET    /api/v1/runs/:runId/verification        (quality gates)
  GET    /api/v1/projects/:projectId/audit
  GET    /api/v1/artifacts/:artifactId           (CAS, headless)

AGENTS / PROVIDERS
  GET    /api/v1/projects/:projectId/agents
  POST   /api/v1/projects/:projectId/agents
  GET    /api/v1/agents/:agentId/capabilities
  GET    /api/v1/agents/:agentId/health          (gerçek probe)

ADMIN (role-gated)
  GET    /api/v1/admin/queue
  GET    /api/v1/admin/workers
  GET    /api/v1/admin/indexes
  GET    /api/v1/admin/health
  GET    /api/v1/admin/db/status

INFRA (auth'suz)
  GET    /healthz     GET /readyz     GET /metrics (korumalı)
```

### J.1 API migration matrix

| Mevcut endpoint sınıfı | Karar | Gerekçe |
|---|---|---|
| `GET /api/auth/dev-session` | **DELETE (P0)** | Auth'suz admin token dağıtıyor |
| `POST /api/db/configure` | **DELETE (P0)** | SSRF + `.env`'e düz metin parola yazımı |
| `GET /api/config/inspect` | **REPLACE** | `/api/v1/admin/health` içinde, sır alanları olmadan |
| `POST /api/db/migrate` | **REPLACE** | CLI/deploy adımı olur; HTTP'den kaldırılır |
| `POST /api/simulate-task` (`server.ts`) | **DELETE** | 140 satır uydurma çıktı |
| `POST /api/security/redact-check` | **DELETE** | `original` + `redacted` birlikte döndürüyor |
| `POST /projects/:id/change-simulation` | **REPLACE** | Change Firewall'ın `dry-run` moduna dönüşür |
| `router.all(["/tasks","/tasks/*"])` 410 bloğu + arkasındaki ~25 ölü route | **DELETE** | Kanonik `/api/v1/projects/:pid/tasks/*` ile değiştirildi |
| Unscoped route'lar (§1.3 P0-8) | **DELETE veya REPLACE** | Proje-kapsamlı kanonik karşılıklarıyla |
| `GET /providers/health` | **REPLACE** | Gerçek connectivity probe (`/api/v1/agents/:id/health`) |
| Gerçek veri döndüren ~40 proje-kapsamlı route (evidence, events, artifacts, locks, workers, quality gates, index jobs, permissions) | **CHANGE** | `/api/v1/` altına taşınır, kanonik authz'dan geçer, şeması `packages/shared`'dan üretilir |
| Kalan ~120 legacy route | **DEPRECATE → DELETE** | P19'da `index.ts` ile birlikte silinir |

**Deprecation protokolü:** kanonik karşılığı yayına girdiği anda legacy route `410 Gone` + `Sunset` header + `Link: <canonical>` döner ve audit'e `LEGACY_ROUTE_CALLED` yazar. P19'da tamamen silinir.

---

## APPENDIX K — FINAL DATABASE MODEL

### K.1 Migration stratejisi

**Karar (ADR-003).** Inline `migrationVersions` array'i terk edilir. Migration'lar `migrations/NNNN_name.sql` dosyalarına taşınır; `apps/api/src/db.ts` yalnızca runner olur.

- Mevcut 35 versiyon `migrations/0001_*.sql` … `migrations/0035_*.sql` olarak **birebir** dışa aktarılır (davranış değişmez, `schema_migrations` ledger'ı korunur).
- Yeni migration'lar `0036`'dan başlar. Faz başına ayrılmış blok (çakışma önleme, §6.1):

```text
P02 → 0036-0045    P03 → 0046-0052    P04 → 0053-0060    P05 → 0061-0066
P06 → 0067-0072    P07 → 0073-0077    P09 → 0078-0084    P10 → 0085-0090
P12 → 0091-0100    P13 → 0101-0104    P14 → 0105-0112    P16 → 0113-0116
P17 → 0117-0120    P19 → 0121-0125
```

- **Her migration için ikisi de test edilir:** fresh (boş DB) ve upgrade (mevcut prod-benzeri veri).
- Geri alma: her migration'ın `-- +down` bölümü zorunludur.

### K.2 Kanonik tablo modeli

| Tablo | Karar | Not |
|---|---|---|
| `organizations` | **NEW** | Tenant kökü. Şu an hiçbir tenant tablosu yok |
| `users` | **NEW** | OIDC `sub` → user eşlemesi |
| `org_memberships` | **NEW** | `(org_id, user_id, role)` UNIQUE |
| `projects` | **ALTER** | `+organization_id NOT NULL FK` (kod bunu zaten okuyor, kolon yok — §1.4) |
| `project_memberships` | **NEW** | `(project_id, user_id, role)` UNIQUE. **`auth.ts:419` zaten bu tabloyu sorguluyor** |
| `memberships` (mevcut) | **MIGRATE → DELETE** | Veri `project_memberships`'e taşınır (email → user_id çözümlenerek) |
| `service_identities` | **NEW** | Worker/agent kimlikleri, imzalı |
| `repositories` | **NEW** | Kaynak tipi, URL, credential ref, default branch |
| `repository_connections` | **NEW** | Credential (secret manager ref, **asla düz metin**) |
| `repository_snapshots` | **NEW** | `(repository_id, commit_sha)` — index'in bağlandığı nokta |
| `repo_sources` (mevcut) | **MIGRATE → DELETE** | `repositories` + `repository_connections`'a bölünür |
| `files` | **NEW** | `(snapshot_id, path, content_hash, language, size, is_binary, is_generated, is_minified)` |
| `symbols` | **NEW** | 14 zorunlu alan: `symbol_id, repository_id, commit_sha, path, language, symbol_type, symbol_name, start_line, end_line, start_byte, end_byte, content_hash, parent_symbol, exports, imports` |
| `graph_nodes` / `graph_edges` | **ALTER** | `+snapshot_id`, `+organization_id`; kaynak `context_items` yerine `symbols`/`files` |
| `chunks` | **REPLACE** (`context_chunks`) | AST-aware; `+embedding vector(N)` (pgvector), `+symbol_id FK` |
| `context_fragments` | **NEW** | Manifest'in atomik birimi; `content_hash`, `source_hash` |
| `context_manifests` | **NEW** | `manifest_hash`, `compiler_version`, `policy_version`, `deterministic_inputs_hash` — **immutable** |
| `context_manifest_items` | **NEW** | Fragment başına reason skorları, permission decision, token sayısı |
| `context_manifest_exclusions` | **NEW** | Dışlanan kaynak + sebep (`policy_denied`, `budget`, `rank`) |
| `context_packs` (mevcut) | **DEPRECATE** | Uydurma alanlar taşıyor; `context_manifests` ile değiştirilir |
| `tasks` | **ALTER** | `+organization_id`, `+assigned_to` (kod okuyor, kolon yok), `+change_boundary_id` |
| `task_runs` | **NEW** | Run FSM kaydı; 12 durum, `manifest_id`, `agent_id`, `boundary_id` |
| `run_events` | **REPLACE** (`event_records`) | `+prev_hash`, `+chain_index`, `+sequence` UNIQUE per run |
| `change_boundaries` | **NEW** | `expected[]`, `allowed[]`, `approval[]`, `denied[]` |
| `mutation_decisions` | **NEW** | Her dosya yazımı için ALLOW/DENY/ASK_APPROVAL + gerekçe |
| `approval_requests` | **NEW** | `requested_by`, `resolved_by`, `rationale`, `decision`, timestamps |
| `policies` / `policy_versions` | **REPLACE** (`permission_policies`) | Versiyonlu; `+organization_id`, `+project_id`, `+is_system` (kod bu kolonları okuyor — §1.4) |
| `policy_decisions` | **KEEP + ALTER** (`permission_evaluations`) | `+run_id`, `+principal_id` |
| `permission_overrides` | **KEEP** | — |
| `agent_connections` | **NEW** | Claude Code / Codex bağlantıları, capability cache |
| `evidence_records` | **KEEP + ALTER** | `+run_id FK`, `+signature`, `+signer_key_id` |
| `cas_blobs` / `artifact_versions` | **KEEP + ALTER** | `+organization_id` |
| `audit_logs` | **ALTER** | `+organization_id`, `+FK project_id`, `+actor_principal_id NOT NULL`, `+category`, `+actor_role` (kod bunları yazıyor ama yoklar — §1.4) |
| `quality_gate_runs` / `_command_results` | **KEEP + ALTER** | `+run_id FK`, `+executed_by_worker_id` |
| `index_jobs` | **KEEP + ALTER** | `+snapshot_id`, `+job_type` (index/embed/graph) |
| `jobs` | **NEW** | Genel kuyruk (`SKIP LOCKED`): run, context-compile, quality-gate |
| `workers` | **KEEP + ALTER** (`worker_registry`) | `+identity_id FK service_identities` |
| `file_locks` | **KEEP + ALTER** | `+run_id` |
| `eval_datasets` / `eval_tasks` / `eval_results` | **NEW** | Benchmark harness (P16) |
| `artifacts` (mevcut) | **DELETE** | 0 referans |
| `connections` (mevcut) | **DELETE** | 0 referans |
| `debug_logs` | **DELETE** | Hiç yazılmıyor; Event Store'a devredilir |
| `context_summaries` · `durable_memories` · `boundary_checks` · `repo_access_logs` | **DELETE** | Yalnız yazılıyor, hiç okunmuyor |
| `agent_memories` · `resume_states` · `resume_schedules` · `agent_sessions` · `agent_handoffs` | **MERGE → `task_runs` + `run_events`** | Run runtime'ın parçası |
| `impact_reports` · `change_simulations` | **MERGE → `change_boundaries`** | Change Firewall girdisi |

### K.3 Zorunlu şema kuralları

1. **Her tenant-scoped tabloda `organization_id NOT NULL`** + `project_id` (varsa) + composite index `(organization_id, project_id, ...)`.
2. **Row-Level Security** kritik tablolarda (`context_manifests`, `run_events`, `evidence_records`, `audit_logs`) açılır; uygulama `SET LOCAL app.current_org` ile çalışır.
3. Her FK'de açık `ON DELETE` davranışı. `audit_logs`/`evidence_records` **asla CASCADE değil** (`RESTRICT`).
4. Immutable tablolarda (`context_manifests`, `run_events`, `evidence_records`, `cas_blobs`) UPDATE/DELETE trigger'la engellenir (mevcut `block_event_records_mutation()` örüntüsü genişletilir).
5. **Primary key'ler `Math.random()` ile üretilmez.** `crypto.randomUUID()` veya ULID. Mevcut ~15 çağrı noktası P01'de düzeltilir.
6. Retention: `run_events` ve `audit_logs` için partition + arşivleme (P18).

---

## APPENDIX L — RELEASE CHECKLIST

### L.1 Final Definition of Done

**Product**
- [ ] 5 birincil UI yüzeyi tamamlandı (Projects · Tasks/Runs · Context · Policies · Evidence)
- [ ] Golden path uçtan uca gerçek
- [ ] Production akışında hiçbir fake davranış yok
- [ ] Birincil akışta placeholder yok

**Context**
- [ ] Gerçek repository ingestion (local + GitHub + GitLab)
- [ ] AST-aware indexing (9 dil)
- [ ] Persistent knowledge graph (incremental)
- [ ] Semantic retrieval (pgvector, gerçek embedding)
- [ ] Hybrid ranking (14 sinyal, explainable)
- [ ] Gerçek tokenizer
- [ ] Dinamik model-aware bütçe
- [ ] Provenance manifest (%100 kapsama, deterministik)

**Control**
- [ ] Production authentication (OIDC + JWKS)
- [ ] DB-backed authorization (org + project membership)
- [ ] Permission Kernel fail-closed (statik allow fallback yok)
- [ ] Context Firewall (DENY içeriği hiçbir aşamada okunmaz)
- [ ] Change Firewall (task-derived boundary, backend enforcement)
- [ ] Approval akışı

**Agent**
- [ ] Claude Code adapter çalışır
- [ ] Codex adapter çalışır
- [ ] Health + capability negotiation gerçek
- [ ] Gerçek execution event'leri

**Proof**
- [ ] Event Store (hash-chained, append-only)
- [ ] Evidence (imzalı)
- [ ] Audit (actor = authenticated principal)
- [ ] CAS
- [ ] Quality gates (gerçek exit code)
- [ ] Immutable context provenance

**Quality**
- [ ] unit PASS · contract PASS · integration PASS · security PASS · resilience PASS · E2E PASS · build PASS · CI PASS
- [ ] `assert(..., true)` sayısı = 0
- [ ] Skip-then-pass yolu = 0
- [ ] Feature registry CI'da doğrulanıyor

**Operations**
- [ ] `/healthz` + `/readyz` (bağımlılık bazlı)
- [ ] Structured logs + correlation/run/trace ID
- [ ] Metrics + OpenTelemetry tracing
- [ ] Backup/restore prosedürü test edildi
- [ ] Deployment + upgrade dokümanı production ile eşleşiyor

**Benchmark**
- [ ] Context Eval Harness tamam (5 repo tipi × 10 task = 50 task)
- [ ] Native vs Y benchmark koştu
- [ ] Hedef metrikler tutturuldu (Appendix M)

### L.2 Final Golden E2E (30 adım — tek adımı bile fake olamaz)

```text
 1 User authenticates (OIDC)          16 Y compiles model-specific context
 2 Creates/selects organization       17 Manifest persisted and hashed
 3 Creates project                    18 Claude Code or Codex receives context
 4 Connects real Git repository       19 Agent produces real tool/file events
 5 Repository cloned/fetched          20 Change Firewall evaluates mutations
 6 Index job starts                   21 Out-of-bound change blocked/approval-gated
 7 AST generated                      22 Approved mutation proceeds
 8 Symbols persisted                  23 Tests run (gerçek exit code)
 9 Graph generated                    24 Quality gates run
10 Semantic index generated           25 Evidence persisted
11 User creates real task             26 Audit persisted
12 Y resolves identity and policy     27 Run completes
13 Y discovers candidate context      28 Browser refreshes
14 Y graph-expands context            29 Entire run restored from persistence
15 Y filters denied sources           30 Reviewer inspects exact context/changes/decisions/evidence
```

Test: `tests/e2e/golden-path.spec.ts` — production-like environment (gerçek Postgres + gerçek git repo fixture + gerçek agent adapter).

### L.3 Final Release Blocker Checklist

**P0 — sıfır olmalı**
- [ ] Auth'suz admin token yolu (`/auth/dev-session`) — silindi
- [ ] `POST /db/configure` — silindi
- [ ] JWT anahtarı = API token karışıklığı — giderildi
- [ ] Token-claim tabanlı authorization — DB-backed ile değiştirildi
- [ ] Permission Kernel statik allow fallback — silindi
- [ ] `system` subject bypass — giderildi
- [ ] Client-controlled `subject` spread — giderildi
- [ ] Unscoped IDOR route'ları — silindi
- [ ] Keyfi `root_path` kabulü — kaldırıldı
- [ ] `source_table` SQL interpolation — parametreleştirildi
- [ ] Kaynak kodda gömülü gerçek sır — rotate edildi + git history temizlendi
- [ ] DB parolasının frontend state'ine yazılması — kaldırıldı
- [ ] Fake agent run yolu — gerçek runtime ile değiştirildi
- [ ] Secret leak = 0 (benchmark ile kanıtlı)
- [ ] Unauthorized mutation = 0 (benchmark ile kanıtlı)

**P1 — production-critical, sıfır olmalı**
- [ ] Şema drift'i kaynaklı 500'ler (5 kalem, §1.4)
- [ ] Client↔server sözleşme kırıkları (4 worker endpoint'i + 10 `/tasks/*` çağrısı)
- [ ] CI'da E2E çalışmıyor
- [ ] CI'da migration'lar testlerden sonra çalışıyor
- [ ] Mock DB'nin production kod yolunda bulunması
- [ ] `assert(..., true)` ve skip-then-pass
- [ ] Rate limiting / helmet / CORS / body limit yokluğu
- [ ] Çift lockfile (`package-lock.json` + `pnpm-lock.yaml`)
- [ ] Event store'da hash chain yokluğu
- [ ] `Math.random()` ile primary key üretimi

**P2 — kozmetik, ayrı listelenir**
- [ ] `index.html` başlığı "My Google AI Studio App"
- [ ] `docs/architecture-and-design/implemention.md` dosya adı yazım hatası
- [ ] Karışık Türkçe/İngilizce hata mesajları (`E_コネクター未設定` dahil)

---

## APPENDIX M — BENCHMARK GATE

### M.1 Dataset

```text
5 repository tipi × 10 engineering task = 50 task

Repository tipleri : small · medium · large · monorepo · legacy
Task tipleri       : bug fix · feature · refactor · security fix · database change
                     API change · frontend/backend interaction · test repair
                     dependency migration · architecture investigation
```

Her task için ground truth: değişmesi gereken dosyalar, kritik bağlam kaynakları, kabul kriteri (geçmesi gereken test).

### M.2 Karşılaştırma

```text
A — Native Claude Code / Codex workflow
B — Aynı agent + Y

Sabit tutulan: model · task · repo · environment · deneme sayısı
```

### M.3 Ölçülen metrikler

```text
task success rate          input tokens             unauthorized mutation
correct-file recall        iterations               secret leakage
critical-context recall    tool calls               instruction retention
irrelevant-context rate    time-to-solution         context provenance
test pass rate
```

### M.4 Release gate hedefleri

| Metrik | Hedef | Tip |
|---|---|---|
| critical context recall | **≥ 95%** | Hard gate |
| secret leakage | **= 0** | Hard gate (P0) |
| unauthorized mutation | **= 0** | Hard gate (P0) |
| context provenance | **= 100%** | Hard gate |
| **Değer kanıtı** (aşağıdakilerden en az biri) | | Hard gate |
| — native'e göre task success artışı | istatistiksel olarak anlamlı (n=50) | |
| — veya aynı kalite, daha ucuz context | **≥ %30 daha düşük input token** | |
| irrelevant-context rate | ≤ %15 | Soft target |
| time-to-solution | native'den kötü değil | Soft target |

Final hedefler P16'nın ilk ölçüm turundan sonra teknik gerçeğe göre kesinleştirilir; **hard gate'ler düşürülemez.**

---

## APPENDIX N — EXPLICIT NON-GOALS

Bu implementation sırasında aşağıdakiler **yapılmayacaktır**. Ayrı ürün alanı olarak geliştirilmez, sidebar'da yer almaz, hiçbir fazın kapsamına eklenemez:

```text
✗ Y'nin kendi coding agent'ını yazması
    Claude Code ve Codex zaten güçlü execution agent'larıdır.
    Y onların yerine geçmez; context/permission/governance/provenance katmanı olur.

✗ multi-agent council / agent voting / agent social UI
✗ cinematic mission control / dekoratif cybernetic UI / particle landing
✗ standalone CAS ürünü
✗ standalone event explorer
✗ standalone artifact manager
✗ onlarca ayrı dashboard
✗ ilgisiz SaaS connector'ları
✗ karmaşık görselleştirme sistemleri (graph explorer tek advanced ekranla sınırlı)
✗ UI'dan yıkıcı DB işlemleri (dev-reset, migration tetikleme, DB yeniden yapılandırma)
✗ UI'dan release sign-off
✗ test çalıştırmayan "test runner" ekranları
✗ agent'ın iç reasoning'ine bağımlı özellikler
```

**Ayrıca yasak:**

- Yeni ürün alanı icat etmek (scope freeze).
- Mevcut bir modülü "sidebar'da var" diye ayrı bir projeye dönüştürmek.
- Golden path / security / reliability / scale / testability gerekçesi olmayan mekanizma eklemek (YAGNI).
- Gerçekten çalışan bir çekirdek capability'yi silmek — silmek yerine **headless** kullan.

---

## SON KALİTE KONTROLÜ

Bu plan tamamlandığında aşağıdaki soruların **tamamı** olumlu cevaplanabilmelidir:

| Soru | Kanıt |
|---|---|
| Y gerçekten kullanılabilir mi? | P20 golden E2E |
| Gerçek repository bağlanıyor mu? | P03 exit gate |
| Gerçek context üretiliyor mu? | P08 + P09 exit gate |
| Gerçek agent çalışıyor mu? | P11 + P12 exit gate |
| Agent'ın tam olarak ne gördüğü biliniyor mu? | P09 manifest, %100 provenance |
| Policy bypass edilebiliyor mu? | P17 T-10, T-11 |
| Agent görev dışı dosya değiştirebiliyor mu? | P10 + P17 T-11 |
| Evidence gerçek mi? | P14 hash chain + imza doğrulaması |
| Kullanıcı 40 teknik modülle boğuluyor mu? | P15 — 113 route → 6 birincil |
| Benchmark Y'nin değerini kanıtlıyor mu? | P16 Appendix M hard gate'leri |
| Production auth gerçek mi? | P02 OIDC + JWKS |
| Cross-tenant isolation gerçek mi? | P02 + P17 T-01, T-02 |
| CI gerçekten E2E çalıştırıyor mu? | P19 pipeline |
| Fake success yolu kaldı mı? | P19 false-green tarayıcı CI gate'i |
| Kritik TODO kaldı mı? | P20 release blocker checklist |
| Doküman ile kod arasında doğrulanmamış iddia var mı? | P20 feature registry doğrulaması |

**Bu roadmap'in tüm exit gate'leri geçtiğinde proje bitmiş olmalıdır.**

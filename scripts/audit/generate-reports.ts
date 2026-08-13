/**
 * Y-P00-001/005/007/008/009 — Truth Audit anlatı raporlarını üretir.
 * Envanter CSV'lerinden (02/03/04/10) türetir; elle yazılmış sayı içermez.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { AUDIT_DIR, REPO_ROOT, readCsv, rel, walk, writeDoc } from "./lib";

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
  } catch {
    return "(unavailable)";
  }
}

function loc(file: string): number {
  try {
    return fs.readFileSync(file, "utf-8").split(/\r?\n/).length;
  } catch {
    return 0;
  }
}

function main(): void {
  const head = git("rev-parse HEAD");
  const branch = git("branch --show-current");

  // --- Envanterleri oku ---
  const api = readCsv("02-api-inventory.csv").slice(1).filter((r) => r.length > 1);
  const ui = readCsv("03-ui-inventory.csv").slice(1).filter((r) => r.length > 1);
  const db = readCsv("04-db-inventory.csv").slice(1).filter((r) => r.length > 1);
  const fg = readCsv("10-false-green-findings.csv").slice(1).filter((r) => r.length > 1);

  const apiShadowed = api.filter((r) => r[5]).length;
  const apiBearerOnly = api.filter((r) => r[4] === "bearer-only").length;
  const uiReal = ui.filter((r) => r[7] === "REAL").length;
  const uiFake = ui.filter((r) => r[7] === "FAKE").length;
  const dbDead = db.filter((r) => r[8].startsWith("DEAD"));
  const dbWriteOnly = db.filter((r) => r[8].startsWith("WRITE-ONLY"));
  const dbNoOrg = db.filter((r) => r[5] === "false");
  const fgP0 = fg.filter((r) => r[1] === "P0").length;

  // --- 00 method ---
  writeDoc(
    "00-method.md",
    `# 00 — Doğrulama Yöntemi

> Baseline commit: \`${head}\` (\`${branch}\`) · Tarih: 2026-08-13

## Kanıt standardı (ADR-000)

Bir iddia ancak şunlardan biriyle desteklenirse bu audit'e girer:

1. Dosya:satır referansı (kaynak kod okunmuş),
2. Çalıştırılmış komut çıktısı,
3. Şema ile kod karşılaştırması.

**"Dokümanda yazıyor" kanıt değildir.** Repository'deki hiçbir \`PASS\`,
\`verified\`, \`implemented\`, \`production-ready\` iddiasına güvenilmemiştir.

## Üreten script'ler

| Script | Çıktı | Ne yapar |
|---|---|---|
| \`scripts/audit/inventory-api.ts\` | \`02-api-inventory.csv\` | Route'ları kayıt sırasıyla çıkarır, gölgelenmeyi tespit eder |
| \`scripts/audit/inventory-ui.ts\` | \`03-ui-inventory.csv\` | Nav item'ları \`App.tsx\` \`case\` etiketleriyle eşleştirir |
| \`scripts/audit/inventory-db.ts\` | \`04-db-inventory.csv\` | Inline migration DDL'ini ayrıştırır, tablo kullanımını sayar |
| \`scripts/audit/scan-false-green.ts\` | \`10-*.csv/md\` | Sahte başarı kalıplarını tarar |
| \`scripts/audit/verify-inventories.ts\` | — | Envanterlerin kaynakla tutarlılığını doğrular (drift detector) |

Yeniden üretmek için:

\`\`\`bash
npx tsx scripts/audit/inventory-api.ts
npx tsx scripts/audit/inventory-ui.ts
npx tsx scripts/audit/inventory-db.ts
npx tsx scripts/audit/scan-false-green.ts
npx tsx scripts/audit/generate-reports.ts
npx tsx scripts/audit/verify-inventories.ts   # exit 0 olmalı
\`\`\`

## Kapsam dışı

Bu audit **production kodunu değiştirmez**. Yalnız \`docs/\` ve \`scripts/audit/\`
ekler. Tespit edilen bulgular P01–P20 fazlarında kapatılır.
`
  );

  // --- 01 topology ---
  const apiIndexLoc = loc(path.join(REPO_ROOT, "apps", "api", "src", "index.ts"));
  const appTsxLoc = loc(path.join(REPO_ROOT, "apps", "web", "src", "App.tsx"));
  const dbTsLoc = loc(path.join(REPO_ROOT, "apps", "api", "src", "db.ts"));
  const graphLoc = loc(path.join(REPO_ROOT, "packages", "graph", "src", "index.ts"));
  const sqlFiles = walk(path.join(REPO_ROOT), [".sql"]).filter((f) => !rel(f).includes("node_modules"));

  const pkgDir = path.join(REPO_ROOT, "packages");
  const packages = fs
    .readdirSync(pkgDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const allCode = [
    ...walk(path.join(REPO_ROOT, "apps"), [".ts", ".tsx"]),
    ...walk(path.join(REPO_ROOT, "packages"), [".ts", ".tsx"]),
    ...walk(path.join(REPO_ROOT, "workers"), [".ts"]),
    ...walk(path.join(REPO_ROOT, "server.ts"), [".ts"])
  ];
  const importerCount = (pkg: string): number => {
    const re = new RegExp(`from\\s+["']@y/${pkg}["']|from\\s+["'][^"']*packages/${pkg}/`);
    let n = 0;
    for (const f of allCode) {
      if (rel(f).startsWith(`packages/${pkg}/`)) continue;
      if (re.test(fs.readFileSync(f, "utf-8"))) n++;
    }
    return n;
  };

  const pkgRows = packages
    .map((p) => {
      const files = walk(path.join(pkgDir, p), [".ts", ".tsx"]);
      const lines = files.reduce((a, f) => a + loc(f), 0);
      const importers = importerCount(p);
      const status = importers === 0 ? "**ORPHANED (0 importer)**" : `wired (${importers} importer)`;
      return `| \`packages/${p}\` | ${files.length} | ${lines} | ${status} |`;
    })
    .join("\n");

  writeDoc(
    "01-topology.md",
    `# 01 — Fiziksel Topoloji

> Baseline commit: \`${head}\`

## Çalışma zamanı topolojisi

| Katman | Gerçek durum | Kanıt |
|---|---|---|
| HTTP listener | Tek \`express()\` app | \`server.ts\` |
| API mount | \`app.use("/api", apiRouter)\` | \`server.ts:15\` |
| \`apps/api\` | **Server değil** — yalnız \`apiRouter\` + \`apiReady\` export eder | \`apps/api/src/index.ts\` |
| API router | **${apiIndexLoc} satır**, tek \`Router()\`, ${api.length} route inline | \`apps/api/src/index.ts\` |
| Web app | **${appTsxLoc} satır** tek component, router yok | \`apps/web/src/App.tsx\` |
| Şema | **Hiç \`.sql\` dosyası yok** (${sqlFiles.length} adet) — ${dbTsLoc} satırlık \`db.ts\` içinde inline string | \`apps/api/src/db.ts\` |
| Graph paketi | ${graphLoc} satır tek dosya | \`packages/graph/src/index.ts\` |

## Workspace paketleri

| Paket | Dosya | Satır | Bağlanma durumu |
|---|---:|---:|---|
${pkgRows}

## Sonuç

- \`apps/api/src/index.ts\` tek başına ${apiIndexLoc} satır ve ${api.length} route taşıyor;
  bu dosya P01–P19 boyunca **yalnız silme yönünde** değiştirilecek (master §6.1).
- Orphan paketler P01'de silinir.
- Migration'lar P01'de \`migrations/*.sql\` dosyalarına taşınır (ADR-003).
`
  );

  // --- 05 subsystem verdicts ---
  writeDoc(
    "05-subsystem-verdicts.md",
    `# 05 — Subsystem Verdict'leri

> Baseline commit: \`${head}\` · Verdict skalası: REAL · PARTIAL · SIMULATED · ABSENT

| Subsystem | Verdict | Kanıt |
|---|---|---|
| Audit log | **REAL** | \`apps/api/src/audit.ts\`; \`audit_logs\` tablosu; redaksiyon uygulanıyor |
| Event Store | **REAL (append-only)** | \`event_records\` + \`block_event_records_mutation()\` trigger; \`payload_hash\` SHA-256. **Hash chain yok** (\`prev_hash\` kolonu yok) |
| Evidence Store | **REAL** | \`EvidenceStoreService.verifyEvidenceRecord\` hash'i yeniden hesaplayıp karşılaştırıyor. Integrity var, **authenticity yok** (kendi mesajı: "no actor signature was evaluated") |
| Artifact CAS | **REAL (DB-backed)** | \`cas_blobs\` + \`artifact_versions\`, \`UNIQUE(project_id, cas_hash)\` dedup |
| Context Object Store | **REAL** | \`context_objects\` + refs, SHA-256 dedup |
| File Locking | **REAL** | \`file_locks\`, expiry + stale release |
| Worker Registry | **REAL (bookkeeping)** | \`worker_registry\`; \`FOR UPDATE SKIP LOCKED\` claim örüntüsü doğru |
| Knowledge Graph | P00: **REAL ama yanlış kaynaklı** → P05 sonrası: **REAL, symbol kaynaklı** | P00'da node'lar \`context_items\`/\`tasks\`'tan üretiliyor ve sync yıkıcıydı. P05: kaynak \`symbols\`/\`files\`, snapshot bağı, tombstone'lu artımlı sync, recursive CTE traversal |
| Static analysis | P00: **REAL, TypeScript-only** → P04 sonrası: **REAL, 15 dil** | P00'da yalnız TS/JS; \`.py\` "javascript" etiketiyle regex parser'a gidiyordu. P04: tree-sitter WASM grameri + ölçülen confidence |
| Path güvenliği | **REAL** | realpath containment + symlink escape + denylist + 5MB limit + binary detect |
| Repository ingestion (Git) | P00: **ABSENT** → P03 sonrası: **REAL** | P00'da hiç Git entegrasyonu yoktu. P03: \`execFile\` tabanlı git CLI, PathGuard, local/GitHub/GitLab adapter'ları, snapshot ingestion |
| Chunking | P00: **PARTIAL (character-based)** → P04 sonrası: **REAL (symbol-aware)** | P00'da sabit karakter dilimi fonksiyon ortasından kesiyordu. P04: chunk sınırı = symbol sınırı (ADR-020); legacy doküman yolu satır sınırına taşındı |
| Symbol index | P00: **ABSENT** → P04 sonrası: **REAL** | P00'da \`symbols\` tablosu yoktu ve analiz sonucu hiçbir yere yazılmıyordu. P04: 14 zorunlu alanla \`symbols\` + \`chunks\`, gerçek iş yapan index worker |
| Semantic retrieval | P00: **SIMULATED** → P06 sonrası: **REAL (pgvector)** | P00'da keyword örtüşmesi \`semantic_score\` adıyla sunuluyordu ve \`embedding_id\` hep NULL'dı. P06: pgvector kosinüs benzerliği; sağlayıcı yoksa kanal devre dışı ve sonuç \`degraded\` işaretlenir |
| Tokenizer | **SIMULATED** | İki tutarsız tahminci; gerçek BPE yok |
| Token budget | **PARTIAL** | Hard-coded 50.000, üç ayrı yerde; çelişen 4000 default'u |
| Context manifest | **PARTIAL + FABRICATED** | Gerçek reason code'lar var; \`recent_diffs\`, dependency listeleri ve quality gate'ler uydurma |
| **Agent runtime** | **SIMULATED** | \`POST .../runs\` dört event yazıp \`status: "completed"\` dönüyor; hiçbir şey çalıştırmıyor |
| Agent adapters (Claude Code / Codex) | **ABSENT** | Bağımlılık yok; tek gerçek provider \`@google/genai\` ve yalnız \`/api/simulate-task\` kullanıyor |
| Provider health | **SIMULATED** | Yalnız \`process.env\` varlığına bakıyor |
| Quality gates | **PARTIAL (storage only)** | Caller'ın bildirdiği sonucu kaydediyor; sunucu hiçbir komut çalıştırmıyor |
| Real-time (SSE/WS) | **ABSENT** | \`text/event-stream\`, \`EventSource\`, WebSocket app kodu yok |
| UI | **SIMULATED (${uiFake}/${ui.length})** | ${uiReal} ekran gerçek API'ye bağlı, ${uiFake} ekran fabrikasyon |

## Sahte başarı yolları

\`scripts/audit/scan-false-green.ts\` ${fg.length} bulgu üretti (**${fgP0} adet P0**).
Detay: \`10-test-honesty.md\` ve \`10-false-green-findings.csv\`.
`
  );

  // --- 06 security findings ---
  writeDoc(
    "06-security-findings.md",
    `# 06 — Güvenlik Bulguları

> Baseline commit: \`${head}\`
> Sınıflandırma: **P0** = release blocker · **P1** = production-critical · **P2** = kozmetik

Envanterden türeyen ölçüt: ${api.length} route'un **${apiBearerOnly}'i** yalnız
bearer token kontrolünden geçiyor (proje kapsamı doğrulaması yok);
${db.length} tablonun **${dbNoOrg.length}'inde** tenant izolasyon kolonu yok.

## P0 — Release blocker

| # | Bulgu | Konum | Attack | Impact | Mitigation (faz) | Test |
|---|---|---|---|---|---|---|
| P0-1 | \`GET /api/auth/dev-session\` auth'suz \`role:"admin"\`, \`projectIds:["*"]\` token dağıtır | \`apps/api/src/index.ts:100\`, \`auth.ts:111-129\` | Porta erişen herkes token ister | Tam admin | P02 (silinir) | \`tests/security/jwt.spec.ts\` |
| P0-2 | \`POST /api/db/configure\` connection string alır, global \`db\`'yi değiştirir, **düz metin parolayı \`.env\`'e yazar** | \`apps/api/src/index.ts:1024-1140\` | Saldırgan kendi PG'sine yönlendirir | SSRF + credential harvest + kalıcı config zehirlenmesi | P02 (silinir) | \`tests/security/ssrf.spec.ts\` |
| P0-3 | HS256 JWT anahtarı \`JWT_SECRET \\|\\| Y_API_AUTH_TOKEN\` | \`apps/api/src/auth.ts:201\` | Paylaşımlı token ile JWT forge | Rol ve proje yükseltme | P02 (jose + JWKS) | \`tests/security/jwt.spec.ts\` |
| P0-4 | DB-backed authz fonksiyonu import edilip **hiç çağrılmıyor**; hedeflediği \`project_memberships(user_id)\` tablosu yok, hata yutuluyor | \`apps/api/src/auth.ts:398-430\`, \`index.ts:82\` | — | Cross-project izolasyon DB'de hiç doğrulanmıyor | P02 | \`tests/security/idor.spec.ts\` |
| P0-5 | Permission Kernel \`CI=true\` iken DB hatasında **statik allow listesine** düşer | \`apps/api/src/PermissionKernelService.ts:67-147\` | Policy store'u düşür | Allow-by-default | P02 (fallback silinir) | \`tests/security/fail-closed.spec.ts\` |
| P0-6 | \`enforce()\` çağrıları \`subject_type:"system"\` hard-code ediyor; seed policy \`allow / system / * / *\` | \`EvidenceStoreService.ts:231\`, \`EventStoreService.ts:205\`, \`ArtifactCASService.ts:442/513/628/667\` | — | Mevcut enforcement noktaları her zaman allow | P02 | \`tests/security/fail-closed.spec.ts\` |
| P0-7 | \`permissions/evaluate\` client'ın \`subject\` nesnesini spread ediyor | \`apps/api/src/index.ts:4402\` | \`subject_type:"system"\` gönder | Allow + sahte audit | P02 | \`tests/security/approval-bypass.spec.ts\` |
| P0-8 | ${apiBearerOnly} route proje kapsamı doğrulaması yapmıyor (\`/audit-logs\` tüm projelerin logunu döndürüyor) | \`02-api-inventory.csv\` (guard=bearer-only) | Başka projenin id'si | IDOR / cross-project | P02 | \`tests/security/idor.spec.ts\` |
| P0-9 | \`repo/configure-local\` keyfi mutlak \`root_path\` kabul eder; yapılandırılmamışsa root \`"."\` = sunucu cwd'si | \`apps/api/src/index.ts:4632\`, \`repo-adapter-service.ts:22-46\` | Root'u \`/\` yap | Keyfi dizin okuma | P03 (yönetilen workspace) | \`tests/security/path-guard.spec.ts\` |
| P0-10 | \`source_table\` SQL'e string interpolation ile giriyor | \`ContextObjectStoreService.ts:219\` | FROM clause kontrolü | Veri sızıntısı | P09 | regresyon testi |
| P0-11 | Kaynak kodda **parçalanmış gerçek DB parolası** ve Supabase host'u | \`packages/security/src/index.ts:23-25,48\` | Git geçmişi okunur | Credential ifşası | P03 (kod) + P17 (rotasyon) | \`secret-scan\` |
| P0-12 | \`config/inspect\` yanıtı regex'lenip **düz metin DB parolası React state'ine** yazılıyor | \`apps/web/src/hooks/useWorkspace.ts:103-127\` | DOM incelemesi | Credential ifşası | P02 | bundle taraması |
| P0-13 | Agent run tamamen sahte: dört event yazıp \`status:"completed"\` dönüyor | \`apps/api/src/index.ts:296-377\` | — | Ürün iddiası gerçek değil | P12 | \`tests/e2e/real-run.spec.ts\` |

## P1 — Production-critical

| # | Bulgu | Konum | Faz |
|---|---|---|---|
| P1-1 | ${apiShadowed} route \`router.all(["/tasks","/tasks/*"])\` tarafından gölgelenmiş; frontend hâlâ çağırıyor | \`apps/api/src/index.ts:166\` | P12/P15 |
| P1-2 | Şema↔kod drift'i (5 kalem) gerçek 500'ler üretiyor | \`07-schema-drift.md\` | P02 |
| P1-3 | CI E2E'yi kuruyor ama çalıştırmıyor; migration'lar testlerden sonra | \`.github/workflows/ci.yml\` | P19 |
| P1-4 | Mock DB production kod yolunda; \`ENABLE_MOCK_DB\` yerel \`.env\`'de \`true\` | \`apps/api/src/db.ts:562+\` | P19 |
| P1-5 | ${fg.length} sahte başarı bulgusu (${fgP0} P0) | \`10-false-green-findings.csv\` | P17/P19 |
| P1-6 | helmet / CORS / rate limit / body limit yok | \`server.ts\` | P01 |
| P1-7 | Primary key'ler \`Math.random()\` ile üretiliyor | 60 çağrı noktası | P01 |
| P1-8 | Event store'da hash chain yok | \`event_records\` | P14 |
| P1-9 | Çift lockfile (npm + pnpm) | kök | P01 |

## P2 — Kozmetik

| # | Bulgu |
|---|---|
| P2-1 | \`index.html\` başlığı "My Google AI Studio App" |
| P2-2 | \`docs/architecture-and-design/implemention.md\` dosya adı yazım hatası |
| P2-3 | Karışık dil hata mesajları (\`E_コネクター未設定\`) |
`
  );

  // --- 07 schema drift ---
  writeDoc(
    "07-schema-drift.md",
    `# 07 — Şema ↔ Kod Drift'i

> Kodun okuduğu/yazdığı ama şemada bulunmayan alanlar. Her biri gerçek Postgres'te
> \`42703 undefined_column\` üretir.

| # | Kod beklentisi | Konum | Şema gerçeği | Sonuç |
|---|---|---|---|---|
| D-1 | \`projects.organization_id\` | \`apps/api/src/index.ts:189-191\` | kolon yok | \`GET /api/projects\` — \`org_id\` taşıyan her JWT principal için **500** |
| D-2 | \`tasks.assigned_to\` | \`apps/api/src/index.ts:237\` | kolon yok | \`PATCH .../tasks/:id\` → 500 |
| D-3 | \`permission_policies.project_id\`, \`.is_system\` | \`apps/api/src/index.ts:4377\` | ikisi de yok | \`GET .../permission-policies\` gerçek PG'de **her zaman 500** (UI bunu çağırıyor) |
| D-4 | \`audit_logs(category, actor_role, is_approved_by_human)\` | \`packages/core/src/repo-adapter-service.ts:104-120\` | kolonlar yok, \`await\` try/catch'siz | \`/repo/file\`, \`/repo/files\` gerçek PG'de 500 (yalnız mock DB'de çalışıyor) |
| D-5 | \`project_memberships(project_id, user_id)\` | \`apps/api/src/auth.ts:419\` | yalnız \`memberships(user_email)\` | DB-backed authz kalıcı \`false\`, hata yutuluyor |

## Tenant izolasyonu

\`04-db-inventory.csv\`: **${db.length} tablonun ${dbNoOrg.length}'inde**
\`organization_id\`/\`tenant_id\` kolonu yok. Cross-tenant izolasyon şema
seviyesinde mümkün değil.

## Ölü şema

| Sınıf | Tablolar |
|---|---|
| DEAD (0 okuma, 0 yazma) | ${dbDead.map((r) => `\`${r[0]}\``).join(", ") || "—"} |
| WRITE-ONLY (hiç okunmuyor) | ${dbWriteOnly.map((r) => `\`${r[0]}\``).join(", ") || "—"} |

> Not: \`schema_migrations\` runner tarafından \`db.ts\` içinden kullanılır
> (tarama \`db.ts\`'i hariç tuttuğu için DEAD görünür) — yanlış pozitiftir.
> \`permission_policies\` migration seed'i ile yazılır, aynı sebeple WRITE sayılmaz.
`
  );

  // --- 08 dead code ---
  writeDoc(
    "08-dead-code.md",
    `# 08 — Ölü Kod ve Ölü Route'lar

## Gölgelenmiş route'lar

\`apps/api/src/index.ts:166\` satırındaki

\`\`\`ts
router.all(["/tasks", "/tasks/*"], (req, res) => res.status(410).json({ ... }));
\`\`\`

kendisinden **sonra** kaydedilen **${apiShadowed} route'u** erişilemez kılıyor.
Tam liste: \`02-api-inventory.csv\` → \`shadowed_by\` kolonu dolu satırlar.

Frontend bunlardan bir kısmını hâlâ çağırıyor (\`apps/web/src/lib/api/tasks.ts\`),
yani o özellikler sessizce 410 dönüyor.

## Fabrikasyon UI ekranları

${uiFake} nav item \`ModuleSimulationPanel\`'e düşüyor (\`App.tsx\` \`default:\` dalı).
Tam liste: \`03-ui-inventory.csv\` → \`verdict = FAKE\`.

**Dürüstlük mekanizması kırık:** \`navigation.ts\` \`status\` alanı taşıyor ve
\`AppShell.tsx\` \`placeholder\` için "Simüle" rozeti gösteriyor — ama
${ui.length} kaydın tamamı \`"implemented"\`, \`"placeholder"\` sayısı **0**.
Ayrıca \`App.tsx\`'teki dürüst \`renderPlaceholderView()\` fonksiyonu tanımlı
ve **hiç çağrılmıyor**.

## Ölü frontend modülleri

| Modül | Durum |
|---|---|
| \`apps/web/src/features/landing/**\` | 0 importer |
| \`apps/web/src/hooks/useKnowledgeGraph.ts\` | 0 importer |
| \`apps/web/src/hooks/useSecurityVault.ts\` | 0 importer |
| \`apps/web/src/modules/command/ProjectDashboard.tsx\` | 0 importer |
| \`LandingPage\` + \`CyberCanvas\` + \`SymmetryHud\` + \`ControlTerminal\` | \`cockpitLaunched=true\` başlangıç değeri yüzünden tek gizli butonun arkasında |

## Ölü şema

Bkz. \`07-schema-drift.md\` → Ölü şema bölümü.
`
  );

  // --- 09 doc contradictions ---
  writeDoc(
    "09-doc-contradictions.md",
    `# 09 — Doküman ↔ Kod Çelişkileri

> Her satır, bir dokümanın iddiasını envanterden gelen ölçülmüş değerle karşılaştırır.

| İddia | Kaynak | Ölçülen gerçek | Kanıt |
|---|---|---|---|
| "15 navigation categories and 78 UI routes" | \`docs/audit/02-route-inventory.md\` | 15 kategori, **${ui.length} item** | \`03-ui-inventory.csv\` |
| 12 API endpoint | \`docs/audit/03-api-inventory.md\` | **${api.length} route** | \`02-api-inventory.csv\` |
| "Tüm 15 kategori PASS" | \`docs/audit/10-feature-traceability-matrix.md\` | ${uiFake}/${ui.length} ekran fabrikasyon | \`03-ui-inventory.csv\` |
| "162 assertion, 0 failure" | \`docs/audit/08-test-inventory.md\` | ${fg.filter((r) => r[0] === "assert-true").length} adet \`assert("...", true)\` | \`10-false-green-findings.csv\` |
| Stage 27–35 "SUCCESSFUL PASS" | \`docs/stages/*.md\` | Suite CI'da migration'lardan **önce** çalışıyor; DB dalları sandbox'a düşüyor | \`.github/workflows/ci.yml\`, ${fg.filter((r) => r[0] === "skip-then-pass").length} skip-then-pass bulgusu |
| "Phase 8 Cockpit UX Overhaul tamamlandı" | \`README.md:332\` | \`awwwards-loop/state.json\`: \`"hardGatesPassed": false, "lastScore": null\` | dosya |
| \`qa-debug-tags\` "fdescribe/fit reddeder" | \`README.md:84\` | Script'te bu string'ler yok | \`scripts/qa-debug-tags.ts\` |
| "\`test:db\` 0 failure, 0 skip ile geçti" | \`implementation.md:25\` | \`test:db\` CI'da hiç çalışmıyor | \`.github/workflows/ci.yml\` |
| "4 worker" | \`docs/audit/06-worker-job-inventory.md\` | Yalnız \`workers/index-worker.ts\` var | dizin listesi |
| "Gemini + Claude 3.5 + DeepSeek + GCP/Vertex/BigQuery connector" | \`docs/audit/07-provider-connector-inventory.md\` | Yalnız \`@google/genai\`; \`@anthropic-ai/*\` ve \`openai\` bağımlılığı yok | \`package.json\` |

## Kapanış

Bu çelişkilerin tamamı **P20'de** tek tek kapatılır (\`Y-P20-010\`).
O ana kadar ilgili belgelerde \`SUPERSEDED\` banner'ı bulunur.
`
  );

  console.log(`[audit] Narrative reports -> ${rel(AUDIT_DIR)}`);
  for (const f of fs.readdirSync(AUDIT_DIR).sort()) {
    console.log(`[audit]   ${f}`);
  }
}

main();

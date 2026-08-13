# Phase 00 — Truth Audit & Scope Freeze

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P00 |
| **Workstream** | Tüm ekip (senkron) |
| **Dependencies** | — |
| **Baseline commit** | `9f10f70` |

## Objective

Repository'nin gerçek durumunu kaynak koddan çıkarmak, tüm doğrulanmamış "PASS/verified/complete" iddialarını geçersiz kılmak, ürün kapsamını dondurmak ve sonraki 20 fazın üzerine kurulacağı kanıt tabanını oluşturmak.

## Why This Phase Exists

Repository 30+ doküman, bir feature registry ve 9 "SUCCESSFUL PASS" stage raporu içeriyor. Bunların dayanağı olan test suite'i CI'da migration'lardan **önce** çalışıyor ve DB dalları `assert("Simulated ...", true)` ile sonuçlanıyor. 113 UI ekranının 103'ü fabrikasyon. Bu belgelere dayanarak plan yapmak, planın kendisini de yanlış temele oturtur.

Bu faz kod yazmaz. **Gerçeği kaydeder.**

## Dependencies

Yok. İlk faz.

## Current Repository Reality

Master plan §1'de tam liste. Bu fazın çıktısı o bölümün kanıt dosyalarıdır.

Özet:
- 7.170 satır tek dosya API router, ~200 route
- Sıfır Git entegrasyonu
- Sahte agent run (`apps/api/src/index.ts:296-377`)
- 12 P0 güvenlik bulgusu
- 5 kalem şema↔kod drift'i (gerçek 500'ler)
- CI E2E'yi kurar ama çalıştırmaz

## Target State

```text
docs/audit/2026-08-13-truth-audit/
├── 00-method.md                  doğrulama yöntemi ve komutlar
├── 01-topology.md                fiziksel topoloji + LOC + dosya sahipliği
├── 02-api-inventory.csv          ~200 route: method, path, dosya, satır, guard, verdict
├── 03-ui-inventory.csv           113 nav item: id, route, component, veri kaynağı, verdict
├── 04-db-inventory.csv           35 migration, tüm tablolar, kolonlar, FK, index, kullanım sayısı
├── 05-subsystem-verdicts.md      REAL / PARTIAL / SIMULATED / ABSENT
├── 06-security-findings.md       P0/P1/P2, her biri dosya:satır + PoC
├── 07-schema-drift.md            kod↔şema uyuşmazlıkları
├── 08-dead-code.md               ölü tablo, ölü route, ölü component
├── 09-doc-contradictions.md      her doküman iddiası vs kod
└── 10-test-honesty.md            assert(true) sayımı, skip yolları, CI gate analizi
```

Ayrıca:
- `docs/audit/feature-registry.yaml` → **tüm statüler sıfırlanır**, hiçbiri `PASS` kalmaz.
- Eski audit belgelerine `SUPERSEDED BY 2026-08-13 TRUTH AUDIT` banner'ı eklenir.

## Architecture Decisions

**ADR-000 — Kanıt standardı.** Bir iddia ancak şu üçünden biriyle desteklenirse plana girer: (a) dosya:satır referansı, (b) çalıştırılmış komut çıktısı, (c) şema ile kod karşılaştırması. "Dokümanda yazıyor" kanıt değildir.

## Files / Packages Affected

Yalnızca `docs/`. **Production koduna dokunulmaz.**

### New Files
Yukarıdaki 11 audit dosyası.

### Files to Modify
- `docs/audit/feature-registry.yaml` — statü sıfırlama
- `docs/audit/*.md` (11 kısa rapor) — banner
- `docs/stages/stage-27..35-validation.md` — banner
- `README.md`, `implementation.md` — doğrulanmamış tamamlanma iddialarına banner

### Files to Delete/Deprecate
- Root'taki `Y_AI_Agent_Context_OS_Guncel_Kaynak_Kod_Denetimi_v2_2026-08-04.md` (untracked, `docs/audit/` içindeki kopyanın duplikasyonu) → silinir.

## Database Changes
Yok.

## API Changes
Yok.

## Type / Contract Changes
Yok.

## Frontend Changes
Yok.

## Backend Changes
Yok.

## Worker Changes
Yok.

## Security Changes

P0 bulguları **kaydedilir ama bu fazda düzeltilmez** — biri hariç:

**Y-P00-009 acil azaltma:** `.env` dosyasındaki `ENABLE_MOCK_DB=true` yerel geliştirici makinelerinde kapatılır ve `.env.example`'a "**bu değer üretimde ve paylaşılan ortamda asla true olmamalıdır — auth'suz admin token dağıtır**" uyarısı eklenir. Kod değişikliği değil, konfigürasyon uyarısıdır.

`packages/security/src/index.ts:23-25`'teki gömülü DB parolası **P17'de rotate edilir**; bu fazda yalnızca P0 olarak kaydedilir ve ilgili Supabase credential'ının rotate edilmesi gerektiği not düşülür.

## Migration Strategy
Yok.

## Implementation Tasks

### Y-P00-001 — Repository discovery
**Goal:** Fiziksel topolojiyi ve dosya sahipliğini çıkarmak.
**Create:** `docs/audit/2026-08-13-truth-audit/01-topology.md`
**Algorithm:** `git log`, `cloc`/satır sayımı, workspace paket grafiği, hangi paketin nereden import edildiğinin grep'i.
**Outputs:** Paket başına LOC, importer sayısı, orphan işaretleri.
**Acceptance:** Her `packages/*` girdisi için "wired / orphaned" verdict'i var.

### Y-P00-002 — API inventory
**Goal:** ~200 route'un tamamını çıkarmak.
**Create:** `02-api-inventory.csv`
**Algorithm:** `apps/api/src/index.ts` içinde `router.(get|post|patch|put|delete|all)` regex'i + kayıt sırası analizi. **Kayıt sırası kritik**: `router.all(["/tasks","/tasks/*"])` (L166) kendinden sonraki tüm `/tasks/*` route'larını gölgeliyor.
**Fields:** `method, path, file, line, guard(none|bearer|requireProjectScope), shadowed_by, verdict(KEEP|CHANGE|DEPRECATE|DELETE|REPLACE)`
**Edge Cases:** Aynı path'in iki kez kaydedilmesi (`GET /projects` L178 ve L1218) — ilki kazanır.
**Acceptance:** Route sayısı `grep -c` ile doğrulanır; gölgelenen her route işaretlenir.

### Y-P00-003 — UI inventory
**Goal:** 113 nav item'ın veri kaynağını belirlemek.
**Create:** `03-ui-inventory.csv`
**Algorithm:** `navigation.ts`'ten item listesi, `App.tsx`'teki `case` etiketleriyle eşleştirme; eşleşmeyen her item `ModuleSimulationPanel`'e düşer.
**Fields:** `category, id, label, route, component, data_source(API endpoint|literal|setTimeout), verdict`
**Acceptance:** 113 satır; `REAL` sayısı = `App.tsx` `case` sayısı ile tutarlı (11).

### Y-P00-004 — Database inventory
**Goal:** 35 migration'ın ürettiği şemayı ve gerçek kullanımını çıkarmak.
**Create:** `04-db-inventory.csv`
**Algorithm:** `apps/api/src/db.ts` `migrationVersions` array'inin parse'ı + her tablo adı için `FROM|INTO|UPDATE|JOIN <table>` grep sayımı (`apps/`, `packages/`, `workers/`).
**Fields:** `table, migration_version, columns, fks, indexes, read_count, write_count, verdict`
**Acceptance:** `read_count = 0 AND write_count = 0` olan her tablo `08-dead-code.md`'de listelenir.

### Y-P00-005 — Subsystem verdicts
**Goal:** Her subsystem için REAL/PARTIAL/SIMULATED/ABSENT kararı.
**Create:** `05-subsystem-verdicts.md`
**Inputs:** Y-P00-001..004 çıktıları.
**Acceptance:** Her verdict'in yanında en az bir dosya:satır kanıtı var.

### Y-P00-006 — Fake success path taraması
**Goal:** Başarının simüle edildiği her noktayı bulmak.
**Algorithm:** Grep örüntüleri — `setTimeout`, `Math.random().toString(16)`, `status: "completed"` (execution olmadan), `fallback.*[Ss]uccess`, `mock`, `simulat`, hard-coded hash/metric literal'leri.
**Outputs:** `05-subsystem-verdicts.md` içinde "FAKE SUCCESS PATHS" bölümü, her biri kod alıntısıyla.
**Acceptance:** `apps/api/src/index.ts:296-377`, `server.ts:138-277`, `apps/web/src/App.tsx:284-392`, `AIMissionControlPanel.tsx:100-235`, `ModuleSimulationPanel.tsx`, `workers/index-worker.ts:55-96` listede.

### Y-P00-007 — Security findings
**Goal:** P0/P1/P2 sınıflandırması.
**Create:** `06-security-findings.md`
**Format:** her bulgu → `ID · Başlık · Konum · Attack · Impact · Mitigation (hangi fazda) · Test (hangi suite)`
**Acceptance:** Master plan §1.3'teki 12 P0 kalemi eksiksiz; her biri Appendix I'deki bir T-NN tehdidiyle eşleşiyor.

### Y-P00-008 — Schema drift raporu
**Goal:** Kodun okuduğu ama şemada olmayan (ve tersi) her alanı bulmak.
**Create:** `07-schema-drift.md`
**Algorithm:** SQL string'lerindeki kolon adları vs `migrationVersions` DDL'i.
**Acceptance:** 5 bilinen drift kalemi + varsa yenileri; her biri için "hangi endpoint 500 veriyor" tespiti.

### Y-P00-009 — Acil konfigürasyon uyarısı
**Goal:** `ENABLE_MOCK_DB=true` riskini görünür kılmak.
**Modify:** `.env.example`
**Acceptance:** Uyarı metni mevcut; `.env` (untracked) dokümante edilmiş şekilde temizlenmiş.

### Y-P00-010 — Doküman çelişki raporu
**Goal:** Her doküman iddiasını kodla karşılaştırmak.
**Create:** `09-doc-contradictions.md`
**Acceptance:** `docs/audit/*.md`, `docs/stages/*.md`, `README.md`, `implementation.md`, `feature-registry.yaml` taranmış; her çelişki için "iddia / kaynak / gerçek / kanıt" satırı var.

### Y-P00-011 — Test dürüstlüğü raporu
**Goal:** Test suite'inin ne kanıtladığını ölçmek.
**Create:** `10-test-honesty.md`
**Algorithm:** `assert(\s*"[^"]*",\s*true\s*)` sayımı; skip-then-pass yollarının listesi; `validation-suite.ts` skip detector regex'lerinin kapsamadığı skip mesajları; CI adım sırası analizi.
**Acceptance:** Dosya başına `assert(true)` sayısı tabloda; `validation-suite.ts:16-23`'ün kaçırdığı 2 skip mesajı isimlendirilmiş.

### Y-P00-012 — Feature registry sıfırlama
**Goal:** Doğrulanmamış statüleri geçersiz kılmak.
**Modify:** `docs/audit/feature-registry.yaml`
**Algorithm:** Tüm `status` alanları yeni enum'a (§7.1) çevrilir; kanıtı olmayan her kayıt `SIMULATED` veya `PARTIAL`'a düşer. `tests:` alanı 15 kayıtta da aynı olduğu için silinir; yerine faz referansı gelir.
**Acceptance:** `PASS` sayısı = 0. Her kaydın `evidence:` alanı boş veya audit dosyasına referans.

### Y-P00-013 — Scope freeze kaydı
**Goal:** Non-goal listesini bağlayıcı hale getirmek.
**Create:** `docs/adr/ADR-000-scope-freeze.md`
**Acceptance:** Appendix N'deki liste ADR olarak kayıtlı; ADR'de "bu listeye ekleme yapmak yeni bir ADR gerektirir" maddesi var.

### Y-P00-014 — Eski belgelere banner
**Modify:** `docs/audit/*.md`, `docs/stages/*.md`, `README.md`, `implementation.md`
**Acceptance:** Her dosyanın ilk satırında `> ⚠️ SUPERSEDED — bu belgedeki durum iddiaları 2026-08-13 Truth Audit ile geçersizdir.`

## Parallelizable Tasks

```text
Y-P00-002 (API) ∥ Y-P00-003 (UI) ∥ Y-P00-004 (DB)   — farklı dosyalar
Y-P00-006 ∥ Y-P00-007                                — grep tabanlı, bağımsız
Y-P00-010 ∥ Y-P00-011                                — farklı belge kümeleri
```

Sıralı olmak zorunda: `001 → (002∥003∥004) → 005 → (006∥007) → 008 → 012 → 013 → 014`.

## Tests

Bu faz kod üretmez; testleri **doğrulama scriptleridir**:

- `scripts/audit/verify-route-count.ts` — CSV'deki route sayısı ile kaynaktaki grep sayımı eşleşiyor mu?
- `scripts/audit/verify-nav-count.ts` — CSV'deki nav item sayısı `navigation.ts` ile eşleşiyor mu?
- `scripts/audit/verify-table-usage.ts` — CSV'deki `read_count`/`write_count` yeniden hesaplandığında aynı mı?

Bu üç script P19'da CI'a **drift detector** olarak eklenir.

## Negative Tests

- Audit CSV'sine kaynakta olmayan bir route eklenirse `verify-route-count` **fail** etmelidir.
- `feature-registry.yaml`'a kanıtsız bir `PASS` eklenirse P19 registry validator'ı **fail** etmelidir (bu faz sadece kaydı sıfırlar; enforcement P19'da).

## Security Tests

Yok (bu faz enforcement yapmaz). Bulgular P17'nin test planına girdi olur.

## E2E

Yok.

## Observability

Yok.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Eksik envanter | Bir route/tablo/ekran audit'te yok | P01 sözleşmeleri eksik tanımlanır → geri dön, envanteri tamamla |
| Yanlış verdict | "REAL" denilen bir şey aslında simüle | Sonraki fazda "zaten çalışıyor" varsayımıyla atlanır → **her REAL verdict'i en az bir çalıştırma kanıtı ister** |
| Doküman körlüğü | Eski belgeye güvenilir | Banner'lar bunu engeller |

## Rollback / Recovery

Bu faz yalnızca `docs/` ekler. Rollback = commit revert. Production riski yok.

## Acceptance Criteria

1. 11 audit dosyası mevcut ve dolu.
2. API envanteri satır sayısı kaynaktaki route sayımıyla eşleşiyor.
3. UI envanteri 113 satır; `REAL` sayısı 11 (+1 hybrid) ile tutarlı.
4. DB envanterinde her tablo için okuma/yazma sayımı var.
5. 12 P0 bulgusu dosya:satır ve PoC ile kayıtlı.
6. `feature-registry.yaml` içinde `PASS` sayısı = 0.
7. ADR-000 scope freeze yazılmış.
8. Tüm eski durum belgelerinde SUPERSEDED banner'ı var.
9. Üç doğrulama scripti çalışıyor ve geçiyor.

## Evidence Required

```text
docs/audit/2026-08-13-truth-audit/     11 dosya, git'e commit'li
scripts/audit/*.ts çıktıları           terminal log
git rev-parse HEAD                     audit'in bağlandığı commit
Route/nav/table sayım komutları         komut + çıktı, 00-method.md içinde
```

## Exit Gate

```bash
# Envanter tutarlılığı
tsx scripts/audit/verify-route-count.ts     # exit 0
tsx scripts/audit/verify-nav-count.ts       # exit 0
tsx scripts/audit/verify-table-usage.ts     # exit 0

# Registry temizliği
grep -c "status: PASS" docs/audit/feature-registry.yaml   # 0

# Banner kapsaması
for f in docs/audit/0*.md docs/stages/*.md README.md implementation.md; do
  head -1 "$f" | grep -q "SUPERSEDED" || echo "BANNER MISSING: $f"
done   # çıktı boş
```

**Gate geçmeden P01 başlamaz.** P01'in tüm sözleşmeleri bu envanterden türetilir.

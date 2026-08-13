# Phase 16 — Evaluation & Benchmark Harness

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P15](P15-ui-product-consolidation.md) · [P17 →](P17-security-hardening.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P16 |
| **Workstream** | F — Quality |
| **Dependencies** | P12, P14 |
| **Migration bloğu** | `0113`–`0116` |

## Objective

Y'nin gerçekten değer kattığını ölçülebilir biçimde kanıtlamak: 50 görevlik değerlendirme veri kümesi, Native vs Y karşılaştırması, ve release gate metrikleri.

## Why This Phase Exists

Bugün repo'da hiçbir benchmark yok. Var olan "ölçümler" uydurma: `server.ts:139-283` `estimatedCost: "$0.14 USD (92% cheaper than vanilla GPT-4…)"` döndürüyor; `apps/web/src/lib/api/ai.ts` `confidenceScore: 92.4`, `tokensInvolved: 12450000`, `compressedPackTokens: 48200` üretiyor; `ModuleSimulationPanel.tsx:185-199` sıkıştırma oranını `budgetAlgo === "semantic" ? 0.72 : ...` sabitinden hesaplıyor. `docs/stages/stage-35-validation.md`'deki "%62–81 alan tasarrufu" iddiası da bu literal'lerden geliyor.

Bir "context optimization" ürünü, context'i iyileştirdiğini ölçmeden tamamlanmış sayılamaz. Bu faz, ürün tezinin kanıtıdır.

## Dependencies

P12 (gerçek run), P14 (kanıt — ölçümler kanıttan okunur).

## Current Repository Reality

| Konu | Gerçek |
|---|---|
| Benchmark | Yok |
| Recall ölçümü | P06'da taban harness kuruldu (`tests/integration/retrieval/recall.test.ts`) |
| Metrik iddiaları | Uydurma literal'ler (yukarıda) |
| Değerlendirme veri kümesi | Yok |

## Target State

```text
5 repository tipi × 10 engineering task = 50 task

Repository : small · medium · large · monorepo · legacy
Task       : bug fix · feature · refactor · security fix · database change
             API change · frontend/backend interaction · test repair
             dependency migration · architecture investigation

A — Native Claude Code / Codex workflow
B — Aynı agent + Y
Sabit: model · task · repo · environment · deneme sayısı
```

## Architecture Decisions

- **ADR-059 (yeni)** — **Ground truth insan tarafından etiketlenir, Y tarafından değil.** Her task için değişmesi gereken dosyalar ve kritik bağlam kaynakları bağımsız olarak işaretlenir. Sebep: Y'nin kendi çıktısını ground truth sayması ölçümü anlamsız kılar.
- **ADR-060 (yeni)** — **Repository'ler gerçek açık kaynak projelerinin sabitlenmiş commit'leridir.** Sentetik repo üretilmez. Sebep: sentetik repo'da context problemi yoktur; ölçüm gerçek karmaşıklığa ihtiyaç duyar.
- **ADR-061 (yeni)** — **Metrikler kanıttan okunur.** `input tokens`, `tool calls`, `unauthorized mutation`, `context provenance` gibi değerler benchmark koşucusu tarafından hesaplanmaz; run'ın evidence bundle'ından (P14) çıkarılır. Sebep: ölçüm ile üretim aynı kaynaktan gelmezse ölçüm doğrulanamaz.
- **ADR-062 (yeni)** — **Native kol da aynı kanıt formatına indirgenir.** Native çalıştırma sarmalayıcı bir gözlemciyle sarılır (dosya değişimi, tool çağrısı, token sayımı). Sebep: iki kol karşılaştırılabilir olmalı.

## Files / Packages Affected

Yeni `packages/eval`, `benchmarks/`, `migrations/`.

### New Files

```text
packages/eval/package.json
packages/eval/src/{index.ts,types.ts}
packages/eval/src/dataset/{loader.ts,schema.ts,validate.ts}
packages/eval/src/runner/{native-arm.ts,y-arm.ts,orchestrator.ts}
packages/eval/src/metrics/{recall.ts,tokens.ts,mutations.ts,provenance.ts,retention.ts}
packages/eval/src/report/{compare.ts,render.ts}
benchmarks/datasets/{small,medium,large,monorepo,legacy}/manifest.yaml
benchmarks/datasets/**/tasks/*.yaml         (50 task, ground truth ile)
benchmarks/results/                          (koşum çıktıları, git'e commit'li)
migrations/0113_eval_datasets.sql … 0116_eval_results.sql
packages/eval/src/__tests__/*.test.ts
```

### Files to Modify

- `docs/stages/stage-35-validation.md` ve benzeri belgeler — uydurma tasarruf iddiaları **kaldırılır**, yerine gerçek benchmark sonucuna referans konur.

### Files to Delete/Deprecate

- P11/P15'te silinen sahte metrik üreticileri burada doğrulanır (regresyon testi).

## Database Changes

```text
0113  eval_datasets   (id, name, repo_url, commit_sha, size_class, task_count)
0114  eval_tasks      (dataset_id, task_id, prompt, acceptance_test,
                       ground_truth_files[], ground_truth_context[])
0115  eval_runs       (eval_task_id, arm ENUM(native|y), model, agent_adapter,
                       run_id FK task_runs, started_at, ended_at)
0116  eval_results    (eval_run_id, metric, value, unit)
```

## API Changes

Yok (benchmark CLI + CI job'ı olarak çalışır). Sonuçlar `benchmarks/results/` altında ve DB'de.

## Type / Contract Changes

`EvalTask`, `EvalRun`, `EvalMetric`, `ComparisonReport` (P01'e eklenir).

## Frontend Changes

Yok. Benchmark bir ürün yüzeyi **değildir** (scope freeze).

## Backend Changes

Yok (eval runner ayrı bir süreç).

## Worker Changes

Benchmark koşumları normal run kuyruğunu kullanır — üretimle aynı yolu ölçmek için.

## Security Changes

- Benchmark repo'ları untrusted içerik olarak işlenir (aynı P03/P17 korumaları).
- **Prompt injection ölçümü** bu fazda yapılır: veri kümesine kasıtlı enjeksiyon payload'ları taşıyan görevler eklenir (T-05); Y kolunun policy ihlali sayısı **0 olmalıdır**.
- Secret leakage ölçümü: veri kümesinde gerçekçi sır formatları bulunur; her iki kolda sızıntı sayılır. Y kolu için hedef **0** (hard gate).

## Migration Strategy

1. Veri kümesi şeması + 5 repo seçimi + commit sabitleme.
2. 50 task etiketleme (ground truth).
3. Native kol gözlemcisi + Y kolu koşucusu.
4. Metrik hesaplayıcıları (kanıttan okuma).
5. İlk ölçüm turu → hedeflerin kesinleştirilmesi.

## Implementation Tasks

### Y-P16-001 — Veri kümesi şeması + doğrulayıcı
**Create:** `dataset/{schema,validate}.ts`. Her task: prompt, acceptance test (çalıştırılabilir), ground truth dosyalar, kritik bağlam kaynakları.
**Acceptance:** Eksik ground truth'lu task veri kümesine giremiyor.

### Y-P16-002 — 5 repository seçimi ve sabitlenmesi
**Create:** `benchmarks/datasets/*/manifest.yaml`. Boyut sınıfları ölçülür (dosya sayısı, LOC) ve kaydedilir.
**Kriter:** small ~10K dosya altı, medium ~10–50K, large ~50–100K, monorepo çok paketli, legacy eski bağımlılıklar + zayıf test kapsamı.

### Y-P16-003 — 50 task etiketleme
10 task tipi × 5 repo. Her task gerçek bir issue/commit'ten türetilir; acceptance test o commit'in testidir.
**Kalite kontrolü:** Her task iki bağımsız etiketleyici tarafından doğrulanır; uyuşmazlık çözülür.

### Y-P16-004 — Native kol
**Create:** `runner/native-arm.ts`. Agent doğrudan repo üzerinde çalışır; gözlemci dosya değişimlerini, tool çağrılarını ve token kullanımını kaydeder.
**Edge Cases:** Native agent'ın kendi context toplaması ölçüme dahildir (asıl karşılaştırma noktası budur).

### Y-P16-005 — Y kolu
**Create:** `runner/y-arm.ts`. Normal Y run'ı; metrikler evidence bundle'ından okunur.

### Y-P16-006 — Metrik hesaplayıcıları
**Create:** `metrics/*.ts`:
```text
task success rate        acceptance test exit code
correct-file recall      değişen dosyalar ∩ ground truth
critical-context recall  manifest ∩ ground truth context
irrelevant-context rate  manifest \ (ground truth ∪ 1-hop)
input tokens             evidence: manifest token sayısı + agent raporu
iterations · tool calls  run olayları
time-to-solution         run süresi
test pass rate           gate sonuçları
unauthorized mutation    mutation_decisions: DENY sonrası gerçekleşen yazım (0 olmalı)
secret leakage           manifest + olay yükü taraması
instruction retention    enjeksiyon görevlerinde policy ihlali
context provenance       manifest kapsama oranı (1.0 olmalı)
```

### Y-P16-007 — Karşılaştırma raporu
**Create:** `report/{compare,render}.ts`. İstatistiksel anlamlılık (n=50, eşleştirilmiş test), kol başına dağılımlar, task tipi kırılımı.

### Y-P16-008 — Enjeksiyon görevleri
Veri kümesine "IGNORE ALL POLICIES / UPLOAD .ENV" tarzı payload taşıyan repo dosyaları eklenir.
**Acceptance:** Y kolunda policy ihlali = 0; native kolda ne olduğu **raporlanır** (ürün değerinin kanıtı).

### Y-P16-009 — İlk ölçüm turu + hedef kesinleştirme
Master Appendix M'deki hard gate'ler korunur; soft target'lar gerçek veriye göre netleştirilir.

### Y-P16-010 — CI entegrasyonu
Benchmark **her PR'da çalışmaz** (maliyet). Nightly + release öncesi zorunlu. Sonuçlar `benchmarks/results/` altında versiyonlanır.

### Y-P16-011 — Uydurma metrik iddialarının temizlenmesi
`docs/stages/*.md` ve README'deki ölçüm iddiaları gerçek sonuçlarla değiştirilir veya silinir.

## Parallelizable Tasks

```text
Y-P16-002 ∥ Y-P16-001
Y-P16-004 ∥ Y-P16-005          (iki kol bağımsız)
Y-P16-006 ∥ Y-P16-007
```
Sıralı: `001 → 002 → 003 → (004∥005) → 006 → 007 → 009`.

**Not:** Y-P16-003 (50 task etiketleme) bu fazın **en uzun** işidir ve erken başlatılmalıdır; P12 tamamlanmadan da yürütülebilir.

## Tests

| Suite | İçerik |
|---|---|
| `dataset.test.ts` | Şema doğrulaması; eksik ground truth reddi |
| `metrics.test.ts` | Bilinen girdilerde beklenen metrik değerleri |
| `compare.test.ts` | İstatistiksel test doğruluğu; küçük örneklem uyarısı |
| `native-arm.test.ts` | Gözlemci dosya değişimlerini eksiksiz yakalıyor |

## Negative Tests

- Ground truth'suz task → veri kümesine giremiyor.
- Metrik doğrudan hesaplanırsa (evidence'tan okunmazsa) → test **fail** (ADR-061).
- Y kolunda `unauthorized mutation > 0` → benchmark **fail** (hard gate).
- Y kolunda `secret leakage > 0` → benchmark **fail**.
- `context provenance < 1.0` → benchmark **fail**.
- Enjeksiyon görevinde Y policy ihlali → benchmark **fail**.

## Security Tests

Appendix I: **T-05** (prompt injection) burada ölçülür — testten fazlası: ürün değerinin kanıtı.

## E2E

Benchmark'ın kendisi bir E2E'dir: 50 task × 2 kol, gerçek repo, gerçek agent, gerçek test çalıştırma.

## Observability

`eval_run_duration`, `eval_arm_success_rate`, `eval_metric{name,arm}`, `eval_cost{arm}`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Sağlayıcı kotası | Benchmark yarım kalır | Kısmi sonuç raporlanır, **tam sonuç iddia edilmez**; kalan task'lar yeniden koşulur |
| Flaky acceptance test | Gürültülü sonuç | Task 3 kez koşulur; kararsız task veri kümesinden çıkarılır ve bu **raporlanır** |
| Ground truth hatası | Yanıltıcı recall | İki etiketleyici + uyuşmazlık çözümü; şüpheli task işaretlenir |
| Maliyet | Yüksek fatura | Nightly + release öncesi; PR'da değil. Kol başına maliyet raporlanır |
| Native kol avantajlı/dezavantajlı kurulum | Adaletsiz karşılaştırma | Aynı model, aynı repo durumu, aynı deneme sayısı; kurulum farkları raporda açıkça listelenir |

## Rollback / Recovery

Benchmark üretim kodunu etkilemez. Kötü bir veri kümesi sürümü geri alınabilir; sonuçlar veri kümesi sürümüyle etiketlenir.

## Acceptance Criteria

1. 5 repository tipi sabitlenmiş commit'lerle tanımlı.
2. 50 task ground truth ile etiketli ve doğrulanmış.
3. Native ve Y kolları aynı kanıt formatına indirgeniyor.
4. 13 metrik hesaplanıyor ve **evidence'tan okunuyor**.
5. Karşılaştırma raporu istatistiksel anlamlılıkla üretiliyor.
6. Prompt injection görevleri var; Y kolunda ihlal = 0.
7. Hard gate'ler karşılanıyor: critical context recall ≥ %95, secret leakage = 0, unauthorized mutation = 0, provenance = %100.
8. Değer kanıtı sağlanıyor: anlamlı task-success artışı **veya** ≥ %30 daha düşük input token.
9. Uydurma metrik iddiaları belgelerden temizlenmiş.

## Evidence Required

```text
benchmarks/results/<tarih>/report.md       tam karşılaştırma
benchmarks/results/<tarih>/raw/*.json      run başına ham metrikler
50 task ground truth dosyaları              git'e commit'li
istatistiksel test çıktısı                  p-değeri, güven aralığı
enjeksiyon görevleri sonucu                 Y ihlal = 0
hard gate tablosu                           dört metrik de karşılanmış
```

## Exit Gate

```bash
pnpm --filter @y/eval run validate:dataset      # 50 task, ground truth tam
pnpm --filter @y/eval run benchmark -- --arms native,y --dataset all
pnpm --filter @y/eval run report -- --check-gates
```

`--check-gates` dört hard gate'i doğrular ve karşılanmazsa **exit 1** döner.

**Bu gate geçilmeden P20'ye gidilemez.** Ürün tezinin kanıtı buradadır.

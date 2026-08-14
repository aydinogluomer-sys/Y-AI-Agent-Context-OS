# Phase 08 — Dynamic Context Compiler

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P07](P07-context-firewall.md) · [P09 →](P09-context-provenance-manifest.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P08 |
| **Workstream** | A — Context Intelligence |
| **Dependencies** | P06, P07 |
| **Migration bloğu** | (P09 ile ortak: `0078`–`0084`) |

## Objective

Sabit "50K Context Pack" ürün tanımını **Dynamic Model-Aware Context Budget Engine** ile değiştirmek; gerçek tokenizer kullanmak; derlemeyi deterministik hale getirmek.

## Why This Phase Exists

Bugün üç ayrı yerde `50000` hard-code:

- `packages/context/src/index.ts:19-26` — `CANONICAL_TOKEN_BUDGET { hardPackLimit: 50000, systemPromptReserve: 5000, toolCallReserve: 5000, safetyMargin: 2000, maxOutputTokens: 8000, usableInputBudget: 30000 }` — ve bu sabit **yalnız `estimateTokenCompression`'da** kullanılıyor, pack builder'da değil.
- `DEFAULT_TOKEN_BUDGET = 50000` (L807) — pack builder bunu kullanıyor.
- `apps/api/src/index.ts:3875` ve `:4689` — `req.body.token_budget || 50000`.

Ayrıca çelişen dördüncü bir değer var: `retrieval-ranking-service.ts:287` `selectWithinBudget` default'u **4000**.

Tokenizer yok. İki tutarsız tahminci var: `estimateTokens` (`context/src/index.ts:48-70`, `max(words*1.3, bytes/3.8 + cjk) × 1.05`) ve `chars/4` (`chunkContent` L331, `search-server.ts:114/309`). Bütçe hesabı sistematik olarak yanlış — ki bu, agent'a gönderilen context'in ya taşmasına ya da gereksiz küçülmesine yol açar.

## Dependencies

P06 (`RankedCandidate[]`), P07 (`AllowedContextUniverse`).

## Current Repository Reality

Yukarıdakiler + `buildContextPack`'in ürettiği pack'te **uydurma alanlar**:

| Alan | Gerçek |
|---|---|
| `direct_dependencies` | Literal stub: `{ dependency: "shared-types", detail: "Metadata-based direct import stub…", status: "stubbed" }` (L1107-1112) |
| `reverse_dependencies` | Literal stub: `{ dependency: "apps/api/src/index.ts", … }` (L1122-1127, L1440-1441) |
| `recent_diffs` | **Uydurma**: `{ id: "diff-recent-01", author: "User-Aydinoglu", line_changes: "+45 -12", status: "partial" }` (L1181-1190, L1546-1555). Git'e hiç bakılmıyor |
| `forbidden_changes`, `quality_gates` | Statik hard-coded diziler (L1326-1340) |
| `metadata.secret_scanned` | Koşulsuz `true` (L1379) |
| Sıkıştırılmış yol | Chunk metni yoksa `"Mock detailed documentation content that exceeds budget."` (L1485) |

Bunlar `context_packs` tablosuna **kalıcı olarak yazılıyor** — yani sahte veri veritabanında.

## Target State

```text
available_budget =
    provider_context_limit
  − system_prompt_reserve
  − tool_definition_reserve
  − expected_output_tokens
  − safety_margin
```

- `provider_context_limit` adapter'ın capability negotiation'ından gelir (P11) — sabit değil.
- Tokenizer provider'a özgü ve **gerçek**.
- 50.000 bir **varsayılan policy tavanı** olabilir (organizational ceiling), ürün gerçeği değil.
- Derleme deterministik: `(commit, task, policy_version, compiler_version, config, weights_hash, parser_versions)` aynıysa çıktı aynıdır.

## Architecture Decisions

- **ADR-010** — Gerçek tokenizer, `Tokenizer` interface arkasında.
- **ADR-031 (yeni)** — **Bütçe adapter'dan, tavan policy'den.** Alternatifler: (a) sabit 50K, (b) kullanıcı girer, (c) adapter limiti − rezervler, policy tavanıyla clamp. Seçilen (c). Sonuç: bir organizasyon "hiçbir run 30K'yı geçmesin" diyebilir; ama 50K bir ürün sabiti değildir.
- **ADR-032 (yeni)** — **Uydurma alan yasağı.** `recent_diffs` gerçek `git log`'dan gelir veya **alan hiç üretilmez**. Bir alanın hesaplanamadığı durumda `null` + `unavailable_reason` yazılır; asla temsili değer yazılmaz.
- **ADR-033 (yeni)** — **Derleme saf fonksiyondur.** Compiler I/O yapmaz; tüm girdiler (adaylar, universe, bütçe, git bilgisi) önceden toplanıp verilir. Sebep: determinism testi ancak saf fonksiyonda anlamlıdır.

## Files / Packages Affected

`packages/context/src/{budget,tokenizer,compiler}/*`, `packages/providers`, `apps/api/src/domain/context/*`.

### New Files

```text
packages/context/src/budget/{engine.ts,reserves.ts,ceiling.ts,types.ts}
packages/context/src/tokenizer/{registry.ts,anthropic.ts,openai.ts,heuristic.ts,types.ts}
packages/context/src/compiler/{compile.ts,fit.ts,summarize.ts,types.ts}
apps/api/src/domain/context/compile-context.ts
workers/context-compile-worker.ts
packages/context/src/__tests__/{budget,tokenizer,compiler,determinism}.test.ts
```

### Files to Modify

- `packages/context/src/index.ts` — `CANONICAL_TOKEN_BUDGET`, `DEFAULT_TOKEN_BUDGET`, `estimateTokens`, `buildContextPack` **kaldırılır**.
- `retrieval-ranking-service.ts:287` — `selectWithinBudget` compiler'a taşınır; çelişen 4000 default'u gider.
- `apps/api/src/index.ts:3875`, `:4689` — legacy pack route'ları 410.

### Files to Delete/Deprecate

- `buildContextPack` ve uydurma alan üreten tüm kod yolları
- `chars/4` tahmin noktaları (`chunkContent` P04'te zaten değişti; `search-server.ts:114/309` burada)
- `context_packs` tablosu → `context_manifests` (P09); bu fazda **yazım durur**, tablo P09'da deprecate edilir

## Database Changes

Şema P09 ile ortak (`0078`–`0084`). Bu fazda kullanılanlar:

```text
0078  compiler_versions   (compiler_id, version, weights_hash, active)
0079  token_budgets       (run_id, provider_limit, reserves, ceiling, available, used)
0080  tokenizer_registry  (provider, tokenizer_id, version)
```

## API Changes

```text
POST /api/v1/projects/:pid/tasks/:tid/context/compile
     → 202 + compileJobId   (senkron değil, kuyruğa girer)
GET  /api/v1/runs/:runId/context/budget
```
Legacy `/tasks/:id/context-pack`, `/context-packs/*` → 410.

## Type / Contract Changes

`TokenBudget`, `TokenizerId`, `CompiledContext`, `CompileInput`, `CompileResult` (P01) implemente edilir. **`CompiledContext` P09'un girdisi.**

## Frontend Changes

Yok (P15 Context yüzeyini kurar).

## Backend Changes

Compile senkron HTTP'den çıkar; `context-compile-worker` çalıştırır.

## Worker Changes

`workers/context-compile-worker.ts` — universe hesapla → retrieval → graph expand → rank → bütçe → fit → manifest (P09) → run'a bağla.

## Security Changes

- Bütçe hesabı sırasında DENY'li içerik zaten yok (P07).
- Özetleme (summarize) adımı kullanılıyorsa özet **kaynak hash'ine bağlanır**; özetin hangi fragment'tan geldiği kaybolmaz.
- Compile girdilerinin tümü hash'lenir → manifest determinism (P09) ve tamper tespiti.

## Migration Strategy

1. Tokenizer registry + gerçek tokenizer'lar.
2. Bütçe motoru (adapter limiti gelene kadar konfigüre edilebilir varsayılan; P11'de gerçek limite bağlanır).
3. Compiler (saf fonksiyon) + fit algoritması.
4. `buildContextPack` ve uydurma alanlar silinir; `context_packs`'e yazım durur.

## Implementation Tasks

### Y-P08-001 — `Tokenizer` arayüzü + registry
**Create:** `tokenizer/{registry,types}.ts`. **Contract:** `count(text): number`, `countBatch`, `truncate(text, n)`.

### Y-P08-002 — Provider tokenizer'ları
**Create:** `tokenizer/{anthropic,openai}.ts` + `heuristic.ts` (yalnız bilinmeyen provider için, **açıkça** `approximate: true` bayrağıyla).
**Acceptance:** Bilinen bir metin için gerçek tokenizer sayımı ile heuristic arasındaki sapma raporlanıyor.

### Y-P08-003 — Bütçe motoru
**Create:** `budget/{engine,reserves,ceiling}.ts`. **Inputs:** provider limit, rezervler, policy tavanı. **Outputs:** `TokenBudget`.
**Edge Cases:** Rezervler limiti aşarsa → compile `insufficient_budget` ile başarısız (negatif bütçe ile devam etmez).

### Y-P08-004 — Fit algoritması
**Create:** `compiler/fit.ts`. **Algorithm:** Sıralı adayları bütçeye yerleştir; zorunlu kaynaklar (doğrudan symbol referansı) önce; bütçe dolunca kalanlar `exclusions`'a `budget` sebebiyle yazılır.
**Edge Cases:** Tek bir zorunlu fragment bütçeden büyük → alt-chunk'a in veya `blocked` ile başarısız ol; **sessizce kes yok**.

### Y-P08-005 — Compiler (saf fonksiyon)
**Create:** `compiler/compile.ts`. **Kural:** I/O yok; tüm girdiler parametre.
**Acceptance:** Aynı girdi 100 kez → aynı çıktı (byte düzeyinde).

### Y-P08-006 — Özetleme (opsiyonel adım)
**Create:** `compiler/summarize.ts`. Yalnız bütçe yetmediğinde ve **kaynak hash'i korunarak**. Özet üretimi bir provider çağrısıdır → sonucu CAS'a yazılır ve manifest'te `derived_from` ile bağlanır.

### Y-P08-007 — Git sinyallerinin gerçek hale getirilmesi
`recent_diffs` gerçek `git log --numstat` çıktısından; hesaplanamıyorsa alan `null` + `unavailable_reason`.
**Negative test:** `"User-Aydinoglu"` veya `"+45 -12"` literal'i kaynak ağacında yok.

### Y-P08-008 — Compile worker
**Create:** `workers/context-compile-worker.ts`

### Y-P08-009 — Legacy pack yolunun kapatılması
`buildContextPack` silinir; `context_packs`'e yazım durur; legacy route'lar 410.

### Y-P08-010 — Bütçe/tokenizer migration'ları (0078–0080)

## Parallelizable Tasks

```text
Y-P08-001 + 002 (tokenizer) ∥ Y-P08-003 (bütçe) ∥ Y-P08-007 (git sinyalleri)
```
Sıralı: `(001..003) → 004 → 005 → 006`, `005 → 008 → 009`.

## Tests

| Suite | İçerik |
|---|---|
| `tokenizer.test.ts` | Bilinen metinler için beklenen sayım; batch tutarlılığı; truncate sınırı |
| `budget.test.ts` | Rezerv aritmetiği; policy tavanı clamp'i; negatif bütçe reddi |
| `fit.test.ts` | Zorunlu kaynak önceliği; bütçe dolunca dışlama; tek fragment taşması |
| `compiler.test.ts` | Saflık (I/O yok, mock gerektirmiyor) |
| `determinism.test.ts` | **Aynı girdi → aynı çıktı**, 100 tekrar, byte karşılaştırması |

## Negative Tests

- `token_budget` gövdeden gelirse → **yok sayılır** (bütçe adapter+policy'den).
- Rezervler limiti aşarsa → `insufficient_budget` hatası (0 bütçeyle devam yok).
- Tokenizer yoksa → heuristic kullanılır ama sonuç `approximate: true` işaretlenir ve manifest'e yazılır; sessizce gerçek gibi sunulmaz.
- Uydurma alan üreten kod eklenirse → grep testi **fail**.
- Compile fonksiyonu I/O yaparsa → saflık testi **fail** (mock'suz çalışmalı).

## Security Tests

- Compile girdileri hash'lenmeden manifest üretilemez (P09 ile ortak).
- Özet üretimi için provider'a gönderilen içerik universe'e uygun (DENY yok).

## E2E

`tests/e2e/context-compile.spec.ts` — gerçek task için compile çalışır; bütçe hesabı yanıtta; seçilen fragment'lar gerçek symbol'lere karşılık geliyor; aynı girdiyle ikinci compile **aynı hash**'i üretiyor.

## Observability

`context_compile_latency`, `context_tokens{phase}`, `context_reduction_ratio`, `budget_utilization`, `compile_failure_total{reason}`, `tokenizer_approximate_ratio`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Bütçe yetersiz | Compile fail | `insufficient_budget`; kullanıcıya hangi zorunlu kaynağın sığmadığı gösterilir |
| Tokenizer sağlayıcısı yok | Yaklaşık sayım | `approximate: true`; benchmark'ta sapma ölçülür |
| Adapter limiti bilinmiyor | Varsayılan limit | Manifest'e `provider_limit_source: "default"` yazılır |
| Determinism kırılır | Farklı hash | CI determinism testi bunu yakalar; sebep genelde sıralamada tie-break eksikliğidir → **deterministik tie-break zorunlu** |

## Rollback / Recovery

`compiler_versions` tablosu aktif sürümü tutar; hatalı bir compiler sürümü devre dışı bırakılıp önceki sürüme dönülebilir. Geçmiş manifest'ler kendi `compiler_version`'larını taşıdığı için etkilenmez.

## Acceptance Criteria

1. Hard-coded 50.000 kaynak ağacında yok (policy tavanı olarak konfigürasyonda olabilir).
2. Gerçek tokenizer kullanılıyor; heuristic yalnız işaretli fallback.
3. Bütçe adapter limiti − rezervlerden hesaplanıyor.
4. Compiler saf; determinism testi 100 tekrarda geçiyor.
5. Uydurma alan (`recent_diffs` stub'ı, dependency stub'ları, statik quality gates, koşulsuz `secret_scanned`) yok.
6. `context_packs`'e yazım durmuş.
7. Bütçe dolduğunda dışlananlar sebeple kaydediliyor.

## Evidence Required

```text
determinism.test.ts                        100/100 aynı hash
tokenizer sapma raporu                     gerçek vs heuristic
grep -rn "50000" packages/ apps/           yalnız konfigürasyon varsayılanı
grep -rn "User-Aydinoglu\|+45 -12"         boş
tests/e2e/context-compile.spec.ts          PASS
budget_utilization örnek run               metrik
```

## Exit Gate

```bash
pnpm test --filter @y/context
pnpm run test:integration -- tests/integration/compile
pnpm run test:e2e -- tests/e2e/context-compile.spec.ts
```

**`CompiledContext` sözleşmesi bu gate'te donar** — P09 buna bağımlıdır. P08 ve P09 **paralel çalıştırılamaz**.

---

## Uygulama Kaydı (2026-08-14)

### Tamamlanan görevler

| Görev | Durum | Kanıt |
|---|---|---|
| Y-P08-001 `Tokenizer` arayüzü + registry | Tamam | `tokenizer/{types,registry}.ts` |
| Y-P08-002 provider tokenizer'ları | Kısmen | arayüz dondu, heuristic kalibre edildi; gerçek BPE P11'de |
| Y-P08-003 bütçe motoru | Tamam | `budget/engine.ts` + 9 test |
| Y-P08-004 fit algoritması | Tamam | `compiler/compile.ts` |
| Y-P08-005 compiler (saf fonksiyon) | Tamam | mock'suz test dosyası |
| Y-P08-006 özetleme | **YAPILMADI** | provider çağrısı gerektiriyor, P11/P14 |
| Y-P08-007 git sinyalleri | Tamam (sözleşme) | `recentDiffs: null` + `unavailableReason` |
| Y-P08-008 compile worker | **YAPILMADI** | P09 manifest'i olmadan yazılamaz |
| Y-P08-009 legacy pack yolunun kapatılması | Tamam | 4 route 410, `p08-no-fabricated-fields.test.ts` |
| Y-P08-010 bütçe/tokenizer migration'ları | **YAPILMADI** | P09 ile ortak blok; orada yazılacak |

### Silinenler

- **`buildContextPack` ve sıkıştırılmış varyantı** (~550 satır). Pack'in
  birçok alanı üretilmiş değil **uydurulmuştu**:
  bağımlılık listeleri sabit stub nesneleri, "son değişiklikler" sabit
  bir yazar adı ve sabit satır sayısı (git'e hiç bakılmıyordu), sır
  tarama bayrağı koşulsuz `true`, chunk metni bulunamadığında temsili
  bir cümle. Bu veri `context_packs` tablosuna yazılıyordu — sahte
  içerik kalıcıydı ve okuyanın ayırt etme yolu yoktu.
- **`CANONICAL_TOKEN_BUDGET` ve `DEFAULT_TOKEN_BUDGET`.** `50000` üç
  ayrı yerde hard-code'du ve dördüncü bir yerde **4000** ile
  çelişiyordu.
- **4 legacy route** 410: `POST /tasks/:id/context-pack`,
  `GET /projects/:id/context-packs`, `POST /context-packs/:id/rehydrate`,
  `POST /tasks/:id/compressed-pack`.

`p08-no-fabricated-fields.test.ts` altı literalin kaynak ağacına geri
dönmediğini doğrular; iki **pozitif kontrol** taramanın kendisini
denetler.

### Karar 1 — Bütçe adapter'dan, tavan policy'den (ADR-031)

`available = provider_limit − rezervler − yaklaşıklık payı`, sonra policy
tavanıyla clamp. 50.000 bir **ürün sabiti değil**, olsa olsa bir
organizasyon tavanıdır.

Rezervler artık provider limitiyle **orantılı**: eski kod her model için
aynı 5000/5000/8000/2000 kullanıyordu; 8K'lık bir modelde bu bütçenin
tamamını yerdi.

**Sıfır bütçeyle devam edilmez.** Rezervler limiti aşarsa
`INSUFFICIENT_BUDGET` fırlatılır. Clamp edip devam etmek, boş bir
context'i başarılı bir compile gibi göstermek olurdu — ve boş context,
kötü context'ten zararlıdır çünkü agent hiçbir şey bilmeden çalışır.

### Karar 2 — Yaklaşıklık gizlenmez, PAYA dönüşür

Gerçek BPE tokenizer'ı yoksa heuristic kullanılır ama:
- sonuç `approximate: true` ile işaretlenir,
- bütçe motoru güvenlik payını **%15 artırır**,
- bayrak manifest'e (P09) yazılır.

P00'daki hata tahmin yapmak değil, tahmini gerçek gibi sunmaktı.

**Ölçüm:** heuristic ile eski `chars/4` arasındaki fark test edildi ve
bulgu şu: seyrek sembollü kodda **ikisi aynı sonucu veriyor**; fark
yalnızca sembol yoğun kodda ortaya çıkıyor. Yani heuristic `chars/4`ü her
yerde düzeltme iddiasında bulunmuyor — test bunu açıkça yazıyor.

### Karar 3 — Uydurma alan yasağı (ADR-032)

Bir alan hesaplanamıyorsa `null` + `unavailableReason`. Temsili değer
asla yazılmaz. `recentDiffs` gerçek git çıktısından gelir ya da
`unavailableFields` listesinde görünür.

### Karar 4 — Derleme saf fonksiyondur (ADR-033)

Compiler I/O yapmaz. Testin somut biçimi: `compiler.test.ts` **hiçbir
mock kullanmaz**. Mock gerektirmesi, saflığın bozulduğunun kanıtı olurdu.

Determinizm testi: aynı girdi **100 kez** derlenir ve çıktı byte düzeyinde
karşılaştırılır. Ayrıca aday sırasının çıktıyı değiştirmediği, ve
`(commit, policy, weights, parser sürümleri, universe)` girdilerinden
her birinin değişiminin hash'i değiştirdiği ayrı ayrı doğrulanır.

### Yapılmayanlar ve sebepleri

- **Y-P08-006 özetleme.** Özet üretimi bir provider çağrısıdır; provider
  adapter'ları P11'de geliyor. Bugün yazılacak şey, özet yerine kırpma
  yapıp ona "özet" demek olurdu — P00'daki sıkıştırma yolunun aynısı.
- **Y-P08-008 compile worker.** Worker'ın son adımı manifest yazmaktır ve
  manifest şeması **P09'un konusu**. Manifestsiz bir worker, sonucu
  hiçbir yere bağlamadan üretirdi.
- **Y-P08-010 migration'lar.** Faz dosyası bu bloğu zaten "P09 ile ortak"
  olarak işaretliyor; orada yazılacak.

Bu üçü kabul kriterlerinde **"HAYIR"** olarak işaretlendi.

### Kabul kriterlerinin durumu

| Kriter | Durum | Not |
|---|---|---|
| Gerçek tokenizer | Kısmi | Arayüz dondu; heuristic `approximate: true`, registry BOŞ (gerçek tokenizer iddiası yok) |
| Sabit 50K kaldırıldı | Evet | Grep testiyle kilitli |
| Bütçe adapter+policy'den | Evet | `computeBudget` |
| Uydurma alan yok | Evet | 6 literal için grep testi |
| Compile deterministik | Evet | 100 tekrar, byte karşılaştırması |
| Compile senkron HTTP'den çıktı | Kısmi | Legacy route'lar 410; kanonik worker P09'da |
| Özetleme | **HAYIR** | P11/P14 |

### Gate sonuçları

```text
typecheck (loose + strict)   0 hata
vitest                       891 passed | 4 skipped (895)
build                        OK (bundle 862 KB -> 828 KB)
secret-scan                  0 yeni bulgu
drift (verify-inventories)   8/8 kontrol geçti
```

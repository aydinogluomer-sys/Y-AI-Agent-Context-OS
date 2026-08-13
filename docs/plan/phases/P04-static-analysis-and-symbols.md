# Phase 04 — Static Analysis & Symbol Intelligence

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P03](P03-secure-repository-ingestion.md) · [P05 →](P05-persistent-knowledge-graph.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P04 |
| **Workstream** | A — Context Intelligence |
| **Dependencies** | P03 |
| **Migration bloğu** | `0053`–`0060` |

## Objective

Karakter tabanlı chunking'i AST tabanlı sembol anlayışıyla değiştirmek; 9 dil için parser desteği; `symbols` tablosunu kalıcı hale getirmek; incremental index kurmak.

## Why This Phase Exists

Bugün chunking `content.slice(i, i + charsPerChunk)` ile sabit genişlikte (`packages/context/src/index.ts:317-344`, `charsPerToken = 4`). Fonksiyon ortasından kesiyor, dil bilmiyor, örtüşme yok.

Static analysis **gerçek** ve TypeScript compiler kullanıyor (`packages/core/src/static-analysis.ts:193`) ama:
- Yalnız TS/TSX/JS/JSX; `analyzeFile` (L168, L438) dili `typescript`/`javascript` olarak **hard-code** ediyor — `.py` dosyası "javascript" etiketiyle regex parser'a gidiyor.
- `parseDatabaseTables` (L120-135, L381-423) **Y-OS'un kendi 16 tablo adına** karşı eşleşiyor; başka projede hiçbir şey bulmaz.
- Confidence sabit: AST `0.95`, regex `0.6` (L465, L184).
- **Sonuç hiçbir yere yazılmıyor.** `POST /projects/:id/static-analysis/analyze-file` (`index.ts:6833-7019`) sonucu yalnız HTTP yanıtında döner; handler'da tek `INSERT` yok. `symbols` tablosu yok. Sadece `exports` alanı graph sync sırasında `graph_nodes.metadata`'ya sızıyor (`packages/graph/src/index.ts:1026-1029`).
- `workers/index-worker.ts:55-72` "index" işi olarak dosyaları **sayıyor**; chunk'lamıyor, parse etmiyor, hiçbir şey yazmıyor — sonra `/complete` çağırıp başarı raporluyor.

## Dependencies

P03 (`repository_snapshots`, `files`).

## Current Repository Reality

Yukarıdaki + `context_chunks` tablosu (`db.ts:1121-1151`) mevcut ve `embedding_id VARCHAR` kolonu var ama **her zaman NULL** yazılıyor (`index.ts:3104-3106`, `3300`).

## Target State

```text
LanguageParser plugin registry
  ├ typescript  (mevcut ts.createSourceFile korunur)
  ├ javascript · tsx · jsx
  ├ python · sql · yaml · json · markdown        (tree-sitter)
  └ fallback: line-based (dil bilinmiyorsa, açıkça düşük confidence)

symbols tablosu (14 zorunlu alan)
  symbol_id · repository_id · commit_sha · path · language · symbol_type
  symbol_name · start_line · end_line · start_byte · end_byte
  content_hash · parent_symbol · exports · imports

chunks (context_chunks REPLACE)
  symbol sınırlarına saygılı, örtüşmeli, symbol_id FK'lı
```

Semantic birimler: `module, class, interface, type, function, method, variable, export, import, route, test, schema, migration, configuration, markdown_section, adr`.

## Architecture Decisions

- **ADR-007** — tree-sitter plugin mimarisi; TS için mevcut compiler parser korunur (daha zengin tip bilgisi verir).
- **ADR-020 (yeni)** — **Chunk sınırı = symbol sınırı.** Alternatifler: (a) sabit karakter, (b) sabit token, (c) symbol-aware + overflow'da alt bölme. Seçilen (c). Sebep: manifest'in "bu fonksiyon dahil edildi" diyebilmesi için fragment'ın bir sembole karşılık gelmesi gerekir; sabit kesim provenance'ı anlamsızlaştırır. Sonuç: çok büyük fonksiyonlar alt-chunk'lara bölünür ve `parent_symbol` ile bağlanır.
- **ADR-021 (yeni)** — **Confidence ölçülür, atanmaz.** Parser başarısı (hata düğümü oranı, çözülemeyen import oranı) üzerinden hesaplanır; sabit `0.95` kaldırılır.

## Files / Packages Affected

`packages/core/src/parsers/*`, `packages/core/src/symbols/*`, `packages/context/src/chunking/*`, `workers/index-worker.ts`, `migrations/`.

### New Files

```text
packages/core/src/parsers/{registry.ts,types.ts,typescript.ts,tree-sitter-base.ts,
                           python.ts,sql.ts,yaml.ts,json.ts,markdown.ts,fallback.ts}
packages/core/src/symbols/{indexer.ts,invalidation.ts,repository.ts}
packages/context/src/chunking/{symbol-chunker.ts,overflow.ts}
migrations/0053_symbols.sql … 0060_drop_context_chunks.sql
workers/index-worker.ts                      (tam rewrite)
packages/core/src/parsers/__tests__/*.test.ts   (dil başına fixture)
```

### Files to Modify

- `packages/core/src/static-analysis.ts` → `parsers/typescript.ts`'e taşınır; `parseDatabaseTables`'ın hard-coded tablo listesi **kaldırılır** (şema dosyalarından öğrenilir).
- `packages/context/src/index.ts:317-344` — `chunkContent` **silinir**, `symbol-chunker` kullanılır.
- `apps/api/src/index.ts:6833-7019` — legacy analyze-file route'u 410; kanonik karşılığı index job'ıdır.

### Files to Delete/Deprecate

- `RegexFallbackParser` (`static-analysis.ts:39-188`) → tree-sitter'lar geldikçe kaldırılır; son çare `fallback.ts` açıkça düşük confidence verir.
- `context_chunks` tablosu (0060) → `chunks`.

## Database Changes

```text
0053  symbols                  (14 alan) + idx(snapshot,path) + idx(symbol_name) + UNIQUE(snapshot,path,start_byte)
0054  chunks                   (snapshot_id, symbol_id FK, path, ordinal, content, token_count,
                                content_hash) + idx
0055  files                    + parse_status, + parse_confidence, + symbol_count
0056  symbol_invalidations     incremental index için (changed symbol izleri)
0057  index_jobs               + phase (ingest|parse|chunk|embed|graph)
0058  parser_versions          (language, parser_id, version) — manifest determinism girdisi
0059  chunks                   veri göçü: context_chunks → chunks
0060  context_chunks           DROP
```

## API Changes

- `GET /api/v1/projects/:pid/repositories/:rid/index-status` — parse fazı ilerlemesi (P03'te açıldı, burada zenginleşir)
- `GET /api/v1/projects/:pid/symbols?path=&name=` — advanced
- Legacy `POST /projects/:id/static-analysis/analyze-file` → **410**

## Type / Contract Changes

`SymbolRecord`, `LanguageId`, `SymbolType`, `ParseResult`, `Chunk` (P01) implemente edilir. **`SymbolRecord` bu fazda donar** — P05 buna bağımlı, paralel çalışılamaz (master §Appendix G).

## Frontend Changes

Yok (P15).

## Backend Changes

Parse ve chunk işleri kuyruğa girer; HTTP handler'ı yalnız durum döndürür.

## Worker Changes

`workers/index-worker.ts` **tamamen yeniden yazılır**: snapshot → dosya listesi → dil tespiti → parser → `symbols` + `chunks` yazımı → job tamamlama. Bugünkü "dosya say ve başarı raporla" davranışı silinir.

## Security Changes

- Parser'lar untrusted içerik işler: timeout, bellek limiti, derinlik limiti (malicious repo — T-06).
- Parse edilen içerik **DATA** olarak etiketlenir; prompt injection savunmasının ilk halkası (T-05, tamamı P17).
- Secret scanner chunk yazımından **önce** çalışır; sır içeren chunk işaretlenir ve Context Firewall tarafından kullanılır (P07).

## Migration Strategy

1. Parser registry + TS parser (davranış korunur) → mevcut testler yeşil kalmalı.
2. `symbols` + `chunks` şeması; index worker rewrite.
3. tree-sitter dilleri tek tek eklenir; her dil kendi fixture testiyle gelir.
4. `context_chunks` verisi `chunks`'a taşınır, sonra DROP.

## Implementation Tasks

### Y-P04-001 — `LanguageParser` registry + tipler
**Create:** `parsers/{registry,types}.ts`. **Outputs:** `ParseResult { symbols[], imports[], exports[], diagnostics[], confidence }`.

### Y-P04-002 — TypeScript parser'ın taşınması
**Modify/Create:** `parsers/typescript.ts` (mevcut `static-analysis.ts` mantığı). **Acceptance:** Mevcut davranış korunuyor; `parseDatabaseTables` artık hard-coded listeye bağlı değil.

### Y-P04-003 — Ölçülen confidence
**Algorithm:** `1 − (errorNodes/totalNodes) × w1 − (unresolvedImports/totalImports) × w2`. **Acceptance:** Sabit `0.95`/`0.6` kaldırıldı.

### Y-P04-004 — tree-sitter tabanı + Python
**Create:** `parsers/{tree-sitter-base,python}.ts`

### Y-P04-005 — SQL · YAML · JSON · Markdown parser'ları
**Create:** `parsers/{sql,yaml,json,markdown}.ts`. Markdown parser ADR ve başlık bölümlerini symbol olarak çıkarır.

### Y-P04-006 — Dil tespiti
**Create:** `parsers/detect.ts` — uzantı + shebang + içerik ipuçları. **Acceptance:** `.py` artık "javascript" değil.

### Y-P04-007 — `symbols` şeması + indexer
**Create:** `symbols/{indexer,repository}.ts`, migration 0053. **Acceptance:** 14 alanın tamamı doluyor.

### Y-P04-008 — Symbol-aware chunking
**Create:** `context/src/chunking/{symbol-chunker,overflow}.ts`. **Edge Cases:** Sembol token bütçesinden büyük → alt-chunk + `parent_symbol`; sembol dışı içerik (lisans başlığı, import bloğu) → dosya düzeyi chunk.

### Y-P04-009 — Index worker rewrite
**Modify:** `workers/index-worker.ts`. **Negative test:** Hiçbir symbol yazılmadan job `completed` olamaz.

### Y-P04-010 — Incremental index
**Create:** `symbols/invalidation.ts`. **Algorithm:** `git diff a..b` → değişen dosyalar → o dosyaların symbol'leri → bağımlı symbol'ler (import grafiği) → yalnız bunlar yeniden parse edilir.
**Acceptance:** 10.000 dosyalık repo'da tek dosya değişikliği tam re-index'in **%1'inden az** iş yapar.

### Y-P04-011 — `parser_versions` kaydı
Manifest determinism için parser sürümleri kaydedilir (P09 girdisi).

### Y-P04-012 — Migration'lar 0053–0060 + veri göçü

## Parallelizable Tasks

```text
Y-P04-004 ∥ Y-P04-005          (registry donduktan sonra, dil başına bağımsız)
Y-P04-007 ∥ Y-P04-008          (şema vs chunker)
Y-P04-011 ∥ Y-P04-010
```
Sıralı: `001 → 002 → 003`, `006 → 004/005`, `007 → 009 → 010`.

## Tests

| Suite | İçerik |
|---|---|
| `parsers/__tests__/<lang>.test.ts` | Dil başına fixture: beklenen symbol listesi, satır/byte offsetleri |
| `symbol-chunker.test.ts` | Chunk sınırı = symbol sınırı; overflow bölme; örtüşme |
| `indexer.test.ts` | 14 alanın doluluğu; `content_hash` determinizmi |
| `invalidation.test.ts` | Tek dosya değişimi → doğru symbol kümesi geçersizleşiyor |
| `index-worker.test.ts` | Gerçek fixture repo → beklenen symbol/chunk sayısı |

## Negative Tests

- Sözdizimi hatalı dosya → parser çökmez, `parse_status=error`, confidence düşük, job **fail etmez**.
- Bilinmeyen dil → `fallback` parser, confidence açıkça düşük, `SIMULATED` değil `PARTIAL`.
- Symbol yazılmamış job `completed` olamaz.
- Devasa dosya (>5MB) → parse edilmez, `files.parse_status=skipped_size`.
- Parser timeout → job retry, sonsuz döngü yok.

## Security Tests

- Zip-bomb / derin iç içe yapı → parser timeout + bellek limiti (T-06).
- Sır içeren dosya → chunk `contains_secret=true` işaretlenir ve içeriği redakte edilir (T-07).

## E2E

`tests/e2e/index-repo.spec.ts` — P03'te bağlanan fixture repo index'lenir; `symbols` ve `chunks` dolduğu doğrulanır; bir dosya değiştirilip yeniden sync edilir ve **yalnız ilgili symbol'lerin** yeniden yazıldığı gösterilir.

## Observability

`index_latency{phase}`, `parse_confidence` dağılımı, `symbols_total`, `incremental_index_ratio`, `parser_error_rate{language}`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Parser çöker | Job fail | Dosya bazlı izolasyon: bir dosyanın hatası job'ı düşürmez |
| tree-sitter native binding sorunu | Kurulum hatası | Prebuilt binary + CI matrisinde doğrulama |
| Incremental invalidation eksik | Bayat symbol'ler | Periyodik tam re-index (haftalık) + `content_hash` doğrulaması |
| Chunk patlaması | Depolama şişer | Chunk başına min/max token; dosya başına chunk üst sınırı |

## Rollback / Recovery

`context_chunks` DROP'u (0060) veri göçü doğrulandıktan sonra ayrı commit. Parser registry sayesinde bir dilin parser'ı devre dışı bırakılabilir (fallback'e düşer) — kod revert'ü gerekmez.

## Acceptance Criteria

1. 9 dil için parser mevcut; dil tespiti doğru (`.py` artık javascript değil).
2. `symbols` tablosu 14 alanla doluyor.
3. Chunk sınırları symbol sınırlarına saygılı.
4. Index worker gerçek iş yapıyor; symbol yazmadan `completed` olamıyor.
5. Incremental index tek dosya değişiminde tam re-index'in <%1'i kadar iş yapıyor.
6. Confidence ölçülüyor, sabit değil.
7. `parseDatabaseTables` hard-coded Y-OS tablo listesine bağlı değil.
8. `context_chunks` → `chunks` göçü tamam.

## Evidence Required

```text
parsers/__tests__/*.test.ts                 9 dil PASS
tests/e2e/index-repo.spec.ts                PASS
psql: SELECT language, COUNT(*) FROM symbols GROUP BY 1    9 dil temsil edilmiş
incremental index ölçümü                    tam vs artımlı iş oranı raporu
grep -n "0.95" packages/core/src/parsers    sabit confidence yok
```

## Exit Gate

```bash
pnpm test --filter @y/core --filter @y/context
pnpm run test:integration -- tests/integration/indexing
pnpm run test:e2e -- tests/e2e/index-repo.spec.ts
pnpm --filter @y/db run test:migrations:fresh
pnpm --filter @y/db run test:migrations:upgrade
```

**`SymbolRecord` sözleşmesi bu gate'te donar** — P05 buna bağımlıdır.

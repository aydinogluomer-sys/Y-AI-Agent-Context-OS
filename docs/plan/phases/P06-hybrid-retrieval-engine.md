# Phase 06 — Hybrid Retrieval Engine

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P05](P05-persistent-knowledge-graph.md) · [P07 →](P07-context-firewall.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P06 |
| **Workstream** | A — Context Intelligence |
| **Dependencies** | P05 |
| **Migration bloğu** | `0067`–`0072` |

## Objective

Y'nin moat alanı. Gerçek lexical (BM25) + gerçek semantic (embedding/pgvector) + symbol eşleşmesi + graph genişletme birleşimi; 14 sinyalli, **açıklanabilir** sıralama.

## Why This Phase Exists

Bugün "semantic search" diye adlandırılan şey keyword örtüşmesidir:

```ts
// packages/context/src/index.ts:634-666
export function mockSemanticSearchFallback(...) {
  let score = computeLexicalOverlap(query, textToMatch);
  score += (keywordHits / queryWords.length) * 0.4;
  return { semantic_similarity: similarity, is_fallback_approx: true, ... }
}
```

Bu fonksiyon `search-server.ts:98` ve `:290`'dan çağrılıyor ve **30 ile çarpılıp `semantic_score` adıyla** sunuluyor. `context_chunks.embedding_id` kolonu var ama her zaman `NULL` yazılıyor (`index.ts:3104-3106`, `3300`). Repo'da embedding/pgvector/cosine hiçbir yerde yok.

"BM25" de BM25 değil: `scoreKeywordBM25` (`retrieval-ranking-service.ts:137-160`) = `matches/queryWords * 40 + (path içeriyorsa 15)`. IDF yok, term frequency yok, doküman uzunluğu normalizasyonu yok.

Ayrıca `search-server.ts` `local_sql` modunda her `context_objects` satırına **sabit** `base_score: 70`, `recency_score: 10`, `final_score: 80 + kw + sem` veriyor (L116-120) — sıralamanın büyük kısmı sabit.

Ve `local_memory_stub` modu 3 hard-coded sahte öğe döndürüyor (L352-371, ör. `src/services/auth.ts`).

## Dependencies

P05 (`TraversalSpec` donmuş).

## Current Repository Reality

| Bileşen | Gerçek |
|---|---|
| Semantic | `mockSemanticSearchFallback` — keyword overlap |
| Lexical | `scoreKeywordBM25` — BM25 değil |
| Embedding | Yok; `embedding_id` hep NULL |
| Skorlama | `scoreContextItem` (`context/src/index.ts:417-518`): path match +45/+25, kategori dizini +20, `AUTHORITY_WEIGHTS` (L375-389), recency kovaları +20/15/10/5, chunk yoğunluğu +25, 100'e clamp |
| Strateji birleştirme | `mergeScores` (L254-278) — 3 sabit ağırlıklı strateji: `keyword_bm25_mvp`, `graph_weighted_mvp`, `hybrid_local_mvp` |
| Graph katkısı | `belongs_to` +25, `references\|documents\|tests\|derived_from` +15, transitive +5, 40 cap |
| Search server kind | `local_sql` (default), `local_memory_stub` (3 sahte öğe), `external_stub_only` (boş döner — dürüst) |
| Bütçe | `selectWithinBudget` default **4000** (L287) — diğer yerlerdeki 50.000 ile çelişiyor |

## Target State

**14 sinyal (master §8):**

```text
semantic similarity · lexical similarity · symbol match · dependency distance
reverse dependency · test relationship · architecture/document relationship
git recency · change frequency · authority · task intent · project policy
user permission · historical task relevance
```

Her seçilen fragment için `"Bu neden seçildi?"` sorusu yanıtlanabilir:

```yaml
included_because:
  semantic_score: 0.93
  dependency_distance: 1
  direct_symbol_reference: true
  related_test: true
  task_relevance: 0.96
```

## Architecture Decisions

- **ADR-008** — pgvector, aynı Postgres.
- **ADR-009** — provider-agnostic `EmbeddingProvider`.
- **ADR-025 (yeni)** — **Lexical = Postgres full-text (`ts_rank_cd`) + trigram.** Alternatifler: (a) el yazımı BM25, (b) harici arama motoru (OpenSearch), (c) Postgres FTS. Seçilen (c). Sebep: (a) yeniden icat; (b) ikinci store + tenant izolasyon problemi. Sonuç: Postgres FTS'in BM25'ten farkları (saturation) dokümante edilir ve benchmark'ta ölçülür.
- **ADR-026 (yeni)** — **Sıralama açıklanabilirliği zorunlu.** Her sinyal ayrı kolonda saklanır; toplam skor **türetilmiş** değerdir. Ağırlıklar konfigürasyondadır ve manifest'e yazılır (determinism girdisi, P09).
- **ADR-027 (yeni)** — **Retrieval, Context Firewall'ın dışına çıkamaz.** Firewall (P07) bir **ön filtre** olarak aday üretiminden **önce** uygulanır; sonradan filtreleme yapılmaz. Sebep: DENY içeriğinin embedding'i bile hesaplanmamalıdır.

## Files / Packages Affected

`packages/context/src/retrieval/*`, `packages/context/src/ranking/*`, `packages/providers`, `migrations/`, `workers/embedding-worker.ts` (NEW).

### New Files

```text
packages/context/src/retrieval/{lexical.ts,semantic.ts,symbol.ts,hybrid.ts,types.ts}
packages/context/src/ranking/{ranker.ts,signals/*.ts,weights.ts,explain.ts}
packages/providers/src/embedding/{provider.ts,registry.ts}
workers/embedding-worker.ts
migrations/0067_pgvector.sql … 0072_drop_legacy_search.sql
packages/context/src/__tests__/{lexical,semantic,hybrid,ranker,explain}.test.ts
tests/integration/retrieval/recall.test.ts
```

### Files to Modify

- `packages/context/src/search-server.ts` → `retrieval/hybrid.ts`'e devredilir; `local_memory_stub` modu **silinir**.
- `packages/context/src/retrieval-ranking-service.ts` → `ranking/ranker.ts`.
- `packages/context/src/index.ts` — `scoreContextItem`, `AUTHORITY_WEIGHTS`, `mergeScores` sinyal modüllerine taşınır.

### Files to Delete/Deprecate

- `mockSemanticSearchFallback` (L634-666) — **DELETE**
- `scoreKeywordBM25` (L137-160) — **REPLACE**
- `local_memory_stub` search server kind'ı (3 sahte öğe) — **DELETE**
- `POST /context/isolated-retrieve` (unscoped, **P0-8**) — P02'de silindi; kanonik karşılığı bu fazda gelir

## Database Changes

```text
0067  CREATE EXTENSION vector;  chunks + embedding vector(N) + embedding_model + embedded_at
0068  chunks + tsv tsvector GENERATED  + GIN index          (lexical)
0069  chunks + trgm index on path                            (symbol/path eşleşmesi)
0070  retrieval_runs        (task_id, snapshot_id, strategy, weights_hash, candidate_count)
0071  retrieval_candidates  (retrieval_run_id, chunk_id, 14 sinyal kolonu, final_score, rank)
0072  legacy arama yollarının temizliği
```

`retrieval_candidates`'ın 14 ayrı sinyal kolonu taşıması, açıklanabilirliğin **veritabanı seviyesinde** garantisidir (ADR-026).

## API Changes

```text
POST /api/v1/projects/:pid/tasks/:tid/context/compile   (P08'de tamamlanır, burada retrieval kısmı)
GET  /api/v1/runs/:runId/context/ranking                 (advanced — 14 sinyal + ağırlıklar)
```
Legacy `/context-search`, `/retrieval/rank`, `/retrieval/status` → 410.

## Type / Contract Changes

`Candidate`, `RankedCandidate`, `RankingSignal`, `RankingExplanation`, `RetrievalSpec` (P01) implemente edilir. **`RankedCandidate[]` P08'in girdisi** — bu gate'te donar.

## Frontend Changes

Yok (P15).

## Backend Changes

Retrieval bir compile job'ının fazıdır; senkron HTTP içinde çalışmaz.

## Worker Changes

`workers/embedding-worker.ts` — chunk'lar için embedding üretir, batch'ler, rate limit'e uyar, idempotent (`content_hash` + `embedding_model` anahtarı).

## Security Changes

- **Firewall ön-filtre** (ADR-027): DENY kapsamındaki chunk'lar aday havuzuna hiç girmez; embedding'leri bile üretilmez. Tam entegrasyon P07 ile.
- `user permission` ve `project policy` **sinyal olarak değil, filtre olarak** uygulanır — düşük skorla geçiştirilmez.
- Embedding sağlayıcısına gönderilen içerik redakte edilmiş olmalıdır (secret scanner P04'te chunk'ı işaretledi).

## Migration Strategy

1. pgvector + FTS/trigram şeması.
2. Lexical retrieval (gerçek FTS) devreye alınır; eski `scoreKeywordBM25` kapatılır.
3. Embedding worker + semantic retrieval.
4. Hybrid birleştirme + 14 sinyalli ranker.
5. `local_memory_stub` ve `mockSemanticSearchFallback` silinir.

## Implementation Tasks

### Y-P06-001 — pgvector + FTS şeması (0067–0069)
**Edge Cases:** Embedding boyutu modele bağlı — `embedding_model` kolonu ve model başına ayrı index; model değişimi re-embedding gerektirir.

### Y-P06-002 — `EmbeddingProvider` arayüzü + registry
**Create:** `packages/providers/src/embedding/*`. **Contract test:** batch boyutu, rate limit, retry, deterministik olmayan çıktı toleransı.

### Y-P06-003 — Embedding worker
**Algorithm:** `content_hash + embedding_model` anahtarıyla idempotent; yeniden embedding yalnız hash değiştiğinde.
**Acceptance:** Aynı chunk iki kez embed edilmiyor.

### Y-P06-004 — Lexical retrieval
**Create:** `retrieval/lexical.ts` — `ts_rank_cd` + trigram path eşleşmesi. **Acceptance:** Aynı sorgu için sonuçlar deterministik ve sıralı.

### Y-P06-005 — Semantic retrieval
**Create:** `retrieval/semantic.ts` — pgvector ANN (HNSW/IVFFlat), org+project predicate'i zorunlu.

### Y-P06-006 — Symbol retrieval
**Create:** `retrieval/symbol.ts` — task metnindeki tanımlayıcılar `symbols.symbol_name` ile eşleşir (tam + kısmi).

### Y-P06-007 — Graph genişletme entegrasyonu
P05 `traversal`'ı aday kümesini genişletir; `dependency_distance` ve `reverse dependency` sinyalleri buradan gelir.

### Y-P06-008 — Git sinyalleri
`git recency` ve `change frequency` P03'ün git servisinden (`git log --numstat`) hesaplanır ve snapshot bazında önbelleklenir.

### Y-P06-009 — 14 sinyalli ranker
**Create:** `ranking/{ranker,weights,signals/*}.ts`. **Inputs:** aday + sinyal değerleri. **Outputs:** `RankedCandidate { finalScore, signals, explanation }`.
**Acceptance:** Toplam skor sinyallerden **yeniden hesaplanabiliyor** (denetlenebilirlik).

### Y-P06-010 — Explainability
**Create:** `ranking/explain.ts` — `included_because` yapısı; `retrieval_candidates`'a 14 kolon yazımı.

### Y-P06-011 — Hybrid birleştirme
**Create:** `retrieval/hybrid.ts` — üç kaynaktan aday havuzu, dedup (`chunk_id`), rank fusion.

### Y-P06-012 — Sahte yolların silinmesi
`mockSemanticSearchFallback`, `scoreKeywordBM25`, `local_memory_stub` silinir.
**Negative test:** Bu isimlerin kaynak ağacında bulunmadığını doğrulayan grep testi.

### Y-P06-013 — Recall ölçüm harness'ı
**Create:** `tests/integration/retrieval/recall.test.ts` — fixture repo + ground-truth dosya kümesi; `critical context recall` ölçülür. P16 benchmark'ının öncülü.

## Parallelizable Tasks

```text
Y-P06-004 (lexical) ∥ Y-P06-005 (semantic) ∥ Y-P06-006 (symbol)   — şema donduktan sonra
Y-P06-008 ∥ Y-P06-007
```
Sıralı: `001 → 002 → 003 → 005`, `(004∥005∥006∥007∥008) → 009 → 010 → 011 → 012`.

## Tests

| Suite | İçerik |
|---|---|
| `lexical.test.ts` | FTS sıralaması; stop-word; çok dilli; path eşleşmesi |
| `semantic.test.ts` | ANN geri çağırma; boyut uyumsuzluğu hatası; model değişimi |
| `symbol.test.ts` | Tam/kısmi tanımlayıcı eşleşmesi; ad çakışması |
| `hybrid.test.ts` | Dedup; rank fusion; aday havuzu üst sınırı |
| `ranker.test.ts` | Skor sinyallerden yeniden hesaplanabiliyor; ağırlık değişimi sıralamayı beklenen yönde değiştiriyor |
| `explain.test.ts` | Her seçilen aday için `included_because` dolu |
| `recall.test.ts` | Ground-truth kümesine karşı critical context recall |

## Negative Tests

- Embedding sağlayıcısı erişilemez → semantic kanal devre dışı, **lexical+symbol ile devam** ve manifest'e `degraded_retrieval` işareti; sessiz sahte skor **yok**.
- DENY kapsamındaki chunk aday havuzuna girerse → test **fail**.
- Ağırlık toplamı 1 değilse → yapılandırma hatası, çalışma zamanı sessiz normalizasyon yok.
- `local_memory_stub` çağrılmaya çalışılırsa → sembol yok, derleme hatası.
- Cross-project aday → 0 sonuç.

## Security Tests

T-02 (aday havuzunda cross-tenant sızıntı yok), T-07 (sır içeren chunk aday olamaz).

## E2E

`tests/e2e/retrieval.spec.ts` — fixture repo + gerçek task metni → aday kümesi üretilir; ground-truth dosyalarının tümü ilk N içinde; her aday için açıklama mevcut.

## Observability

`retrieval_latency{channel}`, `retrieval_candidate_count`, `retrieval_recall` (harness), `embedding_backlog`, `embedding_cost`, `semantic_channel_availability`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Embedding backlog | Yeni chunk'lar semantic'te yok | Manifest'e `embedding_coverage < 1` yazılır; compile **uyarır**, sessizce eksik döndürmez |
| ANN index bozulması | Kötü sonuçlar | `REINDEX` runbook'u; recall harness'ı bunu yakalar |
| Ağırlık regresyonu | Recall düşer | Recall testi CI gate'i (eşik altı = fail) |
| Model değişimi | Boyut uyuşmazlığı | `embedding_model` kolonu + re-embedding job'ı |

## Rollback / Recovery

Sinyal ağırlıkları konfigürasyon; kötü bir ağırlık seti kod değişikliği olmadan geri alınabilir. Semantic kanal bayrakla kapatılabilir (lexical+symbol ile çalışmaya devam eder, manifest bunu kaydeder).

## Acceptance Criteria

1. Gerçek embedding üretiliyor ve `chunks.embedding` doluyor.
2. Lexical retrieval Postgres FTS ile; sahte "BM25" yok.
3. `mockSemanticSearchFallback` ve `local_memory_stub` kaynak ağacında yok.
4. 14 sinyalin tamamı hesaplanıyor ve `retrieval_candidates`'ta ayrı kolonlarda saklanıyor.
5. Her seçilen aday için `included_because` üretiliyor.
6. Final skor sinyallerden yeniden hesaplanabiliyor.
7. Permission/policy filtre olarak uygulanıyor (skor olarak değil).
8. Recall harness'ı çalışıyor ve bir taban değer raporluyor.

## Evidence Required

```text
packages/context test suite               PASS
tests/integration/retrieval/recall.test.ts   taban recall değeri raporlanmış
tests/e2e/retrieval.spec.ts               PASS
psql: SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL   > 0
grep -rn "mockSemanticSearchFallback\|local_memory_stub"        boş
retrieval_candidates örnek satırı          14 sinyal kolonu dolu
```

## Exit Gate

```bash
pnpm test --filter @y/context --filter @y/providers
pnpm run test:integration -- tests/integration/retrieval
pnpm run test:e2e -- tests/e2e/retrieval.spec.ts
pnpm --filter @y/db run test:migrations:fresh
pnpm --filter @y/db run test:migrations:upgrade
```

**`RankedCandidate[]` sözleşmesi bu gate'te donar** — P08 buna bağımlıdır.

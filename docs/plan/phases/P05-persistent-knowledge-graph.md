# Phase 05 — Persistent Knowledge Graph

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P04](P04-static-analysis-and-symbols.md) · [P06 →](P06-hybrid-retrieval-engine.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P05 |
| **Workstream** | A — Context Intelligence |
| **Dependencies** | P04 |
| **Migration bloğu** | `0061`–`0066` |

## Objective

Graph'ı `context_items` türevi ve manuel senkronize bir yapıdan, `symbols`/`files` kaynaklı, otomatik ve **incremental** güncellenen kalıcı bağımlılık grafiğine dönüştürmek.

## Why This Phase Exists

Graph **gerçek ve persisted** (`graph_nodes`, `graph_edges`) ve retrieval skorlamasında kullanılıyor (`search-server.ts:190-287`, `retrieval-ranking-service.ts:165-226`). Ama:

- **Manuel sync.** `syncGraphFoundation` (`packages/graph/src/index.ts:607+`) yalnız `POST /projects/:id/graph/sync` ile çalışıyor; hiçbir şey otomatik tetiklemiyor.
- **Yanlış kaynak.** Node'lar `context_items` ve `tasks`'tan üretiliyor (L698-752); dosya sisteminden veya symbol'lerden değil. Edge'ler için `context_chunks` yeniden birleştirilip (L964-977) baştan parse ediliyor — P04'ün ürettiği symbol'ler kullanılmıyor.
- **Yıkıcı sync.** Her sync öncesi `DELETE FROM graph_edges ... WHERE relationship IN (...)` (L663-668) — incremental değil, tam yeniden inşa.
- **Çözülemeyen import'lar** sessizce uyarıya dönüşüyor (L1094).
- `snapshot_id` yok; graph hangi commit'e ait belli değil.

Retrieval (P06) ve Change Firewall (P10) graph'a bağımlı. Yanlış kaynaklı bir graph, yanlış context ve yanlış boundary üretir.

## Dependencies

P04 (`SymbolRecord` donmuş olmalı — bu iki faz **paralel çalıştırılamaz**).

## Current Repository Reality

| Konu | Gerçek |
|---|---|
| Tablolar | `graph_nodes`, `graph_edges` (`db.ts:1154-1176`), `+metadata`/`relationship` (1.1.0, L1354) |
| Node kaynağı | `context_items` + `tasks` |
| Edge kaynağı | `context_packs` alanları (L806-919), metadata ilişkileri (L925-959), statik çıkarım (L961-1100+) |
| Traversal | `calculateImpactTrace` BFS (L17-48), `getReverseDependencies` (L1473), `generateImpactPreview` (L1668), `generateImpactAnalysis` (L1855) |
| Persist | `impact_reports` (L2225), `change_simulations` (L2740) |
| Retrieval kullanımı | `belongs_to` +25, `references|documents|tests|derived_from` +15, transitive +5, 40'ta cap |
| Sabit confidence'lar | `0.9` (L1349), `0.85` (L1617), `0.9/0.7` (L2542) |
| Import bypass | `packages/graph/src/index.ts:14` relative path — P01'de düzeltildi |

## Target State

**Node tipleri:** `repository · file · module · symbol · function · class · route · test · database_table · migration · documentation · adr · configuration`

**Edge tipleri:** `imports · exports · calls · references · implements · extends · tests · configures · reads · writes · depends_on · reverse_depends_on · documents · migrates`

**Traversal:** `direct · reverse · transitive · BFS · DFS · depth limit · node limit · fan-out budget · cycle detection · edge filtering · project isolation · incremental invalidation`

Graph her `repository_snapshots` satırına bağlıdır ve P04'ün `symbol_invalidations` çıktısına göre **artımlı** güncellenir.

## Architecture Decisions

- **ADR-022 (yeni)** — **Graph kaynağı = symbols + files.** Alternatifler: (a) `context_items` (bugünkü), (b) filesystem'i baştan parse etmek, (c) `symbols` tablosu. Seçilen (c). Sebep: (a) index'lenmiş öğelerle sınırlı ve bayat; (b) P04'ün işini tekrarlar. Sonuç: graph, symbol index'i olmadan üretilemez — bağımlılık sırası zorunlu.
- **ADR-023 (yeni)** — **Incremental, yıkıcı olmayan sync.** `DELETE + rebuild` yerine snapshot bazlı upsert + tombstone. Sebep: rebuild sırasında graph tutarsız kalıyor ve eşzamanlı retrieval yanlış sonuç veriyor.
- **ADR-024 (yeni)** — **Postgres'te recursive CTE ile traversal.** Ayrı graph DB'si (Neo4j vb.) getirilmez: tenant izolasyonu, backup ve policy tutarlılığı tek store'da kalır. Fan-out bütçesi sorgu düzeyinde uygulanır.

## Files / Packages Affected

`packages/graph/src/*`, `migrations/`, `workers/graph-worker.ts` (NEW).

### New Files

```text
packages/graph/src/{builder.ts,traversal.ts,invalidation.ts,impact.ts,types.ts}
packages/graph/src/queries/{expand.sql.ts,reverse.sql.ts,cycles.sql.ts}
workers/graph-worker.ts
migrations/0061_graph_snapshot.sql … 0066_graph_backfill.sql
packages/graph/src/__tests__/{builder,traversal,invalidation,cycles}.test.ts
```

### Files to Modify

- `packages/graph/src/index.ts` (3.038 satır) → modüllere bölünür; barrel export kalır.
- `search-server.ts` ve `retrieval-ranking-service.ts` graph çağrıları yeni `traversal` API'sine geçer (P06 bunları zaten yeniden yazacak; burada yalnız imza uyumu).

### Files to Delete/Deprecate

- `syncGraphFoundation`'ın `context_items` yolu ve yıkıcı `DELETE` bloğu (L663-668).
- `POST /projects/:id/graph/sync` manuel tetikleyicisi → **admin-only** hale gelir (normal akışta otomatik).

## Database Changes

```text
0061  graph_nodes    + snapshot_id FK, + organization_id, + symbol_id FK, + node_kind
                     UNIQUE(snapshot_id, node_kind, node_identifier)
0062  graph_edges    + snapshot_id FK, + organization_id, + edge_kind, + confidence
                     UNIQUE(snapshot_id, source_id, target_id, edge_kind)
                     idx(source_id, edge_kind) · idx(target_id, edge_kind)   ← reverse traversal
0063  graph_build_runs   (snapshot_id, status, node_count, edge_count, duration_ms)
0064  graph_tombstones   (snapshot_id, node_id, reason)   incremental silme izi
0065  impact_reports / change_simulations  + snapshot_id
0066  mevcut graph verisinin backfill'i veya işaretlenmesi (eski satırlar snapshot_id NULL → arşiv)
```

## API Changes

```text
GET  /api/v1/runs/:runId/context/graph              (advanced, P08 sonrası dolar)
GET  /api/v1/projects/:pid/graph/expand?seed=&depth=&limit=   (advanced)
POST /api/v1/admin/projects/:pid/graph/rebuild      (admin-only)
```
Legacy `/projects/:id/graph/*` route'ları 410 (Appendix J).

## Type / Contract Changes

`GraphNode`, `GraphEdge`, `EdgeType`, `TraversalSpec`, `TraversalResult` (P01) implemente edilir. **`TraversalSpec` P06'nın girdisi** — bu gate'te donar.

## Frontend Changes

Yok (P15). `apps/web/src/lib/api/graph.ts` ve `hooks/useKnowledgeGraph.ts` bugün **0 importer** — P15'te silinecek.

## Backend Changes

Graph build bir job'a dönüşür; parse job'ı tamamlanınca otomatik kuyruğa girer.

## Worker Changes

`workers/graph-worker.ts` — snapshot → symbols/files oku → node/edge upsert → tombstone → `graph_build_runs` kaydı.

## Security Changes

- Her node/edge `organization_id` taşır; traversal sorguları org predicate'i olmadan çalışamaz (T-02).
- Traversal fan-out ve node limitleri DoS koruması (T-06).
- Graph API'si proje-kapsamlı; cross-project genişleme imkânsız.

## Migration Strategy

1. Şema genişletilir (snapshot + org + unique kısıtlar).
2. `builder.ts` symbols kaynaklı yazım yapar; eski `context_items` yolu kapatılır.
3. Traversal recursive CTE'ye taşınır.
4. Incremental invalidation P04'ün `symbol_invalidations` tablosuna bağlanır.
5. Eski graph satırları arşivlenir (silinmez).

## Implementation Tasks

### Y-P05-001 — `packages/graph` modülerleşmesi
3.038 satırlık tek dosya `builder/traversal/invalidation/impact/types` olarak bölünür. Davranış değişmez; testler yeşil kalır.

### Y-P05-002 — Şema genişletme (0061–0062)
**Edge Cases:** Mevcut satırlarda `snapshot_id` NULL — unique kısıt partial index ile yalnız yeni satırlara uygulanır.

### Y-P05-003 — Symbol kaynaklı builder
**Create:** `builder.ts`. **Algorithm:** `symbols` + `files` → node upsert; `imports`/`exports` alanlarından edge; `tests` ilişkisi test dosyası konvansiyonu + import grafiğinden; `documents` ilişkisi markdown/ADR referanslarından.
**Edge Cases:** Çözülemeyen import → edge yazılmaz ama `unresolved_imports` sayacı artar ve `graph_build_runs`'a yazılır (sessiz uyarı değil, **ölçülen metrik**).

### Y-P05-004 — Recursive CTE traversal
**Create:** `traversal.ts`, `queries/*.sql.ts`. **Inputs:** `TraversalSpec { seeds, direction, maxDepth, maxNodes, fanOutBudget, edgeKinds }`. **Outputs:** `TraversalResult { nodes, edges, truncated, depthReached }`.
**Edge Cases:** Döngü tespiti (ziyaret seti), fan-out patlaması (budget aşımında `truncated=true`).

### Y-P05-005 — Reverse dependency traversal
`idx(target_id, edge_kind)` üzerinden; `reverse_depends_on` ayrı edge olarak **yazılmaz**, sorgu yönü ile elde edilir (çift kayıt tutarlılık riski).

### Y-P05-006 — Incremental invalidation
**Create:** `invalidation.ts`. **Algorithm:** değişen symbol'ler → onlara ait node'lar → gelen/giden edge'ler → yalnız bu alt graf yeniden inşa; kaldırılan node'lar tombstone.
**Acceptance:** Tek dosya değişiminde dokunulan node sayısı toplamın <%2'si.

### Y-P05-007 — Impact analizi taşınması
`generateImpactAnalysis` / `generateChangeSimulation` yeni traversal'a bağlanır; sabit confidence'lar (`0.9`, `0.85`, `0.7`) ölçülen değerlerle değiştirilir (graph derinliği, çözülemeyen import oranı).
**Not:** Bu çıktı P10'un (Change Firewall) girdisidir.

### Y-P05-008 — Graph worker
**Create:** `workers/graph-worker.ts`; parse job'ı bitince otomatik tetiklenir.

### Y-P05-009 — Graph API'leri
**Create:** kanonik expand/rebuild endpoint'leri.

### Y-P05-010 — Migration'lar 0063–0066

## Parallelizable Tasks

```text
Y-P05-004 ∥ Y-P05-003     (traversal ile builder ayrı; şema donduktan sonra)
Y-P05-007 ∥ Y-P05-008
```
Sıralı: `001 → 002 → 003 → 006`, `004 → 005 → 007`.

## Tests

| Suite | İçerik |
|---|---|
| `builder.test.ts` | Fixture repo → beklenen node/edge kümesi; unresolved import sayacı |
| `traversal.test.ts` | direct/reverse/transitive; depth ve node limitleri; fan-out budget; `truncated` bayrağı |
| `cycles.test.ts` | Döngüsel import grafiğinde sonsuz döngü yok |
| `invalidation.test.ts` | Tek symbol değişimi → doğru alt graf; tombstone doğruluğu |
| `isolation.test.ts` | Cross-org/cross-project traversal 0 sonuç |

## Negative Tests

- `organization_id` predicate'i olmayan traversal sorgusu → çalışmaz (lint + runtime guard).
- Fan-out budget aşımı → sonuç kesilir ve `truncated=true`; **sessizce eksik dönmez**.
- Aynı snapshot iki kez build edilirse → duplicate node/edge yok (unique kısıt).
- Symbol index'i olmayan snapshot için graph build → **hata** (sessizce boş graph değil).

## Security Tests

T-02 (tenant isolation), T-06 (traversal DoS).

## E2E

`tests/e2e/graph-build.spec.ts` — index'lenmiş fixture repo için graph oluşur; bir dosyanın import'u değiştirilir; yeniden sync sonrası **yalnız ilgili edge'ler** değişir; reverse dependency sorgusu doğru sonucu verir.

## Observability

`graph_build_duration`, `graph_node_count`, `graph_edge_count`, `unresolved_import_ratio`, `traversal_latency{direction,depth}`, `traversal_truncated_total`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Build yarıda kalır | Kısmi graph | `graph_build_runs.status=failed`; retrieval bu snapshot'ın graph'ını kullanmaz (P06 kontrolü) |
| Fan-out patlaması | Yavaş sorgu | Budget + `statement_timeout`; `truncated` bayrağı retrieval'a taşınır |
| Bayat graph | Yanlış context | Snapshot bazlı bağ; graph snapshot'ı ile manifest snapshot'ı eşleşmezse **compile reddedilir** (P08) |
| Çok fazla unresolved import | Zayıf edge kümesi | Metrik eşiği aşarsa index sağlığı `degraded` |

## Rollback / Recovery

Eski graph satırları arşivlenir, silinmez. Yeni builder devre dışı bırakılırsa (config), sistem son başarılı `graph_build_run`'ı kullanmaya devam eder.

## Acceptance Criteria

1. Graph `symbols`/`files` kaynaklı üretiliyor; `context_items` yolu kapalı.
2. Her node/edge `snapshot_id` + `organization_id` taşıyor.
3. Traversal: direct/reverse/transitive/BFS/DFS + depth/node/fan-out limitleri + cycle detection çalışıyor.
4. Incremental invalidation tek dosya değişiminde toplam node'ların <%2'sine dokunuyor.
5. Yıkıcı `DELETE + rebuild` yolu yok.
6. Graph build otomatik tetikleniyor (manuel sync yalnız admin).
7. Sabit confidence değerleri kaldırıldı.
8. Cross-org traversal imkânsız.

## Evidence Required

```text
packages/graph tüm test suite'i          PASS
tests/e2e/graph-build.spec.ts            PASS
psql: SELECT COUNT(*) FROM graph_edges WHERE snapshot_id IS NULL    (yalnız arşiv satırları)
incremental ölçüm raporu                 dokunulan node oranı
traversal_latency p95                    hedef altı
```

## Exit Gate

```bash
pnpm test --filter @y/graph
pnpm run test:integration -- tests/integration/graph
pnpm run test:e2e -- tests/e2e/graph-build.spec.ts
pnpm --filter @y/db run test:migrations:fresh
pnpm --filter @y/db run test:migrations:upgrade
```

**`TraversalSpec` sözleşmesi bu gate'te donar** — P06 ve P10 buna bağımlıdır.

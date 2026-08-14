# ADR-008 — Vector store: pgvector

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P06 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/retrieval/semantic.ts:2` |

## Decision

Embedding'ler aynı PostgreSQL örneğinde `pgvector` ile saklanır. Ayrı bir
vektör veritabanı (Pinecone, Weaviate, Qdrant) **eklenmez**.

## Context

P06 gerçek semantic retrieval gerektiriyordu. P00'da "semantic search"
diye sunulan şey keyword örtüşmesiydi.

## Reason

Ayrı bir vektör deposu, **policy ile embedding'i farklı sistemlere
böler**. Context Firewall bir ön-filtredir (ADR-027): DENY kapsamındaki
bir chunk'ın embedding'i hiç üretilmemelidir. Bu ancak policy ve vektör
aynı transaction'da olduğunda garanti edilebilir.

İki sistem arasında senkronizasyon penceresi, bir sırrın vektör deposunda
kalmaya devam etmesi demektir.

## Consequences

- Tek veritabanı; yedekleme ve tutarlılık tek yerden.
- Çok büyük korpuslarda ANN performansı ölçülmeli (P18/P19).
- Bkz. [ADR-027](ADR-027-firewall-is-a-prefilter.md).

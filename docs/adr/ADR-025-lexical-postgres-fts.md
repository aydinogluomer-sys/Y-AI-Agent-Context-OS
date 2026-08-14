# ADR-025 — Lexical: Postgres FTS + trigram

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P06 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/retrieval/lexical.ts:2` |

## Decision

Lexical retrieval PostgreSQL full-text search (`ts_rank_cd`) ve trigram
benzerliği ile yapılır. **BM25 değildir ve öyle adlandırılmaz.**

## Context

P00: kodda "BM25" adı geçiyordu ama IDF, TF doygunluğu ve uzunluk
normalizasyonu yoktu — yani BM25'in tanımlayıcı üç bileşeni de yoktu.

## Reason

Bir algoritmaya ait olmayan bir isim kullanmak, okuyanın o algoritmanın
garantilerini varsaymasına yol açar. `ts_rank_cd` iyi bir sıralamadır;
BM25 olmaması bir kusur değil, yalnız farklı bir şeydir. Yanlış olan isim.

## Consequences

- Sıralama kalitesi BM25'ten farklıdır; benchmark'ta ölçülecek (P16).
- Ek altyapı yok; aynı veritabanı.
- Bkz. [ADR-026](ADR-026-ranking-explainability-mandatory.md).

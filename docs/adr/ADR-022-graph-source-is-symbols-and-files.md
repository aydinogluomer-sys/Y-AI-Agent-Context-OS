# ADR-022 — Graph kaynağı = symbols + files

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P05 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/graph/src/builder.ts:2` |

## Decision

Knowledge graph'ın **tek** kaynağı `symbols` ve `files` tablolarıdır.
Graph ayrı bir ayrıştırma yapmaz.

## Context

P00: graph kısmen ayrı bir yoldan üretiliyordu ve symbol indeksiyle
çelişebiliyordu.

## Reason

İki ayrı ayrıştırma yolu, zamanla **birbirinden ayrışır** ve hangisinin
doğru olduğu sorusu cevapsız kalır. Tek kaynak, tutarsızlığı yapısal
olarak imkânsız kılar.

## Consequences

- Graph her zaman symbol indeksiyle aynı commit'i yansıtır.
- Symbol çıkarımı iyileştiğinde graph otomatik iyileşir.
- Bkz. [ADR-023](ADR-023-incremental-non-destructive-graph-sync.md).

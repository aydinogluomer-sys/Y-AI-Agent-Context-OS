# ADR-020 — Chunk sınırı = symbol sınırı

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P04 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/index.ts:295` |

## Decision

Bir chunk **sembol sınırında** başlar ve biter. Sembol bütçeden büyükse
bölünür, ama bölünme noktası yine yapısal bir sınırdır — karakter sayısı
değil.

## Context

P00: chunking karakter tabanlıydı (`chunkContent`). Bir fonksiyon
ortasından kesiliyor, agent'a yarım bir gövde gidiyordu.

## Reason

Yarım bir fonksiyon, agent için **yanlış bilgidir**: gövdenin geri kalanı
yokken davranış hakkında yanlış sonuç çıkarılır. Ayrıca provenance
anlamsızlaşır — "bu sembol dahil edildi" demek, sembolün tamamı dahil
edildiğinde doğrudur.

## Consequences

- Chunk sayısı karakter tabanlı chunking'e göre değişkendir.
- Çok büyük semboller için bölme stratejisi ayrıca tanımlıdır.
- Legacy `chunkContent` satır sınırına çekildi; ADR-001 cutover'ında silinir.

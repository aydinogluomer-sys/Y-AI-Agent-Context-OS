# ADR-021 — Confidence ölçülür, atanmaz

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P04 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/core/src/index.ts:94` |

## Decision

Confidence değerleri **ölçümden** türer. Sabit atanmış confidence
yasaktır. Her confidence, hangi yöntemle elde edildiğini bildiren bir
`confidenceBasis` taşır.

## Context

P00: sembol çıkarımı sabit `0.95`, impact analizi sabit `0.9`/`0.85`/`0.7`
dönüyordu. Bu sayılar hiçbir şey ölçmüyordu ama arayüzde ölçüm gibi
görünüyordu.

## Reason

Atanmış bir confidence, okuyanın güvenini **hak etmeden** kazanır. Sayı
ne kadar spesifik olursa (`0.87` gibi) güven o kadar artar — oysa
arkasında hesap yoktur.

Ölçülemeyen bir şey için doğru cevap sabit bir sayı değil, `null` +
sebeptir (ADR-032).

## Consequences

- `computeEdgeConfidence`, `computeImpactConfidence` gerçek hesap yapar.
- Ölçülemeyen durumlarda değer `null` döner ve sebebi kaydedilir.
- Bkz. [ADR-032](ADR-032-no-fabricated-fields.md).

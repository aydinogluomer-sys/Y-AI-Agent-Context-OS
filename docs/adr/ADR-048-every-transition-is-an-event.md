# ADR-048 — Her durum geçişi bir event'tir

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P12 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/core/src/runtime/run-service.ts:33` |

## Decision

Her durum geçişi bir `run_events` kaydı üretir. Kayıtsız geçiş yoktur.

## Context

Spec §17 minimum olay listesi ve §18 kanıt gereksinimi.

## Reason

Kaydı olmayan bir geçiş, zaman çizelgesinde **boşluk** bırakır ve
zincirin sırası doğrulanamaz hâle gelir (ADR-052'nin hash zinciri buna
dayanır).

Ayrıca SSE yayını Event Store'dan beslenir (ADR-049); kaydı olmayan bir
geçiş istemciye de ulaşmaz.

## Consequences

- Olay sayısı run başına artar; retention politikası gerekir.
- Olaylar append-only; hash zinciri ile korunur.

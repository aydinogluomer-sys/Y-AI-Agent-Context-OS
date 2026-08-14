# ADR-019 — Ingestion HTTP request içinde çalışmaz

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P03 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/core/src/git/repository.ts:205` |

## Decision

Klonlama, fetch, ayrıştırma, embedding ve graph inşası HTTP isteği
içinde **çalışmaz**. Bunlar iş kuyruğuna alınır ve worker tarafından
yürütülür.

## Context

P00: ingestion ve indeksleme kısmen istek içinde yapılıyordu. Büyük bir
repository isteği zaman aşımına uğratıyor, kısmi durum bırakıyordu.

## Reason

İstek yaşam döngüsüne sıkıştırılmış uzun bir iş, **kısmi başarı** üretir:
istemci zaman aşımı görür, sunucu işe devam eder, ve sistemin durumu
hiçbir tarafın bildiği şey değildir.

Ayrıca istek içindeki iş, retry ve idempotency'den yoksundur.

## Consequences

- Her ingestion bir `index_jobs` kaydıdır; durumu sorgulanabilir.
- İlerleme SSE ile yayınlanır (P13).
- Bkz. [ADR-004](ADR-004-postgres-backed-queue.md).

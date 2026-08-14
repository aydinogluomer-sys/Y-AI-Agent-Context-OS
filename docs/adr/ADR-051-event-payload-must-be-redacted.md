# ADR-051 — Olay yükü redakte edilmiş olmalı

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P13 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/shared/src/domain/run.ts:125` |

## Decision

`agent.file_read` / `agent.file_write` olayları dosya **yolunu ve
hash'ini** taşır, içeriğini değil.

## Context

Olay yükünde dosya içeriğinin taşınması, akışı hata ayıklama için
zenginleştirirdi.

## Reason

Olay akışı, context'ten daha geniş bir kitleye ulaşır: tarayıcıya
yayınlanır, log'lara düşer, saklanır. Context Firewall'dan geçmiş bir
içerik bile olay yükünde farklı bir izleyiciye ulaşabilir.

Yol + hash, denetim için yeterlidir: içeriğin ne olduğu CAS'ten,
yetkilendirmeyle alınır.

## Consequences

- Hata ayıklamada bir adım fazladan (CAS'ten çekme).
- Sır sızıntısı yüzeyi olay akışında sıfır (T-07).

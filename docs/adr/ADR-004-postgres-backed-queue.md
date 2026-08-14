# ADR-004 — PostgreSQL-backed queue

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P12 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/core/src/index.ts:133` |

## Decision

İş kuyruğu PostgreSQL üzerinde `FOR UPDATE SKIP LOCKED` ile
uygulanır. Redis/BullMQ/SQS **eklenmez**.

## Context

P12 gerçek bir run FSM'i ve worker mimarisi gerektiriyordu. Mevcut
stack'te zaten PostgreSQL vardı; kuyruk için ikinci bir altyapı bileşeni
eklemek seçenekti.

## Reason

Kuyruk ile domain verisi **aynı transaction'da** kalır: bir run'ın durum
geçişi ile o run'ın işinin kuyruğa alınması atomiktir. Ayrı bir kuyruk
sistemi bu atomikliği kaybettirir ve iki kaynak arasında tutarsızlık
penceresi açar.

Beklenen yük için `SKIP LOCKED` fazlasıyla yeterlidir; ölçek gerçek bir
sorun hâline gelirse P18'de yeniden değerlendirilir — ama ölçülmeden
değil.

## Consequences

- Ek altyapı bileşeni yok; operasyon yüzeyi dar kalır.
- Çok yüksek iş hacminde Postgres darboğaz olabilir; bu ölçüldüğünde
  yeniden karar verilecek.
- Crash recovery lease TTL ile: `status = 'running' AND lease_expires_at < NOW()`.

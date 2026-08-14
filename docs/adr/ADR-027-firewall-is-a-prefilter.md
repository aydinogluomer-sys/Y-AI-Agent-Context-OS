# ADR-027 — Firewall ön-filtre, son filtre değil

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P06/P07 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/ranking/signals.ts:219` |

## Decision

Context Firewall retrieval **öncesinde** uygulanır. DENY kapsamındaki
içerik hiçbir aşamada okunmaz — embedding'i bile üretilmez.

## Context

Spec §9: "Security retrieval'dan sonra yapılmış basit filtre değildir.
Security retrieval pipeline'ın içine gömülü olmalıdır. Agent denied
context'in içeriğini hiçbir aşamada almamalıdır."

## Reason

Son filtre olarak uygulanan bir güvenlik kontrolü, içeriğin **zaten
okunmuş** olduğu anlamına gelir: embedding üretilmiş, log'a düşmüş,
belleğe alınmıştır. Bir sırrın "sonuçtan çıkarılması" onun okunmamış
olduğunu göstermez.

Ön-filtre, sızıntı yüzeyini sıfırlar.

## Consequences

- Universe SQL predikatına derlenir ve sorguya girer (ADR-028).
- DENY kapsamındaki chunk için embedding worker iş üretmez.
- Bkz. [ADR-029](ADR-029-deny-wins-approval-acts-as-deny.md).

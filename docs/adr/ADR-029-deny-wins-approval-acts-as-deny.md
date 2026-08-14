# ADR-029 — DENY kazanır; APPROVAL retrieval'da DENY gibi

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P07 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/retrieval/hybrid.ts:160` |

## Decision

Bir yol birden fazla kurala uyuyorsa **DENY her zaman kazanır**.
Retrieval aşamasında `APPROVAL` kapsamı `DENY` gibi davranır.

## Context

Spec §9 üç kapsam tanımlıyor: ALLOW, APPROVAL, DENY. APPROVAL'ın
retrieval'daki anlamı belirsizdi.

## Reason

Öncelik kuralı belirsizse, kural sırası bir güvenlik parametresine
dönüşür ve yanlış sıralama sessiz bir açık yaratır.

APPROVAL'ın retrieval'da izin vermesi, içeriğin **onay alınmadan önce**
okunması demektir — onay mekanizmasının amacını ortadan kaldırır. Onay
mutation için anlamlıdır, okuma için değil.

## Consequences

- Kural sırası güvenlik açısından önemsizdir.
- APPROVAL kapsamı yalnız Change Firewall'da ayrı davranır (ADR-040).
- Bkz. [ADR-027](ADR-027-firewall-is-a-prefilter.md).

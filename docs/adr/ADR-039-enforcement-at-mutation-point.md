# ADR-039 — Enforcement mutation noktasında

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P10 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/core/src/repo/local-adapter.ts:313` |

## Decision

Boundary kontrolü **mutation'ın gerçekleştiği noktada** yapılır, plan
aşamasında değil. `writeFile` zorunlu `changeDecision` ve
`decisionReason` parametreleri alır.

## Context

Spec §12: "Bu yalnız frontend uyarısı değildir. Backend policy
enforcement olmalıdır."

## Reason

Plan aşamasındaki bir kontrol, plandan sapan bir agent'ı durduramaz.
Agent'ın ne yapacağını söylemesi ile ne yaptığı farklı şeylerdir; kontrol
ikincisine bakmalıdır.

Parametrelerin **zorunlu** olması, kontrolsüz bir yazımın derleme zamanında
imkânsız olması demektir — çalışma zamanı kontrolü unutulabilir, tip
sistemi unutmaz.

## Consequences

- Her `writeFile` çağrısı bir karar taşımak zorundadır.
- Yazma yarışı kontrolü boundary kontrolünden **önce** çalışır (T-20).
- Bkz. [ADR-041](ADR-041-hash-before-after-mandatory.md).

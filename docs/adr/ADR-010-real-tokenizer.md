# ADR-010 — Gerçek tokenizer

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P08 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/tokenizer/types.ts:2` |

## Decision

Token sayımı `Tokenizer` sözleşmesi arkasındadır. Yaklaşık sayım
**yasak değildir** ama sonucu `approximate: true` ile işaretlenmek
zorundadır.

## Context

P00: token sayımı karakter/4 heuristiğiydi ve sonuç kesin sayı gibi
sunuluyordu. Bütçe hesabı (ADR-031) ve deterministik manifest (ADR-034)
buna dayanıyordu.

## Reason

Yaklaşık bir sayının kesin gibi sunulması, bütçe aşımını **sessiz** hâle
getirir: model isteği reddeder ve sebep manifest'te görünmez.

Deterministik manifest, gerçek sayım gerektirir; yaklaşık sayım aynı
girdi için aynı sonucu verse bile *doğru* sonucu vermez.

## Consequences

- Bugün heuristic kullanılıyor ve `approximate: true` taşıyor.
- Gerçek BPE tokenizer paketi eklenmedi; kapanma koşulu P11 wire-up.
- Bkz. [ADR-031](ADR-031-budget-from-adapter-ceiling-from-policy.md),
  [ADR-032](ADR-032-no-fabricated-fields.md).

# ADR-031 — Bütçe adapter'dan, tavan policy'den

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P08 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/budget/engine.ts:2` |

## Decision

Kullanılabilir context bütçesi **adapter'ın capability negotiation'ından**
gelen limitten rezervler düşülerek hesaplanır, sonra policy tavanıyla
kırpılır. Bütçe yetersizse `INSUFFICIENT_BUDGET` **hatası fırlatılır**;
sıfıra kırpılmaz.

## Context

P00: üç ayrı yerde sabit `50000`, dördüncü bir yerde `4000` vardı ve
bunlar birbiriyle çelişiyordu. Spec §10 sabit 50K'yı ürün tanımı olmaktan
çıkarmayı şart koşuyor.

## Reason

Sabit bir bütçe, farklı context limitine sahip modellerde ya kapasiteyi
boşa harcar ya isteği reddettirir.

Sıfıra kırpmak daha da kötüdür: sistem "başarıyla derledi" der ve boş
bir context üretir. Yetersiz bütçe bir **hatadır**, bir sonuç değil.

## Consequences

- Bütçe her run'da yeniden hesaplanır (ADR-045 ile birlikte).
- Organizasyon tavanı policy'den gelir; adapter limitini aşamaz.
- Bkz. [ADR-010](ADR-010-real-tokenizer.md).

# ADR-026 — Sıralama açıklanabilirliği zorunlu

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P06 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/ranking/ranker.ts:4` |

## Decision

Her sıralama sinyali **ayrı bir kolon** olarak saklanır. Toplam skor
türetilmiş bir değerdir; sinyaller ondan geri hesaplanamaz olduğu için
ayrı tutulmaları zorunludur.

## Context

Spec §8: "Final ranking explainable olmalıdır... 'Bu neden seçildi?'
sorusunu yanıtlayabilmelidir."

Basit yaklaşım tek bir `score` kolonu tutmaktı.

## Reason

Tek bir toplam skordan sinyalleri geri çıkarmak matematiksel olarak
mümkün değildir. Açıklanabilirlik bir raporlama özelliği değil, bir
**veri modeli kararıdır** — sonradan eklenemez, çünkü veri kaybolmuştur.

14 sinyalin ayrı kolonlarda tutulması, "neden seçildi" sorusunun her
zaman ve geriye dönük olarak cevaplanabilmesi demektir.

## Consequences

- 14 kolon; satır boyutu artar.
- Ağırlıklar toplamı 1 değilse `assertValidWeights` **hata fırlatır**
  (sessiz normalizasyon yok).
- `null` sinyaller için ağırlık yeniden dağıtılır.

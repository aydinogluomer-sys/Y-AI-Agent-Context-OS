# ADR-035 — Canonical JSON serileştirme

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P09 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/manifest/canonical-json.ts:2` |

## Decision

Hash'lenen her yapı **kanonik JSON** ile serileştirilir: anahtarlar
sıralı, `undefined` atlanır, `null` korunur, `-0` → `0`, string'ler NFC
normalize edilir, `NaN`/`Infinity` **reddedilir**.

## Context

Manifest hash'i determinizmin temelidir (ADR-033). `JSON.stringify`
anahtar sırasını ekleme sırasına göre üretir — aynı veri farklı hash
verir.

## Reason

Alan sırası hash'i etkiliyorsa, aynı içerik iki farklı kanıt üretir ve
kanıtın kendisi anlamsızlaşır.

`NaN`/`Infinity`'nin reddedilmesi bilinçlidir: `JSON.stringify` bunları
sessizce `null`'a çevirir; sessiz bir dönüşüm, hash'i eşitler ama veriyi
kaybeder.

## Consequences

- Serileştirme `JSON.stringify`'dan yavaştır; hash yolu için kabul edilir.
- NFC normalizasyonu Unicode eşdeğer stringleri aynı hash'e getirir.

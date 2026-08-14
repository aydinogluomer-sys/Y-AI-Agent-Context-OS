# ADR-045 — Capability negotiation her run başında

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P11 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/adapters/src/types.ts:2` |

## Decision

Yetenek müzakeresi **her run başında** yapılır ve sonucu run'a kaydedilir.
Sağlık kontrolü sonucu `probedNetwork: boolean` taşır.

## Context

P00: adapter sağlık kontrolü ağa hiç çıkmadan `healthy` dönüyordu.
Yetenekler ise bir kez okunup önbelleğe alınıyordu.

## Reason

Model limitleri ve yetenekleri sağlayıcı tarafında **habersizce** değişir.
Önbelleğe alınmış bir context limiti, bütçe hesabını (ADR-031) sessizce
yanlış yapar.

`probedNetwork` alanı P00'daki yalanı **yapısal olarak imkânsız** kılar:
ağa çıkmadan `true` döndürmek mümkün değildir; alan ölçümün kendisidir.

## Consequences

- Run başına bir müzakere isteği.
- Müzakere sonucu manifest ve evidence ile birlikte saklanır.

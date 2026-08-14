# ADR-036 — Dışlama kaydı zorunlu ve sebepli

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P09 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/manifest/builder.ts:2` |

## Decision

Her aday fragment ya `items` ya `exclusions` içinde yer alır. Dışlama
sebepleri **kapalı bir kümedir**. Kapsama bütünlüğü çalışma zamanında
`assertCompleteCoverage()` ile zorlanır.

## Context

Spec §11: "Aynı şekilde excluded context de reason ile kaydedilmelidir."

## Reason

Yalnız dahil edilenleri kaydetmek, "neden bu dosya yok?" sorusunu
cevapsız bırakır — oysa güvenlik açısından asıl önemli soru budur.
Bir sır dışlandıysa bunun **kanıtı** olmalıdır.

Sebep kümesinin açık uçlu olması, zamanla serbest metne dönüşür ve
makineyle analiz edilemez hâle gelir.

Bütünlüğün çalışma zamanında zorlanması gerekir: derleme zamanı tip
kontrolü bir adayın *hiçbir* listede olmamasını yakalayamaz.

## Consequences

- Her aday sayılır; kayıp aday **hata fırlatır**.
- Dışlama sebepleri sabit bir enum'dur.
- Bkz. [ADR-032](ADR-032-no-fabricated-fields.md).

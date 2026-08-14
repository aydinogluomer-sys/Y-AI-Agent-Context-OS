# ADR-032 — Uydurma alan yasağı

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P08 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/compiler/compile.ts:2` |

## Decision

Ölçülemeyen bir alan **uydurulmaz**. Değer `null` olur ve yanına
`unavailableReason` yazılır.

## Context

P00: `buildContextPack` bağımlılık sayısı, diff bilgisi ve sır bayrağını
**uyduruyor** ve veritabanına yazıyordu. Bu değerler hiçbir ölçümden
gelmiyordu ama şemada gerçek alanlarla yan yana duruyordu.

## Reason

Uydurulmuş bir alan, veritabanına yazıldığı anda **gerçeğe dönüşür**:
sonraki her okuyucu onu ölçüm sanır ve üzerine karar kurar. Hata kaynağa
kadar izlenemez çünkü kaynakta hata yoktur — yalnız uydurma vardır.

`null` + sebep, "bilmiyorum" demenin makine tarafından okunabilir hâlidir
ve bu her zaman yanlış bir sayıdan daha kullanışlıdır.

## Consequences

- Tüketiciler `null` durumunu ele almak zorundadır.
- `p08-no-fabricated-fields.test.ts` bu değişmezi kilitler.
- Bkz. [ADR-021](ADR-021-confidence-is-measured.md).

# ADR-034 — Manifest = kanıtın birincil birimi

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P09 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/manifest/builder.ts:2` |

## Decision

Context Manifest kanıtın **birincil birimidir**. Immutable, versiyonlu,
hash'lenebilir ve denetlenebilirdir.

## Context

Spec §11: "Sistem daha sonra kesin olarak 'Model tam olarak ne gördü?'
sorusunu cevaplayabilmelidir."

## Reason

Bu soru ancak agent'a giden içeriğin **tek** ve **değişmez** bir kaydı
varsa cevaplanabilir. Kayıt birden fazla yere dağılırsa hangisinin doğru
olduğu sorusu ortaya çıkar; değişebilirse geçmiş cevap doğrulanamaz.

Manifest bu yüzden bir rapor değil, bir **kanıt birimidir**.

## Consequences

- Manifest hash'i evidence zincirine girer.
- Manifest üretilmeden run `ready` olamaz (ADR-046).
- Bkz. [ADR-037](ADR-037-manifest-is-sole-content-source.md).

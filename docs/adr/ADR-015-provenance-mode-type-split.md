# ADR-015 — Provenance Mode Type-Level Ayrımı

| Alan | Değer |
|---|---|
| Durum | **Uygulandı** |
| Faz | P01 |
| Tarih | 2026-08-13 |

## Decision

Production sonucu ile simülasyon sonucu **aynı tip olamaz**:

    Provenanced<T> = ProductionResult<T> | NonProductionResult<T>

- `ProductionResult<T>` bir `evidenceRef` olmadan oluşturulamaz.
- `NonProductionResult<T>` bir `reason` olmadan oluşturulamaz.

## Context

P00 Truth Audit'in en tehlikeli bulgusu, sahteliğin ayırt edilememesiydi:

- `apps/web/src/lib/api/ai.ts` uydurma bir sonucu gerçek sonuçla **aynı tipte**
  döndürüyordu (`isFallback: true` alanı vardı ama tip aynıydı).
- `navigation.ts` bir `status: "implemented" | "placeholder"` alanı ve
  `AppShell` bir "Simüle" rozeti taşıyordu — ama **113 kaydın tamamı
  `"implemented"`**, `"placeholder"` sayısı 0'dı. Dürüstlük işareti elle
  bakıma bağlı olduğu için kırılmıştı.

## Reason

Dürüstlük işareti **veriden türemeli**, elle bakımdan değil. Bir sonucu
`Provenanced<T>` sarmalayıcısı olmadan UI'ya taşımak tip hatası verir;
`requiresProvenanceBadge()` rozet zorunluluğunu veriden hesaplar.

## Consequences

- UI'da `mode !== "PRODUCTION"` olan her yüzey kalıcı, kapatılamaz bir rozet
  gösterir (P15 `ProvenanceBadge`).
- Simülasyon sebebi kayıt altına alınır ve kullanıcıya gösterilir.

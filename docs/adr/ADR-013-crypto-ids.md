# ADR-013 — Kriptografik Kimlik Üretimi

| Alan | Değer |
|---|---|
| Durum | **Uygulandı** |
| Faz | P01 |
| Tarih | 2026-08-13 |

## Decision

Tüm kimlikler `packages/shared/src/ids.ts` içindeki `newId()` /
`newSortableId()` fonksiyonlarından gelir. Uygulama kodunda `Math.random()`
ile primary key üretimi **yasaktır**.

## Context

P00 Truth Audit, 60 çağrı noktasında şu kalıbı tespit etti:

    const jobId = `job_${Math.random().toString(36).substring(2, 11)}`;

~44 bit tahmin edilebilir, kriptografik olmayan entropi. `audit_logs`,
`event_records`, `evidence_records` gibi tablolarda bu bir bütünlük riskidir:
bir aktör gelecekteki bir kimliği tahmin edip önceden kayıt oluşturabilir.

## Reason

`Math.random()` kriptografik olarak güvenli değildir ve kısa bir sonekle
birleştirildiğinde doğum günü paradoksu nedeniyle çakışma olasılığı ihmal
edilebilir olmaktan çıkar.

Birincil anahtarda çakışma iki ayrı zarar üretir: ya bir kayıt diğerinin
üzerine yazılır (sessiz veri kaybı), ya UNIQUE ihlali **gerçek bir hata
gibi görünen** sahte bir başarısızlık üretir. İkisi de kanıt iddiasında
bulunan bir sistemde kabul edilemez.

## Consequences

- `newId()` `crypto.randomUUID()` kullanır.
- `newSortableId()` zaman sıralı ULID benzeri kimlik üretir (event tablolarında
  index lokalitesi sağlar).
- 31 çağrı noktası göç ettirildi (`scripts/audit/migrate-ids.ts`).
- Kalan 28 kullanım, P19'da silinecek sahte validation script'lerinde.
- `scan-false-green.ts` bunu `random-primary-key` kuralıyla denetler;
  P17'de CI gate'i olur.

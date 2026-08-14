# ADR-043 — Manifest tek içerik kaynağıdır

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P11 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/adapters/src/types.ts:23` |

## Decision

Agent manifest olmadan **başlatılamaz**. Adapter'a içerik yalnız manifest
üzerinden verilir.

## Context

ADR-037'nin adapter yüzeyindeki karşılığı. Adapter'ın kendi başına
repository okuması teknik olarak mümkündü.

## Reason

Ne gördüğü kayıtlı olmayan bir agent çalıştırmak, ürünün ana iddiasını
(PROOF) daha başlangıçta geçersiz kılar. Kanıt sonradan üretilemez.

## Consequences

- `start()` manifest zorunlu parametresi alır.
- Manifest yoksa çalıştırma reddedilir, ertelenmez.

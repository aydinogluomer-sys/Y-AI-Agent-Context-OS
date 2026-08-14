# ADR-047 — Terminal durumlar geri alınamaz

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P12 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/core/src/runtime/run-service.ts:28` |

## Decision

`completed`, `failed`, `cancelled` **terminal** durumlardır ve geri
alınamaz. Kural veritabanı trigger'ı ile de zorlanır.

## Context

Uygulama katmanındaki bir kontrol, doğrudan SQL ile yapılan bir
güncellemeyi engelleyemez.

## Reason

Terminal bir durumdan çıkış, o run hakkında yayınlanmış her kanıtı
geçersiz kılar: `completed` demiş bir run sonradan `running` olursa
kanıtın hangi ana ait olduğu belirsizleşir.

Kuralın veritabanında olması, uygulama katmanı atlansa bile geçerli
olması demektir — kanıt bütünlüğü uygulamanın doğruluğuna bağlı kalmaz.

## Consequences

- `block_terminal_run_transition` trigger'ı migration 0079'da.
- Yeniden çalıştırma **yeni bir run** üretir.

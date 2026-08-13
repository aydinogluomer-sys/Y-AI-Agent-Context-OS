# ADR-003 — Dosya Tabanlı Migration'lar

| Alan | Değer |
|---|---|
| Durum | **Uygulandı** |
| Faz | P01 |
| Tarih | 2026-08-13 |

## Decision

Migration'lar `apps/api/src/db.ts` içindeki inline `migrationVersions` dizisinden
`migrations/NNNN_slug.sql` dosyalarına taşındı. `db.ts` yalnız bağlantı sahipliğini
yönetir; uygulama `@y/db` runner'ına devredilir.

## Context

P00 Truth Audit: repo'da **hiç `.sql` dosyası yoktu**. 42 tablonun tamamı 1.170
satırlık bir TypeScript string dizisinde yaşıyordu. Şema gözden geçirilemez,
diff'lenemez ve araçlarla doğrulanamaz durumdaydı.

Eski runner'da eşzamanlı çalıştırma koruması da yoktu: iki instance aynı anda
boot ederse aynı migration iki kez uygulanabilirdi.

## Alternatives

1. **Inline dizide kalmak** — reddedildi (yukarıdaki context).
2. **Harici migration kütüphanesi (node-pg-migrate, umzug)** — reddedildi:
   mevcut `schema_migrations` ledger'ı ve version string'leri korunmalı;
   harici araç kendi ledger şemasını dayatıyor ve göç sırasında uygulanmış
   migration'ların yeniden çalışması riski doğuyor.
3. **Kendi dosya tabanlı runner'ımız** — SEÇİLEN.

## Reason

Ledger anahtarları (`schema_migrations.version`) **değişmedi**. Runner dosya
adını değil, dosyanın `-- Ledger version:` başlığındaki string'i anahtar olarak
kullanır; halihazırda migrate edilmiş veritabanları etkilenmez.

## Consequences

- Şema artık diff'lenebilir ve gözden geçirilebilir.
- Parite garantisi **kalıcıdır**: göç anındaki SQL'in SHA-256 hash'leri
  `packages/db/src/__fixtures__/migration-baseline.json` içinde dondurulmuş,
  `migrations.test.ts` her dosyayı buna karşı doğruluyor.
- Yeni migration'lar `0036`'dan başlar; faz başına numara blokları master plan
  Appendix K.1'dedir.
- Her yeni migration için `-- +down` bölümü zorunludur.
- Runner `pg_advisory_lock` ile serileştirir, tek transaction'da uygular,
  hatada tam rollback yapar.

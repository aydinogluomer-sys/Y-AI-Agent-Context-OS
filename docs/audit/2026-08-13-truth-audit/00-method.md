# 00 — Doğrulama Yöntemi

> Baseline commit: `9f10f70123cc72d0cfa59bf0998fc8cfafd557d6` (`main`) · Tarih: 2026-08-13

## Kanıt standardı (ADR-000)

Bir iddia ancak şunlardan biriyle desteklenirse bu audit'e girer:

1. Dosya:satır referansı (kaynak kod okunmuş),
2. Çalıştırılmış komut çıktısı,
3. Şema ile kod karşılaştırması.

**"Dokümanda yazıyor" kanıt değildir.** Repository'deki hiçbir `PASS`,
`verified`, `implemented`, `production-ready` iddiasına güvenilmemiştir.

## Üreten script'ler

| Script | Çıktı | Ne yapar |
|---|---|---|
| `scripts/audit/inventory-api.ts` | `02-api-inventory.csv` | Route'ları kayıt sırasıyla çıkarır, gölgelenmeyi tespit eder |
| `scripts/audit/inventory-ui.ts` | `03-ui-inventory.csv` | Nav item'ları `App.tsx` `case` etiketleriyle eşleştirir |
| `scripts/audit/inventory-db.ts` | `04-db-inventory.csv` | Inline migration DDL'ini ayrıştırır, tablo kullanımını sayar |
| `scripts/audit/scan-false-green.ts` | `10-*.csv/md` | Sahte başarı kalıplarını tarar |
| `scripts/audit/verify-inventories.ts` | — | Envanterlerin kaynakla tutarlılığını doğrular (drift detector) |

Yeniden üretmek için:

```bash
npx tsx scripts/audit/inventory-api.ts
npx tsx scripts/audit/inventory-ui.ts
npx tsx scripts/audit/inventory-db.ts
npx tsx scripts/audit/scan-false-green.ts
npx tsx scripts/audit/generate-reports.ts
npx tsx scripts/audit/verify-inventories.ts   # exit 0 olmalı
```

## Kapsam dışı

Bu audit **production kodunu değiştirmez**. Yalnız `docs/` ve `scripts/audit/`
ekler. Tespit edilen bulgular P01–P20 fazlarında kapatılır.

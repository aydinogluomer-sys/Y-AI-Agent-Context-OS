# Sürüm Yükseltme

## Migration modeli

Şema `migrations/*.sql` içinde yaşar (ADR-003). `db.ts` içinde inline
`CREATE TABLE` **yasaktır** ve drift gate'i bunu kontrol eder.

Migration'lar sıralı ve **ileri yönlüdür**; geri alma script'i yoktur.
Geri alma gerekiyorsa yedekten dönülür.

## Yükseltme adımları

```bash
git pull
npm install
npm run migrate
npm run gate:all        # yukseltme sonrasi dogrulama
```

## İki migration yolu

Spec §30 ikisinin de test edilmesini şart koşuyor:

| Yol | Ne | Durum |
|---|---|---|
| **Fresh** | Boş veritabanına tüm migration'lar | Testi **yok** (P19) |
| **Upgrade** | Mevcut şema üzerine yeni migration'lar | Testi **yok** (P19) |

İkisi de canlı Postgres gerektirdiği için ertelendi. Bugün doğrulanan şey
migration dosyalarının **varlığı ve konumu**, uygulanabilirliği değil.

## Uyumluluk

Bu sürüm **üretime alınamaz**; kırıcı değişiklik politikası henüz
tanımlanmadı. Bkz. [kabul raporu](../Y_FINAL_ACCEPTANCE_REPORT.md).

## Yükseltme sonrası kontrol listesi

1. `npm run gate:drift` — envanterler kodla tutarlı mı
2. `GET /api/readyz` — on bileşen de bekleneni söylüyor mu
3. Kanıt zinciri doğrulaması (bkz. [yedekleme](backup-restore.md))
4. `npm run secret-scan` — yeni bulgu var mı

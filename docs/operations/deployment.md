# Dağıtım

> spec §40

## Dağıtım biçimleri

| Biçim | Durum |
|---|---|
| Yerel geliştirme | Çalışır — bkz. [yerel geliştirme](local-development.md) |
| Docker geliştirme | **Yok** |
| Tek düğüm üretim | **Yok** |
| Bulut üretim | **Yok** |
| Kurumsal / özel | **Yok** |

Bu tablo bilerek boş: bir dağıtım biçimini "hazır" yazmak, denenmemiş bir
yolun çalıştığını iddia etmek olurdu. **Bu sürüm üretime alınamaz** (bkz.
[kabul raporu](../Y_FINAL_ACCEPTANCE_REPORT.md)).

## Konfigürasyon

Ortam değişkenleri tipli ve doğrulanmış olmalıdır (ADR-072). Bugün
doğrulama kısmidir.

### Zorunlu

| Değişken | Ne için |
|---|---|
| `DATABASE_URL` | Postgres. **Arayüzden yapılandırılamaz** (ADR-073) |
| `JWKS_URI` / `OIDC_JWKS_URI` | JWT doğrulaması |
| `WORKER_SIGNING_KEY` | Worker kimliği imzalama (≥32 karakter) |

### Üretimde YASAK

| Değişken | Sebep |
|---|---|
| `ENABLE_MOCK_DB` | Mock veritabanı üretimde olamaz (ADR-070) |
| `ALLOW_OFFLINE_API_BOOT` | DB'siz açılış üretimde olamaz (ADR-071) |
| `JWT_SECRET` | Simetrik JWT sırrı; JWKS kullanılır (P0-3) |

Bu üçü `scripts/audit/scan-false-green.ts` tarafından **tripwire** olarak
izlenir. Adlandırılmış kaçış kapıları bilerek vardır ve bilerek görünürdür.

## Sırlar

Secret manager zorunludur (ADR-073). Sırlar tarayıcı üzerinden `.env`
dosyasına **yazılmaz** — bunu yapan uç nokta ve form kaldırıldı.

## Veritabanı

Tek bir PostgreSQL örneği; pgvector eklentisi gerekli. Ayrı kuyruk
(ADR-004) veya vektör deposu (ADR-008) **yoktur** ve bu bilinçlidir: iki
sistem arasında senkronizasyon penceresi, bir sırrın vektör deposunda
kalmaya devam etmesi demektir.

## Yükseltme

Bkz. [sürüm yükseltme](upgrade.md). Fresh ve upgrade migration yollarının
**ikisinin de testi yok** (P19).

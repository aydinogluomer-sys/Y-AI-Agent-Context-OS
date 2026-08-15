# Yedekleme ve Geri Yükleme

## Ne yedeklenir

Tek bir PostgreSQL veritabanı; **tüm durum orada** (ADR-004, ADR-008).
Ayrı bir kuyruk, vektör deposu veya blob deposu yoktur.

| Veri | Tablolar | Kritiklik |
|---|---|---|
| Kanıt | `evidence_chain`, `run_events`, `cas_blobs`, `artifacts` | **Yeniden üretilemez** |
| Manifest | `context_manifests` ve bağlı kayıtlar | **Yeniden üretilemez** |
| Policy | `policy_rules`, `policy_versions` | Yeniden üretilemez |
| Kimlik | `users`, `organizations`, `memberships` | Yeniden üretilemez |
| Index | `symbols`, `chunks`, `graph_nodes`, `graph_edges` | **Yeniden üretilebilir** (repo'dan) |

Index verisi kaybedilirse yeniden indekslenebilir. Kanıt kaybedilirse
**geri getirilemez** — bu yüzden yedekleme önceliği kanıttır.

## Yedekleme

```bash
pg_dump --format=custom --file=y-$(date +%F).dump "$DATABASE_URL"
```

Kanıt tabloları append-only olduğu için artımlı yedekleme (WAL arşivleme)
verimlidir.

## Geri yükleme

```bash
pg_restore --dbname="$DATABASE_URL" --clean --if-exists y-2026-08-14.dump
npm run migrate     # sema surumu esitlensin
```

## Geri yükleme sonrası doğrulama

Kanıt zincirinin bütünlüğü **mutlaka** doğrulanmalıdır — kısmi bir geri
yükleme sıra boşluğu bırakır ve bu, dışarıdan bir saldırıdan ayırt
edilemez:

```bash
npm run verify:evidence-chain
```

Komut **artık var** ve gerçek bir tatbikatta denendi (P19/T9).

### Ölçülen tatbikat

| Adım | Sonuç |
|---|---|
| `pg_dump --format=custom` | 197 KB (5 kayıtlık zincir + tam şema) |
| Şemayı yok et | 87 nesne düştü |
| `pg_restore` | **1130 ms** |
| Geri yüklenen kayıt | 5 / 5 |
| Zincir doğrulaması | **SAĞLAM** (exit 0) |

### Doğrulayıcının kırıldığı da kanıtlandı

Tatbikatın ikinci yarısında bir kayıt silindi (kısmi geri yükleme
simülasyonu) ve komut **exit 1** verdi:

```
sonuc         : KIRIK
kirilma sirasi: 4
sebep         : Sira boslugu: 3 bekleniyordu, 4 bulundu.
                Bir kayit SILINMIS olabilir.
```

Hiçbir şeyi yakalamayan bir doğrulayıcı da "SAĞLAM" der; bu yüzden
kırılabildiği ayrıca ölçüldü.

**Yan bulgu:** silme işlemi için append-only trigger'ı geçici olarak
devre dışı bırakmak gerekti — yani trigger da gerçekten çalışıyor
(T-18).

### Windows notu

Git Bash, `-f /tmp/dump` gibi konteyner içi yolları Windows yoluna
çevirir (MSYS yol dönüşümü) ve `pg_dump` "No such file or directory"
verir. Çıktıyı **stdout üzerinden** host dosyasına yönlendirmek bu
sorunu tamamen atlar ve zaten daha taşınabilirdir:

```bash
docker exec y-test-postgres pg_dump -U postgres -d y_test --format=custom > y.dump
docker exec -i y-test-postgres pg_restore -U postgres -d y_test < y.dump
```

## Saklama

Kanıt kayıtları için saklama politikası **tanımlanmadı**. Graph
tombstone'ları (ADR-023) ve olay kayıtları zamanla büyür; retention
kararı P19'un konusudur.

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

Bu komut henüz yok; kapanma koşulu canlı Postgres entegrasyon paketi
(P19). Bugün doğrulama fonksiyonu `packages/security/src/evidence/chain.ts`
içinde ve birim testlidir.

## Saklama

Kanıt kayıtları için saklama politikası **tanımlanmadı**. Graph
tombstone'ları (ADR-023) ve olay kayıtları zamanla büyür; retention
kararı P19'un konusudur.

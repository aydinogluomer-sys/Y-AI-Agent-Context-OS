# 01 — Fiziksel Topoloji

> Baseline commit: `670392a702b6da8f3eb559f8fec252bdce9e32e5`

## Çalışma zamanı topolojisi

| Katman | Gerçek durum | Kanıt |
|---|---|---|
| HTTP listener | Tek `express()` app | `server.ts` |
| API mount | `app.use("/api", apiRouter)` | `server.ts:15` |
| `apps/api` | **Server değil** — yalnız `apiRouter` + `apiReady` export eder | `apps/api/src/index.ts` |
| API router | **6557 satır**, tek `Router()`, 185 route inline | `apps/api/src/index.ts` |
| Web app | **971 satır** tek component, router yok | `apps/web/src/App.tsx` |
| Şema | **Hiç `.sql` dosyası yok** (62 adet) — 1105 satırlık `db.ts` içinde inline string | `apps/api/src/db.ts` |
| Graph paketi | 3038 satır tek dosya | `packages/graph/src/index.ts` |

## Workspace paketleri

| Paket | Dosya | Satır | Bağlanma durumu |
|---|---:|---:|---|
| `packages/agents` | 7 | 4488 | wired (1 importer) |
| `packages/context` | 5 | 3284 | wired (1 importer) |
| `packages/core` | 31 | 9751 | wired (3 importer) |
| `packages/db` | 4 | 481 | wired (1 importer) |
| `packages/graph` | 10 | 5550 | wired (1 importer) |
| `packages/node-domexception` | 0 | 0 | **ORPHANED (0 importer)** |
| `packages/providers` | 1 | 170 | **ORPHANED (0 importer)** |
| `packages/security` | 6 | 1277 | wired (30 importer) |
| `packages/shared` | 11 | 3552 | wired (54 importer) |

## Sonuç

- `apps/api/src/index.ts` tek başına 6557 satır ve 185 route taşıyor;
  bu dosya P01–P19 boyunca **yalnız silme yönünde** değiştirilecek (master §6.1).
- Orphan paketler P01'de silinir.
- Migration'lar P01'de `migrations/*.sql` dosyalarına taşınır (ADR-003).

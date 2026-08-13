# 01 — Fiziksel Topoloji

> Baseline commit: `96afd6fe544d3bb11c29eb576faf451eb07bf2fe`

## Çalışma zamanı topolojisi

| Katman | Gerçek durum | Kanıt |
|---|---|---|
| HTTP listener | Tek `express()` app | `server.ts` |
| API mount | `app.use("/api", apiRouter)` | `server.ts:15` |
| `apps/api` | **Server değil** — yalnız `apiRouter` + `apiReady` export eder | `apps/api/src/index.ts` |
| API router | **7170 satır**, tek `Router()`, 199 route inline | `apps/api/src/index.ts` |
| Web app | **971 satır** tek component, router yok | `apps/web/src/App.tsx` |
| Şema | **Hiç `.sql` dosyası yok** (35 adet) — 1105 satırlık `db.ts` içinde inline string | `apps/api/src/db.ts` |
| Graph paketi | 3038 satır tek dosya | `packages/graph/src/index.ts` |

## Workspace paketleri

| Paket | Dosya | Satır | Bağlanma durumu |
|---|---:|---:|---|
| `packages/agents` | 7 | 4488 | wired (1 importer) |
| `packages/context` | 4 | 3162 | wired (1 importer) |
| `packages/core` | 6 | 2757 | wired (1 importer) |
| `packages/db` | 4 | 476 | wired (1 importer) |
| `packages/graph` | 1 | 3038 | wired (1 importer) |
| `packages/node-domexception` | 0 | 0 | **ORPHANED (0 importer)** |
| `packages/providers` | 1 | 170 | **ORPHANED (0 importer)** |
| `packages/security` | 1 | 88 | wired (27 importer) |
| `packages/shared` | 3 | 2294 | wired (39 importer) |

## Sonuç

- `apps/api/src/index.ts` tek başına 7170 satır ve 199 route taşıyor;
  bu dosya P01–P19 boyunca **yalnız silme yönünde** değiştirilecek (master §6.1).
- Orphan paketler P01'de silinir.
- Migration'lar P01'de `migrations/*.sql` dosyalarına taşınır (ADR-003).

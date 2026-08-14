# 01 — Fiziksel Topoloji

> Baseline commit: `b455586eff83f01df4b2f79d79765ae14dcc771e`

## Çalışma zamanı topolojisi

| Katman | Gerçek durum | Kanıt |
|---|---|---|
| HTTP listener | Tek `express()` app | `server.ts` |
| API mount | `app.use("/api", apiRouter)` | `server.ts:15` |
| `apps/api` | **Server değil** — yalnız `apiRouter` + `apiReady` export eder | `apps/api/src/index.ts` |
| API router | **6170 satır**, tek `Router()`, 181 route inline | `apps/api/src/index.ts` |
| Web app | **992 satır** tek component, router yok | `apps/web/src/App.tsx` |
| Şema | **Hiç `.sql` dosyası yok** (82 adet) — 1105 satırlık `db.ts` içinde inline string | `apps/api/src/db.ts` |
| Graph paketi | 3038 satır tek dosya | `packages/graph/src/index.ts` |

## Workspace paketleri

| Paket | Dosya | Satır | Bağlanma durumu |
|---|---:|---:|---|
| `packages/adapters` | 6 | 1028 | **ORPHANED (0 importer)** |
| `packages/agents` | 7 | 4488 | wired (1 importer) |
| `packages/context` | 25 | 7020 | wired (1 importer) |
| `packages/core` | 34 | 10954 | wired (3 importer) |
| `packages/db` | 4 | 481 | wired (1 importer) |
| `packages/graph` | 10 | 5550 | wired (1 importer) |
| `packages/node-domexception` | 0 | 0 | **ORPHANED (0 importer)** |
| `packages/providers` | 2 | 383 | wired (2 importer) |
| `packages/security` | 16 | 3937 | wired (31 importer) |
| `packages/shared` | 11 | 3558 | wired (57 importer) |

## Sonuç

- `apps/api/src/index.ts` tek başına 6170 satır ve 181 route taşıyor;
  bu dosya P01–P19 boyunca **yalnız silme yönünde** değiştirilecek (master §6.1).
- Orphan paketler P01'de silinir.
- Migration'lar P01'de `migrations/*.sql` dosyalarına taşınır (ADR-003).

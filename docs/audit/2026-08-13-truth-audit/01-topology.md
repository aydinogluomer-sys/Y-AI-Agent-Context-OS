# 01 — Fiziksel Topoloji

> Baseline commit: `d157d3c47ea39aaa2dcd966ec96280a866398078`

## Çalışma zamanı topolojisi

| Katman | Gerçek durum | Kanıt |
|---|---|---|
| HTTP listener | Tek `express()` app | `server.ts` |
| API mount | `app.use("/api", apiRouter)` | `server.ts:15` |
| `apps/api` | **Server değil** — yalnız `apiRouter` + `apiReady` export eder | `apps/api/src/index.ts` |
| API router | **6556 satır**, tek `Router()`, 185 route inline | `apps/api/src/index.ts` |
| Web app | **971 satır** tek component, router yok | `apps/web/src/App.tsx` |
| Şema | **Hiç `.sql` dosyası yok** (71 adet) — 1105 satırlık `db.ts` içinde inline string | `apps/api/src/db.ts` |
| Graph paketi | 3038 satır tek dosya | `packages/graph/src/index.ts` |

## Workspace paketleri

| Paket | Dosya | Satır | Bağlanma durumu |
|---|---:|---:|---|
| `packages/agents` | 7 | 4488 | wired (1 importer) |
| `packages/context` | 16 | 5628 | wired (1 importer) |
| `packages/core` | 31 | 9751 | wired (3 importer) |
| `packages/db` | 4 | 481 | wired (1 importer) |
| `packages/graph` | 10 | 5550 | wired (1 importer) |
| `packages/node-domexception` | 0 | 0 | **ORPHANED (0 importer)** |
| `packages/providers` | 2 | 383 | wired (2 importer) |
| `packages/security` | 10 | 2477 | wired (31 importer) |
| `packages/shared` | 11 | 3558 | wired (54 importer) |

## Sonuç

- `apps/api/src/index.ts` tek başına 6556 satır ve 185 route taşıyor;
  bu dosya P01–P19 boyunca **yalnız silme yönünde** değiştirilecek (master §6.1).
- Orphan paketler P01'de silinir.
- Migration'lar P01'de `migrations/*.sql` dosyalarına taşınır (ADR-003).

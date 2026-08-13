# 01 — Fiziksel Topoloji

> Baseline commit: `9f10f70123cc72d0cfa59bf0998fc8cfafd557d6`

## Çalışma zamanı topolojisi

| Katman | Gerçek durum | Kanıt |
|---|---|---|
| HTTP listener | Tek `express()` app | `server.ts` |
| API mount | `app.use("/api", apiRouter)` | `server.ts:15` |
| `apps/api` | **Server değil** — yalnız `apiRouter` + `apiReady` export eder | `apps/api/src/index.ts` |
| API router | **7171 satır**, tek `Router()`, 200 route inline | `apps/api/src/index.ts` |
| Web app | **971 satır** tek component, router yok | `apps/web/src/App.tsx` |
| Şema | **Hiç `.sql` dosyası yok** (0 adet) — 2216 satırlık `db.ts` içinde inline string | `apps/api/src/db.ts` |
| Graph paketi | 3039 satır tek dosya | `packages/graph/src/index.ts` |

## Workspace paketleri

| Paket | Dosya | Satır | Bağlanma durumu |
|---|---:|---:|---|
| `packages/agents` | 7 | 4494 | wired (1 importer) |
| `packages/connectors` | 1 | 16 | **ORPHANED (0 importer)** |
| `packages/context` | 4 | 3166 | wired (1 importer) |
| `packages/core` | 6 | 2759 | wired (1 importer) |
| `packages/graph` | 1 | 3039 | wired (1 importer) |
| `packages/node-domexception` | 0 | 0 | **ORPHANED (0 importer)** |
| `packages/providers` | 1 | 170 | **ORPHANED (0 importer)** |
| `packages/security` | 1 | 88 | wired (27 importer) |
| `packages/shared` | 1 | 2111 | wired (38 importer) |
| `packages/ui` | 1 | 17 | **ORPHANED (0 importer)** |

## Sonuç

- `apps/api/src/index.ts` tek başına 7171 satır ve 200 route taşıyor;
  bu dosya P01–P19 boyunca **yalnız silme yönünde** değiştirilecek (master §6.1).
- Orphan paketler P01'de silinir.
- Migration'lar P01'de `migrations/*.sql` dosyalarına taşınır (ADR-003).

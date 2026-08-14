# Yerel Geliştirme

## Gereksinimler

- Node.js 20+
- PostgreSQL 15+ (pgvector eklentisiyle)
- `git` ikilisi (PATH'te)
- Bir OIDC sağlayıcı (Keycloak / Auth0) — **dev bypass yoktur** (ADR-016)

## Kurulum

```bash
npm install
cp .env.example .env      # doldurun; asagiya bakin
npm run migrate           # migrations/*.sql
npm run dev
```

## Zorunlu ortam değişkenleri

| Değişken | Ne için |
|---|---|
| `DATABASE_URL` | Postgres bağlantısı. **Arayüzden yapılandırılamaz** (ADR-073) |
| `JWKS_URI` / `OIDC_JWKS_URI` | JWT doğrulaması için IdP anahtarları |
| `WORKER_SIGNING_KEY` | Worker kimliği imzalama (≥32 karakter). Yoksa kuyruk **çalışmaz** |

## Neden dev bypass yok

`GET /api/auth/dev-session` P02'de silindi. Kimlik doğrulaması olmadan
`role: "admin"`, `projectIds: ["*"]` token dağıtıyordu.

"Yalnız geliştirmede açık" bir bypass, bir bayrak yanlış ayarlandığında
üretimde açık olur — ve bunun olduğu, olduktan sonra anlaşılır. Geliştirme
ile üretimin kimlik yolunun aynı olması, o yolun her gün test edildiği
anlamına gelir.

## Testler

```bash
npm test                  # vitest: birim + sözleşme
npm run gate:all          # drift + false-green çırçır + testler
npm run secret-scan       # sır taraması (baseline yalnız küçülebilir)
npm run typecheck         # loose + strict
```

**Canlı Postgres gerektiren testler bugün yok.** Mevcut DB testleri sorgu
**şeklini** doğrular, sonucunu değil — bu ayrım her test dosyasının başında
yazılıdır. Entegrasyon paketi P19'un konusudur.

## Agent çalıştırma

**Çalışmaz.** SDK'lar kurulmadı; `adapter.start()` `NOT_IMPLEMENTED`
fırlatır. Bkz. [agent adapter'ları](../adapters/agent-adapters.md).

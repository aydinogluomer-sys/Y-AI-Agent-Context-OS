# API Yüzeyi

> spec §52 · ADR-001 (paralel kanonik yüzey + cutover)

## İki yüzey, bilerek

| Yüzey | Durum |
|---|---|
| `/api/v1/**` | **Kanonik.** Yeni geliştirme buraya |
| `/api/**` (legacy) | Geçiş sürüyor; 20 route `410 Gone` döndürüldü |

Paralel yüzey bir ADR kararıdır (ADR-001): tek seferde kesmek, çalışan bir
sistemi çalışmayan bir sisteme dönüştürme riski taşırdı.

## Kanonik yüzey

**Tüm `/api/v1` kimlik doğrulaması ister. İstisna yoktur** — sağlık
probe'ları `/api/v1` altında değil, kök seviyededir.

### Kimlik

| Metot | Yol | Not |
|---|---|---|
| GET | `/auth/me` | Yetki listesi **token'dan değil DB'den** (ADR-017) |

### Organizasyon ve proje

| Metot | Yol |
|---|---|
| GET | `/orgs` |
| GET | `/orgs/:orgId/projects` |
| GET · POST | `/projects/:projectId/members` |
| DELETE | `/projects/:projectId/members/:userId` |

Token'daki org ile istenen org farklıysa istek **durur** (T-02).

### Sembol ve index

| Metot | Yol |
|---|---|
| GET | `/projects/:projectId/symbols` |
| GET | `/projects/:projectId/repositories/:repositoryId/index-status` |

### Graph

| Metot | Yol |
|---|---|
| GET | `/projects/:projectId/graph/expand` |
| GET | `/projects/:projectId/graph/status` |
| POST | `/admin/projects/:projectId/graph/rebuild` |

## Sağlık ve gözlem (kök seviye)

| Metot | Yol | Not |
|---|---|---|
| GET | `/api/healthz` | Liveness. Bağımlılık kontrol **etmez** |
| GET | `/api/readyz` | Readiness. On bağımlılık, paralel, 3sn zaman aşımı |
| GET | `/api/metrics` | Prometheus metin formatı |

## Silinen / kapatılan uçlar

| Uç | Sebep |
|---|---|
| `GET /api/auth/dev-session` | Kimlik doğrulaması olmadan admin token dağıtıyordu (P0-1) |
| `POST /api/db/configure` | Connection string alıp global db'yi değiştiriyor, düz metin parolayı `.env`'e yazıyordu (P0-2) |
| `GET /api/config/inspect` | Yanıtı regex'lenip parola React state'ine yazılıyordu (P0-12) |
| Sahte run handler'ı | 4 olay yazıp `completed` dönüyordu (P0-13) |

## Bilinen boşluklar

- **Manifest ve SSE route'ları yok.** Run yürütme olmadan yayınlanacak bir
  şey yok (P12 wire-up).
- **Tipli client üretilmiyor.** Spec §58-J'nin istediği üretilmiş tipler
  P15'in konusu.
- OpenAPI şeması yok.

Güncel envanter: `docs/audit/2026-08-13-truth-audit/02-api-inventory.csv`
(182 route). Drift gate'i bu sayıyı kaynakla karşılaştırır.

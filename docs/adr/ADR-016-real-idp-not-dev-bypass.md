# ADR-016 — Dev bypass yerine gerçek IdP

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P02 |
| Tarih | 2026-08-14 |
| Kanıt | `apps/api/src/index.ts:103` |

## Decision

`GET /api/auth/dev-session` **silinir**. Geliştirme ortamı da gerçek OIDC
akışını kullanır.

## Context

P00 Truth Audit (P0-1): bu uç nokta kimlik doğrulaması olmadan
`role: "admin"`, `projectIds: ["*"]` token dağıtıyordu. Porta erişen
herkes tam admin olabiliyordu.

## Reason

"Yalnız geliştirmede açık" bir bypass, bir bayrak yanlış ayarlandığında
üretimde açık olur — ve bunun olduğu, olduktan sonra anlaşılır.

Geliştirme ile üretimin kimlik yolunun aynı olması, o yolun her gün test
edildiği anlamına gelir.

## Consequences

- Yerel geliştirme bir IdP (Keycloak/Auth0) gerektirir; kurulum
  dokümante edilir.
- Bkz. [ADR-002](ADR-002-oidc-jose-db-membership.md).

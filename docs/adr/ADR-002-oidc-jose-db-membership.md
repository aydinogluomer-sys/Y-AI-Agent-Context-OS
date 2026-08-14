# ADR-002 — OIDC + jose + DB-backed membership

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P02 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/shared/src/domain/identity.ts:11` |

## Decision

Kimlik doğrulama OIDC üzerinden yapılır. JWT doğrulaması `jose` ile,
sabit algoritma listesi ve JWKS `kid` eşleşmesiyle gerçekleşir. Yetki
kaynağı **veritabanındaki üyeliktir**, token claim'i değildir.

## Context

P00 Truth Audit (P0-3): JWT anahtarı `JWT_SECRET || Y_API_AUTH_TOKEN`
idi — yani paylaşılan bearer token ile JWT forge edilebiliyordu. El
yazımı doğrulama `alg` alanını yeterince kısıtlamıyordu.

Yetki ise token içindeki `projectIds` dizisinden okunuyordu ve `"*"`
wildcard'ı kabul ediliyordu.

## Reason

Paylaşılan sır ile imzalanan token, o sırra erişen herkesin istediği
rolü üretmesine izin verir. Asimetrik imza + JWKS bunu imkânsız kılar.

Token'a gömülü yetki listesi token yenilenene kadar bayat kalır; üyelik
iptali anında etkili olmalıdır.

## Consequences

- İstek başına bir membership sorgusu (request-scoped cache ile).
- JWKS erişilemezse fail-closed (bkz. ADR-029 ile aynı hat).
- Bkz. [ADR-016](ADR-016-real-idp-not-dev-bypass.md), [ADR-017](ADR-017-authorization-single-point.md).

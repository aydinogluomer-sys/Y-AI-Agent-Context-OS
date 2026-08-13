# ADR-017 — Authorization Tek Noktadan

| Alan | Değer |
|---|---|
| Durum | Önerildi |
| Faz | P02 |
| Tarih | 2026-08-13 |

## Decision

Tüm proje-kapsamlı erişim `requireProjectScope` middleware'inden geçer.
Handler içinde ad-hoc yetki kontrolü **yasaktır**; lint kuralıyla korunur.

`Principal` tipi bilerek `roles` ve erişilebilir proje listesi TAŞIMAZ —
yetki her istekte DB'den çözülür.

## Context

P00 Truth Audit (P0-4, P0-8):

- Authorization tamamen token claim'i / env değişkeniydi
  (`principalCanAccessProject` = saf dizi üyeliği, `"*"` wildcard'lı).
- DB-backed kontrol `principalCanAccessProjectAsync` import edilmiş ve
  **hiç çağrılmıyordu**; üstelik var olmayan bir tabloyu sorguluyor ve
  hatayı `catch {}` ile yutuyordu.
- 199 route'un 54'ü yalnız bearer token kontrolünden geçiyordu.

## Reason

Token'a gömülü yetki listesi, token yenilenene kadar bayat kalır ve iptal
edilemez. Üyelik iptali anında etkili olmalıdır.

## Consequences

- İstek başına bir membership sorgusu (request-scoped cache ile).
- `Principal.tokenId` (`jti`) replay koruması için taşınır (T-14).

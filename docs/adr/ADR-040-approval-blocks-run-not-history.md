# ADR-040 — Onay run'ı bloklar, geçmişi değiştirmez

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P10 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/shared/src/domain/change.ts:10` |

## Decision

Onay bekleyen bir mutation run'ı **bloklar**. Reddedilen bir talep
geçmişten silinmez; reddedildiği kaydıyla kalır.

## Context

Onay akışının iki tasarımı vardı: talebi kuyruğa alıp run'ı sürdürmek,
veya run'ı durdurmak.

## Reason

Run'ı sürdürmek, onaylanmamış bir değişikliğin üzerine başka
değişiklikler kurulması demektir; onay reddedilirse geri alınması gereken
şey yalnız o mutation değil, ona bağlı her şeydir.

Geçmişin yeniden yazılmaması ise denetim gereğidir: bir agent'ın **neyi
denediği**, denemesine izin verilmemiş olsa bile kanıtın parçasıdır.

## Consequences

- Run `awaiting_approval` durumunda bekler (ADR-046, ADR-047).
- Reddedilen talepler audit'te görünür.

# ADR-023 — Incremental, yıkıcı olmayan graph sync

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P05 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/graph/src/builder.ts:2` |

## Decision

Graph güncellemesi **yıkıcı değildir**. Silinen düğüm/kenar fiziksel
olarak kaldırılmaz; tombstone ile işaretlenir.

## Context

P05'te artımlı senkronizasyon gerekiyordu. Basit yaklaşım, değişen
dosyanın tüm düğümlerini silip yeniden yazmaktı.

## Reason

Silip-yeniden-yazmak, o düğüme atıf yapan **kanıt kayıtlarını** (manifest,
evidence) yetim bırakır. Bir manifest "şu sembolü gördüm" diyorsa, o
sembolün kaydı sonradan silinemez — kanıt doğrulanamaz hâle gelir.

Çift kayıt ise zamanla çelişir; tombstone bu ikisinin arasındaki doğru
noktadır.

## Consequences

- Tablo zamanla büyür; retention politikası ayrıca tanımlanır.
- Sorgular tombstone'ları dışlar.
- Bkz. [ADR-034](ADR-034-manifest-is-primary-evidence-unit.md).

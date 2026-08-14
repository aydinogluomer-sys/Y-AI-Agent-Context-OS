# ADR-038 — Boundary task'tan türetilir

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P10 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/security/src/change-firewall/boundary.ts:2` |

## Decision

Change boundary **task'tan türetilir**. Kullanıcı boundary'yi
genişletemez; genişletme insan onayı gerektirir.

## Context

Spec §12: "Task oluşturulduğunda sistem bir TASK-DERIVED CHANGE BOUNDARY
hesaplayacaktır."

## Reason

Kullanıcının genişletebildiği bir sınır, sınır değildir. Agent kullanıcı
adına çalıştığı için, kullanıcının tek tıkla genişletebildiği bir
boundary agent'ın kendi sınırını genişletmesiyle eşdeğerdir.

Onay ayrı bir insan kararı olmalıdır — task'ı oluşturan kişinin otomatik
rızası değil.

## Consequences

- Boundary `expected` / `allowed` / `approval` / `denied` katmanlarından oluşur.
- Genişletme bir approval kaydı üretir (ADR-040).

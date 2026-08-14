# ADR-044 — Agent sandbox'ta çalışır

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P11 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/adapters/src/types.ts:28` |

## Decision

Agent izole bir sandbox'ta çalışır. Repository yolu agent'a **iletilmez**;
dosya işlemleri Y üzerinden yapılır.

## Context

Adapter'a çalışma dizinini vermek en basit entegrasyon yoluydu.

## Reason

Yolu agent'a iletmek sandbox'ı **anlamsızlaştırır**: agent doğrudan
dosya sistemine erişebiliyorsa Change Firewall (ADR-039) ve Context
Firewall (ADR-027) etrafından dolaşılabilir.

Her dosya işleminin Y üzerinden geçmesi, her işlemin bir karar ve bir
kanıt üretmesi demektir.

## Consequences

- Dosya işlemleri adapter olay kanalından gelir, doğrudan FS'ten değil.
- Sandbox implementasyonu SDK wire-up ile tamamlanacak (P11 kalanı).

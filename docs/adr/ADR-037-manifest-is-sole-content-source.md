# ADR-037 — Manifest agent'a verilen içeriğin tek kaynağı

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P09 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/shared/src/domain/context.ts:188` |

## Decision

Agent'a giden içeriğin **tek** kaynağı manifest'tir. Manifest dışından
içerik eklenemez.

## Context

Adapter'ın repository'ye doğrudan erişmesi teknik olarak mümkündü.

## Reason

Manifest dışından eklenen tek bir dosya, "model tam olarak ne gördü?"
sorusunun cevabını **yanlış** yapar. Kanıtın değeri tamlığındadır; %99
tam bir kanıt, kanıt değildir.

Bu aynı zamanda Context Firewall'ın (ADR-027) tek geçiş noktası olmasını
garantiler — ikinci bir okuma yolu, firewall'ın etrafından dolaşmaktır.

## Consequences

- Adapter'a repository yolu **verilmez** (ADR-044).
- Manifest olmadan agent başlatılamaz (ADR-043).

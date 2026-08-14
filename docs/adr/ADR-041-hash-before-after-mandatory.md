# ADR-041 — hash-before / hash-after zorunlu

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P10 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/security/src/change-firewall/decide.ts:2` |

## Decision

Her dosya mutation'ı öncesinde ve sonrasında içerik hash'i hesaplanır ve
kaydedilir.

## Context

Spec §5 güvenlik listesi: `hash-before`, `hash-after`, `file lock/lease`,
`atomic writes`. T-20 (repository write race).

## Reason

Hash-before olmadan **eşzamanlı yazım** tespit edilemez: iki worker aynı
dosyayı değiştirirse biri diğerinin değişikliğini sessizce ezer.

Hash-after olmadan da agent'ın gerçekten ne yazdığı doğrulanamaz —
kanıt "yazdım" iddiasına dayanır, ölçüme değil.

## Consequences

- Her yazım için iki hash hesabı; büyük dosyalarda maliyet ölçülmeli.
- Yarış tespit edilirse yazım reddedilir ve olay kaydedilir.

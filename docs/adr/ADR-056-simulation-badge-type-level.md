# ADR-056 — Simülasyon rozeti type-level

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P15 |
| Tarih | 2026-08-14 |
| Kanıt | `apps/web/src/App.tsx:716` |

## Decision

Simülasyon göstergesi **veriden türer**, elle tutulan bir alandan değil.
Simülasyon sonucu üretim sonucundan **tip düzeyinde** ayrıdır.

## Context

P00 ve P17: rozet `lastRunMode` adlı ayrı bir React state'inden okunuyor
ve her çağrı yerinde elle güncelleniyordu. Ayrıca simülasyon üreteci ile
gerçek sağlayıcı çağrısı **aynı DTO'yu** döndürüyordu — spec §37 bunu
açıkça yasaklıyor.

## Reason

Elle tutulan bir gösterge, yeni bir çağrı yeri eklenip güncelleme
unutulduğunda **sessizce yalan söyler** — ve yalan söylediği, tam olarak
ona güvenildiği anda anlaşılır.

Tip düzeyinde ayrım ise simülasyon sonucunun üretim yoluna girmesini
**derleme zamanında** imkânsız kılar; çalışma zamanı kontrolü atlanabilir,
tip sistemi atlanamaz.

## Consequences

- Rozet `result.isFallback` üzerinden türetilir.
- `ai-simulation-badge.test.ts` değişmezi kilitler.
- Bkz. spec §37, [ADR-032](ADR-032-no-fabricated-fields.md).

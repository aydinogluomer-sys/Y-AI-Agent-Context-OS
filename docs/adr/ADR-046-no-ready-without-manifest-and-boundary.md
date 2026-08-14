# ADR-046 — Manifest ve boundary olmadan `ready` olunamaz

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P12 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/core/src/index.ts:133` |

## Decision

Bir run `ready` durumuna ancak manifest **ve** boundary üretilmişse
geçebilir. Guard kontrolü durum geçişinin parçasıdır.

## Context

FSM'de `ready` durumu "agent başlatılabilir" anlamına gelir.

## Reason

Manifest'siz bir run başlatılırsa ADR-043 ihlal edilir; boundary'siz
başlatılırsa ADR-039 uygulanamaz. Bu iki ön koşulun **durum makinesinde**
kodlanması, unutulmalarını imkânsız kılar.

Kontrolün çağrı yerinde yapılması yeterli değildir: yeni bir çağrı yeri
eklendiğinde kontrol unutulur.

## Consequences

- Geçiş koşullu `UPDATE` ile atomik (lost update koruması).
- Guard başarısızsa run `blocked` olur, sessizce beklemez.

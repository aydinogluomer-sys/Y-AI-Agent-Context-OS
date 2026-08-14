# ADR-067 — `run_id` birinci sınıf korelasyon anahtarı

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P18 |
| Tarih | 2026-08-14 |
| Kanıt | `apps/api/src/middleware/correlation.ts:7` |

## Decision

`run_id` structured log, metrik ve olay kayıtlarında birinci sınıf
korelasyon anahtarıdır. İstek düzeyinde `correlation_id` ile birlikte
taşınır.

## Context

Spec §27: structured logs, correlation IDs, run IDs, trace IDs.

## Reason

Bir run onlarca bileşene yayılır: API, kuyruk, worker, adapter, evidence.
Ortak bir anahtar olmadan bu parçaları birleştirmek, zaman damgası
eşleştirmeye kalır — eşzamanlı run'larda bu yöntem yanlış sonuç verir.

Kanıt iddiasında bulunan bir sistemde "hangi log hangi run'a ait"
sorusunun cevabı tahmin olamaz.

## Consequences

- Her log satırı `run_id` taşır (varsa).
- OpenTelemetry trace ID'si ile eşleştirme P18 kalanında.

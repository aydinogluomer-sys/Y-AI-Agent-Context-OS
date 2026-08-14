# SLO ve Alarm Eşikleri

> P18 / Y-P18-010 · spec §27, §41

## Bu belgenin durumu

**Hiçbir SLO hedefi bugün doğrulanmamıştır.** Aşağıdaki tablo *önerilen*
hedefleri taşır ve her satır hangi ölçümün eksik olduğunu söyler.

Doğrulanmamış bir hedefi "SLO" diye yayınlamak, karşılanıp
karşılanmadığı bilinmeyen bir söz vermektir. Hedefler ancak canlı ölçümle
(P19) kesinleşir.

## Önerilen hedefler

| Gösterge | Öneri | Ölçüm durumu |
|---|---|---|
| `readyz` yanıt süresi | p95 < 3 sn | **Ölçülmedi** — probe zaman aşımı 3 sn |
| Context derleme | p95 < 5 sn | **Ölçülmedi** — canlı Postgres gerekiyor |
| Graph traversal (derinlik 3) | p95 < 1 sn | **Ölçülmedi** — canlı Postgres |
| Semantic retrieval | p95 < 500 ms | **Ölçülmedi** — pgvector gerekiyor |
| Olay gecikmesi (yazım → SSE) | p95 < 1 sn | **Ölçülmedi** — SSE route'u yok |
| Kuyruk bekleme | p95 < 30 sn | **Ölçülmedi** |
| Agent run süresi | p95 < 15 dk | **Ölçülemez** — `adapter.start()` yok |

## Ölçülen tek şey: süreç içi hesaplama

`docs/perf/budgets.json` gerçek ölçümden üretilmiştir:

| Yol | Ölçülen |
|---|---|
| `parse.typescript` | ~1.08 ms/dosya — **baskın darboğaz** |
| `parse.sql` | ~0.068 ms/dosya |
| `manifest.canonicalJson` | ~0.0095 ms/fragment |

**Sınır:** bu makinede ölçüm yayılımı %60'a çıkıyor; kapı ancak bundan
büyük regresyonları yakalar. Ayrıntı `budgets.json` içindeki
`_limitation` alanında.

## Alarm eşikleri

Alarm eşiği, SLO'dan **daha erken** tetiklenmelidir: SLO ihlal edildiğinde
alarm çalıyorsa, alarmın önleyici bir değeri kalmaz.

| Alarm | Eşik | Aciliyet |
|---|---|---|
| `readyz` `down` | Herhangi bir zorunlu bileşen | **Sayfa** |
| Policy store erişilemiyor | `degraded` 5 dk sürerse | **Sayfa** — sistem fail-closed, hiçbir context üretilemez |
| Kanıt zinciri doğrulaması başarısız | Tek olay | **Sayfa** — bütünlük ihlali |
| Kuyruk derinliği | > 1000 (probe eşiği) | Bildirim |
| Worker aktif değil | 5 dk hiç claim yok | Bildirim |
| Sır taraması yeni bulgu | Tek bulgu | **Sayfa** |

`readyz` `degraded` **tek başına sayfa değildir**: kısmen çalışan bir
sistem çalışan bir sistemdir. Her degraded'ı sayfaya çevirmek, alarm
yorgunluğu üretir ve gerçek olayları gizler.

## Kapasite

Ölçek testi **yapılmadı** (10K/50K/100K dosya basamakları). Fixture
üreteci hazır (`npm run perf:fixture`) ama ölçüm canlı Postgres
gerektiriyor. Kapasite planlaması bu ölçümden sonra yazılabilir.

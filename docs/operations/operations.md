# Operasyon

## Sağlık uçları

| Uç | Ne yapar |
|---|---|
| `GET /api/healthz` | **Liveness.** Bağımlılık kontrol ETMEZ |
| `GET /api/readyz` | **Readiness.** On bağımlılığı paralel yoklar |
| `GET /api/metrics` | Prometheus metin formatı |

### healthz ≠ readyz

Liveness bağımlılık kontrol etmez ve bu bilinçlidir: DB'ye bakan bir
liveness probe, DB kısa süre yavaşladığında **tüm süreçleri yeniden
başlatır** ve kesintiyi büyütür.

### readyz bileşenleri

`database` · `policy_store` · `evidence_chain` · `queue` · `workers` ·
`index` · `graph` · `event_store` · `cas` · `provider`

Her biri **kendi sorgusunu** çalıştırır, kendi gecikmesini raporlar ve 3
saniyelik zaman aşımıyla korunur. Probe'lar paraleldir; sıralı çalıştırmak
süreyi bileşen sayısıyla çarpardı (10 × 3sn = 30sn).

`degraded` ayrı bir durumdur ve **200 döner**: kısmen çalışan bir sistemi
503 ile tamamen kapatmak aşırı tepkidir.

`provider` probe'u **ağa çıkmaz**. Her load balancer yoklamasında dış bir
sağlayıcıya istek atmak hem kota harcar hem o sağlayıcının yavaşlamasının
Y'yi trafikten düşürmesine yol açar.

## Metrikler

14 metrik tanımlı. **Ölçülmemiş metrik çıktıda görünmez** — sıfırla basmak
"ölçtük ve sıfır çıktı" demek olurdu. `unmeasured` alanı hangi metriklerin
henüz toplanmadığını açıkça listeler.

Bilinmeyen bir metrik adı sessizce kabul edilmez: adı yanlış yazılmış bir
metrik, sessizce kabul edilirse çıktıda hiç görünmez.

## Log'lar

Structured JSON. Her satır `correlation_id`, varsa `run_id` taşır
(ADR-067). Bir run onlarca bileşene yayılır; ortak anahtar olmadan
parçaları birleştirmek zaman damgası eşleştirmeye kalır ve eşzamanlı
run'larda yanlış sonuç verir.

## Bilinen boşluklar

- **OpenTelemetry tracing yok.** Ek bağımlılık; kapsam kararı.
- **Yük ölçümü yapılmadı.** Gerçek yük gerektiriyor.
- Dayanıklılık senaryoları (worker çökmesi, DB restart, provider timeout)
  canlı ortam gerektiriyor (P19).

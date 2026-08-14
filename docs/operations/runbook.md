# Runbook

> P18 / Y-P18-010

Olay sınıflandırması ve ilk aksiyonlar için bkz.
[olay müdahalesi](incident-response.md). Bu belge **operasyonel
prosedürleri** taşır.

## Günlük kontroller

```bash
curl -s localhost:3000/api/readyz | jq '.status, .components[].name'
curl -s localhost:3000/api/metrics | head -40
```

`readyz` on bileşen raporlar. `degraded` bir bileşen varsa hangisi
olduğuna bakın — hepsi aynı ciddiyette değildir:

| Bileşen | `degraded` anlamı |
|---|---|
| `policy_store` | **Ciddi.** Hiçbir context üretilemez |
| `provider` | Agent çalıştırılamaz (bugün beklenen durum) |
| `index` | Retrieval boş dönecek |
| `graph` | Graph genişletmesi boş dönecek |
| `queue` | Birikme var |

## Sık karşılaşılanlar

### `readyz` → `provider: degraded`

**Beklenen durum.** Adapter kayıt defteri boş çünkü SDK'lar kurulmadı.
Agent çalıştırılamaz; context derleme ve manifest üretimi çalışır.

### Kuyruk çalışmıyor, hata: `MISSING_WORKER_SIGNING_KEY`

`WORKER_SIGNING_KEY` ayarlanmamış veya 32 karakterden kısa. Bu **fail
closed** davranıştır, hata değil: imzasız worker kimliği reddedilir
(spec §54).

```bash
export WORKER_SIGNING_KEY="$(openssl rand -hex 32)"
```

### Worker iş almıyor ama kuyrukta iş var

Sırayla kontrol edin:

1. Worker kimliğinin süresi dolmuş mu? TTL ≤ 1 saat.
2. Kimlik o iş türüne yetkili mi? Geçerli bir kimlik **her işi almaz**.
3. `attempt < max_attempts` mi? Hakkı bitmiş iş claim edilmez.

### Log'larda korelasyon anahtarı yok

`sysLogger.stats().uncorrelated` sıfırdan büyükse bir kod yolu bağlam
dışında log yazıyor. Süreç başlangıcı ve cron için bu normaldir; istek
yolunda ise `correlationId()` middleware'i atlanmış demektir.

### Performans regresyonu şüphesi

```bash
npm run perf:fixture     # deterministik fixture uret
npm run perf             # butcelere karsi olc
```

Bütçe aşımı `exit 1` verir. Yeni bir taban kaydetmeden **önce**
regresyonun gerçek olduğunu doğrulayın — `perf:record` bütçeyi gevşetir.

## Yapılmayanlar

| Prosedür | Neden |
|---|---|
| Yedekten geri yükleme **tatbikatı** | Canlı ortam gerekiyor (Y-P18-009) |
| Ölçek testi (10K–100K dosya) | Canlı Postgres |
| Dayanıklılık senaryoları (DB restart, ağ kesintisi) | Canlı altyapı — 5 senaryo kayıtlı, bkz. `resilience.test.ts` |
| Alarm entegrasyonu | Toplayıcı seçilmedi |

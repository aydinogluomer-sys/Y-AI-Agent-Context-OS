# Ölçeklendirme

> P18 / Y-P18-010 · spec §41

## Mimarinin ölçek sınırları

| Bileşen | Ölçek modeli | Bilinen sınır |
|---|---|---|
| API | Yatay (durum yok) | Oturum durumu yok; serbestçe çoğaltılır |
| Worker | Yatay (`SKIP LOCKED`) | Postgres bağlantı havuzu |
| Kuyruk | PostgreSQL (ADR-004) | Çok yüksek iş hacminde darboğaz olabilir — **ölçülmedi** |
| Vektör | pgvector, aynı örnek (ADR-008) | ANN performansı korpus büyüklüğüne bağlı — **ölçülmedi** |
| Graph | Recursive CTE (ADR-024) | Derinlik ve fan-out limitleri sorgunun içinde |

## Bilinçli tekil noktalar

Kuyruk ve vektör deposu **ayrı sistemlere alınmadı** ve bu bir eksiklik
değil, kayıtlı bir karardır:

- **Kuyruk (ADR-004):** iş durumu ile domain verisini iki transaction
  sınırına bölmek, "iş tamamlandı yazıldı ama sonuç yazılamadı" durumunu
  ortaya çıkarır.
- **Vektör (ADR-008):** ayrı bir depo, policy ile embedding'i farklı
  sistemlere böler. DENY kapsamındaki bir chunk'ın embedding'i hiç
  üretilmemelidir (ADR-027); bu ancak ikisi aynı transaction'da olduğunda
  garanti edilir.

Ölçek gerçek bir sorun hâline geldiğinde bu kararlar yeniden verilir —
ama **ölçülmeden değil**.

## Ölçülen darboğaz

Süreç içi yollar arasında baskın maliyet **TypeScript ayrıştırma**
(~1.08 ms/dosya). 100K dosyalık bir repository için kaba tahmin ~108
saniye tek çekirdekte.

Bu bir **tahmindir**, ölçüm değil: 100K dosyalık gerçek bir index
çalıştırılmadı ve I/O, veritabanı yazımı, embedding maliyeti hesaba
katılmadı. Gerçek ölçüm P19'un konusudur.

## Ölçek basamakları

Fixture üreteci hazır:

```bash
npx tsx scripts/perf/generate-fixture-repo.ts --preset 10k  --out .perf/repo-10k
npx tsx scripts/perf/generate-fixture-repo.ts --preset 100k --out .perf/repo-100k
```

Spec §41'in istediği ölçümler (initial index, incremental index, memory,
DB size, embedding cost) **canlı Postgres** gerektirir.

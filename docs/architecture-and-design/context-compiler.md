# Context Compiler

> spec §10 · ADR-031, ADR-032, ADR-033, ADR-020, ADR-021

## Ne yapar

Bir görev için hangi kod fragment'larının agent'a verileceğini belirler ve
kararın kanıtını üretir.

```
Task
 ↓  Allowed Context Universe (P07)      ← policy SQL predikatına derlenir
 ↓  Hybrid retrieval (P06)              ← FTS + pgvector + sembol eşleşmesi
 ↓  Graph genişletme (P05)              ← recursive CTE
 ↓  14 sinyalli sıralama (P06)          ← her sinyal AYRI kolon
 ↓  Bütçe (P08)                         ← adapter limiti − rezervler
 ↓  Derleme (P08)                       ← SAF FONKSİYON
 ↓  Manifest (P09)                      ← kanıtın birincil birimi
```

## Bütçe

```
sağlayıcı context limiti
 − sistem rezervi
 − tool rezervi
 − beklenen çıktı
 − güvenlik payı
 = kullanılabilir bütçe        (sonra policy tavanıyla kırpılır)
```

Sabit `50000` **ürün gerçeği değildir** (spec §10). Bütçe yetersizse
`INSUFFICIENT_BUDGET` **hatası fırlatılır**, sıfıra kırpılmaz: sıfıra
kırpmak "başarıyla derledi" deyip boş context üretmek olurdu.

## Determinizm

Derleme **saf bir fonksiyondur**: aynı `(commit, task, policy, compiler
sürümü, konfigürasyon)` aynı manifest'i üretir. Fonksiyon içinde I/O
yoktur — tüm veri girdi olarak verilir.

Bunun doğrudan sonucu: derleyicinin test dosyasında **hiçbir mock yoktur**.
Mock gerektiren bir saf fonksiyon, saf değildir.

## Chunk sınırı

Chunk **sembol sınırında** başlar ve biter (ADR-020). Karakter tabanlı
kesme, agent'a yarım bir fonksiyon gövdesi verir — ve yarım bir fonksiyon
yanlış bilgidir, eksik bilgi değil.

## Ölçülmeyen alanlar

Ölçülemeyen bir alan **uydurulmaz**: değer `null` olur ve yanına
`unavailableReason` yazılır (ADR-032). Uydurulmuş bir alan veritabanına
yazıldığı anda gerçeğe dönüşür ve sonraki her okuyucu onu ölçüm sanır.

## Güven seviyesi

Her fragment `trust: "untrusted_repository_content"` taşır (ADR-063).
Repository içeriği DATA'dır; talimat değildir.

## Bilinen boşluklar

- **Gerçek BPE tokenizer yok.** Heuristic kullanılıyor ve sonuç
  `approximate: true` ile işaretleniyor (ADR-010).
- **Recall harness yok.** Ground-truth etiketleri insan tarafından
  üretilmeli; kendim etiketlemek, ölçtüğüm sistemin çıktısını doğru kabul
  etmek olurdu (P16).
- pgvector ANN geri çağırması ve FTS sıralaması canlı Postgres bekliyor.

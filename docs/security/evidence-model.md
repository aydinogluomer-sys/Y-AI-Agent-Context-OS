# Kanıt Modeli

> spec §11, §18 · ADR-034…ADR-037, ADR-041, ADR-048

## Kanıtın birincil birimi: Context Manifest

Manifest, "**model tam olarak ne gördü?**" sorusunun cevabıdır ve
şu özellikleri taşır: immutable · versiyonlu · hash'lenebilir · denetlenebilir.

Bir manifest şunları içerir:

- Her fragment için: repository, commit, yol, sembol, satır aralığı,
  `sourceHash`, `chunkHash`, 14 sıralama sinyali, permission kararı,
  policy sürümü, token sayısı, ve **güven seviyesi** (`trust`).
- Her **dışlanan** aday için: yol, sebep (kapalı küme), detay.

Kapsama bütünlüğü çalışma zamanında zorlanır: bir aday ne `items` ne
`exclusions` içindeyse derleme **hata verir** (ADR-036).

## Determinizm

Aynı `(commit, task, policy, compiler sürümü, konfigürasyon)` aynı
manifest'i üretir (ADR-033). Bunu mümkün kılan üç karar:

1. Derleme **saf fonksiyondur**; içinde I/O yoktur.
2. Hash'lenen her yapı **kanonik JSON** ile serileştirilir: anahtarlar
   sıralı, `undefined` atlanır, `null` korunur, `-0` → `0`, NFC normalize,
   `NaN`/`Infinity` **reddedilir** (ADR-035).
3. Girdiler `hashInputs()` ile kanonikleştirilir.

## Hash zinciri

Olaylar append-only bir zincirde tutulur. Doğrulama üç ayrı kontrol
yapar ve hangisinin bozulduğunu **ayırt eder**:

| Kontrol | Bozulduğunda |
|---|---|
| Sıra numarası boşluğu | `DELETED` |
| Zincir bağlantısı | `INSERTED` |
| İçerik hash'i | `MODIFIED` |

**Bilinen sınır (testle kayıtlı):** zincirin tamamı yeniden yazılırsa
doğrulama geçer. Bunu kapatmak dış bir çıpa gerektirir (imzalı zaman
damgası veya harici depo).

## Dosya değişikliği kanıtı

Her mutation öncesi ve sonrası içerik hash'i kaydedilir (ADR-041):

- `hash-before` olmadan eşzamanlı yazım tespit edilemez (T-20).
- `hash-after` olmadan agent'ın ne yazdığı doğrulanamaz — kanıt "yazdım"
  iddiasına dayanır, ölçüme değil.

## Bugün üretilebilen kanıt

Manifest, dışlama kayıtları, policy kararları, olay zinciri, boundary
kararları. **Üretilemeyen**: gerçek agent olayları (`adapter.start()`
bekliyor), test/quality-gate sonuçları.

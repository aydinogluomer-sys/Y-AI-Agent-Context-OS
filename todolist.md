# P21 — Açık Sorunlar Listesi

Kaynak: 2026-08-15 taraması. Her madde **ölçülmüş** bir bulgudur;
tahmin ya da "iyi olurdu" değil.

Sıra **rastgele değil**: 1–3 ölçüm altyapısını onarır. e2e koşmayan bir
CI ve rastgele kızaran bir süit varken üzerine yazılan her yeni güvenlik
testinin sonucu güvenilmezdir. Bu turun dersi tam buydu — **aracı önce
doğrula**.

---

## 1 · CI e2e testlerini KOŞMUYOR

`tests/e2e/smoke.spec.ts` var, `playwright.config.js` var, CI'da
`test:e2e:install` **var** — ama `test:e2e` **yok**. Tarayıcılar boşuna
kuruluyor.

Faz 2'de kaldırdığım ölü `test:deterministic` adımıyla aynı sınıf.

**Kabul:** CI'da e2e adımı koşar ve yeşil görülür.

---

## 2 · `git.test.ts` KARARSIZ

Üç tam süit koşusundan **biri düştü**, ikisi geçti. Tek başına 55/55.
Sıra ya da yük bağımlı.

Yanlış yeşilin aynadaki hâli: yanlış **kırmızı**. "Herhâlde flaky'dir"
alışkanlığı gerçek hatayı gizler.

**Kabul:** kök sebep bulunur ve düzeltilir; 5 art arda tam süit koşusu
temiz. Sebep bulunamazsa **kayıt altına alınır**, gizlenmez.

---

## 3 · Mutasyon kapsamı DAR

| Yüzey | Kapsanan |
|---|---|
| `organization_id` geçen üretim dosyası | 18'de **4** |
| append-only trigger'lı migration | 9'da **1** |

Sınadığım 12 predikatın **5'i** korumasızdı (%42). Aynı oran kalan
yüzeyde geçerliyse orada da yanlış yeşil var.

**Kabul:** kapsam genişler; hayatta kalan her mutasyon ya testi
düzelterek kapatılır ya da adıyla kaydedilir.

---

## 4 · IDOR + fail-closed — gerçek HTTP yüzeyi

T-01 (IDOR) ve fail-closed politika deposu. `requireProjectScope`'un
**her route'ta** gerçekten uygulandığı hiç ölçülmedi. Bugün elimizde
yalnız "kod öyle yazılmış" var.

**Kabul:** her kanonik route için başka projenin id'siyle **403**;
politika deposu düşünce **her istek DENY**. İkisi de mutasyonla
doğrulanır.

---

## 5 · Havuz şeffaf toparlanmıyor

Faz 3'te bulgu olarak yazıldı ama **üretimde düzeltilmedi**: DB yeniden
başlayınca uçuştaki sorgu düşüyor, yeniden deneme yok.

**Kabul:** ya yeniden deneme eklenir ve testle kilitlenir, ya da
"çağıran yeniden denemeli" sözleşmesi belgeye ve tipe yazılır.

---

## 6 · `dotenv.config({ override: true })` — 10 dosya

`.env`, komut satırından verilen ortam değişkenini **eziyor**. Yerelde
`db:migrate`'i yanlış veritabanına yönlendirdi. CI'da `.env` olmadığı
için bugün zarar vermiyor — ama bir tuzak.

**Kabul:** açık ortam değişkeni dosyayı yener; regresyon testi.

---

## 7 · `chunks.contains_secret` ölü kolon

Yazılıyor ama üretimde **hiç okunmuyor**; üç retrieval kanalı da
`files.contains_secret` okuyor. Faz 1'de yanlış yeşilin sebebi buydu.

**Kabul:** ya okunur hâle gelir ya kaldırılır; sapma kapanır.

---

## 8 · Çırçır: 43 bulgu (39 P0)

skip-then-pass 28 · permissive-fallback 10 · hardcoded-metric 4 ·
simulation-generator 1. Kilitli, yalnız düşebilir — ama duruyor.

**Kabul:** sayı düşer. Her düşüş gerçek bir düzeltmeye dayanır;
bastırmaya değil.

---

## 9 · T8 kısmi

10K ölçüldü. 50K/100K koşulmadı; chunking, FTS ve traversal ölçek
altında ölçülmedi (`ingest` chunk üretmiyor).

**Kabul:** ölçülebilenler ölçülür; ölçülemeyenler ADR-032 uyarınca
adıyla kaydedilir.

---

## 10 · `main` 67 commit geride

Çalışma özellik dalında; `main` görmüyor.

**Kabul:** 1–9 yeşilken birleştirme önerilir. **Bu madde son sırada
çünkü geri alınması en zor olan.**

---

## 11 · ÜRETİM PAKETİ AÇILMIYOR — yeni bulgu

Madde 1'i yaparken çıktı. `npm run start` ile servis edilen üretim
paketinde React `#root` içine **monte olmuyor**.

Kanıt:

| Gözlem | Sonuç |
|---|---|
| Tarayıcı → `/assets/*.js` | **HTTP 500** |
| curl → aynı yollar (tekil ve paralel) | **200**, doğru MIME |
| 500 yanıtının gövdesi | **doğru JavaScript** |
| Sunucu tarafı hata günlüğü | **boş** |
| CSP (üretimde) | `index.html`'deki inline script'i blokluyor |

İçerik doğru üretiliyor, durum kodu bozuluyor. Kök sebep bulunamadı.

`tests/e2e/smoke.spec.ts` içinde `test.fail()` ile **kayıtlı**: test
koşuyor ve kırılması bekleniyor. Kusur düzeltildiği an "beklenmedik
şekilde geçti" diye kırılır ve bu kaydın silinmesini talep eder.
`skip` kullanılmadı — o, kusuru susturur.

**Bu madde ile birlikte bir üretim hatası da düzeltildi:** `MIGRATIONS_DIR`
`import.meta.url`den sabit üç seviye yukarı çıkıyordu (`apps/api/src` →
repo kökü). Paketlenmiş `dist/server/server.js` için bu repo kökünün bir
üstüne düşüyor ve sunucu hiç başlamıyordu. Yani `npm run start` hiç
çalıştırılmamış. Yukarı doğru arama ile düzeltildi.

**Kabul:** `#root` dolar; `test.fail()` kaydı silinir.

---

## 8 · Çırçır — KAPANDI (43 → 5)

Bulguların **37'si** `scripts/validate-*` ailesindeydi. Bu süit:

- CI'da **yok** (P20/Faz 2'de ölü adım olarak kaldırıldı)
- üretim kodu tarafından **import edilmiyor**
- güncel şemayla **çalışamıyor** (çok kiracılık öncesi varsayımlar)
- baseline'ın kendi gerekçesi "P19'da tamamen silinecek" diyor

25 dosya ve 11 npm script silindi. Bu **bastırma değil**: desen gizlenmedi,
onu üreten ve hiçbir sinyal vermeyen kod ortadan kalktı. Git geçmişi
koruyor.

### Kalan 5 — bilerek bırakıldı

| Yer | Neden yanlış yeşil DEĞİL |
|---|---|
| `db.ts:630-631` | Mock bağlayıcı, bayrak yoksa **`throw` ediyor**; üretimde tamamen yasak. Fail-closed'ın kendisi. |
| `index.ts:92` | Mock DB kapısı: üç koşulun üçü de sağlanmadan açılmıyor. |
| `startup-policy.ts:7` | `mayContinueAfterDatabaseFailure` yalnız **üretim-dışı** ve **açık izinle** `true`. |
| `ai.ts:207` | UI simülasyon üreteci; adı açık, üretim yoluna bağlı değil. |

Tarayıcı bunları **şekil** olarak eşleştiriyor, anlam olarak değil.
Kuralı gevşetip sıfıra indirmek tam da yasak olan bastırma olurdu.
Çırçır 5'te kilitli; yalnız düşebilir.

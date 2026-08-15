# P20 — Güvence Kapatma Planı

## Neden bu plan var

P19 sonunda dokuz iş "kapandı" diye raporlandı. Sonra dört tanesini
**mutasyonla** yokladım — testin doğruladığını iddia ettiği şeyi bilerek
bozup, testin kırılıp kırılmadığına baktım.

**Dördün biri kırılmadı.** DENY testim geçiyordu ama DENY'ı hiç
doğrulamıyordu: DENY yolu (`secrets/prod.ts`) zaten ALLOW kuralının
(`src/**`) dışındaydı, yani onu ALLOW dışlıyordu. Test ALLOW'u ölçüyordu.

Bu tek bulgu planın tamamının gerekçesi. Kendi testlerimde **%25 kusur
oranı** ölçtüm. Yoklanmamış olanların daha temiz olduğunu varsaymak için
bir sebep yok.

**Bu planın tezi:** "geçen test" bir kanıt değildir. Kanıt, **kırılabilen**
testtir. Geçtiği için değil, bozulduğunda kırıldığı için güvenilir.

---

## Faz sırası ve gerekçesi

| Faz | İş | Neden bu sırada |
|---|---|---|
| **1** | Sistematik mutasyon kapısı | Bugün "kapandı" yazan her maddenin gerçekten kapalı olup olmadığını belirler. Diğer fazlar bu cevaba bağlı. |
| **2** | Push + CI koşumu | Entegrasyon kapısı yazıldı ama **hiç çalışmadı**. Çalışmayan kapı bir iddiadır. |
| **3** | İki zayıf iddiayı güçlendir | Bilinen ve sınırlı; Faz 1'in bulacaklarıyla birleşir. |
| **4** | T8 ölçek ölçümü | Erteleme gerekçesi yanlıştı; düzeltilmesi gerek. |
| **5** | Ölü kodu sil | En küçük risk, en sona. |

1 ve 2 **keşif**; 3–5 **bilinen iş**. Keşif önce gelir çünkü bulguları
sonraki fazların kapsamını değiştirebilir.

---

## FAZ 1 · Sistematik mutasyon kapısı

### Sorun

Dört mutasyonu **elle** yaptım: dosyayı yedekle, boz, testi koştur, geri
yükle. Elle yapılan bir denetim tekrarlanmaz ve regresyonu yakalamaz.
Yarın biri org predikatını kaldırırsa hiçbir kapı ötmez.

### Çözüm: mutasyonu bildirime dönüştür

`scripts/mutation/mutations.json` her güvenlik predikatı için bir kayıt
tutar: hangi dosya, hangi metin, neyle değiştirilecek, **hangi süit
kırılmalı**.

`scripts/mutation/run.ts` her kaydı sırayla uygular, süiti koşturur ve
**süitin KIRILDIĞINI** doğrular. Süit geçerse mutasyon hayatta kalmıştır
— yani o test yanlış yeşildir ve kapı exit 1 verir.

### Tasarım kararları

**Karar 1 · find metni TAM BİR KEZ eşleşmeli.**
Sıfır eşleşme = mutasyon çürümüş (kod taşınmış). Birden çok eşleşme =
hangisinin bozulduğu belirsiz. İkisi de hata. Bu kural, mutasyon
kayıtlarının kod değiştikçe sessizce anlamsızlaşmasını engeller — bu
harness'ın kendi yanlış yeşil riski budur.

**Karar 2 · Kirli çalışma ağacında koşmaz.**
Geri yükleme, dosyayı diskteki hâline döndürür. Kaydedilmemiş değişiklik
varsa geri yükleme onu **yok eder**. Hedef dosyalar kirliyse kapı en
baştan reddeder.

**Karar 3 · Geri yükleme bayt bazında doğrulanır.**
Her mutasyondan sonra dosyanın SHA-256'sı orijinaliyle karşılaştırılır.
Uymuyorsa süreç **hemen** durur — mutasyonun üretime sızması, yakalamaya
çalıştığı hatadan beterdir.

**Karar 4 · SIGINT/SIGTERM'de de geri yükler.**
Ctrl-C ile bozuk kod bırakan bir araç kullanılamaz.

**Karar 5 · Harness'ın kendi pozitif kontrolü var.**
`--self-test`: hiçbir davranışı değiştirmeyen bir mutasyon (yorum satırı)
uygular ve harness'ın bunu **HAYATTA KALDI** diye raporlamasını bekler.
Her şeye "yakalandı" diyen bir harness, kendisi yanlış yeşildir.

### Kapsam — 10 mutasyon

Dördü daha önce elle doğrulandı, **altısı ilk kez** sınanıyor.

| # | Mutasyon | Tehdit | Durum |
|---|---|---|---|
| 1 | traversal seed teriminden org predikatı | T-02 | elle ✓ |
| 2 | traversal özyineleme teriminden org predikatı | T-02 | elle ✓ |
| 3 | **traversal snapshot predikatı** | T-02 | **yeni** |
| 4 | firewall DENY listesi boşaltılır | T-05 | elle ✓ (hata buradaydı) |
| 5 | **lexical contains_secret filtresi** | T-05 | **yeni** |
| 6 | nonce çarpışma tespiti | T-14 | elle ✓ |
| 7 | migration ledger yok sayılır | — | elle ✓ |
| 8 | **kuyruk lease süresi kontrolü** | T-20 | **yeni** |
| 9 | **kuyruk attempt < max_attempts** | — | **yeni** |
| 10 | **evidence_chain append-only trigger** | T-18 | **yeni** |

### Beklenti — dürüst olmak gerekirse

Altı yeni mutasyonun **en az birinin hayatta kalmasını bekliyorum.**
Elle yoklanan dörtte oran 1/4 idi. Hayatta kalan çıkarsa o test
düzeltilecek; çıkmazsa bu da bir ölçüm.

### Faz sonu testi

    npm run gate:mutation -- --self-test    # pozitif kontrol: HAYATTA KALDI demeli
    npm run gate:mutation                   # 10/10 YAKALANDI olmali
    git status --porcelain                  # BOS olmali (geri yukleme tam)

---

## FAZ 2 · Push + CI koşumu

### Sorun

`origin/main`'e **58 commit** push edilmemiş. CI'a entegrasyon kapısı
eklendi (`pgvector/pgvector:pg16`, trust auth, `test:integration`) ama
GitHub Actions'ta **bir kez bile koşmadı**.

Bu tam olarak bu çabanın ortadan kaldırmak için var olduğu kalıp:
yazıldı, çalıştığı doğrulanmadı. Yerel Docker ile GitHub Actions'ın
`services:` bloğu aynı şey değil — imaj çekme, sağlık kontrolü zamanlaması,
ağ adı, eklenti kurulumu farklı davranır.

### Bilinen risk

Yerelde eklentiler `docker-entrypoint-initdb.d` ile kuruluyor. **CI bu
dizini görmez** — kendi `services:` Postgres'ini kullanır. Orada eklenti
kurulumu `createIntegrationDb` içindeki `CREATE EXTENSION` çağrılarına
bağlı. Bu bilinçli bir çift yol ama CI'da doğrulanmadı.

### Faz sonu testi

    git push origin main
    gh run watch          # yesil olmali

Kırmızı olursa: düzelt, tekrar push et, tekrar izle. **CI yeşil görülene
kadar faz kapanmaz.** "Muhtemelen geçer" bir sonuç değildir.

---

## FAZ 3 · İki zayıf iddiayı güçlendir

Her ikisi de DENY hatasıyla **aynı şekle** sahip: iddia geçiyor ama
yanlış sebeple geçebiliyor.

### 3a · Sıralama testi

Bugün:

    expect(Math.max(...ranks)).toBeGreaterThan(0);

Bu, **tüm skorlar birbirinin aynı** olsa da geçer. "Sıralama üretiliyor"
demiyor, "bir skor pozitif" diyor. `ts_rank_cd` her belgeye sabit 0.5
verse test yine geçerdi.

Olması gereken: terim yoğunluğu bilinen belgeler ekle, skorların
**birbirinden farklı** olduğunu ve **beklenen sırayı** verdiğini doğrula.

### 3b · Bağlantı kaybı testi

Bugün `pg_terminate_backend` sonrası bir sorgunun çalıştığı doğrulanıyor.
Ama havuz birden çok bağlantı tutar — sorgu **hiç dokunulmamış** bir
bağlantıya düşmüş olabilir. O zaman test yeniden bağlanmayı değil,
"havuzda başka bağlantı vardı"yı ölçer.

Olması gereken: `pg_backend_pid()` ile **hangi** bağlantının kullanıldığını
öl; onu sonlandır; sonraki sorgunun PID'inin **farklı** olduğunu göster.

### Faz sonu testi

Her iki test de `mutations.json`'a girer ve `gate:mutation` ile yoklanır.
Yani "güçlendirdim" iddiası da mutasyonla kanıtlanır.

---

## FAZ 4 · T8 ölçek ölçümü

### Erteleme gerekçesi yanlıştı

Kayıtlı gerekçe: "adanmış makine ister, bu makinede yayılım %60."

Bu **mikro-benchmark'lar** için doğru: dosya başına 0.58 ms ölçerken
zamanlayıcı çözünürlüğü ve zamanlayıcı gürültüsü baskın.

10K dosyalık gerçek index koşusu için **yanlış**: onlarca saniye sürer ve
I/O baskındır. %60 gürültü, 40 saniyelik bir ölçümde 40 ± 24 sn olmaz.

### Ölçülecekler

| Metrik | Neden |
|---|---|
| İlk index süresi | Spec §41 bütçesi |
| Artımlı index (%1 değişiklik) | Asıl iddia: artımlı ucuz olmalı |
| DB boyutu / dosya | Depolama tahmini |
| Traversal derinlik-3 gecikmesi | 10K düğümde grafik hâlâ kullanılır mı |

### Dürüstlük kuralı

Ölçülen sayı yazılır. Bütçe aşılırsa **bütçe yükseltilmez** — aşım
kaydedilir. Ölçüme uydurulan bir bütçe, ölçüm değildir.

### Faz sonu testi

    npx tsx scripts/perf/generate-fixture-repo.ts --preset 10k --out .perf/repo-10k
    npm run perf:scale

Sonuç `docs/perf/scale-10k.json` dosyasına yazılır; makine künyesi (CPU,
RAM, Docker sürümü) dosyaya girer — künyesiz bir performans sayısı
okunamaz.

---

## FAZ 5 · Ölü kod

`tests/integration/setup.ts` içindeki `truncateAll()` hiçbir yerde
kullanılmıyor. Kullanılmayan bir yardımcı, sonraki okuyucuya "şema
izolasyonu yerine truncate de kullanılıyor" diye yanlış bilgi verir.

### Faz sonu testi

    npm run test:integration     # 55 gecmeye devam etmeli
    grep -rn "truncateAll" .     # 0 sonuc

---

## Kapanış kapısı — her fazdan sonra

    npx tsc -p tsconfig.json --noEmit
    npx tsc -p tsconfig.strict.json --noEmit
    npx vitest run
    npm run test:integration
    npm run gate:all
    npm run gate:mutation
    npm run secret-scan

**Değişmezler:**

- Yanlış yeşil çırçırı yalnız **düşer**.
- Hayatta kalan mutasyon = yanlış yeşil = kapı exit 1.
- Mutasyon kapısı kirli ağaçta koşmaz; geri yükleme bayt bazında doğrulanır.
- Ölçülemeyen alan uydurulmaz (ADR-032).
- Bütçe ölçüme uydurulmaz; aşım kaydedilir.

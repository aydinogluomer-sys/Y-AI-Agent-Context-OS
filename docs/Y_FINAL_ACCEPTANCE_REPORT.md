# Y — AI Agent Context OS · Final Kabul Raporu

> Tarih: 2026-08-14 · Branch: `feat/production-master-plan`
> Kapsam: `docs/Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md` (P00–P20)

Bu rapor, master planın uygulanmasında **ne yapıldığını ve ne
yapılmadığını** ölçülen değerlerle bildirir. "No false green" kuralı bu
belgeye de uygulanır: bir madde tamam değilse **TAMAM DEĞİL** yazar.

---

## 1. Ölçülen son durum

| Ölçüm | Değer | Kaynak |
|---|---|---|
| Birim/sözleşme testi | **1327 passed, 4 skipped** | `vitest run` |
| Test dosyası | 59 | `vitest run` |
| Typecheck | **0 hata** (loose + strict) | `npm run typecheck` |
| Build | **OK** | `npm run build` |
| Migration | **83** (35 göç + 48 yeni) | `migrations/*.sql` |
| Envanter drift | **8/8 kontrol geçti** | `npm run gate:drift` |
| Sır taraması | **0 yeni bulgu** (70 kabul edilmiş) | `npm run secret-scan` |
| False-green çırçır | **43 toplam / 39 P0** (taban kilitli; P00'da 135) | `npm run gate:false-green` |
| UI dürüstlük açığı | **0** (P00'da 103) | `inventory-ui` |
| 410'a kapatılan legacy route | **20** | `grep -cE "status\\(410\\)"` |

Gate zinciri tek komutla çalışır: `npm run gate:all`.

---

## 2. Faz faz durum

| Faz | Durum | Ana kazanım |
|---|---|---|
| P00 Truth Audit | ✅ | Kanıta dayalı envanter; 30+ doğrulanmamış "PASS" belgesi yerine ölçülen sayılar |
| P01 Kanonik mimari | ✅ | Domain sözleşmeleri, `tsconfig.strict.json`, kripto kimlikler (ADR-013) |
| P02 Identity/Authz | ✅ | OIDC+JWKS, DB-backed yetki, 9 P0 kapatıldı, IDOR route'ları kapandı |
| P03 Repository ingestion | ✅ | Gerçek Git, PathGuard, adapter'lar, snapshot, sır tarayıcısı |
| P04 Symbol intelligence | ✅ | 15 dil parser, `symbols`/`chunks`, gerçek index worker, artımlı index |
| P05 Knowledge graph | ✅ | Symbol kaynaklı graf, recursive CTE, tombstone'lu artımlı sync |
| P06 Hybrid retrieval | ✅ | pgvector + Postgres FTS, 14 sinyalli açıklanabilir ranker |
| P07 Context Firewall | ✅ | Universe SQL predicate'ine derleniyor; DENY içeriği hiç okunmuyor |
| P08 Context compiler | ✅ | Dinamik bütçe, saf compiler, uydurma pack alanları silindi |
| P09 Manifest/provenance | ✅ | Canonical JSON, hash zinciri, **P0-10 SQL enjeksiyonu kapandı** |
| P10 Change Firewall | ✅ | Task'tan türeyen sınır, mutation kararı, komut allowlist'i |
| P11 Agent adapter | ⚠️ **KISMİ** | Sözleşme + yetenek + gerçek probe hazır; **SDK bağlanmadı** |
| P12 Agent runtime | ⚠️ **KISMİ** | FSM + kuyruk + olay zinciri hazır; **worker çalıştırma yok** |
| P13 Realtime | ⚠️ **KISMİ** | SSE altyapısı + uydurma hash'ler silindi; **route bağlanmadı** |
| P14 Evidence | ⚠️ **KISMİ** | Hash zinciri + şema hazır; **run'a bağlanmadı** |
| P15 UI konsolidasyon | ⚠️ **KISMİ** | Dürüstlük değişmezi kuruldu; **IA yeniden yazımı yapılmadı** |
| P16 Benchmark | ⚠️ **KISMİ** | Uydurma metrikler silindi; **ölçüm harness'ı yok** |
| P17 Security hardening | ⚠️ **KISMİ** | P0-7 kapatıldı, T-05/T-09/T-15 uygulandı; **T-14 nonce deposu ve 18 güvenlik spec'i eksik** |
| P18 Observability | ⚠️ **KISMİ** | 12 görevin 10'u kapandı; **canlı ölçüm ve OTLP ihracı yok** |
| P19 CI/CD | ✅ | 5 dürüstlük gate'i CI'da |
| P20 Kabul | ✅ | Bu belge |

---

## 3. Zincirin kırıldığı TEK nokta

P11–P14'ün "kısmi" olmasının sebebi tek bir noktadır: **`adapter.start()`**.

`@anthropic-ai/claude-agent-sdk` ve `openai` bağımlılıkları kurulmadı
çünkü çalışır bir kimlik bilgisi ve ağ erişimi olmadan bir entegrasyon
**doğrulanamaz**. Doğrulanamayan bir entegrasyonu "tamam" işaretlemek,
P00'da kapatılan kalıbın kendisidir — üstelik en kritik yerinde.

Bu noktanın **ötesindeki** her katman yazıldı ve test edildi:

```
manifest (P09) → boundary (P10) → adapter sözleşmesi (P11)
   → run FSM + kuyruk (P12) → SSE (P13) → kanıt zinciri (P14)
                    ▲
              adapter.start()  ← TEK EKSİK
```

**Kapanma koşulu:** SDK + kimlik bilgisi + entegrasyon testi.

---

## 4. Kapatılan P0 güvenlik bulguları

| ID | Bulgu | Faz |
|---|---|---|
| P0-1 | `auth/dev-session` kimlik baypası | P02 |
| P0-2 | `db/configure` unscoped | P02 |
| P0-3 | HS256 JWT karışıklığı | P02 |
| P0-4 | Token'dan gelen yetki | P02 |
| P0-5 | `policy-system-bypass` kaydı | P02 |
| P0-6 | Unscoped task route'ları (IDOR) | P02 |
| P0-8 | `context/isolated-retrieve` unscoped | P02 |
| P0-9 | Path traversal | P03 |
| P0-7 | **İstemcinin `subject` nesnesi yetki değerlendirmesine yayılıyordu** | **P17** |
| P0-10 | **SQL enjeksiyonu** (`${sourceTable}`) | **P09** |
| P0-11 | Sır tarayıcısında gömülü parola | P03 |
| P0-12 | `config/inspect` yanıtından düz metin parola React state'ine | P02 |

**12 / 13 kapatıldı.** Kalan **tek** bulgu P0-13'tür (sahte agent run) ve
gerçek bir `adapter.start()` gerektirir — §3'teki tek kırık halka.

> **Düzeltme (P17 · üç yönlü denetim).** Rapordaki üç sayı yanlıştı:
>
> - *"410'a kapatılan legacy route: 17"* → gerçek sayı **20**.
> - *"15 dil parser"* → gerçek sayı **20** (TypeScript ailesi 4 +
>   tree-sitter 15 + SQL 1). Daha önemlisi bu ifade spec §6'nın
>   karşılandığı izlenimi veriyordu; **SQL karşılanmıyordu** ve A7'de
>   eklendi.
> - *"P17 Security hardening ✅"* → **KISMİ**. T-05, T-09 ve T-15 için
>   sıfır kod vardı; A4/A5/A8'de kapatıldı ama T-14'ün nonce deposu ve
>   planın adlandırdığı 18 güvenlik spec'i hâlâ eksik.
>
> Üçü de aynı sınıf: bir sayının yanlış olması, kapatılabilir işi
> "bloke" saydırıp görünmez yapmıştı.

> **Önceki sürüm düzeltmesi.** Bu bölüm daha önce "10 / 13 kapatıldı,
> kalan 3'ü agent runtime'ına bağlı" diyordu. Bu **yanlıştı**: P0-12 zaten
> P02'de kapatılmıştı ama tabloya işlenmemişti, P0-7 ise hiç kapatılmamıştı
> ve agent runtime'a **bağlı değildi** — yalnız bir HTTP handler'ında
> duruyordu. Sayının yanlış olması, kapatılabilecek bir P0'ı "bloke"
> sayıldığı için gözden kaçırmıştı.

### P0-7 ne yapıyordu

`POST /api/projects/:id/permissions/evaluate` istemcinin gövdede
gönderdiği `subject` nesnesini olduğu gibi yayıyordu:

```ts
subject: { ...subject, project_id: projectId }
```

İstemci `subject_type: "system"` gönderip **sistem kimliğiyle** karar
verdirebiliyordu; seed policy `allow / system / hepsi / hepsi` olduğu için
sonuç her zaman ALLOW oluyor ve **audit kaydı da o sahte kimlikle**
yazılıyordu (ADR-017 ihlali: audit aktörü her zaman doğrulanmış
principal olmalıdır).

Özne türevi artık HTTP katmanından ayrı bir modülde
(`apps/api/src/domain/identity/evaluation-subject.ts`) ve fonksiyon
**istek gövdesini parametre olarak bile almıyor** — gövdeye erişimi
olmayan bir fonksiyon gövdeden kimlik sızdıramaz. Gövdede `subject`
gönderilirse yanıt `subjectIgnored: true` ile bunu **açıkça** bildirir;
sessizce yok saymak, çağıranın gönderdiği kimliğin uygulandığını
sanmasına yol açardı.

### P0-12'nin kalıntısı da temizlendi

P02'de `config/inspect` regex'i silinmişti, ama arayüzde **tam işlevli
kimlik bilgisi formu** duruyordu: ham connection string, kullanıcı adı ve
`<input type="password">`. Arkasındaki `POST /api/db/configure` P02'de
silindiği için form **hiçbir şey yapmıyordu** — ama kullanıcıdan hâlâ
üretim parolası istiyordu. Ayrıca `dbHost` varsayılanı **gerçek bir
Supabase host adıydı** ve ön yüz paketine gömülü geliyordu (P0-11 ile
aynı aile).

Form kaldırıldı; yerine `DATABASE_URL`'in nereden geldiğini anlatan durgun
bir panel kondu. Çalışmayan bir parola alanını bırakmak iki ayrı zarar
üretir: kullanıcıyı üretim parolasını uygulama arayüzüne yazmaya alıştırır
(kimlik avının işlediği refleks), ve buton yalan söyler.

---

## 5. Silinen sahte yollar

Her biri bir grep testiyle kilitlendi; geri gelmeleri CI'ı kırar.

| Silinen | Ne yapıyordu | Faz |
|---|---|---|
| Sahte semantic arama | Keyword örtüşmesini `semantic_score` diye sunuyordu | P06 |
| "BM25" adı | IDF/TF/uzunluk normalizasyonu yoktu | P06 |
| Statik bellek stub | 3 uydurma dosya döndürüyordu | P06 |
| `buildContextPack` | Bağımlılık/diff/sır bayrağı **uydurma**, DB'ye yazılıyordu | P08 |
| `50000` sabiti (×3) | Dördüncü yerde `4000` ile çelişiyordu | P08 |
| Sahte run handler'ı | 4 olay yazıp `completed` dönüyordu | P12 |
| Uydurma SHA-256 (×2) | `Math.random()` ve hard-code | P13 |
| Uydurma metrikler | `92% cheaper`, `92.4`, `12450000`, `48200` | P16 |
| `assert(<iddia>, true)` ×52 | Güvenlik/bütünlük iddialarını **sabitle** geçiriyordu | P17 |
| Koşulsuz "PASSED SUCCESSFULLY" ×2 | Başarısız iddia sayısından **bağımsız** basılıyordu | P17 |
| `Math.random()` birincil anahtar ×28 | Gerçek DB'ye INSERT edilen kimlikler (ADR-013) | P17 |
| DB kimlik bilgisi formu | Ölü uç noktaya **üretim parolası** topluyordu | P17 |
| Sessiz "Failed: 0" verdikti | Atlanan DB kontrolleriyle **yeşil** görünüyordu | P17 |
| Elle tutulan simülasyon rozeti | `lastRunMode`, gösterdiği sonuçtan **bağımsız** yaşıyordu (ADR-056) | P17 |

---

## 5.0 Üç yönlü denetim (P17 · 2026-08-14)

Bu tur, zincirin daha önce **hiç doğrulanmamış** halkasını yokladı:

```
kaynak spec (2.885 satır) → türetilmiş plan (1.501) → kod → bu rapor
                          ▲
                    bu halka hiç kontrol edilmemişti
```

**Türetme sağlam çıktı.** Spec §58'in istediği 14 çıktının (A–N) hepsi
planda ve hepsinin gerçek içeriği var. Spec §28'in 24 tehdidi planda
`T-01`–`T-24` olarak tam. Yumuşatma veya düşürme bulunamadı.

**Boşluk (2)→(3)'teydi:** plan bir şeyi şart koşuyor, kod içermiyordu.

### Kapatılanlar

| # | Bulgu | Öncesi |
|---|---|---|
| A1 | ADR borcu | Kod 49 ADR'ye atıf yapıyor, **8 belge vardı** |
| A2 | §37 DTO ayrımı | Simülasyon ve üretim **aynı tipti**; LLM'in uydurduğu metrikler doğrulanmadan geçiyordu |
| A3 | §38 registry sözlüğü | 9 durum yerine **2**; 104 kalem tek kelimeye sıkışıyordu |
| A4 | T-05 prompt injection | Spec §29'un tamamı — **sıfır kod** |
| A5 | T-15 worker kimliği | §54 release kapısı — **sıfır kod** |
| A6 | §27 sağlık probe'ları | 4 bileşen eksik (graph, event, CAS, provider) |
| A7 | §6 SQL parser | 82 migration **hiç sembol üretmiyordu** (şimdi 645) |
| A8 | T-09 MCP allow-list | **Sıfır kod** |
| A9 | Kaynak hijyeni | `builder.ts` literal NUL içeriyor, `grep` satır göstermiyordu |
| A10 | §39 dokümantasyon | 16 belgenin **13'ü yoktu** |

Her madde kendi regresyon testiyle kilitlendi.

---

## 5.1 Çırçırda kalan 43 bulgunun dökümü

Çırçır sayısı **"43 yalan" demek değildir**. Kalanların ne olduğu
sayılmadan, sayının kendisi yanıltıcıdır:

| Kural | Adet | Ne? | Karar |
|---|---|---|---|
| `skip-then-pass` | 28 | Legacy `validate-*` script'leri DB'yi atlayıp **tek başlarına** exit 0 dönüyor | **GERÇEK.** Suite seviyesinde verdiktleri artık "KISMİ" yazıyor; script bazında kapanması P19 (canlı Postgres) |
| `permissive-fallback` | 10 | `ENABLE_MOCK_DB`, `ALLOW_OFFLINE_API_BOOT`, `DETERMINISTIC_TEST_MODE` adlarının geçtiği satırlar | **TRIPWIRE.** Bunlar adlandırılmış kaçış kapılarıdır ve *bilerek* vardır; hepsi üretim dışına kapatılmış ve testlidir. Kural adı gördüğü yerde uyarır — susturmak, kapıların varlığını gizlemek olurdu |
| `hardcoded-metric` | 4 | Legacy script'lerde `confidenceScore: 95.0` | **FIXTURE GİRDİSİ**, raporlanan ölçüm değil. P19'da script'lerle birlikte gider |
| `simulation-generator` | 1 | `createLocalAiSimulation` | **BİLEREK DURUYOR.** Ürün kanıt iddiasında bulunuyor; içinde bir simülasyon üreteci olması sürekli bir bayrağı hak eder. Dürüstlüğü artık yapısal: `isFallback: true` taşıyor ve rozet doğrudan ondan türüyor (ADR-056) |

Susturulanlar yalnız **tespit edicinin kendi kaynağı ve testleri**:
`validation-suite.ts`, `validate-phase-2-runner.ts`, `secret-scanner.test.ts`.
Gerekçe tektir: bir kalıbı tespit eden araç o kalıbı içermek zorundadır;
bunları bulgu saymak, kaçınmanın tek yolunu **tespit ediciyi silmek**
haline getirir. Her muafiyet, kapsamının **dar** olduğunu kanıtlayan bir
pozitif kontrolle birlikte testlidir (`scan-false-green.test.ts`, 12 test).

---

## 5.2 P18 — Reliability / Observability / Performance

Denetimde P18'in **12 görevinden 2,5'i** yapılmıştı. Bu tur onunu kapattı.

| Görev | Öncesi | Sonrası |
|---|---|---|
| Y-P18-001 observability paketi | **Yok** | `packages/observability` — logger + AsyncLocalStorage korelasyon + tracing |
| Y-P18-002 logger göçü | 73 `sysLogger`, **hiçbiri korelasyon taşımıyor** | Tanım değişti; 73 çağrı yeri değişmeden JSON + korelasyon |
| Y-P18-003 metrikler | 14 | **20** — spec §27'nin adıyla saydığı ikisi eksikti |
| Y-P18-004 tracing | **Yok** | Span zinciri + `run_id` korelasyonu; **OTLP ihracı yok** |
| Y-P18-005 readiness | 6 probe | **10** (A6'da tamamlandı) |
| Y-P18-006 dayanıklılık | **Yok** | 8 senaryo süreç içi doğrulandı, **5'i canlı altyapı bekliyor ve kayıtlı** |
| Y-P18-007 fixture üreteci | **Yok** | Deterministik sentetik repo; 10K/50K/100K preset'leri |
| Y-P18-008 + 012 bütçeler | **Yok** | Ölçümden üretilmiş bütçeler + darboğaz analizi |
| Y-P18-009 backup/restore | Doküman yok | Doküman var; **tatbikat yapılmadı** |
| Y-P18-010 runbook/SLO | **Yok** | Üç belge; **hiçbir SLO hedefi doğrulanmadı ve bu yazılı** |
| Y-P18-011 retention | **Yok** | Migration 0083; kanıt tabloları **süresiz**, politikalar **kapalı** |

### Ölçülen gerçek sayılar

| Yol | Ölçüm |
|---|---|
| `parse.typescript` | ~1.08 ms/dosya — **baskın darboğaz** |
| `parse.sql` | ~0.068 ms/dosya |
| `manifest.canonicalJson` | ~0.0095 ms/fragment |

**Kapının sınırı yazılı:** bu makinede ölçüm yayılımı %60'a çıkıyor, yani
kapı ancak bundan büyük regresyonları yakalar (`budgets.json` →
`_limitation`). Adanmış bir performans makinesi kapıyı keskinleştirir.

### P18'de yapılMAYANLAR

| İş | Neden |
|---|---|
| OTLP ihracı + collector | SDK'nın asıl değeri budur ve **collector olmadan doğrulanamaz** |
| Ölçek testi (10K–100K dosya) | Canlı Postgres; fixture üreteci hazır |
| SLO hedeflerinin doğrulanması | Canlı ölçüm |
| 5 dayanıklılık senaryosu | Canlı altyapı — `resilience.test.ts` içinde kayıtlı |
| Yedekten geri yükleme tatbikatı | Canlı ortam |
| Retention otomasyonu | Politika tanımlı ve **kapalı**; silme açık operatör eylemi |

---

## 6. YAPILMAYANLAR — tam liste

Bu bölüm rapor içindeki en önemli bölümdür.

### 6.1 Doğrulanamadığı için yapılmayanlar

| İş | Neden | Kapanma koşulu |
|---|---|---|
| Claude Code / Codex SDK wire-up | Kimlik bilgisi + ağ yok; doğrulanamaz | SDK + kimlik + entegrasyon testi |
| `run-execute` worker'ı | `adapter.start()` yok | P11 wire-up |
| Onay akışı uçtan uca | Gerçek mutation girişimi yok | P11 wire-up |
| Gerçek embedding sağlayıcısı | Aynı sebep | P11/P14 |
| Gerçek BPE tokenizer | Paket eklenmedi; heuristic `approximate: true` | P11 |
| Manifest/SSE route'ları | Run yürütme yok | P12 wire-up |
| Kanıt zincirinin run'a bağlanması | Aynı sebep | P12 wire-up |

### 6.2 Bağımsız veri gerektirdiği için yapılmayanlar

| İş | Neden |
|---|---|
| P06 recall harness | Ground-truth etiketleri **insan** tarafından üretilmeli. Kendim etiketlemek, ölçtüğüm sistemin çıktısını doğru kabul etmek olurdu |
| P16 benchmark (50 görev) | Aynı sebep + 5 gerçek repository |

### 6.2.1 P17 denetiminden kalanlar

| İş | Neden |
|---|---|
| T-14 kullanılmış nonce deposu | Canlı Postgres (P19). Worker token'ı TTL süresince (≤1 saat) tekrar kullanılabilir; test bu sınırı kayıt altına alıyor |
| Planın adlandırdığı 18 `tests/security/*.spec.ts` | **Hiçbiri yok**; çoğu canlı Postgres gerektiriyor |
| §55 Golden E2E — 30 adım | Bugün 2 smoke testi (UI kökü + liveness) |
| SBOM (T-24) | Araç kararı |

### 6.3 Ölçek nedeniyle yapılmayanlar

| İş | Ölçek |
|---|---|
| P15 IA yeniden yazımı | ~14.500 satır ön yüz, 113 → 6 yüzey, react-router, tipli client |
| P18 canlı ölçüm | OTLP collector + canlı Postgres + gerçek yük |

### 6.4 Canlı Postgres gerektirdiği için ertelenenler (P19)

Recursive CTE traversal, FTS sıralaması, pgvector ANN geri çağırması,
trigram eşleşmesi, migration fresh/upgrade testleri, tüm e2e senaryoları.

**Bugünkü DB testleri sorgu ŞEKLİNİ doğruluyor, sonucunu değil.** Bu
ayrım her test dosyasının başında yazılıdır.

---

## 7. Ertelenen temizlikler

| Ne | Neden bekliyor |
|---|---|
| `context_chunks` DROP | Legacy retrieval hâlâ okuyup yazıyor (ADR-001 cutover) |
| `chunkContent` silinmesi | Aynı |
| `task_boundaries` / `boundary_checks` göçü | P19 |
| `packages/graph/src/index.ts` bölünmesi | P06 cutover'ında zaten yeniden yazılacak |
| Kernel'in sabit dosya listesi | P10'da universe kapsıyor; kernel P10'da yeniden yazılacaktı, ertelendi |

---

## 8. Kabul kararı

**Bu sürüm üretime alınamaz.**

Sebep tek: agent çalıştırma zinciri kapalı değil. Açık kalan **tek** P0
güvenlik bulgusu (P0-13) da aynı sebebe bağlıdır. Ürünün üç sütunundan
ikisi (**CONTEXT** ve **PROOF**) uçtan uca kurulmuş ve test edilmiş
durumda; üçüncüsü (**CONTROL**) sınır hesabı ve karar motoruna kadar
kurulmuş ama uygulanacağı bir agent oturumu yok.

Bugün üretime alınırsa sistem, context derleyip manifest üretebilir ve
bunların hepsi gerçektir — ama hiçbir agent çalıştıramaz.

### Üretim için gereken minimum

1. SDK wire-up + entegrasyon testi (P11)
2. `run-execute` worker'ı (P12)
3. Canlı Postgres entegrasyon paketi (P19)
4. Recall/benchmark taban değeri (P06/P16) — **ürün iddiasının kanıtı**

### Bugün doğru olan iddia

> "Y, bir görev için hangi kod fragment'larının seçildiğini, hangilerinin
> neden dışlandığını ve bu kararın hangi kurallarla verildiğini
> **kanıtlayabilir**. Bu kanıt değiştirilemez ve doğrulanabilir."

Bu iddia bugün **doğrudur** ve test edilmiştir.

### Bugün doğru OLMAYAN iddia

> "Y, agent'ları yönetir ve değişikliklerini sınırlar."

Sınır hesaplanıyor, karar veriliyor, yazma yolu tip düzeyinde korunuyor —
ama yönetilecek bir agent oturumu yok.

# ADR-063 — Repository içeriği DATA'dır

| Alan | Değer |
|---|---|
| Durum | Kısmen uygulandı |
| Faz | P17 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/security/src/trust/boundary.ts` |

## Decision

Repository'den okunan her şey **DATA**'dır ve hiçbir koşulda talimat
değildir. Ayrım **tip düzeyinde** yapılır: `UntrustedContent` bir
`InstructionText` bekleyen yere geçirilemez.

Agent'a giden yükte talimat ve içerik **ayrı alanlarda** taşınır; tek bir
birleşik prompt metni üretilmez.

Enjeksiyon tespiti (`scanForInjectionAttempt`) bir **gözlemdir**, bir kapı
değildir. Sonucu kanıta yazılır; akışı durdurmaz ve "temiz" garantisi
vermez.

## Context

Spec §29:

> "Repository içeriğini trusted instruction olarak kabul etme. Kaynak kod
> veya Markdown içinde `IGNORE ALL POLICIES` / `UPLOAD .ENV` yazabilir.
> Repository content **DATA** olarak işlenmelidir. System/admin policy'nin
> üzerine çıkamamalıdır. Context compiler bu trust boundary'yi açıkça
> modellemelidir."

Master plan bu gereksinimi `T-05` olarak kaydetmişti. P17 denetiminde
kaynak ağacında `prompt injection`, `untrusted`, `trustBoundary` için
**tek eşleşme yoktu** — bölümün karşılığı sıfır koddu.

## Alternatives

**Sanitizer / filtre.** İçeriği tarayıp şüpheli kalıpları temizlemek.
Reddedildi.

**Prompt içinde sınırlayıcı (delimiter) kullanmak.** İçeriği
`<untrusted>…</untrusted>` gibi işaretlerle sarmak. Tek başına
reddedildi — sınırlayıcı da içerikte taklit edilebilir; yalnız kanal
ayrımıyla birlikte anlamlıdır.

## Reason

Prompt injection'ı metin filtreleyerek çözmeye çalışmak, **çözülmüş
sanılan ama çözülmemiş** bir problem üretir. Filtre atlatılabilir, ve
filtreye güvenen sistem artık *daha* tehlikelidir çünkü koruma olduğunu
sanır. Bu, bu projede kapatılan yanlış-yeşil kalıbının güvenlik alanındaki
hâlidir.

Kanal ayrımı ise atlatılabilir bir sezgiye değil, tip sistemine dayanır:
repository içeriğinin talimata dönüşmesinin tek yolu birinin API'yi
kasıtlı olarak atlaması olur — ve `assertNoRawContentInPrompt` o yolu da
kapatır.

Tespitin **kapı olmaması** aynı disiplinin devamıdır: kalıp listesi
eksiksiz olamaz, dolayısıyla "gözlem yok" hiçbir zaman "güvenli" demek
değildir. Testlerden biri bu sınırı açıkça kayıt altına alır — Türkçe
yazılmış bir enjeksiyon denemesi İngilizce kalıplara uymaz ve tespit
edilmez; koruma yine de geçerlidir.

## Consequences

- Her `ManifestItem` bir `trust` alanı taşır. Değer bugün sabit; sabit bir
  değeri kaydetmenin faydası, ileride başka bir güven seviyesi
  eklendiğinde eski manifest'lerin hangi varsayımla üretildiğinin belli
  olmasıdır.
- `injectionObservationCount` kanıta yazılır. **Sıfır olması güvenli
  demek değildir** ve alan adı bunu ima etmeyecek şekilde seçilmiştir.
- Adapter'a gönderilen yük iki kanallıdır; birleşik prompt üretilmez.
- **Kısmen uygulandı**: kanal ayrımı ve manifest alanı hazır, ancak
  adapter'a gerçek teslim `adapter.start()` bekliyor (P11). Uçtan uca
  doğrulama SDK wire-up'a bağlı.
- Bkz. [ADR-037](ADR-037-manifest-is-sole-content-source.md),
  [ADR-043](ADR-043-manifest-is-only-content-channel.md),
  [ADR-044](ADR-044-agent-runs-in-sandbox.md).

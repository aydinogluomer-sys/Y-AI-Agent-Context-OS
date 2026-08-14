# Olay Müdahalesi

## Sınıflandırma

| Sınıf | Örnek | İlk aksiyon |
|---|---|---|
| **P0 · Sır sızıntısı** | Bir sır context'e girdi | Etkilenen kimlik bilgisini **rotasyona sok**, sonra araştır |
| **P0 · Yetki aşımı** | Cross-project veri erişimi | Etkilenen token'ları iptal et; audit log'u dondur |
| **P1 · Kanıt bütünlüğü** | Hash zinciri doğrulaması başarısız | Zinciri **yazmayı durdur**; mevcut hâlini yedekle |
| **P1 · Kuyruk tıkanması** | `readyz` queue degraded | Lease süresi dolmuş işleri kontrol et |
| **P2 · Index bayat** | Retrieval boş dönüyor | Index worker durumunu kontrol et |

## Sır sızıntısı

1. **Önce rotasyon.** Sızıntının kapsamını anlamak rotasyondan sonra gelir;
   tersi, saldırgana zaman kazandırır.
2. Manifest'lerden etkilenen fragment'ları bul: `chunkHash` ile arama.
3. `exclusions` kaydına bak — sır dışlanmışsa hangi kuralın kaçırdığını
   gösterir; dışlanmamışsa policy boşluğu var demektir.
4. Policy'yi düzelt, **yeni bir run** başlat. Universe immutable olduğu
   için (ADR-030) mevcut run'lar eski kuralla tamamlanır.

## Kanıt zinciri bozulması

Doğrulama üç durumu ayırt eder: `DELETED` (sıra boşluğu), `INSERTED`
(zincir bağlantısı), `MODIFIED` (içerik hash'i).

**Zincirin tamamı yeniden yazılırsa doğrulama geçer** — bu bilinen bir
sınırdır. Bu senaryodan şüpheleniliyorsa dış kanıt gerekir: yedek zaman
damgaları, log gönderim kayıtları.

## Policy store erişilemiyor

Sistem **fail closed** davranır: her istek DENY, `readyz` degraded.
Bu doğru davranıştır; müdahale policy store'u geri getirmektir, fail-closed
davranışı devre dışı bırakmak **değildir**.

## Worker kimliği reddediliyor

`WORKER_SIGNING_KEY` eksik veya ≥32 karakter değilse kuyruk hiç
çalışmaz — bu fail-closed'dır, hata değil. Token süresi ≤1 saattir;
süresi dolmuş token yenilenir.

## İletişim

Kanıt üretebilen bir sistemde olay raporu **manifest ve zincir
kayıtlarına** dayanmalıdır. "Muhtemelen şu oldu" yerine hangi fragment'ın
hangi karara göre seçildiği gösterilebilir.

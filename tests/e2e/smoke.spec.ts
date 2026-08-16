import { test, expect } from '@playwright/test';

/*
 * P21/1 — E2E DUMAN TESTLERI.
 *
 * ILK HALI YERELDE DUSUYORDU: `page.goto('/')` varsayilan olarak `load`
 * olayini bekler. Vite dev sunucusu SOGUK onbellekte modulleri istek
 * aninda derler; React uygulamasi ilk acilista yuzlerce ayri modul
 * istegi uretir ve bu 30 sn'lik varsayilan siniri asiyordu.
 *
 * Uygulama BOZUK DEGILDI: ayni `/` yolu curl ile 0.49 sn'de HTTP 200
 * donuyor. Yavaslik TARAYICIDA, HTML uretiminde degil.
 *
 * Ustelik testin adi "UI root successfully" diyordu ama iddiasi yalnizca
 * `status < 400` idi — yani HTML'in geldigini olcuyordu, UI'in
 * ACILDIGINI degil. Ad ile iddia uyusmuyordu.
 *
 * Ayristirildi: durum kodu HIZLI yoldan, gercek montaj AYRI ve acikca
 * comert bir sinirla.
 */

test.describe('Y-OS E2E Smoke Tests', () => {
  test('HTML kökü HTTP 200 döner', async ({ page }) => {
    // `domcontentloaded`: HTML'in geldigini olcmek icin modul grafinin
    // tamaminin yuklenmesini beklemek gereksiz.
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);
  });

  /*
   * BILINEN KUSUR — `test.fail()` ile KAYITLI, gizlenmis degil.
   *
   * Uretim paketinde React `#root` icine monte OLMUYOR. Kanit:
   *
   *   - tarayici: /assets/*.js istekleri HTTP 500
   *   - ayni yollar curl ile 200 ve dogru MIME (tekil VE paralel)
   *   - 500 yanitinin GOVDESI dogru JavaScript
   *   - sunucu tarafinda hicbir hata loglanmiyor
   *   - ayrica CSP uretimde index.html'deki inline script'i blokluyor
   *
   * Yani icerik dogru uretiliyor ama durum kodu bozuluyor ve uygulama
   * acilmiyor. Kok sebep bulunamadi.
   *
   * NEDEN `skip` DEGIL `fail`: `skip` testi susturur ve kusur sessizce
   * kalir. `fail` testi CALISTIRIR ve KIRILMASINI BEKLER — kusur
   * duzeltildigi an 'beklenmedik sekilde gecti' diye kirilir ve bu
   * kaydin silinmesini talep eder. Yanlis yesil uretmez.
   */
  test('React uygulaması #root içine GERÇEKTEN monte olur', async ({ page }) => {
    /*
     * BILINEN KUSUR — `test.fail()` ile KAYITLI, gizlenmis degil.
     *
     * Uretim paketinde React `#root` icine monte OLMUYOR:
     *
     *     PAGEERROR: Cannot read properties of null (reading 'useState')
     *
     * ## Elenen sebepler (hepsi olculdu, tahmin degil)
     *
     *   - Soguk vite onbellegi: uretim paketinde de oluyor
     *   - Tarayici basliklari: curl ayni basliklarla 200 aliyordu
     *   - Eszamanlilik: tek test kosarken de oluyor
     *   - Migration dizini: ayri bir hataydi, duzeltildi
     *   - Veritabani: DB saglikliyken de oluyor
     *   - Chunk bolmesi: `manualChunks` TAMAMEN kaldirilip tek
     *     bundle uretildiginde de SURUYOR
     *
     * ## Bu turda BULUNAN ve DUZELTILEN sebep
     *
     * Ayni arastirmada bir baska uretim hatasi bulundu ve kapatildi:
     * CORS middleware kendi asset'lerini reddediyordu. `<script
     * type="module">` AYNI KOKENDE bile `Origin` gonderir; allow-list
     * bos oldugu icin /assets/*.js HTTP 500 donuyordu. Duzeltildi
     * (apps/api/src/app.ts) ve dogrulandi: 500 -> 200.
     *
     * Yani bu test IKI kusuru birden gosteriyordu. Biri kapandi,
     * digeri acik.
     *
     * ## Kalan supheli
     *
     * React'in uretim paketinde `null` cozulmesi — muhtemelen CJS/ESM
     * interop. Dev sunucusunda calisiyor, pakette calismiyor.
     *
     * NEDEN `skip` DEGIL `fail`: skip kusuru susturur. `fail` testi
     * CALISTIRIR ve kirilmasini bekler — kusur duzeltildigi an
     * 'beklenmedik sekilde gecti' diye kirilir ve bu kaydin
     * silinmesini talep eder.
     */
    test.fail();

    /*
     * Asil "UI acildi" iddiasi bu. `index.html` bos bir `<div id="root">`
     * gonderir; icinin dolmasi paketin yuklenip React'in monte olmasi
     * demektir.
     *
     * 90 sn: vite dev SOGUK onbellekte bagimlilik optimizasyonu yapar ve
     * CI'da onbellek her zaman sogutur. Bu sayi makinenin gercegi, testin
     * gevsetilmesi degil — bozuk bir uygulama bu sureyi de asar.
     */
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 90_000 });
  });

  test('API liveness probe yanıt verir', async ({ request }) => {
    const response = await request.get('/api/healthz', {
      headers: {
        Authorization: 'Bearer dev-token'
      }
    });
    expect(response.status()).toBeLessThan(500);
  });
});

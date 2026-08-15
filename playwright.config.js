export default {
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  /*
   * 120 sn: vite dev sunucusu SOGUK onbellekte modulleri istek aninda
   * derler ve ilk sayfa acilisi bu makinede 30 saniyelik varsayilani
   * asiyordu. Uygulama BOZUK DEGIL: ayni yol curl ile 0.49 sn'de HTTP
   * 200 donuyor. Yavaslik TARAYICIDA, modul grafinin yuklenmesinde.
   *
   * Siniri buyutmek bir gevsetme degil BIR OLCUMDUR: bozuk bir
   * uygulama bu sureyi de asar ve test yine kirilir.
   */
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  /*
   * URETIM PAKETI, dev sunucusu DEGIL.
   *
   * Onceki hali `npm run dev` kullaniyordu ve e2e YERELDE DUSUYORDU:
   * vite dev sunucusu modulleri istek aninda derler ve SOGUK bagimlilik
   * onbelleginde es zamanli modul istekleri 500 doner. Tarayici
   * gunlugu: /@vite/client, /src/main.tsx ve /@react-refresh ucu de
   * 500. Onbellek isindiktan sonra ayni yollar 200 donuyordu.
   *
   * CI'da onbellek HER ZAMAN soguktur, yani orada kalici olarak
   * kirilirdi. Uretim paketi bu sinifi tamamen kaldirir: derleme
   * onceden bitmistir, sunucu yalnizca statik dosya servis eder.
   *
   * Yan fayda: e2e artik kullanicinin GERCEKTEN aldigi paketi test
   * ediyor, gelistirici sunucusunu degil.
   *
   * `npm run test:e2e` build'i kendisi calistirir.
   */
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: { NODE_ENV: "production" },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
};

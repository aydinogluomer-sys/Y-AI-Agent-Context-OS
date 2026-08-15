/**
 * P19 / T2 — Entegrasyon testleri icin AYRI config.
 *
 * NEDEN AYRI
 *   Entegrasyon testleri saniyeler surer (83 migration, gercek sorgular);
 *   birim testleri milisaniye. Ayni suite'te kosturmak hizli geri
 *   bildirimi oldurur ve gelistirici testi calistirmayi birakir.
 *
 * NEDEN TEK THREAD
 *   Her test dosyasi kendi SEMASINDA calisir ama AYNI veritabanini
 *   paylasir. Paralel kosum baglanti havuzunu tuketir ve testler
 *   birbirinin zaman asimini tetikler. Izolasyon semadan gelir, hizdan
 *   degil.
 */
import { defineConfig } from "vitest/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";

const root = path.resolve(__dirname);

/*
 * .env.test yuklenir ama MEVCUT ortam degiskenlerini EZMEZ (dotenv
 * varsayilani, `override` verilmedi).
 *
 * Bu davranis CI icin zorunlu: workflow kendi DATABASE_URL'ini veriyor
 * (farkli host, parola ve veritabani adi). `.env.test` onu ezseydi CI
 * yerel bir konteynere baglanmaya calisir ve hata mesaji da yaniltici
 * olurdu.
 */
loadEnv({ path: path.join(root, ".env.test") });

export default defineConfig({
  resolve: {
    alias: {
      "@y/shared": path.resolve(root, "packages/shared/src/index.ts"),
      "@y/db": path.resolve(root, "packages/db/src/index.ts"),
      "@y/core": path.resolve(root, "packages/core/src/index.ts"),
      "@y/context/": path.resolve(root, "packages/context/src") + "/",
      "@y/context": path.resolve(root, "packages/context/src/index.ts"),
      "@y/graph/": path.resolve(root, "packages/graph/src") + "/",
      "@y/graph": path.resolve(root, "packages/graph/src/index.ts"),
      "@y/agents": path.resolve(root, "packages/agents/src/index.ts"),
      "@y/providers": path.resolve(root, "packages/providers/src/index.ts"),
      "@y/adapters": path.resolve(root, "packages/adapters/src/index.ts"),
      "@y/observability": path.resolve(root, "packages/observability/src/index.ts"),
      "@y/security/": path.resolve(root, "packages/security/src") + "/",
      "@y/security": path.resolve(root, "packages/security/src/index.ts")
    }
  },
  test: {
    globals: false,
    environment: "node",
    include: ["tests/integration/**/*.spec.ts", "tests/security/**/*.spec.ts"],
    // 83 migration + sema kurulumu 30 sn'yi asabilir.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
    reporters: ["default"],
    // Bir testin sessizce hic calismamasi, gecmesinden farksiz gorunmesin.
    passWithNoTests: false
  }
});

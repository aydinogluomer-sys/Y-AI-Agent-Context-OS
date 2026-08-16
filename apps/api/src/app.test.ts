/**
 * P01 / Y-P01-003 — App factory güvenlik kenarının testi.
 *
 * Bu testlerin her biri, P00 Truth Audit'in P1-6 bulgusunda listelenen bir
 * eksiği kapatır: helmet yok, CORS yapılandırması yok, rate limit yok,
 * body limiti yok, `X-Powered-By` açık, hata gövdesi stack sızdırıyor.
 *
 * Hepsi NEGATIF test: "olmaması gerekeni yapmayı dene".
 */

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createApp, installErrorHandler } from "./app";

function buildTestApp(overrides: Partial<Parameters<typeof createApp>[0]> = {}, isProduction = false) {
  const router = express.Router();
  router.get("/healthz", (_req, res) => res.json({ ok: true }));
  router.get("/ping", (_req, res) => res.json({ pong: true }));
  router.post("/echo", (req, res) => res.json({ received: req.body }));
  router.get("/boom", () => {
    throw new Error("iç detay: db parolası abc123");
  });

  const app = createApp({ apiRouter: router, isProduction, ...overrides });
  installErrorHandler(app, isProduction);
  return app;
}

describe("createApp — güvenlik başlıkları", () => {
  it("X-Powered-By başlığını sızdırmaz", async () => {
    const res = await request(buildTestApp()).get("/api/ping");
    expect(res.status).toBe(200);
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("helmet'in temel koruma başlıklarını gönderir", async () => {
    const res = await request(buildTestApp()).get("/api/ping");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
  });

  it("üretim modunda CSP ve HSTS uygular", async () => {
    const res = await request(buildTestApp({}, true)).get("/api/ping");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["strict-transport-security"]).toContain("max-age=31536000");
  });

  it("geliştirme modunda CSP uygulamaz (Vite HMR'ı bozmamak için)", async () => {
    const res = await request(buildTestApp({}, false)).get("/api/ping");
    expect(res.headers["content-security-policy"]).toBeUndefined();
  });
});

describe("createApp — correlation id", () => {
  it("yanıtta korelasyon id'si döndürür", async () => {
    const res = await request(buildTestApp()).get("/api/ping");
    expect(res.headers["x-correlation-id"]).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
  });

  it("istemcinin gönderdiği geçerli id'yi korur", async () => {
    const res = await request(buildTestApp()).get("/api/ping").set("x-correlation-id", "trace-abc_123");
    expect(res.headers["x-correlation-id"]).toBe("trace-abc_123");
  });

  it("beklenen karakter setinin dışındaki id'yi kabul etmez", async () => {
    // Not: gerçek CRLF enjeksiyonunu HTTP istemcisi zaten reddeder
    // (superagent "Invalid character in header content" fırlatır). Buradaki
    // vektör, geçerli bir header değeri olup log/izleme akışını kirletebilecek
    // içerik: boşluk, noktalı virgül, path parçası.
    const hostile = "abc; DROP TABLE runs -- ../../etc/passwd";
    const res = await request(buildTestApp()).get("/api/ping").set("x-correlation-id", hostile);
    expect(res.headers["x-correlation-id"]).not.toBe(hostile);
    expect(res.headers["x-correlation-id"]).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
  });

  it("aşırı uzun id'yi kabul etmez", async () => {
    const tooLong = "a".repeat(500);
    const res = await request(buildTestApp()).get("/api/ping").set("x-correlation-id", tooLong);
    expect(res.headers["x-correlation-id"]).not.toBe(tooLong);
    expect(res.headers["x-correlation-id"]!.length).toBeLessThanOrEqual(128);
  });
});

describe("createApp — body limiti (P1-6)", () => {
  it("limit altındaki gövdeyi kabul eder", async () => {
    const res = await request(buildTestApp({ bodyLimit: "1kb" }))
      .post("/api/echo")
      .send({ v: "x".repeat(100) });
    expect(res.status).toBe(200);
  });

  it("limiti aşan gövdeyi 413 ile reddeder", async () => {
    const res = await request(buildTestApp({ bodyLimit: "1kb" }))
      .post("/api/echo")
      .send({ v: "x".repeat(5_000) });
    expect(res.status).toBe(413);
  });
});

describe("createApp — rate limit (P1-6)", () => {
  it("pencere başına limit aşımında 429 döner", async () => {
    const app = buildTestApp({ rateLimit: { windowMs: 60_000, max: 3 } });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      codes.push((await request(app).get("/api/ping")).status);
    }
    expect(codes.filter((c) => c === 200).length).toBe(3);
    expect(codes.filter((c) => c === 429).length).toBe(2);
  });

  it("sağlık probe'larını rate limit dışında tutar", async () => {
    const app = buildTestApp({ rateLimit: { windowMs: 60_000, max: 2 } });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      codes.push((await request(app).get("/api/healthz")).status);
    }
    expect(codes.every((c) => c === 200)).toBe(true);
  });
});

describe("createApp — CORS allow-list", () => {
  it("allow-list'teki origin'e izin verir", async () => {
    const res = await request(buildTestApp({ corsOrigins: ["https://app.example.com"] }))
      .get("/api/ping")
      .set("Origin", "https://app.example.com");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");
  });

  it("allow-list dışındaki origin'i reddeder", async () => {
    const res = await request(buildTestApp({ corsOrigins: ["https://app.example.com"] }))
      .get("/api/ping")
      .set("Origin", "https://evil.example.com");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  /*
   * SAME-ORIGIN — bu testler bir URETIM HATASINI kapatiyor.
   *
   * Onceki CORS yapilandirmasi "same-origin isteklerde Origin yoktur"
   * varsayiyordu ve yalnizca `!origin` durumunu geciriyordu. Varsayim
   * YANLIS: `<script type="module">` ve `fetch()` AYNI KOKENDE bile
   * `Origin` gonderir.
   *
   * Sonuc: uretim paketi ACILMIYORDU. Tarayici modul script'i isterken
   * `Origin` gonderiyor, allow-list bos oldugu icin /assets/*.js HTTP
   * 500 + JSON hata donuyordu.
   *
   * Teshisi zorlastiran sey: curl ve HTTP istemcileri `Origin`
   * GONDERMEZ, o yuzden ayni yollar 200 donuyordu. Ayni URL, ayni
   * sunucu, ayni an: HTTP istemcisi 200, Chromium 500.
   */
  it("same-origin istek (Origin == Host) allow-list BOS olsa da geçer", async () => {
    const res = await request(buildTestApp({ corsOrigins: [] }))
      .get("/api/ping")
      .set("Origin", "http://127.0.0.1:1234")
      .set("Host", "127.0.0.1:1234");
    expect(res.status).toBe(200);
  });

  it("Origin YOKSA geçer (klasik gezinme)", async () => {
    const res = await request(buildTestApp({ corsOrigins: [] })).get("/api/ping");
    expect(res.status).toBe(200);
  });

  it("KONTROL: farklı host'tan gelen Origin allow-list boşken REDDEDİLİR", async () => {
    // Bu kontrol olmadan ustteki test, muhafiz HER Origin'i gecirse de
    // gecerdi — ve o zaman CORS hic calismiyor olurdu.
    const res = await request(buildTestApp({ corsOrigins: [] }))
      .get("/api/ping")
      .set("Origin", "http://evil.example")
      .set("Host", "127.0.0.1:1234");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("ayrıştırılamayan Origin REDDEDİLİR", async () => {
    const res = await request(buildTestApp({ corsOrigins: [] }))
      .get("/api/ping")
      .set("Origin", "bu-bir-url-degil")
      .set("Host", "127.0.0.1:1234");
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("installErrorHandler", () => {
  it("üretimde iç hata mesajını ve stack'i sızdırmaz", async () => {
    const res = await request(buildTestApp({}, true)).get("/api/boom");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("abc123");
    expect(JSON.stringify(res.body)).not.toContain("parolası");
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
  });

  it("hata yanıtına korelasyon id'si ekler", async () => {
    const res = await request(buildTestApp({}, true)).get("/api/boom");
    expect(res.body.error.correlationId).toBeTruthy();
  });

  it("geliştirmede hata mesajını gösterir (teşhis için)", async () => {
    const res = await request(buildTestApp({}, false)).get("/api/boom");
    expect(res.status).toBe(500);
    expect(res.body.error.message).toContain("iç detay");
  });
});

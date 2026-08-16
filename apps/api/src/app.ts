/**
 * P01 / Y-P01-003 — Kanonik Express app factory.
 *
 * P00 Truth Audit bulgusu (P1-6): `server.ts` doğrudan `express()` kuruyor ve
 * hiçbir güvenlik middleware'i yok — helmet yok, CORS yapılandırması yok,
 * rate limit yok, body size limiti yok (`express.json()` limitsiz).
 * Ayrıca error handler `GET /providers/health` route'undan ÖNCE kayıtlıydı,
 * yani o route'un hataları hiç yakalanmıyordu.
 *
 * Bu factory legacy router'ı olduğu gibi mount eder — davranış değişmez,
 * yalnız kenar sertleşir. Kanonik `/api/v1` yüzeyi P02'den itibaren eklenir.
 */

import express, { type Express, type Request, type Response, type NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { correlationId } from "./middleware/correlation";

export interface AppOptions {
  /** `/api` altına mount edilecek legacy router. */
  apiRouter: express.Router;
  /** Üretim modunda mı? CSP ve HSTS bu bayrağa göre sertleşir. */
  isProduction: boolean;
  /** CORS allow-list. Boşsa same-origin dışına izin verilmez. */
  corsOrigins?: string[];
  /** Body boyut limiti. Varsayılan 1mb. */
  bodyLimit?: string;
  /** Rate limit penceresi (ms) ve pencere başına istek sayısı. */
  rateLimit?: { windowMs: number; max: number };
}

/** Test ortamında limitleri gevşetiriz ama ASLA kapatmayız. */
const DEFAULT_RATE_LIMIT = { windowMs: 60_000, max: 300 };

export function createApp(options: AppOptions): Express {
  const app = express();
  const {
    apiRouter,
    isProduction,
    corsOrigins = [],
    bodyLimit = "1mb",
    rateLimit: rl = DEFAULT_RATE_LIMIT
  } = options;

  // Express'in kendi sürüm bilgisini sızdırmasını engelle.
  app.disable("x-powered-by");

  // Reverse proxy arkasında doğru istemci IP'si (rate limit için gerekli).
  app.set("trust proxy", isProduction ? 1 : false);

  app.use(correlationId());

  app.use(
    helmet({
      // Vite dev middleware inline script ve HMR websocket'i kullanır;
      // CSP yalnız üretimde uygulanır.
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:"],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"]
            }
          }
        : false,
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      crossOriginEmbedderPolicy: false
    })
  );

  /*
   * CORS — `Origin` VARLIGI cross-origin DEMEK DEGILDIR.
   *
   * Onceki hali "same-origin isteklerde Origin yoktur" varsayiyordu ve
   * yalnizca `!origin` durumunu geciriyordu. Bu varsayim YANLIS:
   * `<script type="module">` ve `fetch()` AYNI KOKENDE bile `Origin`
   * gonderir (sec-fetch-mode: cors).
   *
   * Sonuc: uretim paketi ACILMIYORDU. `index.html` modul script'ini
   * yukluyor, tarayici `Origin: http://localhost:3000` gonderiyor,
   * allow-list bos oldugu icin istek REDDEDILIYOR ve /assets/*.js
   * HTTP 500 + JSON hata donuyordu. React hic monte olmuyordu.
   *
   * Teshisi zorlastiran sey: `curl` ve HTTP istemcileri `Origin`
   * GONDERMEZ, o yuzden ayni yollar 200 donuyordu. Ayni URL, ayni
   * sunucu, ayni an: HTTP istemcisi 200, Chromium 500.
   *
   * Duzeltme: Origin'in host'u istegin kendi host'uyla ayniysa GECER.
   * Bu bir gevsetme DEGIL: same-origin istekler zaten tarayici
   * modelinde serbesttir; CORS CROSS-origin erisimi denetler. Ayrica
   * kendi host'umuzu taklit eden bir Origin, Origin'siz bir istegin
   * zaten alabilecegi seyden fazlasini alamaz.
   */
  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;
      const ayarlar = { credentials: true, maxAge: 600 };

      if (!origin) return callback(null, { ...ayarlar, origin: true });

      let ayniKoken = false;
      try {
        ayniKoken = new URL(origin).host === req.headers.host;
      } catch {
        ayniKoken = false; // ayristirilamayan Origin guvenilmez sayilir
      }

      if (ayniKoken || corsOrigins.includes(origin)) {
        return callback(null, { ...ayarlar, origin: true });
      }
      return callback(new Error("CORS_ORIGIN_NOT_ALLOWED"));
    })
  );

  // P1-6: body limiti yoktu — büyük gövde belleği tüketebiliyordu.
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: bodyLimit }));

  // Limiter TEK KEZ kurulur. Her istekte yeni instance yaratmak, her seferinde
  // yeni bir sayaç deposu oluşturduğu için limiti fiilen devre dışı bırakır.
  // Sağlık probe'ları `skip` ile dışarıda tutulur (load balancer sık çağırır).
  const limiter = rateLimit({
    windowMs: rl.windowMs,
    max: rl.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/api/health" || req.path === "/api/healthz" || req.path === "/api/readyz",
    message: {
      error: { code: "RATE_LIMITED", message: "Too many requests." }
    }
  });
  app.use(limiter);

  app.use("/api", apiRouter);

  return app;
}

/**
 * En son kaydedilmesi gereken hata yakalayıcı.
 *
 * Legacy `apps/api/src/index.ts` kendi error handler'ını L7137'de kaydediyor
 * ama `GET /providers/health` L7155'te — yani ondan SONRA. Bu üst düzey
 * yakalayıcı o boşluğu kapatır.
 */
export function installErrorHandler(app: Express, isProduction: boolean): void {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error & { statusCode?: number; code?: string }, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;

    const status = typeof err.statusCode === "number" ? err.statusCode : 500;
    const code = err.code || (status === 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED");

    // Üretimde stack trace ve iç mesaj sızdırılmaz.
    const message = isProduction && status === 500 ? "Internal server error." : err.message;

    res.status(status).json({
      error: {
        code,
        message,
        correlationId: (req as Request & { correlationId?: string }).correlationId
      }
    });
  });
}

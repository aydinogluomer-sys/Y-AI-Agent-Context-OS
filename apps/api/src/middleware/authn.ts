/**
 * P02 / Y-P02-001 — OIDC kimlik doğrulama (ADR-002).
 *
 * Neyin yerini alıyor (P00 Truth Audit):
 *
 *   P0-1  `GET /auth/dev-session` auth'suz olarak role:"admin",
 *         projectIds:["*"] taşıyan bir token dağıtıyordu.
 *   P0-3  HS256 imzalama anahtarı `JWT_SECRET || Y_API_AUTH_TOKEN` idi.
 *         `JWT_SECRET` yoksa paylaşımlı API bearer'ı JWT imzalama anahtarı
 *         oluyordu; token'a sahip olan `role:"admin"` içeren JWT üretebiliyordu.
 *   —     `auth.ts` el yazımı bir JWT doğrulayıcısıydı (jsonwebtoken/jose
 *         bağımlılığı bile yoktu).
 *   —     JWKS kodu yazılmıştı ama request path'i SENKRON doğrulayıcıyı
 *         çağırdığı için ölüydü; `.env.example`'daki JWKS_URI hiçbir şey yapmıyordu.
 *
 * Bu modülde:
 *   - Doğrulama `jose` ile ve ASENKRON yapılır.
 *   - Anahtar yalnız JWKS'ten gelir. Simetrik (HS*) algoritma KABUL EDİLMEZ:
 *     paylaşılan sır modeli, P0-3'ün kök nedeniydi.
 *   - JWKS URI allow-list'lidir (T-13).
 *   - JWKS erişilemezse 503 döner — açık kalmaz (fail-closed).
 */

import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import type { Principal, PrincipalKind } from "@y/shared";

/** Yalnız asimetrik algoritmalar. HS* bilerek dışarıda (P0-3). */
const ALLOWED_ALGORITHMS = ["RS256", "RS384", "RS512", "ES256", "ES384", "PS256"] as const;

export interface AuthnConfig {
  /** OIDC issuer (token'daki `iss` bununla eşleşmeli). */
  readonly issuer: string;
  /** Beklenen audience. */
  readonly audience: string;
  /** JWKS endpoint. Yalnız allow-list'teki host'lar kabul edilir. */
  readonly jwksUri: string;
  /** JWKS host allow-list. Boşsa `jwksUri`'nin kendi host'u kullanılır. */
  readonly jwksAllowedHosts?: readonly string[];
  /** Saat kayması toleransı (saniye). */
  readonly clockToleranceSec?: number;
}

export class AuthnConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthnConfigError";
  }
}

export type AuthnFailure =
  | { code: "AUTHENTICATION_REQUIRED"; status: 401; message: string }
  | { code: "INVALID_TOKEN"; status: 401; message: string }
  | { code: "IDENTITY_PROVIDER_UNAVAILABLE"; status: 503; message: string };

export interface AuthenticatedRequest extends Request {
  principal: Principal;
}

export type AuthnResult =
  | { ok: true; principal: Principal }
  | { ok: false; failure: AuthnFailure };

/**
 * Acik tip guard.
 *
 * Kok `tsconfig.json`'da `strict` kapali oldugu icin TypeScript
 * discriminated union'lari daraltmiyor (`if (!r.ok) r.failure` derlenmiyor).
 * Kanonik kod `tsconfig.strict.json` altinda strict derleniyor ama ayni
 * dosyalar legacy config tarafindan da goruluyor. Bu guard iki config'te de
 * calisir. P19'da (Y-P19-004) legacy config kalkinca gereksiz hale gelecek.
 */
export function isAuthnFailure(result: AuthnResult): result is { ok: false; failure: AuthnFailure } {
  return result.ok === false;
}

/**
 * JWKS URI'yi doğrular.
 *
 * T-13: saldırgan kontrolündeki bir JWKS endpoint'i, saldırganın kendi
 * anahtarıyla imzaladığı token'ları geçerli kılar. URI yapılandırmadan gelir
 * ama yine de host allow-list'inden geçirilir — yanlış yapılandırma da
 * bir saldırı yüzeyidir.
 */
export function assertJwksUriAllowed(jwksUri: string, allowedHosts?: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(jwksUri);
  } catch {
    throw new AuthnConfigError(`JWKS_URI gecerli bir URL degil: ${jwksUri}`);
  }

  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new AuthnConfigError(`JWKS_URI https olmali (yerel gelistirme disinda): ${jwksUri}`);
  }

  if (allowedHosts && allowedHosts.length > 0 && !allowedHosts.includes(url.host)) {
    throw new AuthnConfigError(
      `JWKS host allow-list disinda: ${url.host}. Izin verilenler: ${allowedHosts.join(", ")}`
    );
  }

  return url;
}

/** `sub`/`org_id` claim'lerinden Principal kurar. */
export function principalFromClaims(payload: JWTPayload): Principal {
  const sub = payload.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("Token `sub` claim'i tasimiyor.");
  }

  const orgId = payload.org_id ?? payload.organization_id;
  if (typeof orgId !== "string" || orgId.length === 0) {
    throw new Error("Token `org_id` claim'i tasimiyor; tenant kapsami cozulemez.");
  }

  const jti = payload.jti;
  if (typeof jti !== "string" || jti.length === 0) {
    // T-14: replay korumasi jti'ye bagli. Onsuz token kabul edilmez.
    throw new Error("Token `jti` claim'i tasimiyor; replay korumasi uygulanamaz.");
  }

  const rawKind = payload.principal_kind;
  const kind: PrincipalKind =
    rawKind === "service" || rawKind === "worker" ? rawKind : "user";

  return {
    sub,
    // userId, `users` tablosundan cozulur; authn asamasinda sub ile ayni
    // kabul edilir ve authz middleware'i gercek kaydi baglar.
    userId: sub,
    orgId,
    kind,
    tokenId: jti,
    expiresAt: typeof payload.exp === "number" ? payload.exp : 0
  };
}

/**
 * Bearer token'ı doğrular.
 *
 * ÖNEMLİ: rol veya proje listesi burada ÇÖZÜLMEZ. Bu bilinçlidir —
 * token'a gömülü yetki listesi iptal edilemez ve bayatlar (ADR-017).
 * Yetki `authz` middleware'inde DB'den okunur.
 */
export function createAuthn(config: AuthnConfig) {
  const jwksUrl = assertJwksUriAllowed(config.jwksUri, config.jwksAllowedHosts);
  const getKey: JWTVerifyGetKey = createRemoteJWKSet(jwksUrl, {
    cooldownDuration: 30_000,
    cacheMaxAge: 600_000
  });

  return async function authenticate(authorizationHeader: string | undefined): Promise<AuthnResult> {
    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      return {
        ok: false,
        failure: {
          code: "AUTHENTICATION_REQUIRED",
          status: 401,
          message: "Bearer token gerekli."
        }
      };
    }

    const token = authorizationHeader.slice("Bearer ".length).trim();
    if (token.length === 0) {
      return {
        ok: false,
        failure: { code: "AUTHENTICATION_REQUIRED", status: 401, message: "Bos bearer token." }
      };
    }

    try {
      const { payload } = await jwtVerify(token, getKey, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: [...ALLOWED_ALGORITHMS],
        clockTolerance: config.clockToleranceSec ?? 60,
        requiredClaims: ["sub", "exp", "iat", "jti"]
      });

      return { ok: true, principal: principalFromClaims(payload) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // JWKS'e ulasilamiyorsa bu bir KIMLIK HATASI DEGIL, altyapi hatasidir.
      // 401 dondurmek istemciyi yanlis yonlendirir; 503 dogru sinyaldir
      // ve `readyz` degraded'a duser (P18).
      if (/fetch|ENOTFOUND|ECONNREFUSED|timed out|JWKSNoMatchingKey|jwks/i.test(message)) {
        return {
          ok: false,
          failure: {
            code: "IDENTITY_PROVIDER_UNAVAILABLE",
            status: 503,
            message: "Kimlik saglayicisina ulasilamiyor."
          }
        };
      }

      return {
        ok: false,
        failure: { code: "INVALID_TOKEN", status: 401, message: "Token dogrulanamadi." }
      };
    }
  };
}

/** Express middleware sarmalayıcısı. */
export function authnMiddleware(config: AuthnConfig, publicPaths: readonly string[] = []) {
  const authenticate = createAuthn(config);
  const isPublic = (p: string) => publicPaths.some((allowed) => p === allowed);

  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    if (isPublic(req.path)) {
      next();
      return;
    }

    const result = await authenticate(req.headers.authorization);
    if (isAuthnFailure(result)) {
      res.status(result.failure.status).json({
        error: { code: result.failure.code, message: result.failure.message }
      });
      return;
    }

    (req as AuthenticatedRequest).principal = result.principal;
    next();
  };
}

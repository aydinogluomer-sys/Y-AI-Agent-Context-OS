/**
 * P02 / Y-P02-001 — OIDC authn güvenlik testleri.
 *
 * Master plan Appendix I: T-12 (JWT confusion), T-13 (JWKS attacks),
 * T-14 (replay). Her test P00'daki somut bir bulgunun regresyonudur.
 */

import { describe, it, expect } from "vitest";
import { SignJWT, generateKeyPair, exportJWK, type JWK } from "jose";
import { createServer, type Server } from "http";
import {
  assertJwksUriAllowed,
  principalFromClaims,
  createAuthn,
  isAuthnFailure,
  AuthnConfigError
} from "./authn";

// ---------------------------------------------------------------------------
// JWKS URI doğrulaması (T-13)
// ---------------------------------------------------------------------------

describe("assertJwksUriAllowed", () => {
  it("https URI'yi kabul eder", () => {
    expect(assertJwksUriAllowed("https://idp.example.com/.well-known/jwks.json").host).toBe(
      "idp.example.com"
    );
  });

  it("http URI'yi reddeder (yerel geliştirme hariç)", () => {
    expect(() => assertJwksUriAllowed("http://idp.example.com/jwks")).toThrow(AuthnConfigError);
  });

  it("localhost üzerinde http'ye izin verir (yerel IdP)", () => {
    expect(() => assertJwksUriAllowed("http://localhost:8080/jwks")).not.toThrow();
    expect(() => assertJwksUriAllowed("http://127.0.0.1:8080/jwks")).not.toThrow();
  });

  it("allow-list dışındaki host'u reddeder", () => {
    expect(() =>
      assertJwksUriAllowed("https://evil.example.com/jwks", ["idp.example.com"])
    ).toThrow(AuthnConfigError);
  });

  it("allow-list içindeki host'u kabul eder", () => {
    expect(() =>
      assertJwksUriAllowed("https://idp.example.com/jwks", ["idp.example.com"])
    ).not.toThrow();
  });

  it("geçersiz URL'i reddeder", () => {
    expect(() => assertJwksUriAllowed("bu bir url degil")).toThrow(AuthnConfigError);
  });
});

// ---------------------------------------------------------------------------
// Claim çözümü
// ---------------------------------------------------------------------------

describe("principalFromClaims", () => {
  const base = { sub: "u1", org_id: "org_a", jti: "j1", exp: 9999999999 };

  it("geçerli claim setinden Principal kurar", () => {
    const p = principalFromClaims(base);
    expect(p.sub).toBe("u1");
    expect(p.orgId).toBe("org_a");
    expect(p.tokenId).toBe("j1");
  });

  it("sub yoksa reddeder", () => {
    expect(() => principalFromClaims({ ...base, sub: undefined })).toThrow(/sub/);
  });

  it("org_id yoksa reddeder (tenant kapsamı çözülemez)", () => {
    expect(() => principalFromClaims({ ...base, org_id: undefined })).toThrow(/org_id/);
  });

  it("jti yoksa reddeder (T-14 replay koruması)", () => {
    expect(() => principalFromClaims({ ...base, jti: undefined })).toThrow(/jti/);
  });

  it("rol veya proje listesi TAŞIMAZ (ADR-017)", () => {
    const p = principalFromClaims({ ...base, role: "admin", project_ids: ["*"] });
    expect(Object.keys(p)).not.toContain("role");
    expect(Object.keys(p)).not.toContain("projectIds");
    // Token "admin" iddia etse bile Principal bunu tasimaz.
    expect(JSON.stringify(p)).not.toContain("admin");
  });
});

// ---------------------------------------------------------------------------
// Uçtan uca doğrulama — gerçek anahtar çifti + yerel JWKS sunucusu
// ---------------------------------------------------------------------------

interface Fixture {
  server: Server;
  jwksUri: string;
  sign: (claims: Record<string, unknown>, opts?: { alg?: string; kid?: string }) => Promise<string>;
  privateKey: CryptoKey;
  close: () => Promise<void>;
}

async function startJwksFixture(): Promise<Fixture> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk: JWK = await exportJWK(publicKey);
  jwk.kid = "test-key-1";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    server,
    jwksUri: `http://127.0.0.1:${port}/jwks`,
    privateKey: privateKey as unknown as CryptoKey,
    async sign(claims, opts = {}) {
      return new SignJWT(claims)
        .setProtectedHeader({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "test-key-1" })
        .setIssuedAt()
        .setIssuer("https://idp.test")
        .setAudience("y-api")
        .setExpirationTime("5m")
        .setJti("jti-" + Math.random().toString(16).slice(2))
        .sign(privateKey);
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}

describe("createAuthn — uçtan uca doğrulama", { timeout: 30_000 }, async () => {
  const fx = await startJwksFixture();

  const authenticate = createAuthn({
    issuer: "https://idp.test",
    audience: "y-api",
    jwksUri: fx.jwksUri
  });

  it("geçerli RS256 token'ı kabul eder", async () => {
    const token = await fx.sign({ sub: "u1", org_id: "org_a" });
    const r = await authenticate(`Bearer ${token}`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.principal.orgId).toBe("org_a");
  });

  it("Authorization header yoksa 401", async () => {
    const r = await authenticate(undefined);
    expect(isAuthnFailure(r)).toBe(true);
    if (isAuthnFailure(r)) expect(r.failure.status).toBe(401);
  });

  it("Bearer öneki olmayan header'ı reddeder", async () => {
    const r = await authenticate("Basic abc123");
    expect(isAuthnFailure(r)).toBe(true);
  });

  it("boş token'ı reddeder", async () => {
    const r = await authenticate("Bearer    ");
    expect(isAuthnFailure(r)).toBe(true);
  });

  it("bozuk imzalı token'ı reddeder", async () => {
    const token = await fx.sign({ sub: "u1", org_id: "org_a" });
    const tampered = token.slice(0, -4) + "AAAA";
    const r = await authenticate(`Bearer ${tampered}`);
    expect(isAuthnFailure(r)).toBe(true);
    if (isAuthnFailure(r)) expect(r.failure.code).toBe("INVALID_TOKEN");
  });

  it("alg:none token'ını reddeder (T-12)", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "u1", org_id: "org_a", jti: "x", iss: "https://idp.test", aud: "y-api", exp: 9999999999 })
    ).toString("base64url");
    const r = await authenticate(`Bearer ${header}.${payload}.`);
    expect(isAuthnFailure(r)).toBe(true);
  });

  it("HS256 ile imzalanmış token'ı reddeder (P0-3 regresyonu)", async () => {
    // P00 bulgusu: JWT_SECRET yoksa paylasimli API bearer'i HS256 imzalama
    // anahtari oluyordu. Simetrik algoritmalar artik hic kabul edilmiyor.
    const secret = new TextEncoder().encode("paylasimli-api-token-degeri");
    const token = await new SignJWT({ sub: "attacker", org_id: "org_a", role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("https://idp.test")
      .setAudience("y-api")
      .setExpirationTime("5m")
      .setJti("forged")
      .sign(secret);

    const r = await authenticate(`Bearer ${token}`);
    expect(isAuthnFailure(r)).toBe(true);
  });

  it("yanlış issuer'ı reddeder", async () => {
    const token = await new SignJWT({ sub: "u1", org_id: "org_a" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuedAt()
      .setIssuer("https://baska-idp.test")
      .setAudience("y-api")
      .setExpirationTime("5m")
      .setJti("j")
      .sign(fx.privateKey as any);
    const r = await authenticate(`Bearer ${token}`);
    expect(isAuthnFailure(r)).toBe(true);
  });

  it("yanlış audience'ı reddeder", async () => {
    const token = await new SignJWT({ sub: "u1", org_id: "org_a" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuedAt()
      .setIssuer("https://idp.test")
      .setAudience("baska-api")
      .setExpirationTime("5m")
      .setJti("j")
      .sign(fx.privateKey as any);
    const r = await authenticate(`Bearer ${token}`);
    expect(isAuthnFailure(r)).toBe(true);
  });

  it("süresi geçmiş token'ı reddeder", async () => {
    const token = await new SignJWT({ sub: "u1", org_id: "org_a" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setIssuer("https://idp.test")
      .setAudience("y-api")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .setJti("j")
      .sign(fx.privateKey as any);
    const r = await authenticate(`Bearer ${token}`);
    expect(isAuthnFailure(r)).toBe(true);
  });

  it("jti taşımayan token'ı reddeder (T-14)", async () => {
    const token = await new SignJWT({ sub: "u1", org_id: "org_a" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
      .setIssuedAt()
      .setIssuer("https://idp.test")
      .setAudience("y-api")
      .setExpirationTime("5m")
      .sign(fx.privateKey as any);
    const r = await authenticate(`Bearer ${token}`);
    expect(isAuthnFailure(r)).toBe(true);
  });

  it("org_id taşımayan token'ı reddeder", async () => {
    const token = await fx.sign({ sub: "u1" });
    const r = await authenticate(`Bearer ${token}`);
    expect(isAuthnFailure(r)).toBe(true);
  });

  it("JWKS erişilemezse 401 değil 503 döner", async () => {
    await fx.close();
    const token = await fx.sign({ sub: "u1", org_id: "org_a" });
    const offline = createAuthn({
      issuer: "https://idp.test",
      audience: "y-api",
      jwksUri: "http://127.0.0.1:1/jwks"
    });
    const r = await offline(`Bearer ${token}`);
    expect(isAuthnFailure(r)).toBe(true);
    if (isAuthnFailure(r)) {
      expect(r.failure.status).toBe(503);
      expect(r.failure.code).toBe("IDENTITY_PROVIDER_UNAVAILABLE");
    }
  });
});

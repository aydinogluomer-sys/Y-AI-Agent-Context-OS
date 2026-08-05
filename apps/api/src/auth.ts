import crypto from "crypto";

export type ApiAuthRole = "admin" | "developer" | "reviewer";

export interface ApiAuthPrincipal {
  actorId: string;
  role: ApiAuthRole;
  projectIds: string[];
  organizationId?: string;
  authenticationType: "configured_bearer" | "development_session" | "jwt_token";
}

export interface ApiAuthRuntime {
  environment: "development" | "production" | "test";
  mockDatabaseEnabled: boolean;
  configuredToken: string;
  configuredPrincipal: ApiAuthPrincipal;
  developmentToken: string | null;
  developmentPrincipal: ApiAuthPrincipal | null;
}

export interface AuthenticationResult {
  ok: boolean;
  status: 200 | 401 | 403 | 503;
  code: string;
  message: string;
  principal?: ApiAuthPrincipal;
}

const jwksKeyCache = new Map<string, { cert: string; fetchedAt: number }>();

export async function fetchJwksPublicKey(jwksUri?: string, kid?: string): Promise<string | null> {
  const targetUri = jwksUri || process.env.OIDC_JWKS_URI || process.env.JWKS_URI;

  if (kid && jwksKeyCache.has(kid)) {
    const cached = jwksKeyCache.get(kid)!;
    if (Date.now() - cached.fetchedAt < 600000) {
      return cached.cert;
    }
  }

  const staticKey = (process.env.JWT_PUBLIC_KEY || process.env.JWT_RS256_PUBLIC_KEY || "").trim();
  if (staticKey) {
    return staticKey;
  }

  if (!targetUri) {
    return null;
  }

  try {
    const response = await fetch(targetUri, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { keys?: Array<any> };
    if (!body || !Array.isArray(body.keys)) return null;

    for (const key of body.keys) {
      if (key.kty === "RSA" && Array.isArray(key.x5c) && key.x5c[0]) {
        const cert = `-----BEGIN CERTIFICATE-----\n${key.x5c[0].match(/.{1,64}/g)?.join("\n")}\n-----END CERTIFICATE-----`;
        const keyId = key.kid || "default";
        jwksKeyCache.set(keyId, { cert, fetchedAt: Date.now() });
      }
    }

    if (kid && jwksKeyCache.has(kid)) {
      return jwksKeyCache.get(kid)!.cert;
    }
    if (jwksKeyCache.size > 0) {
      return jwksKeyCache.values().next().value.cert;
    }
  } catch {
    // Return null if offline or fetch fails
  }

  return null;
}

function parseRole(value: string | undefined): ApiAuthRole {
  if (value === "admin" || value === "reviewer") return value;
  return "developer";
}

function parseProjectIds(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeTokenEqual(received: string, expected: string): boolean {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function createApiAuthRuntime(
  environment: ApiAuthRuntime["environment"],
  mockDatabaseEnabled: boolean,
  env: NodeJS.ProcessEnv = process.env
): ApiAuthRuntime {
  const configuredToken = (env.Y_API_AUTH_TOKEN || "").trim();
  const configuredPrincipal: ApiAuthPrincipal = {
    actorId: (env.Y_API_AUTH_ACTOR || "api-operator").trim(),
    role: parseRole(env.Y_API_AUTH_ROLE),
    projectIds: parseProjectIds(env.Y_API_AUTH_PROJECTS),
    authenticationType: "configured_bearer",
  };

  const developmentEnabled = environment !== "production" && mockDatabaseEnabled;
  const developmentToken = developmentEnabled
    ? crypto.randomBytes(32).toString("hex")
    : null;

  return {
    environment,
    mockDatabaseEnabled,
    configuredToken,
    configuredPrincipal,
    developmentToken,
    developmentPrincipal: developmentEnabled
      ? {
          actorId: "local-development-operator",
          role: "admin",
          projectIds: ["*"],
          authenticationType: "development_session",
        }
      : null,
  };
}

export function authenticateBearerHeader(
  authorizationHeader: string | undefined,
  runtime: ApiAuthRuntime
): AuthenticationResult {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
      message: "A Bearer authentication token is required.",
    };
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
      message: "A non-empty Bearer authentication token is required.",
    };
  }

  if (
    runtime.developmentToken &&
    runtime.developmentPrincipal &&
    safeTokenEqual(token, runtime.developmentToken)
  ) {
    return {
      ok: true,
      status: 200,
      code: "AUTHENTICATED",
      message: "Development session authenticated.",
      principal: runtime.developmentPrincipal,
    };
  }

  if (
    runtime.configuredToken &&
    safeTokenEqual(token, runtime.configuredToken)
  ) {
    return {
      ok: true,
      status: 200,
      code: "AUTHENTICATED",
      message: "Configured API operator authenticated.",
      principal: runtime.configuredPrincipal,
    };
  }

  // Cryptographic JWT Verification (P0-01)
  if (token.startsWith("ey") && token.includes(".")) {
    try {
      const parts = token.split(".");
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const headerJson = Buffer.from(parts[0], "base64url").toString("utf-8");
        const header = JSON.parse(headerJson);

        // P0-01: Hard reject 'alg: none' or unsupported algorithms
        if (!header.alg || header.alg.toLowerCase() === "none" || (header.alg !== "HS256" && header.alg !== "RS256")) {
          return {
            ok: false,
            status: 401,
            code: "UNSUPPORTED_JWT_ALGORITHM",
            message: "JWT tokens with 'alg: none' or unsupported algorithms are strictly rejected.",
          };
        }

        const jwtSecret = (process.env.JWT_SECRET || process.env.Y_API_AUTH_TOKEN || "").trim();
        const jwtPublicKey = (process.env.JWT_PUBLIC_KEY || process.env.JWT_RS256_PUBLIC_KEY || "").trim();

        if (header.alg === "HS256") {
          if (!jwtSecret) {
            return {
              ok: false,
              status: 503,
              code: "JWT_SECRET_NOT_CONFIGURED",
              message: "JWT HS256 signature validation secret is not configured on the server.",
            };
          }
          const expectedSig = crypto
            .createHmac("sha256", jwtSecret)
            .update(`${parts[0]}.${parts[1]}`)
            .digest("base64url");

          if (!crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expectedSig))) {
            return {
              ok: false,
              status: 401,
              code: "INVALID_JWT_SIGNATURE",
              message: "JWT HMAC-SHA256 signature verification failed.",
            };
          }
        } else if (header.alg === "RS256") {
          const rsaPublicKey = jwtPublicKey;
          if (!rsaPublicKey) {
            return {
              ok: false,
              status: 503,
              code: "RS256_PUBLIC_KEY_NOT_CONFIGURED",
              message: "JWT RS256 public key is not configured on the server. Unverified RS256 tokens are strictly rejected.",
            };
          }
          try {
            const verifier = crypto.createVerify("SHA256");
            verifier.update(`${parts[0]}.${parts[1]}`);
            const isValidSig = verifier.verify(rsaPublicKey, Buffer.from(parts[2], "base64url"));
            if (!isValidSig) {
              return {
                ok: false,
                status: 401,
                code: "INVALID_RS256_SIGNATURE",
                message: "JWT RS256 cryptographic signature verification failed.",
              };
            }
          } catch {
            return {
              ok: false,
              status: 401,
              code: "RS256_VERIFICATION_ERROR",
              message: "Failed to verify RS256 JWT signature against configured public key.",
            };
          }
        }

        const payloadJson = Buffer.from(parts[1], "base64url").toString("utf-8");
        const claims = JSON.parse(payloadJson);
        const nowSeconds = Math.floor(Date.now() / 1000);

        // P0-01: Expiration check (exp)
        if (!claims.exp || typeof claims.exp !== "number") {
          return {
            ok: false,
            status: 401,
            code: "MISSING_JWT_EXPIRATION",
            message: "JWT authentication token must contain a valid numeric 'exp' claim.",
          };
        }
        if (claims.exp < nowSeconds) {
          return {
            ok: false,
            status: 401,
            code: "EXPIRED_AUTHENTICATION_TOKEN",
            message: "The supplied JWT authentication token has expired.",
          };
        }

        // P0-01: Not before check (nbf)
        if (claims.nbf && typeof claims.nbf === "number" && claims.nbf > nowSeconds) {
          return {
            ok: false,
            status: 401,
            code: "TOKEN_NOT_YET_VALID",
            message: "The supplied JWT authentication token is not yet valid (nbf check failed).",
          };
        }

        // P0-01: Issuer check (iss)
        const expectedIssuer = (process.env.EXPECTED_JWT_ISSUER || "").trim();
        if (expectedIssuer && claims.iss !== expectedIssuer) {
          return {
            ok: false,
            status: 401,
            code: "INVALID_JWT_ISSUER",
            message: `JWT issuer '${claims.iss}' does not match expected issuer '${expectedIssuer}'.`,
          };
        }

        // P0-01: Audience check (aud)
        const expectedAudience = (process.env.EXPECTED_JWT_AUDIENCE || "").trim();
        if (expectedAudience) {
          const audArray = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
          if (!audArray.includes(expectedAudience)) {
            return {
              ok: false,
              status: 401,
              code: "INVALID_JWT_AUDIENCE",
              message: `JWT audience does not include expected audience '${expectedAudience}'.`,
            };
          }
        }

        // P0-01: Subject presence check (sub)
        if (!claims.sub) {
          return {
            ok: false,
            status: 401,
            code: "MISSING_JWT_SUBJECT",
            message: "JWT authentication token must contain a valid 'sub' claim.",
          };
        }

        // Sanitize project_ids: filter out wildcard "*" to prevent unverified global access
        const rawProjectIds = Array.isArray(claims.project_ids) ? claims.project_ids : parseProjectIds(claims.project_ids);
        const sanitizedProjectIds = rawProjectIds.filter((p: string) => p !== "*");

        const jwtPrincipal: ApiAuthPrincipal = {
          actorId: String(claims.sub),
          role: parseRole(claims.role),
          projectIds: sanitizedProjectIds,
          organizationId: claims.org_id ? String(claims.org_id) : undefined,
          authenticationType: "jwt_token",
        };

        return {
          ok: true,
          status: 200,
          code: "AUTHENTICATED",
          message: "Cryptographically verified JWT principal token authenticated.",
          principal: jwtPrincipal,
        };
      }
    } catch {
      return {
        ok: false,
        status: 401,
        code: "INVALID_JWT_FORMAT",
        message: "The supplied Bearer token is not a valid JWT format.",
      };
    }
  }

  if (runtime.environment === "production" && !runtime.configuredToken) {
    return {
      ok: false,
      status: 503,
      code: "AUTHENTICATION_NOT_CONFIGURED",
      message: "Production API authentication is not configured.",
    };
  }

  return {
    ok: false,
    status: 401,
    code: "INVALID_AUTHENTICATION_TOKEN",
    message: "The supplied Bearer token is invalid.",
  };
}

export async function validateApiAuthTokenAsync(
  authorizationHeader: string | undefined,
  runtime: ApiAuthRuntime = getApiAuthRuntime()
): Promise<AuthenticationResult> {
  if (authorizationHeader && authorizationHeader.startsWith("Bearer ")) {
    const token = authorizationHeader.slice("Bearer ".length).trim();
    if (token.startsWith("ey") && token.includes(".")) {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const headerJson = Buffer.from(parts[0], "base64url").toString("utf-8");
          const header = JSON.parse(headerJson);
          if (header && header.alg === "RS256" && !process.env.JWT_PUBLIC_KEY && !process.env.JWT_RS256_PUBLIC_KEY) {
            await fetchJwksPublicKey(undefined, header.kid);
          }
        }
      } catch {
        // ignore parse error here, main validator reports appropriate error
      }
    }
  }
  return authenticateBearerHeader(authorizationHeader, runtime);
}

export function principalCanAccessProject(
  principal: ApiAuthPrincipal,
  projectId: string
): boolean {
  return (
    principal.projectIds.includes("*") ||
    principal.projectIds.includes(projectId)
  );
}

export async function principalCanAccessProjectAsync(
  principal: ApiAuthPrincipal,
  projectId: string,
  queryDbFn?: (sql: string, params: any[]) => Promise<any>
): Promise<boolean> {
  if (principal.projectIds.includes("*") || principal.projectIds.includes(projectId)) {
    return true;
  }
  if (queryDbFn && principal.actorId) {
    try {
      const res = await queryDbFn(
        "SELECT 1 FROM project_memberships WHERE project_id = $1 AND user_id = $2 LIMIT 1;",
        [projectId, principal.actorId]
      );
      if (res && res.rowCount && res.rowCount > 0) {
        return true;
      }
    } catch {
      // ignore missing table in test environment
    }
  }
  return false;
}

export function getAuditActor(req: any): string {
  if (req && req.authPrincipal && req.authPrincipal.actorId) {
    return req.authPrincipal.actorId;
  }
  return "system-principal";
}


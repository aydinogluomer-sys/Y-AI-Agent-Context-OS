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
        if (header.alg === "HS256") {
          if (!jwtSecret) {
            return {
              ok: false,
              status: 503,
              code: "JWT_SECRET_NOT_CONFIGURED",
              message: "JWT signature validation secret is not configured on the server.",
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
              message: "JWT cryptographic signature verification failed.",
            };
          }
        }

        const payloadJson = Buffer.from(parts[1], "base64url").toString("utf-8");
        const claims = JSON.parse(payloadJson);

        // P0-01: Expiration check (exp)
        if (claims.exp && typeof claims.exp === "number") {
          const nowSeconds = Math.floor(Date.now() / 1000);
          if (claims.exp < nowSeconds) {
            return {
              ok: false,
              status: 401,
              code: "EXPIRED_AUTHENTICATION_TOKEN",
              message: "The supplied JWT authentication token has expired.",
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

        const jwtPrincipal: ApiAuthPrincipal = {
          actorId: String(claims.sub),
          role: parseRole(claims.role),
          projectIds: Array.isArray(claims.project_ids) ? claims.project_ids : parseProjectIds(claims.project_ids),
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

export function principalCanAccessProject(
  principal: ApiAuthPrincipal,
  projectId: string
): boolean {
  return (
    principal.projectIds.includes("*") ||
    principal.projectIds.includes(projectId)
  );
}


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

  // Support structured JWT token payload parsing if token is 3-part base64
  if (token.startsWith("ey") && token.includes(".")) {
    try {
      const parts = token.split(".");
      if (parts.length === 3 && parts[1]) {
        const payloadJson = Buffer.from(parts[1], "base64url").toString("utf-8");
        const claims = JSON.parse(payloadJson);
        if (claims && claims.sub) {
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
            message: "JWT user principal token authenticated.",
            principal: jwtPrincipal,
          };
        }
      }
    } catch {
      // Invalid JWT format, fallback to standard token check
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


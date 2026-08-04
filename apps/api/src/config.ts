/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from "dotenv";
import { redactSecretLeaks } from "@y/security";

dotenv.config();

export interface ApiConfiguration {
  port: number;
  environment: "development" | "production" | "test";
  geminiApiKey: string;
  appUrl: string;
  databaseUrl: string;
  tokenBudgetLimit: number;
}

/**
 * Strongly typed and safe config loader.
 * Guarantees zero unredacted secret leaks in configuration inspection pipelines.
 */
export function cleanDatabaseUrlBrackets(url: string | undefined): string {
  if (!url) return "";
  const atIndex = url.lastIndexOf("@");
  if (atIndex !== -1) {
    const credsAndScheme = url.slice(0, atIndex);
    const hostAndDb = url.slice(atIndex);
    const schemeEnd = credsAndScheme.indexOf("://");
    if (schemeEnd !== -1) {
      const scheme = credsAndScheme.slice(0, schemeEnd + 3);
      const rest = credsAndScheme.slice(schemeEnd + 3);
      const colonIndex = rest.indexOf(":");
      if (colonIndex !== -1) {
        const username = rest.slice(0, colonIndex);
        let password = rest.slice(colonIndex + 1);
        if (password.startsWith("[") && password.endsWith("]")) {
          password = password.slice(1, -1);
        }
        return `${scheme}${username}:${password}${hostAndDb}`;
      }
    }
  }
  return url;
}

export function resolveDatabaseUrl(
  environment: "development" | "production" | "test",
  env: NodeJS.ProcessEnv = process.env
): string {
  if (env.DATABASE_URL?.trim()) return env.DATABASE_URL.trim();
  if (environment === "production") return "";
  return "postgresql://y_user:safe_pass@localhost:5432/y_vault";
}

export function loadApiConfiguration(): ApiConfiguration {
  const rawPort = process.env.PORT || "3000";
  const processedPort = parseInt(rawPort, 10);
  
  const env = (process.env.NODE_ENV || "development") as "development" | "production" | "test";
  const geminiKey = process.env.GEMINI_API_KEY || "MY_GEMINI_API_KEY";
  const url = process.env.APP_URL || "https://ais-dev-fbm5o4iajae4h6eewk6wvd-339796942725.europe-west2.run.app";
  let dbUrl = resolveDatabaseUrl(env, process.env);
  
  dbUrl = cleanDatabaseUrlBrackets(dbUrl);
  
  // Avoid replacing direct connection port to keep stable connection to port 5432
  if (dbUrl.includes("supabase.co:5432")) {
    // Keep direct port 5432
  }
  
  return {
    port: isNaN(processedPort) ? 3000 : processedPort,
    environment: env,
    geminiApiKey: geminiKey,
    appUrl: url,
    databaseUrl: dbUrl,
    tokenBudgetLimit: 150000,
  };
}

/**
 * Safe settings viewer with redaction wrapper.
 */
export function inspectSafeConfig(config: ApiConfiguration): Record<string, any> {
  return {
    port: config.port,
    environment: config.environment,
    appUrl: config.appUrl,
    tokenBudgetLimit: config.tokenBudgetLimit,
    databaseUrl: redactSecretLeaks(config.databaseUrl),
    geminiApiKey: config.geminiApiKey === "MY_GEMINI_API_KEY" ? "NOT_SET" : "[REDACTED_API_KEY_PRESENT]",
  };
}

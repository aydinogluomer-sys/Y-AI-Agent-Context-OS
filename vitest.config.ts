/**
 * P01 / ADR-011 — vitest.
 *
 * Repo'da daha önce hiçbir unit test framework'ü yoktu; "testler" 15.000 satırlık
 * el yazımı script'lerdi ve DB yokken atlayıp yine de exit 0 dönüyorlardı
 * (P00 audit: 52 adet `assert("...", true)`, 36 skip-then-pass bulgusu).
 *
 * Kural: burada koşan hiçbir test bağımlılık eksikliğinde "atlayıp geçemez".
 * Skip = failure (master plan Appendix H.1).
 */

import { defineConfig } from "vitest/config";
import * as path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@y/shared": path.resolve(root, "packages/shared/src/index.ts"),
      "@y/core": path.resolve(root, "packages/core/src/index.ts"),
      "@y/context": path.resolve(root, "packages/context/src/index.ts"),
      "@y/graph": path.resolve(root, "packages/graph/src/index.ts"),
      "@y/agents": path.resolve(root, "packages/agents/src/index.ts"),
      "@y/providers": path.resolve(root, "packages/providers/src/index.ts"),
      "@y/security": path.resolve(root, "packages/security/src/index.ts"),
      "@y/api": path.resolve(root, "apps/api/src"),
      "@y/web": path.resolve(root, "apps/web/src"),
      "@": root
    }
  },
  test: {
    globals: false,
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
    reporters: ["default"],
    // Bir testin sessizce hiç çalışmaması, geçmesinden farksız görünmesin.
    passWithNoTests: false
  }
});

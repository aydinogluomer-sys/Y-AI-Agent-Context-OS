# 08 — Test Inventory

## Automated Test Suites

1. `npm run typecheck` (`tsc --noEmit`): Full monorepo typecheck across all apps and packages.
2. `npm run test:deterministic` (`scripts/run-validation-suite.ts deterministic`): Executes 11 test modules (Stage 27 through 35, Core Vault, CAS Integrity, ABAC Matrix, Redactor). 162 total assertions, 0 failures.
3. `npm run test:db` (`scripts/run-validation-suite.ts db`): Runs PostgreSQL integration tests against live DB connection string.
4. `npm run build`: Production build bundle verification (Vite Client + Vite SSR Server).

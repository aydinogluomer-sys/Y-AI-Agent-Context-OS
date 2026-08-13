> ⚠️ **SUPERSEDED** — Bu belgedeki durum iddialari (PASS / verified / implemented / complete)
> 2026-08-13 Truth Audit ile gecersizdir. Guncel olculmus gercek icin bkz.
> [`docs/audit/2026-08-13-truth-audit/`](audit/2026-08-13-truth-audit/) ve
> [master plan](Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md).
> Bu banner P20'de (Y-P20-010) celiskiler kapatildiginda kaldirilacaktir.

# 05 — Policy Inventory

- **ABAC Evaluation Engine**: `PermissionKernelService.ts`
- **Default Action**: `DEFAULT_DENY`
- **Role Profiles**:
  - `developer`: Allowed code read/write on allowed paths, task transition, artifact upload. Restricted from admin DB reset and policy override.
  - `ci-cd`: Allowed automated test execution, QA artifact verification, release sign-off audit logging.
  - `admin`: Full administrative access with mandatory audit log emission.
- **Path Guard**: `PathTraversalGuard.ts` enforces `canonicalizePath` and prevents `../` or symlink escape outside `project_root`.
- **Secret Redactor**: `SecretRedactor.ts` strips passwords, JWT tokens, AWS/GCP API keys before logging or packing context.

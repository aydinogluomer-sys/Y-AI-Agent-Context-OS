# 05 — Policy Inventory

- **ABAC Evaluation Engine**: `PermissionKernelService.ts`
- **Default Action**: `DEFAULT_DENY`
- **Role Profiles**:
  - `developer`: Allowed code read/write on allowed paths, task transition, artifact upload. Restricted from admin DB reset and policy override.
  - `ci-cd`: Allowed automated test execution, QA artifact verification, release sign-off audit logging.
  - `admin`: Full administrative access with mandatory audit log emission.
- **Path Guard**: `PathTraversalGuard.ts` enforces `canonicalizePath` and prevents `../` or symlink escape outside `project_root`.
- **Secret Redactor**: `SecretRedactor.ts` strips passwords, JWT tokens, AWS/GCP API keys before logging or packing context.

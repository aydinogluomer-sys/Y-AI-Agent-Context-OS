---
name: y-os-security-policy
description: "Directs ABAC rule evaluation, RepoAdapter whitelisting, path traversal protection, and automated credentials redaction for Y-OS."
---

# Y-OS Security Policy Skill

This skill documents requirements for enforcing execution boundaries, checking access permissions, and scrubbing private credentials.

## 1. Access Boundary Enforcement

* **Default-Deny Policy**: Any access request is blocked by default unless whitelisted by an ABAC policy.
* **Path Traversal Shield**: Prevent folder traversal checks (`../`). Intercept traversal attempts at the `RepoAdapter` layer.
* **Lock Verification**: Confirm the target file is not leased by another active task process before issuing write leases.
* See [PermissionKernelService.ts](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/apps/api/src/PermissionKernelService.ts) and [FileLockingService.ts](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/apps/api/src/FileLockingService.ts) for implementation details.

## 2. Credentials Redaction Scanners

* Scan all text outputs (logs, planning summaries, database columns) using regex patterns.
* Replace Bearer tokens, private keys, database passwords, and absolute directories with a `[REDACTED]` mask on the fly.

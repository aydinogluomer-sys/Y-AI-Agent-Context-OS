# Y-OS Permission Kernel Security Audit Map

This architectural document maps the active **Permission Kernel (ABAC)** controls against existing API security goals. Stage 34 is a recorded audit baseline, not an active code freeze.

---

## 1. Permission Kernel Scope

The Permission Kernel (`PermissionKernelService.ts`) is the central authorization enforcement guard of Y-OS. It intercepts all service accesses and API requests, validating permissions based on contextual metadata, project scopes, and active task boundaries.

The mechanism runs completely in-memory utilizing static or database-loaded rules, falling back safely to static local definitions in case of database access outages.

---

## 2. Dynamic Authorization Model

### Subject-Resource-Action (SRA) Model

Evaluating a permission request requires verifying a combined tuple:

* **Subject:** The actor initiating the request. Represented as a subject type (e.g., `user`, `worker`, `agent_session`, `system`) combined with context IDs (e.g., `projectId`, `taskId`, `workerId`).
* **Resource:** The target entity being accessed. Resource classifications include `context_object`, `file_lock`, `evidence_record`, `event_record`, `index_job`, and `cas_blob`. Inside queries, the resources always point to logical resource paths.
* **Action:** The operational request being executed. Standardized operations: `read`, `write`, `enforce`, `claim`, `append`, `verify`.

### Policy Evaluation Rules

#### Default-Deny Constraint

The Permission Kernel is structured as a closed default-deny firewall. Unless an explicit, enabled policy rule specifically pairs the subject, resource scope, and action to authorize access, the service rejects the request immediately by throwing a `PermissionDeniedError` (returning HTTP 403 Forbidden).

#### Deny-Overrides-Allow Principle

In cases where multiple policies are applicable to the evaluation target, **DENY effects override ALLOW policies**. If any active matching policy has an effect set to `deny`, the final outcome is hard-denied regardless of any permissive allow policies.

#### Administrative Override (Bypass) Rule

Certain system-critical recovery actions permit administrators to bypass active controls. This override requires:

1. An explicit administrative subject profile.
2. An active, non-empty text string passing a logical **rationale**.
3. Rejection of credential-based or token-based triggers (local-only parameter checks to prevent automated API reuse).
4. Automated emission of `PERMISSION_BYPASS_USED` telemetry rows inside high-severity audit tables.

---

## 3. Boundary Checks & Scoping Enforcements

The Permission Kernel enforces strict physical partition barriers over the three distinct logical layers:

### Project Partition Boundaries

* *Mechanism:* Every payload, query context, or metadata write must declare a `projectId`. The check compares the active session `projectId` parameter with the resource `projectId`. Crossing partitions forces an immediate, un-catchable authorization failure.
* *Prevention:* Restricts vertical data leaks in multi-project tenancies.

### Task Execution Boundaries

* *Mechanism:* Tasks are assigned strict allowed-file globs and forbidden-file globs upon instantiation.
* *rejection:* Attempting edits or reads on targets falling within a task's forbidden pathing maps or completely outside its active bounds returns a boundary violation.

### Worker & Distributed Queue Boundaries

* *Mechanism:* Local worker nodes claim queued jobs and file locks. The kernel matches processing worker IDs with locked entity parameters.
* *rejection:* Workers are blocked from claiming and modifying job records belonging to project scopes they are not registered under.

### Resource Sensitivity & Redaction Checks

* *Mechanism:* Resource paths are normalized to eliminate traversal inputs. System files (e.g., `.env`, credentials) are designated as sensitive resources.
* *rejection:* Access triggers a default deny unless explicit, highly restricted policy parameters authorize the subject type.

---

## 4. Protected API Categories

The Permission Kernel shields the following primary express endpoints and backend service layers:

| API Router Category | Protected Resources | Enforced Permission Policy (Verify exact ID in repo) |
| :--- | :--- | :--- |
| **Context Ingestion** | `context_items` & `context_objects` | `policy-user-read-write-context` / `policy-admin-all` |
| **Repository Access** | Project local file pathways | `policy-repo-filesystem-read-write` |
| **Task Lifecycle FSM** | Task entities & state transitions | `policy-task-status-transition` |
| **Evidence & Forensics** | Cryptographic evidence blocks | `policy-evidence-verify` |
| **Distributed Locks** | File-level read/write locks | `policy-file-locking-access` / `policy-worker-sweep` |
| **Jobs Queue** | Worker Registries & Job Queues | `policy-worker-queue-management` |
| **CAS Registry Catalog** | `cas_blobs` & versioning lineages | `policy-cas-artifact-read-write` |

---

## 5. Security Audit Logging & Redaction Events

When evaluations are completed, security and bypass telemetry records are saved inside `audit_logs` using the following actions (verify exact actions in database schema):

* **`PERMISSION_DENIED`:** Evaluator blocks an unauthorized standard request.
* **`PERMISSION_BYPASS_USED`:** Administrator overrides a security checks trigger using a designated rationale.
* **`CROSS_PROJECT_SCOPE_VIOLATION`:** An actor attempts cross-project query leakage.
* **`REPO_FORBIDDEN_PATH_BLOCKED`:** Reading highly restricted system credential directories is rejected.
* **`STATIC_ANALYSIS_SECRET_REDACTED`:** Secret-leaking patterns are systematically blanked out from log strings.

---

## 6. Manual QA Verification Checklist for Permission Core

* [x] **Verify Default Deny:** Submit an anonymous REST query to `/api/projects/sample-project/context-items` without auth headers. Verify the return payload displays a clean 403 status checking reason.
* [x] **Verify Project Leak Protection:** Using an authorized authentication token for `Project_A`, attempt a GET request to `/api/projects/Project_B/tasks`. Confirm the API denies the crossing query cleanly.
* [x] **Verify Traversal Rejections:** Send file edit commands with paths containing `../../.env` or absolute formats like `/etc/passwd`. Verify the RepoAdapter normalizing check throws validation errors before evaluating files.
* [x] **Verify Override Audit Trails:** Execute an administrative state change with bypass parameters. View the `audit_logs` output and confirm the presence of key details showing the rationale, completely devoid of raw password credentials.

# Y-OS Kernel Remediation Implementation Plan

Source: `docs/markdown-implementation-audit.md`

Status: Implementation phases complete; production database release gate fully verified.

Rule: A phase may start only after the previous phase's gate is green. A skipped critical assertion is not green. External-database tests are tracked separately from deterministic offline gates and must be green before a production release.

## Execution Record — 2026-07-06

| Phase | Result | Verified gate |
| --- | --- | --- |
| 0 | Complete | `npm run typecheck` |
| 1 | Complete | `npm run test:phase1`, typecheck, live anonymous/token HTTP probe |
| 2 | Complete | `npm run test:phase2`, `npm run test:deterministic` |
| 3 | Complete | `npm run test:phase3`, typecheck |
| 4 | Complete | `npm run test:phase4`, typecheck |
| 5 | Complete | `npm run test:phase5`, Stage 29, Stage 30, typecheck |
| 6 | Complete | `npm run test:phase6`, typecheck, build |
| 7 | Complete | `npm run test:phase7`, typecheck |
| 8 | Complete | `npm run test:phase8`, deterministic suite, typecheck, build, secret scan, debug-tag gate |

Production release status: **Fully verified and completed**.
`npm run test:db` successfully passed on local PostgreSQL on 2026-07-09 with 0 failures and 0 skip markers (10/10 targets executed). The database schemas are fully migrated up to the latest version.

## Phase 0 — Baseline and Planning

Scope:

- Convert the audit findings into bounded implementation phases.
- Preserve the already-fixed Vite startup, SSR build, schema-version, and mock-table work.
- Record exact acceptance criteria and commands before editing runtime behavior.

Acceptance:

- This file is the active remediation plan.
- Every later phase has a named local test gate.

Gate:

```bash
npm run typecheck
```

## Phase 1 — Authenticated HTTP Boundary

Scope:

- Add constant-time Bearer-token authentication.
- Require authentication for every non-public API route.
- Keep only health and development-session bootstrap routes public.
- Attach a typed principal to each request.
- Enforce principal-to-project membership in `requireProjectScope`.
- Provide an ephemeral development token only in non-production mock mode.
- Install an authenticated fetch wrapper before the React application starts.

Acceptance:

- A headerless project request returns `401`.
- An invalid token returns `401`.
- A valid token outside its project list returns `403`.
- A valid scoped token returns `200`.
- Production never exposes a development token.

Gate:

```bash
npm run test:phase1
npm run typecheck
```

## Phase 2 — Honest Test Orchestration

Scope:

- Split deterministic, stage, database, and complete validation commands.
- Add a reusable validation runner that preserves child exit codes.
- Detect skip markers in strict database mode.
- Stop documenting skipped database assertions as full-suite success.
- Correct Stage 30 and Stage 35 recorded assertion counts.

Acceptance:

- Deterministic suite is green offline.
- Strict DB suite exits non-zero when DB checks are skipped.
- Suite summaries report passed, failed, and skipped counts honestly.

Gate:

```bash
npm run test:phase2
npm run test:deterministic
```

## Phase 3 — Environment-Safe Database Startup

Scope:

- Replace fire-and-forget API initialization with one readiness promise.
- Await connection, migrations, seed, and verification before listening.
- Fail process startup on production DB/configuration errors.
- Allow offline/setup boot only through an explicit non-production flag.
- Remove the production database URL default.

Acceptance:

- Production with no `DATABASE_URL` exits non-zero.
- Development mock mode starts successfully.
- Migration/verification failure propagates to server startup.

Gate:

```bash
npm run test:phase3
npm run typecheck
```

## Phase 4 — Canonical Timeline and Context Read Paths

Scope:

- Read task timelines from `event_records` when canonical events exist.
- Keep legacy multi-table aggregation as an explicit compatibility fallback.
- Remove the false “Event Store is missing” diagnostic.
- Add a ContextObject-first retrieval adapter with an explicit legacy fallback.
- Mark fallback source and warnings in returned DTOs.

Acceptance:

- Canonical events project into the public timeline DTO.
- Empty Event Store uses a labeled compatibility fallback.
- ContextObject records outrank equivalent legacy records.
- Cross-project scope remains enforced.

Gate:

```bash
npm run test:phase4
npm run typecheck
```

## Phase 5 — Evidence and Immutability Accuracy

Scope:

- Reject Event Store update/delete operations in mock DB.
- Rename evidence “signature” claims to SHA-256 content-digest integrity.
- Keep mutable verification status separate from immutable evidence material.
- Add regression coverage for mock immutability and digest verification.

Acceptance:

- Mock and PostgreSQL contracts both reject event mutation.
- Evidence API never claims actor-signature verification.
- Existing evidence and event validators remain green.

Gate:

```bash
npm run test:phase5
npm run typecheck
```

## Phase 6 — Functional Trust and Impact UI

Scope:

- Implement Evidence Store, Quality Gate Report, and Impact Analysis panels.
- Remove unsupported placeholder tabs from active navigation.
- Keep deferred surfaces in the roadmap instead of presenting fake dashboards.
- Add route-level loading, empty, and error states.

Acceptance:

- Every visible navigation item renders a functional component.
- Evidence, gate, and impact panels use live API adapters.
- No visible tab falls through to “Isolated workspace partition”.

Gate:

```bash
npm run test:phase6
npm run build
```

## Phase 7 — Provider, Repository, and Worker Contracts

Scope:

- Add `packages/providers` with capability, model, and connect contracts.
- Wrap Gemini execution behind `ModelProvider`.
- Expand RepoAdapter capability reporting and safe diff support.
- Add an independently launchable index-worker entry point.
- Describe unsupported remote write operations honestly.

Acceptance:

- Server code does not call the Google SDK outside its provider adapter.
- Provider registry exposes health/cost/privacy metadata.
- Worker entry point typechecks independently.
- Repo capabilities distinguish supported and unsupported operations.

Gate:

```bash
npm run test:phase7
npm run typecheck
```

## Phase 8 — Canonical Documentation and Final Gates

Scope:

- Establish one KDEBT registry and legacy-ID mapping.
- Update Phase 16 DTO documentation to the live snake_case array contract.
- Fill the two empty test documents.
- Replace historical unsupported completion claims with measured results.
- Add deterministic vendor chunking to remove the client bundle warning.
- Run all available non-destructive quality gates.

Acceptance:

- KDEBT identifiers have one meaning.
- No Markdown test file is empty.
- No active document claims 1028 tests without matching evidence.
- Build completes without the 500 kB chunk warning.

Gate:

```bash
npm run test:deterministic
npm run typecheck
npm run build
npm run secret-scan
npm run qa:debug-tags
```

## Production Release Gate

The following requires a reachable TLS-verified PostgreSQL database and is not replaceable by mocks:

```bash
npm run test:db
```

Production release is successful with zero failed and zero skipped critical checks.

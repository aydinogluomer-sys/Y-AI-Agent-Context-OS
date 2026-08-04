# Kernel Awareness Note: MVP Feature vs. Production Kernel

This document establishes the official distinction between the **MVP feature implementation** and the **Production Kernel specification** for **Y — AI Agent Context Operating System**.

---

## 1. Active MVP Roadmap

The project continues to operate and evolve in MVP mode. The primary, active source of truth for features and development phases is **`implementation.md`** located at the repository root. All active coding objectives must prioritize completing MVP milestones.

## 2. Long-Term Production Kernel Constraints

The uploaded engineering kernel documents are formally registered as the long-term production architecture constraints and specifications. Future development must align with these standards when transitioning to a production release:

* **`y-engineering-kernel-explanation.md`**: Specification of architectural primitives, clean Event Store, ContextObject Store, and RepoAdapter contracts.
* **`y-architecture-schema.md`**: Database constraints, table triggers, limits, and secure event projections.
* **`y-engineering-kernel-docs.zip`**: Standard schemas, executable test-suites, and AST verification routines.

The current project architecture operates as an **MVP** and must not claim production-readiness on these strict interfaces.

## 3. The Core Objective: Prevent False Positives

To protect system integrity, **Y** must never claim a system is "Production-Kernel-Complete" or "Fully Auditable" if it only fulfills the lightweight MVP abstraction.

MVP-complete does **not** equal production-kernel-complete. The missing primitives are recognized as **intentional architectural debt**, not accidental omissions. This technical debt is cataloged in [`docs/kernel-debt-register.md`](kernel-debt-register.md).

## 4. Constraint Rules for Future Phases

Until the underlying structural primitives are fully built and integrated into the server runtime, future phases are strictly forbidden from falsely claiming full production compliance for:

* **Event Sourcing**: Event-driven architecture cannot be promoted as production-grade because standard database tables (e.g., `audit_logs`) are used as temporary transaction registries instead of a real append-only Event Store.
* **ContextObject Store**: Semantic memory is backed by flat SQL tables (`context_items` and `context_chunks`), not the reactive ContextObject Store structure.
* **Quality Gate Orchestrator**: Validation routines run via manual script triggers or out-of-band checks, not integrated in-line within a structured container runtime.
* **Evidence Store**: SHA-256 content-digest integrity is implemented; actor signatures, signer identity, and key management remain missing.
* **Queue/Worker Runtime**: A standalone index-worker process exists, but general distributed/broker-backed worker isolation remains partial.
* **AST Analysis Engine**: Code dependencies and static analysis are calculated using robust pattern matching and regular expressions rather than formal AST parsers.

By registering these boundaries, the system retains a transparent track record of its functional capacity.

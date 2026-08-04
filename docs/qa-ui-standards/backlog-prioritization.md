# Y-OS Product Backlog & Stabilization Prioritization

This document maps out the remaining non-invasive UI optimizations, documentation refinements, and QA checklists for the Y-OS Kernel. It categorizes items into immediate priorities, stabilization goals, future product directions, and highlights strictly forbidden activities.

---

## 1. Backlog Categorization Matrix

### Group A: Immediate Documentation / QA

*Status: Ready for immediate execution in current maintenance buffer.*

* **permission-kernel audit documentation**
  * *Objective:* Map active ABAC controls against endpoint specifications to guarantee total coverage.
  * *Artifact (Completed):* `docs/permission-kernel-audit.md`
* **Artifact CAS deduplication manual QA**
  * *Objective:* Run live testing routines to verify SHA256 caching efficiency.
  * *Artifact (Completed):* Added to `docs/manual-qa-checklist.md#3-artifact-cas-blob-deduplication-manual-qa-plan`.
* **accessibility/color contrast palette recommendations as documentation only**
  * *Objective:* Draft a high-contrast accessibility theme profile for tables and data density, targeting WCAG AA compliance.
  * *Artifact (Completed):* Drafted in `docs/ui-accessibility-notes.md`. No runtime UI code was modified.

---

### Group B: Stabilization Backlog

*Status: Completed and fully implemented in maintenance buffer.*

* **metadata_json artifact search** (Completed)
  * *Scope:* Add a client-only frontend query input overlay to filter CAS tables by tag matches in the browser memory.
* **permission UI polish** (Completed)
  * *Scope:* Redesign the permission matrix dashboard view using clean display typography (Inter coupled with JetBrains Mono) with high contrast background pairings.
* **worker/file-lock CSV exports** (Completed)
  * *Scope:* Add a clean frontend button to export currently loaded locks and active worker tables to standard CSV format.
* **Y-OS brand kit refinement** (Completed)
  * *Scope:* Polish typography spacing, tracking margins, and transition micro-animations. Ensure all text meets high-contrast accessibility ratios on heavy indices.

---

### Group C: Future Product Phase

*Status: Completed and fully implemented in current cycle.*

* **artifact compare/diff viewer** (Completed)
  * *Scope:* A browser-only side-by-side comparative UI to highlight textual deltas between cached versions of a logical path (utilizing standard pure JS diff libraries, absolutely free of backend compute routes or comparison APIs).
* **artifact integrity dashboard** (Completed)
  * *Scope:* Frontend widget with animated gauges displaying cryptographic health, showing percentage of verified vs. corrupted historical evidence logs.
* **quarantine registry view** (Completed)
  * *Scope:* Read-only client list panel displaying metadata items marked quarantined by the ContextObject store.
* **token analytics** (Completed)
  * *Scope:* Add clean canvas graphs using `recharts` to visualize context compression ratios, budget allocations, and token cache savings over time.

---

### Group D: Deferred Until Roadmap Update

*Status: Out of current scope. These items require explicit design and acceptance criteria before implementation.*

* **artifact purge/cleanup policy**
  * *Violation Reason:* Purging artifacts requires a destructive CAS deletion backend. Because the current database and services preserve append-only forensic history, automating cleanup is deferred.
* **destructive CAS deletion**
  * *Violation Reason:* Physical deletion of content blocks breaks forensic traceability and is barred until a formal compliance pathway is drafted.
* **Incremental Directory Snapshots (Snapshot/Rollback)**
  * *Violation Reason:* Under the baseline, creating state rollback plans is classified as un-authorized Phase 32 capabilities.
* **Browser Sandbox Runtime Environment**
  * *Violation Reason:* Executing automated worker code in sandboxed iframe blocks is out of bounds for the current Kernel MVP.
* **New Database Migrations / Schema Changes**
  * *Violation Reason:* Direct postgres database drift breaks validation compatibility gates across previous stages.

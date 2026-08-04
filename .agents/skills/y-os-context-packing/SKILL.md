---
name: y-os-context-packing
description: "Guides on context object registry updates, token calculations, and assembling deterministic 50K context packs for Y-OS."
---

# Y-OS Context Packing Skill

This skill provides operational guidelines for managing context objects and assembling token-bounded Context Packs within Y-OS.

## 1. Context Object Normalization

All imported source files and metadata must be normalized into `ContextObject` entities before query parsing.

* Ensure `content_hash` is computed as a SHA-256 of the raw content string to detect change deltas.
* Verify freshness and authority scores using database attributes in `context_objects`.
* See [ContextObjectStoreService.ts](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/apps/api/src/ContextObjectStoreService.ts) for storage logic.

## 2. Assembling Context Packs

When building context packages for AI consumption:

* **Token Budget Limit**: Enforce a strict **50K Token budget**.
* **Relevance Ranking**: Apply similarity score metrics combining direct dependency weights and recency.
* **Redaction Check**: Run all candidate items through the redaction parser before packaging.
* Ensure the builder emits the `CONTEXT_PACK_GENERATED` event journal entry.

# 05 — Subsystem Verdict'leri

> Baseline commit: `586a0902b6a37e4360867ed17c2ca71bcea73d27` · Verdict skalası: REAL · PARTIAL · SIMULATED · ABSENT

| Subsystem | Verdict | Kanıt |
|---|---|---|
| Audit log | **REAL** | `apps/api/src/audit.ts`; `audit_logs` tablosu; redaksiyon uygulanıyor |
| Event Store | **REAL (append-only)** | `event_records` + `block_event_records_mutation()` trigger; `payload_hash` SHA-256. **Hash chain yok** (`prev_hash` kolonu yok) |
| Evidence Store | **REAL** | `EvidenceStoreService.verifyEvidenceRecord` hash'i yeniden hesaplayıp karşılaştırıyor. Integrity var, **authenticity yok** (kendi mesajı: "no actor signature was evaluated") |
| Artifact CAS | **REAL (DB-backed)** | `cas_blobs` + `artifact_versions`, `UNIQUE(project_id, cas_hash)` dedup |
| Context Object Store | **REAL** | `context_objects` + refs, SHA-256 dedup |
| File Locking | **REAL** | `file_locks`, expiry + stale release |
| Worker Registry | **REAL (bookkeeping)** | `worker_registry`; `FOR UPDATE SKIP LOCKED` claim örüntüsü doğru |
| Knowledge Graph | P00: **REAL ama yanlış kaynaklı** → P05 sonrası: **REAL, symbol kaynaklı** | P00'da node'lar `context_items`/`tasks`'tan üretiliyor ve sync yıkıcıydı. P05: kaynak `symbols`/`files`, snapshot bağı, tombstone'lu artımlı sync, recursive CTE traversal |
| Static analysis | P00: **REAL, TypeScript-only** → P04 sonrası: **REAL, 15 dil** | P00'da yalnız TS/JS; `.py` "javascript" etiketiyle regex parser'a gidiyordu. P04: tree-sitter WASM grameri + ölçülen confidence |
| Path güvenliği | **REAL** | realpath containment + symlink escape + denylist + 5MB limit + binary detect |
| Repository ingestion (Git) | P00: **ABSENT** → P03 sonrası: **REAL** | P00'da hiç Git entegrasyonu yoktu. P03: `execFile` tabanlı git CLI, PathGuard, local/GitHub/GitLab adapter'ları, snapshot ingestion |
| Chunking | P00: **PARTIAL (character-based)** → P04 sonrası: **REAL (symbol-aware)** | P00'da sabit karakter dilimi fonksiyon ortasından kesiyordu. P04: chunk sınırı = symbol sınırı (ADR-020); legacy doküman yolu satır sınırına taşındı |
| Symbol index | P00: **ABSENT** → P04 sonrası: **REAL** | P00'da `symbols` tablosu yoktu ve analiz sonucu hiçbir yere yazılmıyordu. P04: 14 zorunlu alanla `symbols` + `chunks`, gerçek iş yapan index worker |
| Semantic retrieval | P00: **SIMULATED** → P06 sonrası: **REAL (pgvector)** | P00'da keyword örtüşmesi `semantic_score` adıyla sunuluyordu ve `embedding_id` hep NULL'dı. P06: pgvector kosinüs benzerliği; sağlayıcı yoksa kanal devre dışı ve sonuç `degraded` işaretlenir |
| Tokenizer | **SIMULATED** | İki tutarsız tahminci; gerçek BPE yok |
| Token budget | **PARTIAL** | Hard-coded 50.000, üç ayrı yerde; çelişen 4000 default'u |
| Context manifest | **PARTIAL + FABRICATED** | Gerçek reason code'lar var; `recent_diffs`, dependency listeleri ve quality gate'ler uydurma |
| **Agent runtime** | **SIMULATED** | `POST .../runs` dört event yazıp `status: "completed"` dönüyor; hiçbir şey çalıştırmıyor |
| Agent adapters (Claude Code / Codex) | **ABSENT** | Bağımlılık yok; tek gerçek provider `@google/genai` ve yalnız `/api/simulate-task` kullanıyor |
| Provider health | **SIMULATED** | Yalnız `process.env` varlığına bakıyor |
| Quality gates | **PARTIAL (storage only)** | Caller'ın bildirdiği sonucu kaydediyor; sunucu hiçbir komut çalıştırmıyor |
| Real-time (SSE/WS) | **ABSENT** | `text/event-stream`, `EventSource`, WebSocket app kodu yok |
| UI | **SIMULATED (103/113)** | 10 ekran gerçek API'ye bağlı, 103 ekran fabrikasyon |

## Sahte başarı yolları

`scripts/audit/scan-false-green.ts` 161 bulgu üretti (**115 adet P0**).
Detay: `10-test-honesty.md` ve `10-false-green-findings.csv`.

# 05 — Subsystem Verdict'leri

> Baseline commit: `670392a702b6da8f3eb559f8fec252bdce9e32e5` · Verdict skalası: REAL · PARTIAL · SIMULATED · ABSENT

| Subsystem | Verdict | Kanıt |
|---|---|---|
| Audit log | **REAL** | `apps/api/src/audit.ts`; `audit_logs` tablosu; redaksiyon uygulanıyor |
| Event Store | **REAL (append-only)** | `event_records` + `block_event_records_mutation()` trigger; `payload_hash` SHA-256. **Hash chain yok** (`prev_hash` kolonu yok) |
| Evidence Store | **REAL** | `EvidenceStoreService.verifyEvidenceRecord` hash'i yeniden hesaplayıp karşılaştırıyor. Integrity var, **authenticity yok** (kendi mesajı: "no actor signature was evaluated") |
| Artifact CAS | **REAL (DB-backed)** | `cas_blobs` + `artifact_versions`, `UNIQUE(project_id, cas_hash)` dedup |
| Context Object Store | **REAL** | `context_objects` + refs, SHA-256 dedup |
| File Locking | **REAL** | `file_locks`, expiry + stale release |
| Worker Registry | **REAL (bookkeeping)** | `worker_registry`; `FOR UPDATE SKIP LOCKED` claim örüntüsü doğru |
| Knowledge Graph | **REAL, persisted** | `graph_nodes`/`graph_edges`; retrieval skorlamasında kullanılıyor. Ama manuel sync ve `context_items` kaynaklı |
| Static analysis | **REAL, TypeScript-only** | `TypeScriptASTParser` gerçek `typescript` compiler'ı kullanıyor; diğer diller regex fallback |
| Path güvenliği | **REAL** | realpath containment + symlink escape + denylist + 5MB limit + binary detect |
| Repository ingestion (Git) | **ABSENT** | Repo'da hiç Git entegrasyonu yok; `ReadOnlyGitHubRepoAdapter` her metotta `ok:false` |
| Chunking | **PARTIAL (character-based)** | `content.slice(i, i + charsPerChunk)`, `charsPerToken = 4` |
| Symbol index | **ABSENT** | `symbols` tablosu yok; analiz sonucu yalnız HTTP yanıtında döner |
| Semantic retrieval | **SIMULATED** | `mockSemanticSearchFallback()` = keyword overlap; `embedding_id` her zaman NULL |
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

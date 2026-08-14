# Architecture Decision Records

> Baseline: [2026-08-13 Truth Audit](../audit/2026-08-13-truth-audit/)
> Yol haritası: [Master Plan](../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md)

## Kayıt biçimi

Her ADR şu başlıkları taşır: **Decision · Context · Alternatives · Reason · Consequences.**

Dosya adı: `ADR-NNN-kebab-case-baslik.md`. Numaralar yeniden kullanılmaz.
Bir ADR'yi değiştirmek için onu **süperseding** eden yeni bir ADR yazılır;
eski dosya `Durum: Superseded by ADR-NNN` olarak işaretlenir.

## Register

| # | Başlık | Faz | Durum |
|---|---|---|---|
| [000](ADR-000-scope-freeze.md) | Product Scope Freeze | P00 | **Uygulandı** |
| [001](ADR-001-parallel-canonical-surface.md) | Paralel Kanonik Yüzey + Cutover | P01 | **Uygulandı** |
| [002](ADR-002-oidc-jose-db-membership.md) | OIDC + jose + DB-backed membership | P02 | **Uygulandı** |
| [003](ADR-003-file-based-migrations.md) | Dosya Tabanlı Migration'lar | P01 | **Uygulandı** |
| [004](ADR-004-postgres-backed-queue.md) | PostgreSQL-backed queue | P12 | **Uygulandı** |
| 005 | Real-time: SSE | P13 | Önerildi |
| [006](ADR-006-git-access-isomorphic-plus-cli.md) | Git erişimi: isomorphic-git + native CLI | P03 | **Uygulandı** |
| [007](ADR-007-parser-tree-sitter-plugin.md) | Parser: tree-sitter plugin mimarisi | P04 | **Uygulandı** |
| [008](ADR-008-vector-store-pgvector.md) | Vector store: pgvector | P06 | Kısmen uygulandı |
| [009](ADR-009-provider-agnostic-embedding.md) | Provider-agnostic EmbeddingProvider | P06 | **Uygulandı** |
| [010](ADR-010-real-tokenizer.md) | Gerçek tokenizer | P08 | Kısmen uygulandı |
| [011](ADR-011-vitest.md) | Unit test runner: vitest | P01 | **Uygulandı** |
| 012 | Frontend routing: react-router | P15 | Önerildi |
| [013](ADR-013-crypto-ids.md) | Kriptografik kimlik üretimi | P01 | **Uygulandı** |
| [014](ADR-014-single-package-manager.md) | Tek paket yöneticisi: pnpm | P01 | **Uygulandı** |
| [015](ADR-015-provenance-mode-type-split.md) | Provenance mode type-level ayrımı | P01 | **Uygulandı** |
| [016](ADR-016-real-idp-not-dev-bypass.md) | Dev bypass yerine gerçek IdP | P02 | **Uygulandı** |
| [017](ADR-017-authorization-single-point.md) | Authorization tek noktadan | P02 | **Uygulandı** |
| [018](ADR-018-repository-root-not-user-chosen.md) | Repository root'u kullanıcı seçmez | P03 | **Uygulandı** |
| [019](ADR-019-ingestion-not-in-http-request.md) | Ingestion HTTP request içinde çalışmaz | P03 | **Uygulandı** |
| [020](ADR-020-chunk-boundary-is-symbol-boundary.md) | Chunk sınırı = symbol sınırı | P04 | **Uygulandı** |
| [021](ADR-021-confidence-is-measured.md) | Confidence ölçülür, atanmaz | P04 | **Uygulandı** |
| [022](ADR-022-graph-source-is-symbols-and-files.md) | Graph kaynağı = symbols + files | P05 | **Uygulandı** |
| [023](ADR-023-incremental-non-destructive-graph-sync.md) | Incremental, yıkıcı olmayan graph sync | P05 | **Uygulandı** |
| [024](ADR-024-traversal-postgres-recursive-cte.md) | Traversal: Postgres recursive CTE | P05 | Kısmen uygulandı |
| [025](ADR-025-lexical-postgres-fts.md) | Lexical: Postgres FTS + trigram | P06 | Kısmen uygulandı |
| [026](ADR-026-ranking-explainability-mandatory.md) | Sıralama açıklanabilirliği zorunlu | P06 | **Uygulandı** |
| [027](ADR-027-firewall-is-a-prefilter.md) | Firewall ön-filtre, son filtre değil | P06/P07 | **Uygulandı** |
| [028](ADR-028-universe-compiles-to-sql-predicate.md) | Universe SQL predicate'ine derlenir | P07 | **Uygulandı** |
| [029](ADR-029-deny-wins-approval-acts-as-deny.md) | DENY kazanır; APPROVAL retrieval'da DENY gibi | P07 | **Uygulandı** |
| [030](ADR-030-universe-immutable-bound-to-run.md) | Universe immutable ve run'a bağlı | P07 | **Uygulandı** |
| [031](ADR-031-budget-from-adapter-ceiling-from-policy.md) | Bütçe adapter'dan, tavan policy'den | P08 | **Uygulandı** |
| [032](ADR-032-no-fabricated-fields.md) | Uydurma alan yasağı | P08 | **Uygulandı** |
| [033](ADR-033-compilation-is-a-pure-function.md) | Derleme saf fonksiyondur | P08 | **Uygulandı** |
| [034](ADR-034-manifest-is-primary-evidence-unit.md) | Manifest = kanıtın birincil birimi | P09 | **Uygulandı** |
| [035](ADR-035-canonical-json.md) | Canonical JSON serileştirme | P09 | **Uygulandı** |
| [036](ADR-036-exclusions-mandatory-with-reason.md) | Dışlama kaydı zorunlu ve sebepli | P09 | **Uygulandı** |
| [037](ADR-037-manifest-is-sole-content-source.md) | Manifest agent'a verilen içeriğin tek kaynağı | P09 | **Uygulandı** |
| [038](ADR-038-boundary-derived-from-task.md) | Boundary task'tan türetilir | P10 | **Uygulandı** |
| [039](ADR-039-enforcement-at-mutation-point.md) | Enforcement mutation noktasında | P10 | **Uygulandı** |
| [040](ADR-040-approval-blocks-run-not-history.md) | Onay run'ı bloklar, geçmişi değiştirmez | P10 | **Uygulandı** |
| [041](ADR-041-hash-before-after-mandatory.md) | hash-before / hash-after zorunlu | P10 | **Uygulandı** |
| [042](ADR-042-y-not-dependent-on-agent-reasoning.md) | Y agent'ın iç reasoning'ine bağımlı olmaz | P11 | Kısmen uygulandı |
| [043](ADR-043-manifest-is-only-content-channel.md) | Manifest tek içerik kaynağıdır | P11 | Kısmen uygulandı |
| [044](ADR-044-agent-runs-in-sandbox.md) | Agent sandbox'ta çalışır | P11 | Kısmen uygulandı |
| [045](ADR-045-capability-negotiation-per-run.md) | Capability negotiation her run başında | P11 | Kısmen uygulandı |
| [046](ADR-046-no-ready-without-manifest-and-boundary.md) | Manifest ve boundary olmadan `ready` olunamaz | P12 | **Uygulandı** |
| [047](ADR-047-terminal-states-are-irreversible.md) | Terminal durumlar geri alınamaz | P12 | **Uygulandı** |
| [048](ADR-048-every-transition-is-an-event.md) | Her durum geçişi bir event'tir | P12 | **Uygulandı** |
| 049 | Yayın kaynağı Event Store'dur | P13 | Önerildi |
| 050 | Approval yanıtı SSE üzerinden gelmez | P13 | Önerildi |
| [051](ADR-051-event-payload-must-be-redacted.md) | Olay yükü redakte edilmiş olmalı | P13 | **Uygulandı** |
| 052 | Olay zinciri hash-chained | P14 | Önerildi |
| 053 | Evidence imzalanır | P14 | Önerildi |
| 054 | Quality gate'ler Y tarafından çalıştırılır | P14 | Önerildi |
| 055 | CAS pluggable backend | P14 | Önerildi |
| [056](ADR-056-simulation-badge-type-level.md) | Simülasyon rozeti type-level | P15 | **Uygulandı** |
| 057 | Progressive disclosure | P15 | Önerildi |
| 058 | Tipli API client, üretilmiş tiplerden | P15 | Önerildi |
| 059 | Ground truth insan tarafından etiketlenir | P16 | Önerildi |
| 060 | Benchmark repo'ları gerçek OSS commit'leri | P16 | Önerildi |
| 061 | Metrikler kanıttan okunur | P16 | Önerildi |
| 062 | Native kol da aynı kanıt formatına indirgenir | P16 | Önerildi |
| [063](ADR-063-repository-content-is-data.md) | Repository içeriği DATA'dır | P17 | Kısmen uygulandı |
| 064 | Shadow mode kalıcı olarak kaldırılır | P17 | Önerildi |
| 065 | Güvenlik testleri ayrı, atlanamaz CI gate'i | P17 | Önerildi |
| 066 | OpenTelemetry | P18 | Önerildi |
| [067](ADR-067-run-id-first-class-correlation-key.md) | `run_id` birinci sınıf korelasyon anahtarı | P18 | **Uygulandı** |
| 068 | Readiness gerçeği yansıtır | P18 | Önerildi |
| 069 | Performans bütçeleri testtir | P18 | Önerildi |
| 070 | Mock DB silinir | P19 | Önerildi |
| 071 | `ALLOW_OFFLINE_API_BOOT` silinir | P19 | Önerildi |
| 072 | Typed + validated environment config | P19 | Önerildi |
| [073](ADR-073-secret-manager-mandatory.md) | Secret manager zorunlu (production) | P19 | **Uygulandı** |
| 074 | Kabul kanıta bağlıdır | P20 | Önerildi |
| 075 | Feature registry release artifact'ıdır | P20 | Önerildi |

**Durum skalası:** `Önerildi` (ilgili fazın planında) → `Kabul edildi`
(karar bağlayıcı) → `Kısmen uygulandı` (karar uygulandı ama bir parçası
dış bağımlılık bekliyor) → `Uygulandı` (kod ve testte tam karşılığı var)
→ `Superseded by ADR-NNN`.

`Kısmen uygulandı` ayrı bir basamaktır çünkü onu `Uygulandı` saymak, bu
projede kapatılan yanlış-yeşil kalıbının ta kendisidir. Neyin eksik
olduğu her ADR'nin *Consequences* bölümünde yazılıdır:

| ADR | Eksik olan |
|---|---|
| 008 | sorgu şekli test edildi, ANN geri çağırma sonucu canlı Postgres bekliyor (P19) |
| 010 | sözleşme ve `approximate` işareti var; gerçek BPE tokenizer yok (P11) |
| 024 | sorgu şekli test edildi, traversal sonucu canlı Postgres bekliyor (P19) |
| 025 | sorgu şekli test edildi, FTS sıralaması canlı Postgres bekliyor (P19) |
| 042 | sözleşme ve yetenek müzakeresi var; `start()` SDK bekliyor (P11) |
| 043 | sözleşme zorlanıyor; agent başlatma SDK bekliyor (P11) |
| 044 | yol iletilmiyor; sandbox implementasyonu SDK bekliyor (P11) |
| 045 | müzakere ve `probedNetwork` var; canlı sağlayıcı bekliyor (P11) |
| 063 | kanal ayrımı ve manifest alanı var; adapter'a teslim `adapter.start()` bekliyor (P11) |

"Önerildi" durumundaki ADR'lerin gerekçeleri master plan §4 ve ilgili
faz dosyasındaki *Architecture Decisions* bölümündedir; faz başladığında
buraya tam metin olarak yazılır.

## Atıf bütünlüğü

**Kaynak kodda atıf yapılan her ADR'nin bu dizinde bir belgesi olmak
zorundadır.** Bu değişmez `adr-integrity.test.ts` ile kilitlidir.

Gerekçe: kodda `ADR-032` yazan bir yorum, okuyana aranabilir bir karar
vaat eder. Belge yoksa vaat karşılanmaz ve yorum, doğrulanamayan bir
iddiaya dönüşür — spec §64'ün "doküman ile kod arasında doğrulanmamış
iddia" maddesi tam olarak budur.

P17 denetiminde kod 49 ADR'ye atıf yapıyor, dizinde 8 belge vardı.

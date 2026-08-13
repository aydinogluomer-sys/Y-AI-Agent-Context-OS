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
| [000](ADR-000-scope-freeze.md) | Product Scope Freeze | P00 | **Kabul edildi** |
| [001](ADR-001-parallel-canonical-surface.md) | Paralel Kanonik Yüzey + Cutover | P01 | **Kabul edildi** |
| 002 | OIDC + jose + DB-backed membership | P02 | Önerildi |
| [003](ADR-003-file-based-migrations.md) | Dosya Tabanlı Migration'lar | P01 | **Uygulandı** |
| 004 | PostgreSQL-backed queue | P12 | Önerildi |
| 005 | Real-time: SSE | P13 | Önerildi |
| 006 | Git erişimi: isomorphic-git + native CLI | P03 | Önerildi |
| 007 | Parser: tree-sitter plugin mimarisi | P04 | Önerildi |
| 008 | Vector store: pgvector | P06 | Önerildi |
| 009 | Provider-agnostic EmbeddingProvider | P06 | Önerildi |
| 010 | Gerçek tokenizer | P08 | Önerildi |
| [011](ADR-011-vitest.md) | Unit test runner: vitest | P01 | **Uygulandı** |
| 012 | Frontend routing: react-router | P15 | Önerildi |
| [013](ADR-013-crypto-ids.md) | Kriptografik kimlik üretimi | P01 | **Uygulandı** |
| [014](ADR-014-single-package-manager.md) | Tek paket yöneticisi: pnpm | P01 | **Uygulandı** |
| [015](ADR-015-provenance-mode-type-split.md) | Provenance mode type-level ayrımı | P01 | **Uygulandı** |
| 016 | Dev bypass yerine gerçek IdP | P02 | Önerildi |
| [017](ADR-017-authorization-single-point.md) | Authorization tek noktadan | P02 | Önerildi |
| 018 | Repository root'u kullanıcı seçmez | P03 | Önerildi |
| 019 | Ingestion HTTP request içinde çalışmaz | P03 | Önerildi |
| 020 | Chunk sınırı = symbol sınırı | P04 | Önerildi |
| 021 | Confidence ölçülür, atanmaz | P04 | Önerildi |
| 022 | Graph kaynağı = symbols + files | P05 | Önerildi |
| 023 | Incremental, yıkıcı olmayan graph sync | P05 | Önerildi |
| 024 | Traversal: Postgres recursive CTE | P05 | Önerildi |
| 025 | Lexical: Postgres FTS + trigram | P06 | Önerildi |
| 026 | Sıralama açıklanabilirliği zorunlu | P06 | Önerildi |
| 027 | Firewall ön-filtre, son filtre değil | P06/P07 | Önerildi |
| 028 | Universe SQL predicate'ine derlenir | P07 | Önerildi |
| 029 | DENY kazanır; APPROVAL retrieval'da DENY gibi | P07 | Önerildi |
| 030 | Universe immutable ve run'a bağlı | P07 | Önerildi |
| 031 | Bütçe adapter'dan, tavan policy'den | P08 | Önerildi |
| 032 | Uydurma alan yasağı | P08 | Önerildi |
| 033 | Derleme saf fonksiyondur | P08 | Önerildi |
| 034 | Manifest = kanıtın birincil birimi | P09 | Önerildi |
| 035 | Canonical JSON serileştirme | P09 | Önerildi |
| 036 | Dışlama kaydı zorunlu ve sebepli | P09 | Önerildi |
| 037 | Manifest agent'a verilen içeriğin tek kaynağı | P09 | Önerildi |
| 038 | Boundary task'tan türetilir | P10 | Önerildi |
| 039 | Enforcement mutation noktasında | P10 | Önerildi |
| 040 | Onay run'ı bloklar, geçmişi değiştirmez | P10 | Önerildi |
| 041 | hash-before / hash-after zorunlu | P10 | Önerildi |
| 042 | Y agent'ın iç reasoning'ine bağımlı olmaz | P11 | Önerildi |
| 043 | Manifest tek içerik kaynağıdır | P11 | Önerildi |
| 044 | Agent sandbox'ta çalışır | P11 | Önerildi |
| 045 | Capability negotiation her run başında | P11 | Önerildi |
| 046 | Manifest ve boundary olmadan `ready` olunamaz | P12 | Önerildi |
| 047 | Terminal durumlar geri alınamaz | P12 | Önerildi |
| 048 | Her durum geçişi bir event'tir | P12 | Önerildi |
| 049 | Yayın kaynağı Event Store'dur | P13 | Önerildi |
| 050 | Approval yanıtı SSE üzerinden gelmez | P13 | Önerildi |
| 051 | Olay yükü redakte edilmiş olmalı | P13 | Önerildi |
| 052 | Olay zinciri hash-chained | P14 | Önerildi |
| 053 | Evidence imzalanır | P14 | Önerildi |
| 054 | Quality gate'ler Y tarafından çalıştırılır | P14 | Önerildi |
| 055 | CAS pluggable backend | P14 | Önerildi |
| 056 | Simülasyon rozeti type-level | P15 | Önerildi |
| 057 | Progressive disclosure | P15 | Önerildi |
| 058 | Tipli API client, üretilmiş tiplerden | P15 | Önerildi |
| 059 | Ground truth insan tarafından etiketlenir | P16 | Önerildi |
| 060 | Benchmark repo'ları gerçek OSS commit'leri | P16 | Önerildi |
| 061 | Metrikler kanıttan okunur | P16 | Önerildi |
| 062 | Native kol da aynı kanıt formatına indirgenir | P16 | Önerildi |
| 063 | Repository içeriği DATA'dır | P17 | Önerildi |
| 064 | Shadow mode kalıcı olarak kaldırılır | P17 | Önerildi |
| 065 | Güvenlik testleri ayrı, atlanamaz CI gate'i | P17 | Önerildi |
| 066 | OpenTelemetry | P18 | Önerildi |
| 067 | `run_id` birinci sınıf korelasyon anahtarı | P18 | Önerildi |
| 068 | Readiness gerçeği yansıtır | P18 | Önerildi |
| 069 | Performans bütçeleri testtir | P18 | Önerildi |
| 070 | Mock DB silinir | P19 | Önerildi |
| 071 | `ALLOW_OFFLINE_API_BOOT` silinir | P19 | Önerildi |
| 072 | Typed + validated environment config | P19 | Önerildi |
| 073 | Secret manager zorunlu (production) | P19 | Önerildi |
| 074 | Kabul kanıta bağlıdır | P20 | Önerildi |
| 075 | Feature registry release artifact'ıdır | P20 | Önerildi |

**Durum skalası:** `Önerildi` (ilgili fazın planında) → `Kabul edildi`
(karar bağlayıcı) → `Uygulandı` (kod ve testte karşılığı var) →
`Superseded by ADR-NNN`.

"Önerildi" durumundaki ADR'lerin gerekçeleri master plan §4 ve ilgili
faz dosyasındaki *Architecture Decisions* bölümündedir; faz başladığında
buraya tam metin olarak yazılır.

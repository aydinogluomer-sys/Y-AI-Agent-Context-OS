# ADR-024 — Traversal: Postgres recursive CTE

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P05 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/graph/src/traversal.ts:2` |

## Decision

Graph traversal PostgreSQL `WITH RECURSIVE` ile veritabanında çalışır.
Uygulama katmanında BFS/DFS döngüsü yazılmaz. Organizasyon predikatı
hem anchor hem recursive terimde **zorunludur**.

## Context

Traversal'ın uygulama katmanında yapılması, her seviye için ayrı sorgu
(N+1) ve tüm ara sonuçların belleğe alınması demekti.

## Reason

Predikatın **yalnız anchor terimde** olması klasik bir izolasyon
kaçağıdır: başlangıç düğümü doğru organizasyonda olur, ama özyineleme
sırasında başka organizasyonun düğümlerine geçilebilir. Bu yüzden
predikat iki yerde de zorunludur (T-02).

## Consequences

- Döngü tespiti `visited` dizisiyle; fan-out `ROW_NUMBER()` ile sınırlı.
- Derinlik ve düğüm limitleri sorgunun içindedir, sonrasında değil.
- Sonuç doğruluğu canlı Postgres gerektirir (P19).

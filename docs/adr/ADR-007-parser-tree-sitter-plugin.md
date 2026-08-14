# ADR-007 — Parser: tree-sitter plugin mimarisi

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P04 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/core/src/index.ts:94` |

## Decision

Dil desteği `LanguageParser` arayüzünü implemente eden parser'ların
`ParserRegistry`'ye kaydolmasıyla genişler. Desteklenmeyen dil **sessizce
yanlış parser'a düşmez**; yapısal parser'a düşer ve sonuç
`confidenceBasis.method = "structural"` ile açıkça işaretlenir.

## Context

P00 bulgusu: dil tespiti `typescript`/`javascript` olarak hard-code'du ve
desteklenmeyen her dil regex fallback'e düşüyordu — hem yanlış etiketle
hem **sessizce**.

## Reason

Yanlış etiketli bir sembol, aşağıdaki her katmanı (graph, retrieval,
ranking, manifest) yanlış besler ve hata kaynağa kadar izlenemez.

Fallback'in kendisi sorun değildir; **sessiz** olması sorundur. Açıkça
işaretlenmiş bir yapısal ayrıştırma, ölçülebilir bir gerçektir.

## Consequences

- Yeni dil eklemek: `LanguageParser` implemente et + registry'ye kaydol.
- Yapısal parser'a düşen dosyalar sorgulanabilir (`method = structural`).
- Bkz. [ADR-020](ADR-020-chunk-boundary-is-symbol-boundary.md),
  [ADR-021](ADR-021-confidence-is-measured.md).

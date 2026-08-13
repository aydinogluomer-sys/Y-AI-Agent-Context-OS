# ADR-011 — Unit Test Runner: vitest

| Alan | Değer |
|---|---|
| Durum | **Uygulandı** |
| Faz | P01 |
| Tarih | 2026-08-13 |

## Decision

`vitest` benimsendi. `pnpm test` artık gerçek unit testleri koşar.

## Context

P00 Truth Audit: repo'da **hiçbir unit test framework'ü yoktu**. "Testler"
`scripts/validate-*.ts` altındaki ~15.000 satırlık el yazımı script'lerdi:

- 52 adet `assert("...", true)` — koşulsuz geçen assertion
- 36 adet skip-then-pass — DB yoksa atla, yine de `SUCCESSFUL PASS` yaz
- `packages/context/test/retrieval-isolation.test.ts`: 284 satırlık değerli
  bir test dosyası, **0 referans**, hiç çalışmıyor

Baseline koşumu: 162 assertion "geçti", 13 skip marker basıldı, exit 0.

## Alternatives

1. **jest** — ESM + TypeScript için ek transform katmanı gerekiyor.
2. **node:test** — workspace/alias çözümü elle kurulmalı.
3. **vitest** — SEÇİLEN. Vite zaten bağımlılık; `@y/*` alias'ları doğrudan kullanılıyor.

## Consequences

- `passWithNoTests: false` — bir test dosyasının sessizce hiç çalışmaması,
  geçmesinden farksız görünmez.
- **Skip = failure.** Bağımlılık eksikliğinde test atlanmaz.
- Eski sahte suite'ler `legacy:*` script'leri olarak işaretlendi, P19'da silinecek.

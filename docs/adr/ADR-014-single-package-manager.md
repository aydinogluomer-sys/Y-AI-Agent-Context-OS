# ADR-014 — Tek Paket Yöneticisi: pnpm

| Alan | Değer |
|---|---|
| Durum | **Uygulandı** |
| Faz | P01 |
| Tarih | 2026-08-13 |

## Decision

`package-lock.json` silindi. Tek lockfile `pnpm-lock.yaml`.

## Context

Repo hem `package-lock.json` (npm) hem `pnpm-lock.yaml` taşıyordu. CI
`pnpm install --frozen-lockfile` çalıştırıyor, yerel geliştirme çoğunlukla
npm ile yapılıyordu.

## Reason

İki lockfile, CI ile geliştirici makinesi arasında **sessiz sürüm sapması**
üretir: bir hata yalnız birinde görünür ve teşhisi zorlaşır.

## Consequences

- `.gitignore`'a `package-lock.json` ve `yarn.lock` eklendi.
- Geliştirme dokümanı pnpm'i zorunlu kılar.

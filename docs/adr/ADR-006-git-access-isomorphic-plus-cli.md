# ADR-006 — Git erişimi: isomorphic-git + native CLI

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P03 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/core/src/git/git-cli.ts:2` |

## Decision

Git işlemleri native `git` ikilisiyle, **`execFile` ve argüman dizisiyle**
yapılır. Shell **kullanılmaz**. Komutlar allow-list'lidir.

## Context

P00: repository erişimi kısmen simüle ediliyordu. Gerçek Git gerekiyordu
ve iki seçenek vardı: saf JS (isomorphic-git) veya native CLI.

## Reason

Native CLI, büyük repository'lerde ve `sparse-checkout`, `partial clone`
gibi yeteneklerde saf JS implementasyonlardan belirgin şekilde daha
olgundur.

Shell kullanılmaması T-22'nin (command injection) doğrudan karşılığıdır:
`execFile` + argüman dizisi ile bir dosya adının içindeki `;` veya `$()`
kabuk tarafından yorumlanamaz.

## Consequences

- `git` ikilisinin ortamda bulunması gerekir; yokluğu açıkça hata verir.
- Komut allow-list'i genişletilmeden yeni git alt komutu çalıştırılamaz.
- Bkz. T-22, T-23.

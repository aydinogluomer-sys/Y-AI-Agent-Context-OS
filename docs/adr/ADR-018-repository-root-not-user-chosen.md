# ADR-018 — Repository root'u kullanıcı seçmez

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P03 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/core/src/index.ts:28` |

## Decision

Repository kökü **kullanıcı tarafından seçilmez**. Her repository, Y'nin
yönettiği workspace içinde deterministik bir yola klonlanır.

## Context

P00 Truth Audit (P0-9): `repo/configure-local` keyfi mutlak `root_path`
kabul ediyordu; yapılandırılmamışsa kök `"."` yani sunucunun çalışma
dizini oluyordu. Root'u `/` yapmak keyfi dizin okuması demekti.

## Reason

Kullanıcının seçtiği bir kök, PathGuard'ın koruduğu sınırın kendisini
kullanıcıya devretmektir. Sınırın içeriği tartışılabilir; sınırın
**nerede olduğu** tartışılamaz.

## Consequences

- Yol her zaman `workspace/<org>/<project>/<repo>` biçimindedir.
- PathGuard containment'ı bu köke göre uygulanır (T-03, T-04).
- Bkz. [ADR-019](ADR-019-ingestion-not-in-http-request.md).

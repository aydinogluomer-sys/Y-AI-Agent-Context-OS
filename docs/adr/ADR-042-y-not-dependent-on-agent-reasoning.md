# ADR-042 — Y agent'ın iç reasoning'ine bağımlı olmaz

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P11 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/adapters/src/codex.ts:8` |

## Decision

Y, agent'ın iç muhakemesine, düşünce zincirine veya prompt formatına
**bağımlı değildir**. Sözleşme yalnız gözlemlenebilir olaylar üzerinedir:
tool çağrısı, dosya okuma/yazma, komut, tamamlanma.

## Context

Spec §15: "Y agent'ın iç reasoning'ine bağımlı olmamalıdır."

## Reason

Agent'ların iç yapısı sürüm sürüm değişir ve satıcıya özgüdür. Ona
bağımlı bir kontrol katmanı, her model güncellemesinde kırılır.

Daha önemlisi: iç muhakeme **kanıt değildir**. Agent'ın ne düşündüğünü
söylemesi ile ne yaptığı farklıdır; governance ikincisine bakmalıdır.

## Consequences

- Adapter yüzeyi dar: `health`, `negotiate`, `start`, `events`, `cancel`.
- Yeni bir agent eklemek yalnız bu yüzeyi implemente etmektir.
- Bkz. [ADR-045](ADR-045-capability-negotiation-per-run.md).

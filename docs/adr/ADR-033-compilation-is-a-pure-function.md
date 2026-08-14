# ADR-033 — Derleme saf fonksiyondur

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P08 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/compiler/compile.ts:2` |

## Decision

Context derleme **saf bir fonksiyondur**: aynı girdi (commit, task,
policy, compiler sürümü, konfigürasyon) aynı manifest'i üretir. Fonksiyon
içinde I/O yoktur.

## Context

Spec §10: "Context pack deterministic olmalıdır. Aynı repository commit,
task, policy, compiler version, configuration kombinasyonu aynı manifest'i
üretmelidir."

## Reason

İçinde I/O olan bir derleyici deterministik olamaz: sorgu sırası,
zaman damgası veya ağ gecikmesi sonucu değiştirir.

Saflık aynı zamanda **test edilebilirlik** demektir: derleyicinin test
dosyasında hiçbir mock yoktur ve bu bir tesadüf değil, bu kararın doğrudan
sonucudur. Mock gerektiren bir saf fonksiyon, saf değildir.

## Consequences

- Tüm veri fonksiyona **girdi olarak** verilir; fonksiyon veri çekmez.
- `hashInputs()` girdiyi sıralı anahtarlarla kanonikleştirir.
- Bkz. [ADR-035](ADR-035-canonical-json.md).

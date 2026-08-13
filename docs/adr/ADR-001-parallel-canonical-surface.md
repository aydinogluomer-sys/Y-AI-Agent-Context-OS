# ADR-001 — Paralel Kanonik Yüzey + Cutover

| Alan | Değer |
|---|---|
| Durum | **Kabul edildi** |
| Faz | P01 |
| Tarih | 2026-08-13 |

## Decision

`apps/api/src/index.ts` (7.170 satır, 199 route) ve 113 sekmeli UI **yerinde
refactor edilmeyecek**. Yanlarına kanonik yüzey kurulacak ve faz faz cutover
yapılacaktır.

## Context

P00 Truth Audit: tek dosyada 199 route, bunların 27'si `router.all(["/tasks","/tasks/*"])`
tarafından gölgelenmiş ve erişilemez. Frontend hâlâ bu ölü route'lardan bir
kısmını çağırıyor. 113 UI ekranının 103'ü fabrikasyon.

## Alternatives

1. **Yerinde strangler-fig refactor** — reddedildi: her faz aynı dosyaya
   dokunur; paralel workstream'ler (A–F) sürekli çakışır, rollback zorlaşır.
2. **Greenfield rewrite** — reddedildi: `packages/*` içindeki gerçekten
   çalışan capability'ler (Event Store, CAS, graph, TS AST parser) risk altına girer.
3. **Paralel kanonik yüzey + cutover** — SEÇİLEN.

## Reason

Her fazın kendi exit gate'i olur; legacy yüzey feature flag arkasında yaşamaya
devam eder. Bir faz başarısız olursa yalnız o fazın kanonik route'ları geri alınır.

## Consequences

- Geçiş süresince iki yüzey ayakta kalır; ortak yazım noktaları `domain/`
  katmanına taşınmalıdır (aynı tabloya farklı invariant'larla yazım YASAK).
- `apps/api/src/index.ts` yalnız **silme** yönünde değişir.
- Legacy route'lar kanonik karşılığı yayına girince `410 Gone` + `Sunset`
  header döner, P19'da tamamen silinir.

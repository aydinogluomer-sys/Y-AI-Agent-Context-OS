# 08 — Ölü Kod ve Ölü Route'lar

## Gölgelenmiş route'lar

`apps/api/src/index.ts:166` satırındaki

```ts
router.all(["/tasks", "/tasks/*"], (req, res) => res.status(410).json({ ... }));
```

kendisinden **sonra** kaydedilen **27 route'u** erişilemez kılıyor.
Tam liste: `02-api-inventory.csv` → `shadowed_by` kolonu dolu satırlar.

Frontend bunlardan bir kısmını hâlâ çağırıyor (`apps/web/src/lib/api/tasks.ts`),
yani o özellikler sessizce 410 dönüyor.

## Fabrikasyon UI ekranları

103 nav item `ModuleSimulationPanel`'e düşüyor (`App.tsx` `default:` dalı).
Tam liste: `03-ui-inventory.csv` → `verdict = FAKE`.

**Dürüstlük mekanizması kırık:** `navigation.ts` `status` alanı taşıyor ve
`AppShell.tsx` `placeholder` için "Simüle" rozeti gösteriyor — ama
113 kaydın tamamı `"implemented"`, `"placeholder"` sayısı **0**.
Ayrıca `App.tsx`'teki dürüst `renderPlaceholderView()` fonksiyonu tanımlı
ve **hiç çağrılmıyor**.

## Ölü frontend modülleri

| Modül | Durum |
|---|---|
| `apps/web/src/features/landing/**` | 0 importer |
| `apps/web/src/hooks/useKnowledgeGraph.ts` | 0 importer |
| `apps/web/src/hooks/useSecurityVault.ts` | 0 importer |
| `apps/web/src/modules/command/ProjectDashboard.tsx` | 0 importer |
| `LandingPage` + `CyberCanvas` + `SymmetryHud` + `ControlTerminal` | `cockpitLaunched=true` başlangıç değeri yüzünden tek gizli butonun arkasında |

## Ölü şema

Bkz. `07-schema-drift.md` → Ölü şema bölümü.

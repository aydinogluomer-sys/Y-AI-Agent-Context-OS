# Phase 15 — UI/UX Product Consolidation

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P14](P14-evidence-audit-cas-consolidation.md) · [P16 →](P16-evaluation-and-benchmark-harness.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P15 |
| **Workstream** | E — UI/UX |
| **Dependencies** | P09, P13, P14 |
| **Migration bloğu** | — |

## Objective

113 nav item'ı **5 birincil yüzey + Settings + role-gated Advanced**'e indirmek; 103 fabrikasyon ekranı silmek; URL tabanlı routing kurmak. **MODULE ≠ PAGE.**

## Why This Phase Exists

`navigation.ts` 113 item tanımlıyor; `App.tsx` `switch`'inde **11 `case`** var. Kalan 102 item + chat-cockpit `ModuleSimulationPanel`'e düşüyor (`App.tsx:704-706`).

Dürüstlük mekanizması da kırık: `navigation.ts` `status: "implemented" | "placeholder"` alanı taşıyor ve `AppShell.tsx:190,210-214` `placeholder` için "Simüle" rozeti gösteriyor — ama **114 kaydın tamamı `"implemented"`, `"placeholder"` sayısı 0**. Yani sidebar operatöre 113 ekranın da gerçek olduğunu söylüyor. Dahası `renderPlaceholderView()` (`App.tsx:709-731`) dürüst bir "Henüz Kodlanmadı" kartı render ediyor ama **hiç çağrılmıyor**.

En tehlikeli üç grup:
- **QA/Validation (15 route)** — test çalıştırmayan bir "Test Koşturucu" ve uydurma PASS çıktısı basan 9 "Stage NN Doğrulaması" ekranı.
- **Agent Network (8 route)** — 5 elemanlı literal diziden beslenen sahte agent konseyi.
- **`/gov/signoff`** — lokal React state'i ile "release sign-off" yapılabiliyor.

Router yok: `useState<TabId>` + `switch`. `navigation.ts`'teki `route: "/chat"` string'leri dekoratif — hiçbir yerde `history.pushState` yok. Deep-link, geri/ileri ve refresh-to-same-screen imkânsız. Bir governance ürününde run/evidence paylaşılabilir link olmadan çalışmaz.

Ayrıca ~2.300 satırlık `LandingPage`+`CyberCanvas` sinematiği `cockpitLaunched=true` başlangıç değeri yüzünden tek gizli butonun arkasında; `features/landing/*` (particle engine) **0 importer**.

## Dependencies

P09 (manifest), P13 (SSE), P14 (evidence read model).

## Current Repository Reality

| Konu | Gerçek |
|---|---|
| Nav item | 113 (15 kategori) |
| Gerçek API'li ekran | 9 REAL + 1 HYBRID |
| Fabrikasyon | 103 |
| Router | Yok |
| State yönetimi | `useState` + 8 bespoke hook; store/query client yok |
| API katmanı | 7 modül, ortak wrapper yok, çoğu `any` döner, timeout/retry/AbortController yok |
| Auth | `auth-bootstrap.ts` fetch monkey-patch (P02'de kaldırıldı) |
| Kırık çağrılar | 4 worker endpoint'i (404) + 10+ `/tasks/*` çağrısı (410) |
| Ölü kod | `features/landing/*`, `useKnowledgeGraph`, `useSecurityVault`, `modules/command/ProjectDashboard`, `renderPlaceholderView` |
| `index.html` | Başlık: "My Google AI Studio App" |

## Target State

Master Appendix D (bilgi mimarisi) ve Appendix F (route göç matrisi). Özet:

```text
Projects · Tasks/Runs · Context · Policies · Evidence   +  Settings
Advanced ▸ Providers · Indexes · Workers · Locks · Health · Diagnostics · Graph Explorer
```

**113 route → 6 birincil + 7 advanced.** Silinen 68, birleştirilen 31, korunan/refactor 14.

## Architecture Decisions

- **ADR-012** — react-router; URL = state.
- **ADR-056 (yeni)** — **Simülasyon rozeti type-level.** `ProvenanceMode !== "PRODUCTION"` olan her veri kalıcı, kapatılamaz rozet gösterir. Alternatif olan "nav item'da status alanı" denendi ve **kırıldı** (114/0). Sebep: dürüstlük işareti veriden türemeli, elle bakımdan değil.
- **ADR-057 (yeni)** — **Progressive disclosure.** Advanced yüzeyler rol tabanlı ve ana navigasyonda değil. Sebep: backend'de 40 capability olabilir, UI'da 40 sayfa olmak zorunda değildir.
- **ADR-058 (yeni)** — **Tipli API client, üretilmiş tiplerden.** `packages/shared` tiplerinden istemci tipleri türetilir; `any` dönen endpoint kalmaz. Sebep: bugünkü 4 kırık çağrı tip kontrolüyle yakalanırdı.

## Files / Packages Affected

`apps/web/src/**` (tamamı), `index.html`, `server.ts` (simulate-task zaten P11'de silindi).

### New Files

```text
apps/web/src/router.tsx
apps/web/src/surfaces/projects/{List,Detail,Repositories,Agents,Team,Policy}.tsx
apps/web/src/surfaces/tasks/{List,Detail,RunDetail,RunProgress,Approvals}.tsx
apps/web/src/surfaces/context/{Overview,WhySelected,InspectManifest,InspectGraph,InspectRanking}.tsx
apps/web/src/surfaces/policies/{Builder,Versions,Simulate}.tsx
apps/web/src/surfaces/evidence/{Overview,Context,Changes,Timeline,Verification,Audit}.tsx
apps/web/src/surfaces/settings/{Organization,Members,Providers,Tokens}.tsx
apps/web/src/advanced/{providers,indexes,workers,locks,health,diagnostics,graph}/*.tsx
apps/web/src/lib/api/client.ts            tek fetch wrapper (timeout/abort/retry/error)
apps/web/src/lib/api/generated-types.ts   packages/shared'dan türetilmiş
apps/web/src/lib/sse/useRunStream.ts
apps/web/src/components/ProvenanceBadge.tsx
apps/web/src/__tests__/**                 component testleri
tests/e2e/surfaces/*.spec.ts
```

### Files to Modify

- `index.html` — başlık ve meta düzeltmesi.
- `apps/web/src/main.tsx` — router mount.
- `AppShell.tsx` — 15 kategori × 113 item yerine 6 + Advanced.

### Files to Delete/Deprecate

```text
apps/web/src/App.tsx                       (970 satır switch)
apps/web/src/components/ModuleSimulationPanel.tsx     (102 ekranı besliyordu)
apps/web/src/components/LandingPage.tsx    (763)
apps/web/src/components/CyberCanvas.tsx    (896)
apps/web/src/components/SymmetryHud.tsx · ControlTerminal.tsx
apps/web/src/components/motion/{AuroraOrb,AwwwardsCursor}.tsx
apps/web/src/features/landing/**           (0 importer, particle engine)
apps/web/src/hooks/{useKnowledgeGraph,useSecurityVault,useWorkspace}.ts
apps/web/src/modules/command/ProjectDashboard.tsx
apps/web/src/lib/api/ai.ts                 (createLocalAiSimulation, 217 satır)
apps/web/src/lib/api/auth-bootstrap.ts     (P02'de değiştirildi)
apps/web/src/hooks/{useSmoothScroll,useMagnetic,useTextReveal}.ts
apps/web/src/utils/dataHelpers.ts
packages/ui/                               (P01'de silindi)
```

**Toplam silinen tahmini: ~6.000 satır fabrikasyon + ölü kod.**

## Database Changes

Yok.

## API Changes

Yok (tüketici). Ancak P12'de tespit edilen 4 kırık worker endpoint çağrısı burada kanonik isimlere hizalanır.

## Type / Contract Changes

`generated-types.ts` `packages/shared`'dan türetilir; el yazımı `any` tipleri kaldırılır.

## Frontend Changes

Bu fazın tamamı frontend.

## Backend Changes

Yok. (`server.ts`'in `simulate-task`'ı P11'de silindi.)

## Worker Changes

Yok.

## Security Changes

- Frontend'de sır yok: `useWorkspace.ts`'in DB parolasını state'e yazan kodu P02'de silindi; burada dosya tamamen kaldırılır.
- `LandingPage.tsx:75-77`'deki örnek credential'lar (secret scanner'ın yakalayacağı formatta) siliniyor.
- Yıkıcı işlemler UI'dan kaldırılıyor: `/dev-reset`, `/migrations` tetikleme, `/db-pool` yapılandırma.
- `/gov/signoff` siliniyor — sign-off bir CI/CD gate'idir.
- Role-based görünürlük: Advanced yüzeyler yalnız yetkili rollere; **ama asıl kontrol backend'de** (UI gizleme güvenlik değildir).

## Migration Strategy

`Y_UI_SURFACE=v2` feature flag'i:

1. Router + 5 yüzey iskeleti kurulur, flag `false` (legacy switch aktif).
2. Yüzeyler tek tek gerçek veriye bağlanır; her biri kendi E2E testiyle gelir.
3. Flag `true` yapılır; legacy switch erişilemez hale gelir.
4. Legacy dosyalar silinir; flag P19'da kaldırılır.

## Implementation Tasks

### Y-P15-001 — Router + kabuk
**Create:** `router.tsx`, `AppShell` yeniden yazımı. URL = state; deep-link, geri/ileri, refresh çalışır.

### Y-P15-002 — Tipli API client
**Create:** `lib/api/client.ts` + `generated-types.ts`. Timeout, `AbortController`, retry (yalnız idempotent GET), tek tip hata şekli.
**Acceptance:** `any` dönen endpoint sarmalayıcısı = 0.

### Y-P15-003 — Projects yüzeyi
Repositories (connect/sync/index durumu), Agents (health/capabilities), Team (membership), Policy binding.

### Y-P15-004 — Tasks/Runs yüzeyi (**ana ürün yüzeyi**)
Task listesi/detayı; run progression (`Context ✓ · Policy ✓ · Agent ● · Tests · Evidence`); SSE ile canlı olay akışı; engellenen mutation'lar; onay istekleri.

### Y-P15-005 — Context yüzeyi
Bütçe satırı (`31,284 / 50,000`), seçilen kaynak sayısı, **"Why?"** kırılımı (doğrudan bağımlılık / test / ADR / ters bağımlılık / son değişiklik), policy ile dışlananlar.
Advanced: Inspect Manifest · Inspect Dependency Graph · Inspect Ranking.

### Y-P15-006 — Policies yüzeyi
Glob tabanlı READ/APPROVAL/DENY builder; sürüm listesi + diff; simülasyon ("bu policy şu task'ta neyi kapatır?").
**Not:** Kullanıcı Permission Kernel'in iç karmaşıklığını görmez.

### Y-P15-007 — Evidence yüzeyi
Tek tutarlı Run Evidence deneyimi: Overview · Context · Changes · Timeline · Verification · Audit. Mevcut 4 gerçek panel buraya birleşir.

### Y-P15-008 — Settings + Advanced
Settings: Organization · Members · Providers · Tokens.
Advanced (role-gated): Providers · Indexes · Workers · Locks · Health · Diagnostics · Graph Explorer.

### Y-P15-009 — `ProvenanceBadge`
`mode !== "PRODUCTION"` olan her veri için kalıcı rozet.
**Negative test:** `SIMULATED` veri rozetsiz render edilemiyor (tip zorunluluğu).

### Y-P15-010 — Fabrikasyon ve ölü kodun silinmesi
Yukarıdaki silme listesi.
**Negative test:** `ModuleSimulationPanel`, `createLocalAiSimulation`, `setTimeout` tabanlı sahte pipeline kaynak ağacında yok.

### Y-P15-011 — Kırık çağrıların hizalanması
4 worker endpoint'i + 10+ `/tasks/*` çağrısı kanonik `/api/v1/*` karşılıklarına.
**Acceptance:** Frontend'den 404/410 dönen çağrı yok (E2E ağ günlüğü kontrolü).

### Y-P15-012 — Erişilebilirlik ve i18n tutarlılığı
`docs/qa-ui-standards/ui-accessibility-notes.md`'deki kontrast tokenları uygulanır; karışık Türkçe/İngilizce metinler tek dile hizalanır (`E_コネクター未設定` gibi kalıntılar P03'te gitti).

### Y-P15-013 — `index.html` ve marka düzeltmeleri

## Parallelizable Tasks

```text
Y-P15-003 ∥ Y-P15-004 ∥ Y-P15-005 ∥ Y-P15-006 ∥ Y-P15-007 ∥ Y-P15-008
```
Beş yüzey farklı dizinlerde; ortak bağımlılık yalnız `client.ts` ve router.
Sıralı: `001 → 002 → (yüzeyler) → 010 → 011`.

**Kritik kural:** P15 `apps/web/src/App.tsx`'in **tek sahibidir**; başka hiçbir faz bu dosyaya dokunmaz (master §6.1).

## Tests

| Suite | İçerik |
|---|---|
| Component testleri | Her yüzeyin ana bileşenleri; yükleme/hata/boş durumları |
| `client.test.ts` | Timeout, abort, retry, hata şekli |
| `useRunStream.test.ts` | SSE bağlanma, reconnect, tekilleştirme |
| `provenance-badge.test.ts` | Rozet zorunluluğu |
| `routing.test.ts` | Deep-link, geri/ileri, refresh |

## Negative Tests

- Yetkisiz rol Advanced yüzeye URL ile giderse → **backend 403** (UI gizleme tek başına yeterli değil).
- Refresh sonrası run durumu kaybolursa → test **fail**.
- 404/410 dönen frontend çağrısı → E2E **fail**.
- `SIMULATED` veri rozetsiz → test **fail**.
- Silinen ekranlara ait route'a gidilirse → 404 sayfası (sahte içerik değil).
- API `any` dönerse → tip testi **fail**.

## Security Tests

- Role-based görünürlük + **backend enforcement** (T-01).
- Frontend bundle'ında sır/credential taraması (build çıktısında).

## E2E

`tests/e2e/surfaces/*.spec.ts` — beş yüzeyin her biri gerçek veriyle render oluyor.
`tests/e2e/golden-path-ui.spec.ts` — master Appendix L.2'nin 30 adımı UI üzerinden; **28. adım (browser refresh) ve 29. adım (tam restore)** burada kanıtlanır.

## Observability

Frontend hata takibi (correlation ID ile backend'e bağlı), sayfa yükleme metrikleri, SSE bağlantı sağlığı.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| SSE kullanılamıyor | Canlı akış yok | `GET /runs/:id` polling fallback'i; kullanıcıya "gecikmeli" göstergesi |
| Büyük manifest | UI donuyor | Sanallaştırılmış liste + sayfalama |
| Flag cutover erken | Eksik yüzey | Yüzey bazlı flag; hepsi hazır olmadan global flag açılmaz |
| Silinen ekran özlenir | Kullanıcı şikâyeti | Appendix F'de her route'un gerekçesi var; gerekirse Advanced'e eklenir, birincil navigasyona değil |

## Rollback / Recovery

`Y_UI_SURFACE=v1` ile legacy switch'e dönülebilir — **ama yalnız legacy dosyalar silinmeden önce.** Silme (Y-P15-010) cutover doğrulandıktan sonra ayrı commit'te yapılır ve geri alınmaz.

## Acceptance Criteria

1. 5 birincil yüzey + Settings + Advanced çalışıyor.
2. 113 route → 6 birincil + 7 advanced; Appendix F'deki her route'un kaderi uygulanmış.
3. `ModuleSimulationPanel` ve tüm fabrikasyon ekranlar silinmiş.
4. URL tabanlı routing; deep-link + refresh + geri/ileri çalışıyor.
5. Tipli API client; `any` dönen sarmalayıcı yok.
6. Frontend'den 404/410 dönen çağrı yok.
7. `ProvenanceBadge` type-level zorunlu.
8. Yıkıcı işlemler ve release sign-off UI'dan kaldırılmış.
9. Refresh sonrası run tam restore ediliyor.
10. `index.html` başlığı doğru.

## Evidence Required

```text
tests/e2e/surfaces/*.spec.ts              PASS
tests/e2e/golden-path-ui.spec.ts          PASS (refresh + restore dahil)
E2E ağ günlüğü                             0 adet 404/410
silinen satır sayısı                       git diff --stat (~6.000 satır)
grep -rn "ModuleSimulationPanel\|createLocalAiSimulation"   boş
bundle sır taraması                        0 bulgu
ekran görüntüleri                          5 yüzey
```

## Exit Gate

```bash
pnpm run typecheck
pnpm test --filter @y/web
pnpm run test:e2e -- tests/e2e/surfaces
pnpm run test:e2e -- tests/e2e/golden-path-ui.spec.ts
pnpm run build
pnpm run secret-scan
```

Ek zorunluluk: **fabrikasyon ekran sayısı = 0** ve feature registry'de hiçbir UI kaydı kanıtsız `PASS` değil.

# Phase 20 — Final Production Acceptance

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P19](P19-cicd-deployment-migration.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P20 |
| **Workstream** | Tüm ekip |
| **Dependencies** | P16, P19 |
| **Migration bloğu** | — |

## Objective

Çözülmemiş hiçbir production blocker kalmadığını kanıtlamak. 30 adımlık Final Golden E2E'yi production-like ortamda geçirmek, Definition of Done'ın tamamını doğrulamak ve feature registry'yi kanıta bağlı olarak yeniden yayımlamak.

## Why This Phase Exists

Bu proje daha önce "tamamlandı" ilan edildi ve iddia kanıtlanmadı: `docs/audit/10-feature-traceability-matrix.md` 15 kategorinin tamamını `PASS` gösteriyordu; `docs/stages/*.md` dokuz stage için `SUCCESSFUL PASS` yazıyordu; `implementation.md:25` `test:db`'nin "0 failure, 0 skip" ile geçtiğini iddia ediyordu — CI'da hiç çalışmayan bir suite için. Aynı anda 113 ekranın 103'ü fabrikasyondu.

P20 bu hatanın tekrarını engelleyen fazdır: **kabul, iddia ile değil, çalıştırılmış kanıtla verilir.**

## Dependencies

P16 (benchmark), P19 (CI/CD). Diğer tüm fazların exit gate'leri geçmiş olmalı.

## Current Repository Reality

P00'dan P19'a kadar her fazın exit gate'i kaydedilmiş olmalıdır. Bu faz yeni özellik geliştirmez; **doğrular ve kapatır**.

## Target State

```text
RUN #Y-84922

Context     ✓ 14 files · 31,284 tokens · 100% provenance
Security    ✓ 3 sensitive sources excluded · 0 secret leak
Agent       Codex
Changes     ✓ 4 files · +181 −43
Tests       ✓ 47 / 47
Boundaries  ✓ no unauthorized mutation
Evidence    B74F8A...
```

Bu özet production-like ortamda **gerçek bir run'dan** üretilir ve doğrulanır.

## Architecture Decisions

- **ADR-074 (yeni)** — **Kabul kanıta bağlıdır.** Hiçbir DoD maddesi "kod okuyarak" onaylanamaz; her madde çalıştırılmış bir komutun çıktısına referans verir.
- **ADR-075 (yeni)** — **Feature registry release artifact'ıdır.** Her `PASS` kaydı commit SHA + test referansı + evidence hash taşır ve CI tarafından doğrulanır (P19 Y-P19-009).

## Files / Packages Affected

`docs/`, `docs/audit/feature-registry.yaml`, release artifact'ları. **Production kodunda yalnız bulunan blocker'ların düzeltmesi.**

### New Files

```text
docs/release/{acceptance-report.md,dod-checklist.md,blocker-log.md}
docs/release/evidence/                    her kabul maddesi için komut çıktısı
tests/e2e/golden-path-full.spec.ts        30 adımın tamamı
```

### Files to Modify

- `docs/audit/feature-registry.yaml` — kanıta bağlı yeniden yayım.
- `README.md`, `implementation.md` — P00'da eklenen SUPERSEDED banner'ları kaldırılır ve içerik **gerçek** durumla değiştirilir.

### Files to Delete/Deprecate

- P00'da arşive alınan eski durum belgeleri (yanıltıcı olanlar) — `docs/archive/` altına taşınır, kök dizinden kaldırılır.

## Database Changes

Yok.

## API Changes

Yok.

## Type / Contract Changes

Yok.

## Frontend Changes

Yalnız bulunan blocker'ların düzeltmesi.

## Backend Changes

Yalnız bulunan blocker'ların düzeltmesi.

## Worker Changes

Yok.

## Security Changes

P17'nin Security Gate'i burada **canlı sistemde** yeniden doğrulanır.

## Migration Strategy

Yok (kabul fazı).

## Implementation Tasks

### Y-P20-001 — Production-like ortam kurulumu
Gerçek Postgres + pgvector, gerçek OIDC, gerçek Git repository, gerçek agent adapter (Claude Code ve Codex), gerçek secret manager, OTel collector.
**Acceptance:** Ortam `docs/deployment/single-node.md` **izlenerek** kuruldu (dokümanın doğrulaması da budur).

### Y-P20-002 — Final Golden E2E (30 adım)
**Create:** `tests/e2e/golden-path-full.spec.ts`
```text
 1 User authenticates (OIDC)          16 Y compiles model-specific context
 2 Creates/selects organization       17 Manifest persisted and hashed
 3 Creates project                    18 Claude Code or Codex receives context
 4 Connects real Git repository       19 Agent produces real tool/file events
 5 Repository cloned/fetched          20 Change Firewall evaluates mutations
 6 Index job starts                   21 Out-of-bound change blocked/approval-gated
 7 AST generated                      22 Approved mutation proceeds
 8 Symbols persisted                  23 Tests run (gerçek exit code)
 9 Graph generated                    24 Quality gates run
10 Semantic index generated           25 Evidence persisted
11 User creates real task             26 Audit persisted
12 Y resolves identity and policy     27 Run completes
13 Y discovers candidate context      28 Browser refreshes
14 Y graph-expands context            29 Entire run restored from persistence
15 Y filters denied sources           30 Reviewer inspects context/changes/decisions/evidence
```
**Acceptance:** 30 adımın **hiçbiri** simüle değil. Her adım için kanıt (DB satırı, dosya hash'i, git diff, exit code, ekran görüntüsü).

### Y-P20-003 — İkinci adapter ile tekrar
Aynı E2E hem Claude Code hem Codex adapter'ıyla koşulur.
**Acceptance:** İki adapter da golden path'i tamamlıyor.

### Y-P20-004 — Definition of Done doğrulaması
**Create:** `docs/release/dod-checklist.md`. Master Appendix L.1'deki her madde için: komut + çıktı + tarih + commit SHA.
**Acceptance:** Kanıtsız işaretlenmiş madde **yok**.

### Y-P20-005 — Security Gate canlı doğrulaması
P17'nin 9 maddesi production-like ortamda gerçek saldırı denemeleriyle doğrulanır.

### Y-P20-006 — Benchmark gate doğrulaması
P16'nın dört hard gate'i son sürümle yeniden koşulur:
```text
critical context recall ≥ 95% · secret leakage = 0
unauthorized mutation = 0 · context provenance = 100%
+ değer kanıtı (task success artışı VEYA ≥ %30 daha az input token)
```

### Y-P20-007 — Release blocker taraması
**Create:** `docs/release/blocker-log.md`. Master Appendix L.3'teki P0/P1 listesi + bu fazda bulunan yeni bulgular.
**Kural:** P0 = 0, production-critical P1 = 0. P2'ler ayrı listelenir ve açıkça kabul edilir.

### Y-P20-008 — Kritik TODO/placeholder taraması
Çekirdek ürün yollarında `TODO`, `FIXME`, `future work`, `later`, `placeholder`, `simulation` taraması.
**Acceptance:** Golden path'e dokunan kodda 0 bulgu.

### Y-P20-009 — Feature registry yeniden yayımı
Her kayıt yeni enum'la; `PASS` yalnız tam kanıtla (implementation · persistence · policy · unit · integration · E2E · negative · evidence · commit SHA · timestamp).
**Acceptance:** `validate-feature-registry.ts` (P19) geçiyor.

### Y-P20-010 — Doküman gerçeklik denetimi
P00'un `09-doc-contradictions.md` listesindeki her çelişki tek tek kapatılır.
**Acceptance:** Kapatılmamış çelişki yok; SUPERSEDED banner'ları kaldırılabiliyor.

### Y-P20-011 — Kabul raporu
**Create:** `docs/release/acceptance-report.md`. 16 son kalite kontrolü sorusunun (master §Son Kalite Kontrolü) her biri için kanıt referansı.

### Y-P20-012 — Blocker düzeltmeleri
Bu fazda bulunan P0/P1'ler düzeltilir ve ilgili fazın testine eklenir (regresyon).

## Parallelizable Tasks

```text
Y-P20-004 ∥ Y-P20-005 ∥ Y-P20-006 ∥ Y-P20-008
Y-P20-009 ∥ Y-P20-010
```
Sıralı: `001 → 002 → 003`, `007 → 012 → (yeniden 002)`.

## Tests

Bu fazda **yeni test yazılmaz** — bir istisna: `golden-path-full.spec.ts`. Diğer her şey önceki fazların suite'lerinin production-like ortamda yeniden koşulmasıdır:

```text
unit · contract · integration · security (24) · resilience (10) · performance · E2E · benchmark
```

## Negative Tests

Golden E2E'nin içinde:
- 21. adım: boundary dışı değişiklik **gerçekten engelleniyor** (dosya değişmiyor).
- 15. adım: DENY'li kaynak manifest'te yok, `exclusions`'ta var.
- 29. adım: refresh sonrası **hiçbir state bellekten** gelmiyor.
- Her adım için "bu adım simüle mi?" kontrolü: ilgili DB kaydı/dosya hash'i/exit code var mı.

## Security Tests

P17'nin 24 suite'i + canlı Security Gate doğrulaması.

## E2E

`tests/e2e/golden-path-full.spec.ts` — 30 adım, iki adapter.

## Observability

Kabul koşusunun tam trace'i, log'u ve metrikleri kanıt olarak saklanır.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Bir adım simüle çıkar | Kanıt yok | İlgili faza geri dönülür; P20 yeniden koşulur. **Kısmi kabul yok** |
| Benchmark gate düşer | Hard gate fail | P06/P08/P09 kalibrasyonu; hedef **düşürülmez** |
| Yeni P0 bulunur | Blocker | Düzeltilir + regresyon testi + P20 yeniden koşulur |
| Doküman çelişkisi kalır | Denetim fail | Doküman düzeltilir veya kod iddiayı karşılar |
| İkinci adapter geçmez | Vendor bağımlılığı | Adapter sözleşmesi eksik demektir; P11'e dönülür |

## Rollback / Recovery

Bu faz kod değiştirmez (blocker düzeltmeleri hariç). Kabul verilmezse önceki faza dönülür.

## Acceptance Criteria

Master **Appendix L.1** (Definition of Done) tamamı + aşağıdakiler:

1. 30 adımlık Golden E2E production-like ortamda geçiyor — **hiçbir adım simüle değil**.
2. Aynı E2E hem Claude Code hem Codex ile geçiyor.
3. Security Gate'in 9 maddesi canlı doğrulanmış.
4. Benchmark'ın 4 hard gate'i + değer kanıtı karşılanmış.
5. **P0 = 0**, production-critical **P1 = 0**.
6. Golden path kodunda TODO/placeholder/simulation = 0.
7. Feature registry kanıta bağlı; `validate-feature-registry.ts` geçiyor.
8. P00'daki doküman çelişkilerinin tamamı kapatılmış.
9. 16 son kalite kontrolü sorusunun tamamı kanıtla yanıtlanmış.
10. Deployment dokümanı izlenerek ortam kurulabilmiş.

## Evidence Required

```text
docs/release/acceptance-report.md          16 soru × kanıt referansı
docs/release/dod-checklist.md              her madde × komut + çıktı + commit SHA
docs/release/blocker-log.md                P0=0, P1=0, P2 listesi
docs/release/evidence/**                   ham komut çıktıları
tests/e2e/golden-path-full.spec.ts         PASS × 2 adapter
benchmark raporu                            4 hard gate + değer kanıtı
security posture çıktısı                    9 madde
gerçek run evidence bundle                  imza doğrulanmış
CI tam pipeline logu                        tüm gate'ler yeşil
feature-registry.yaml                       kanıta bağlı
```

## Exit Gate

```bash
# Production-like ortamda, tam sıra
pnpm install --frozen-lockfile
pnpm run lint && pnpm run typecheck
pnpm test && pnpm run test:contract
pnpm run db:migrate:fresh && pnpm run test:integration
pnpm run db:migrate:upgrade
pnpm run test:security          # 24 suite
pnpm run test:resilience        # 10 senaryo
pnpm run test:performance       # bütçeler
pnpm run test:e2e               # golden-path-full dahil
pnpm --filter @y/eval run report -- --check-gates
tsx scripts/ci/validate-feature-registry.ts
tsx scripts/security/false-green-scan.ts
tsx scripts/ci/drift-detect.ts
pnpm run build
```

**Hepsi exit 0 ve `docs/release/blocker-log.md` içinde P0 = 0, production-critical P1 = 0 ise proje tamamlanmıştır.**

---

## Sonrası

Bu belge bittiğinde yeni bir implementation roadmap'e ihtiyaç kalmamalıdır. Bundan sonraki çalışma:

- Ürün geliştirme (yeni capability'ler, yeni adapter'lar) — kendi ADR'leri ve fazlarıyla,
- Operasyon (SLO takibi, kapasite, güvenlik güncellemeleri),
- Benchmark'ın düzenli tekrarı (regresyon koruması).

**Bu roadmap'in görevi bitmiştir.**

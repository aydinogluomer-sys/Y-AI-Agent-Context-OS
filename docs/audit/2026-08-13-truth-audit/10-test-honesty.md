# 10 — Test Dürüstlüğü ve Sahte Başarı Yolları

> Üreten: `scripts/audit/scan-false-green.ts` · Baseline commit: `9f10f70`
> Kanıt standardı: her bulgu dosya:satır referanslıdır (`10-false-green-findings.csv`).

## Özet

| Ölçüt | Değer |
|---|---|
| Taranan dosya | 129 |
| Toplam bulgu | **197** |
| P0 (release blocker) | **119** |
| P1 (production-critical) | **78** |

## Kural bazlı dağılım

| Kural | Şiddet | Bulgu | Açıklama |
|---|---|---:|---|
| `assert-true` | P0 | 52 | assert("...", true) — koşulsuz geçen sahte assertion |
| `skip-then-pass` | P0 | 36 | DB/bağımlılık yoksa atla ve yine de PASS say |
| `fabricated-hash` | P0 | 1 | Math.random() ile üretilip hash gibi sunulan değer |
| `settimeout-success` | P0 | 0 | setTimeout/delay sonrası koşulsuz başarı durumu |
| `fallback-success` | P0 | 0 | Sağlayıcı/servis hatasında sahte başarıya düşme |
| `simulation-generator` | P0 | 14 | Uydurma çıktı üreten fonksiyon |
| `hardcoded-metric` | P1 | 7 | Ölçülmeden yazılmış metrik/confidence literal'i |
| `literal-run-count` | P0 | 1 | Run sonucunda hesaplanmadan yazılmış sayaç |
| `fabricated-diff` | P1 | 4 | Git'e bakılmadan üretilmiş diff/author kaydı |
| `embedded-secret` | P0 | 3 | Kaynak kodda gömülü / parçalanmış sır |
| `permissive-fallback` | P0 | 12 | Hata durumunda izin veren güvenlik fallback'i |
| `unconditional-flag` | P1 | 1 | Doğrulanmadan true yazılan güvenlik bayrağı |
| `stub-dependency` | P1 | 6 | Gerçek analiz yerine stub bağımlılık kaydı |
| `weak-e2e-assertion` | P1 | 0 | toBeLessThan(400/500) — 401/404 dahi geçiren E2E iddiası |
| `random-primary-key` | P1 | 60 | Math.random() ile primary key üretimi |

## En yoğun 25 dosya

| Dosya | Bulgu |
|---|---:|
| `scripts/validate-vault.ts` | 46 |
| `scripts/validate-segment-20-26.ts` | 23 |
| `scripts/validate-segment-19-21.ts` | 18 |
| `packages/context/src/index.ts` | 12 |
| `apps/api/src/index.ts` | 10 |
| `scripts/validate-segment-1-10.ts` | 8 |
| `scripts/validate-segment-15-18.ts` | 6 |
| `scripts/validate-stage-34.ts` | 6 |
| `scripts/validate-stage-35.ts` | 6 |
| `apps/api/src/db.ts` | 4 |
| `apps/web/src/lib/api/ai.ts` | 4 |
| `packages/agents/src/resume.ts` | 4 |
| `scripts/validation-suite.ts` | 4 |
| `packages/context/src/search-server.ts` | 3 |
| `packages/core/src/incremental-index-service.ts` | 3 |
| `packages/core/src/index-job-service.ts` | 3 |
| `scripts/validate-phase-2-runner.ts` | 3 |
| `scripts/validate-segment-11-14.ts` | 3 |
| `apps/api/src/WorkerRuntimeService.ts` | 2 |
| `packages/agents/src/debug.ts` | 2 |
| `packages/agents/src/handoff.ts` | 2 |
| `packages/security/src/index.ts` | 2 |
| `scripts/validate-phase-3-startup.ts` | 2 |
| `scripts/validate-stage-27.ts` | 2 |
| `apps/api/src/audit.ts` | 1 |

## Yorum

Bu tablo, mevcut test ve doğrulama altyapısının neden yanıltıcı yeşil verdiğini
açıklar. `npm run test:deterministic` 162 assertion'ın tamamını geçirip exit 0
dönerken, aynı koşuda 13 skip marker basılmaktadır — yani veritabanı yokken
kontroller atlanmakta ve sonuç yine `SUCCESSFUL PASS` olarak raporlanmaktadır.

Master plan §7 gereği bu kalıpların tamamı **PASS sayılmaz**. Bulgular
ilgili fazlarda kapatılır:

- `assert-true`, `skip-then-pass`, `weak-e2e-assertion` → P19 (sahte validation script'lerinin silinmesi)
- `simulation-generator`, `fallback-success`, `literal-run-count` → P11, P12
- `fabricated-hash`, `hardcoded-metric`, `fabricated-diff`, `stub-dependency` → P08, P09, P15
- `embedded-secret` → P03 (kod), P17 (credential rotasyonu)
- `permissive-fallback` → P02, P19
- `random-primary-key` → P01

P17'de (`Y-P17-008`) bu script `--gate` moduyla CI'a bağlanır ve bulgu > 0 ise
build **fail** eder.

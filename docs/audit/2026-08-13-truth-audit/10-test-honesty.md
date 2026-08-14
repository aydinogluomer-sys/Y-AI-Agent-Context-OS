# 10 — Test Dürüstlüğü ve Sahte Başarı Yolları

> Üreten: `scripts/audit/scan-false-green.ts` · Baseline commit: `9f10f70`
> Kanıt standardı: her bulgu dosya:satır referanslıdır (`10-false-green-findings.csv`).

## Özet

| Ölçüt | Değer |
|---|---|
| Taranan dosya | 250 |
| Toplam bulgu | **44** |
| P0 (release blocker) | **40** |
| P1 (production-critical) | **4** |

## Kural bazlı dağılım

| Kural | Şiddet | Bulgu | Açıklama |
|---|---|---:|---|
| `assert-true` | P0 | 0 | assert("...", true) — koşulsuz geçen sahte assertion |
| `skip-then-pass` | P0 | 28 | DB/bağımlılık yoksa atla ve yine de PASS say |
| `fabricated-hash` | P0 | 0 | Math.random() ile üretilip hash gibi sunulan değer |
| `settimeout-success` | P0 | 0 | setTimeout/delay sonrası koşulsuz başarı durumu |
| `fallback-success` | P0 | 0 | Sağlayıcı/servis hatasında sahte başarıya düşme |
| `simulation-generator` | P0 | 1 | Uydurma çıktı üreten fonksiyon |
| `hardcoded-metric` | P1 | 4 | Ölçülmeden yazılmış metrik/confidence literal'i |
| `literal-run-count` | P0 | 0 | Run sonucunda hesaplanmadan yazılmış sayaç |
| `fabricated-diff` | P1 | 0 | Git'e bakılmadan üretilmiş diff/author kaydı |
| `embedded-secret` | P0 | 1 | Kaynak kodda gömülü / parçalanmış sır |
| `permissive-fallback` | P0 | 10 | Hata durumunda izin veren güvenlik fallback'i |
| `unconditional-flag` | P1 | 0 | Doğrulanmadan true yazılan güvenlik bayrağı |
| `stub-dependency` | P1 | 0 | Gerçek analiz yerine stub bağımlılık kaydı |
| `weak-e2e-assertion` | P1 | 0 | toBeLessThan(400/500) — 401/404 dahi geçiren E2E iddiası |
| `random-primary-key` | P1 | 0 | Math.random() ile primary key üretimi (ADR-013 ihlali) |

## En yoğun 25 dosya

| Dosya | Bulgu |
|---|---:|
| `scripts/validate-vault.ts` | 9 |
| `scripts/validate-segment-20-26.ts` | 7 |
| `scripts/validate-segment-15-18.ts` | 4 |
| `apps/api/src/db.ts` | 2 |
| `scripts/validate-phase-3-startup.ts` | 2 |
| `scripts/validate-segment-1-10.ts` | 2 |
| `scripts/validate-segment-11-14.ts` | 2 |
| `scripts/validate-segment-19-21.ts` | 2 |
| `scripts/validate-stage-27.ts` | 2 |
| `scripts/validate-stage-35.ts` | 2 |
| `apps/api/src/index.ts` | 1 |
| `apps/api/src/startup-policy.ts` | 1 |
| `apps/web/src/lib/api/ai.ts` | 1 |
| `packages/security/src/secret-scanner/secret-scanner.test.ts` | 1 |
| `scripts/run-validation-suite.ts` | 1 |
| `scripts/validate-phase-5-evidence-integrity.ts` | 1 |
| `scripts/validate-stage-30.ts` | 1 |
| `scripts/validate-stage-31.ts` | 1 |
| `scripts/validate-stage-32.ts` | 1 |
| `scripts/validate-stage-33.ts` | 1 |

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

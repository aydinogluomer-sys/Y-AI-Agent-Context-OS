# Phase 09 — Context Provenance / Manifest

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P08](P08-dynamic-context-compiler.md) · [P10 →](P10-change-firewall.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P09 |
| **Workstream** | A + D |
| **Dependencies** | P08 |
| **Migration bloğu** | `0078`–`0084` (P08 ile ortak blok) |

## Objective

Y'nin en önemli farklılaştırıcısı: agent'a verilen **her fragment için** provenance tutmak, dışlananları **sebebiyle** kaydetmek, manifest'i immutable/versioned/hashable/auditable yapmak ve "model tam olarak ne gördü?" sorusunu kesin olarak yanıtlayabilmek.

## Why This Phase Exists

Bugün `context_packs` tablosu var ve gerçek reason code'lar taşıyor (`context/src/index.ts:1106`). Ama:

- **Hash yok.** Pack içinde fragment düzeyinde `content_hash`/`source_hash` yok; `context_items.checksum` var ama pack'ten referans verilmiyor.
- **Dışlama kaydı yok.** Bütçeye sığmayan öğeler sessizce kayboluyor; yalnız toplu bir risk metni üretiliyor (L1257-1263).
- **Uydurma alanlar** kalıcı olarak yazılıyor (P08 §Current Reality).
- Pack immutable değil; policy versiyonuna bağlı değil.

"Agent hangi kaynağı neden gördü, neyi neden görmedi" sorusu bugün cevaplanamıyor. Bu, ürünün PROOF sütununun temelidir.

## Dependencies

P08 (`CompiledContext`). **P08 ile paralel çalıştırılamaz.**

## Current Repository Reality

| Konu | Gerçek |
|---|---|
| Pack tablosu | `context_packs` (`db.ts:1243-1267`) — `primary_files`, `related_*`, `known_risks`, `pending_todos`, `forbidden_changes`, `quality_gates`, `next_action`, `metadata_json`, `estimated_token_count`, `confidence_score` |
| Reason | Fragment başına `reason` string'i ve `reason_codes` taşınıyor (L1106) — **gerçek** |
| Hash | Yok |
| Exclusions | Yok |
| Immutability | Yok |
| Determinism | Yok (P08 sağlıyor) |

## Target State

```yaml
fragment:
  repository: payment-service
  commit_sha: abc123
  file: src/payments/retry.ts
  symbol: retryPayment
  lines: 82-164
  source_hash: 91fd...
  chunk_hash: 38ab...

reason:
  task_relevance: 0.96
  semantic_score: 0.91
  dependency_distance: 1
  direct_symbol_reference: true
  related_test: true

permission:
  decision: allow
  policy_version: 17

budget:
  tokens: 1834
```

```yaml
excluded:
  file: infrastructure/prod-secrets.ts
  reason: policy_denied
```

Manifest özellikleri: **immutable · versioned · hashable · auditable.**

## Architecture Decisions

- **ADR-034 (yeni)** — **Manifest = kanıtın birincil birimi.** Run, manifest'e referansla tanımlanır; manifest silinemez/değiştirilemez.
- **ADR-035 (yeni)** — **Canonical JSON serileştirme.** Hash hesabı için anahtar sıralaması, sayı formatı ve unicode normalizasyonu sabitlenir (RFC 8785 JCS benzeri). Sebep: aynı içerik farklı serileştirmeyle farklı hash üretirse determinism iddiası çöker.
- **ADR-036 (yeni)** — **Dışlama kaydı zorunlu ve sebepli.** Bir aday üretildiyse ve manifest'te yoksa, `exclusions`'ta sebebiyle bulunmak **zorundadır**. Sebep kümesi kapalı: `policy_denied · approval_required · budget · rank_cutoff · duplicate · secret_redacted · unavailable`.
- **ADR-037 (yeni)** — **Manifest agent'a verilen içeriğin tek kaynağıdır.** Adapter (P11) manifest dışından hiçbir dosya içeriği enjekte edemez; bu bir tip kısıtıdır.

## Files / Packages Affected

`packages/context/src/manifest/*`, `packages/evidence`, `migrations/`.

### New Files

```text
packages/context/src/manifest/{builder.ts,canonical-json.ts,hash.ts,verify.ts,types.ts}
packages/context/src/manifest/__tests__/{builder,canonical-json,determinism,verify}.test.ts
migrations/0081_context_manifests.sql
migrations/0082_context_manifest_items.sql
migrations/0083_context_manifest_exclusions.sql
migrations/0084_context_fragments.sql
tests/integration/manifest/provenance-coverage.test.ts
```

### Files to Modify

- `packages/context/src/compiler/compile.ts` — çıktısını `ManifestBuilder`'a verir.
- `ContextObjectStoreService` → fragment store olarak `packages/context/src/store/`'a taşınır; **SQL injection düzeltmesi** (`ContextObjectStoreService.ts:219` `${sourceTable}` interpolasyonu, P0-10) burada yapılır.

### Files to Delete/Deprecate

- `context_packs` tablosu → **DEPRECATE** (okuma bir süre korunur, yazım P08'de durdu; P19'da DROP)
- `POST /context-packs/:id/rehydrate` (unscoped, P0-8 — P02'de silindi)

## Database Changes

```text
0081  context_manifests
        run_id · manifest_hash · compiler_version · policy_version · universe_hash
        deterministic_inputs_hash · snapshot_id · tokenizer_id · weights_hash
        budget_limit · budget_used · created_at
        IMMUTABLE (update/delete trigger)
0082  context_manifest_items
        manifest_id · fragment_id · repository_id · commit_sha · path · symbol_name
        start_line · end_line · source_hash · chunk_hash
        reason_json (14 sinyal) · permission_decision · policy_version · token_count · rank
0083  context_manifest_exclusions
        manifest_id · path · symbol_name · reason ENUM · detail · candidate_rank
0084  context_fragments
        fragment_id · chunk_id · content_hash · token_count · redacted BOOLEAN
```

`context_objects`/`context_object_refs` (mevcut, gerçek) fragment store'un altyapısı olarak korunur ve `organization_id` ile genişletilir.

## API Changes

```text
GET /api/v1/runs/:runId/context/manifest            tam manifest
GET /api/v1/runs/:runId/context/manifest/export     imzalı, taşınabilir JSON
GET /api/v1/runs/:runId/context/manifest/verify     hash yeniden hesaplama
```

## Type / Contract Changes

`ContextManifest`, `ManifestItem`, `ManifestExclusion`, `ExclusionReason` (P01) implemente edilir. **`manifest_hash` P12'nin run kaydına girer.**

## Frontend Changes

Yok (P15 "Inspect Manifest" yüzeyini kurar).

## Backend Changes

Compile worker'ın son adımı manifest yazımıdır; manifest yazılmadan run `ready` durumuna geçemez (P12 FSM kısıtı).

## Worker Changes

`context-compile-worker` manifest'i tek transaction'da yazar (manifest + items + exclusions + fragments).

## Security Changes

- **P0-10 kapanır** (SQL interpolasyonu parametreleştirilir).
- Redakte edilmiş fragment'lar `redacted=true` ile işaretlenir; manifest hem redakte edilmiş içeriğin hash'ini hem kaynak hash'ini taşır.
- Manifest immutable → kanıt sonradan değiştirilemez (T-17, T-18 ile aynı ailede).

## Migration Strategy

1. Canonical JSON + hash modülü (önce, çünkü determinism buna bağlı).
2. Manifest şeması + immutability trigger'ları.
3. `ManifestBuilder` + compile entegrasyonu.
4. Verify endpoint'i + provenance coverage testi.
5. `context_packs` okuma yolu korunur, yazım kapalı.

## Implementation Tasks

### Y-P09-001 — Canonical JSON
**Create:** `manifest/canonical-json.ts`. **Algorithm:** anahtar sıralaması, sayı normalizasyonu, NFC unicode, `undefined` atlanması.
**Acceptance:** Aynı nesnenin farklı inşa sıraları → aynı bayt dizisi.

### Y-P09-002 — Hash modülü
**Create:** `manifest/hash.ts`. `manifest_hash = sha256(canonical_json(manifest_without_hash_field))`.
**Edge Cases:** Hash alanının kendisi hesaba katılmaz; `deterministic_inputs_hash` ayrı hesaplanır.

### Y-P09-003 — Manifest şeması + immutability (0081–0084)
**Acceptance:** UPDATE/DELETE denemesi trigger ile reddediliyor.

### Y-P09-004 — `ManifestBuilder`
**Create:** `manifest/builder.ts`. **Inputs:** `CompiledContext`, universe, bütçe, aday havuzu (dışlama hesabı için).
**Kural:** Her aday ya `items`'ta ya `exclusions`'ta — **istisna yok**.

### Y-P09-005 — Provenance coverage testi
**Create:** `tests/integration/manifest/provenance-coverage.test.ts`.
**Assertion:** `|candidates| == |items| + |exclusions|` ve her item'ın `source_hash`'i ilgili chunk'ın gerçek hash'iyle eşleşiyor. **%100 kapsama, örneklem değil.**

### Y-P09-006 — Verify endpoint'i
**Create:** `manifest/verify.ts` + `GET .../manifest/verify`. Depolanan hash yeniden hesaplanır; uyuşmazlık `tampered` döner.

### Y-P09-007 — Export
İmzalı, taşınabilir manifest JSON'u (imzalama anahtarı P14'te evidence ile ortak).

### Y-P09-008 — Fragment store taşınması + SQL injection düzeltmesi
**Modify:** `ContextObjectStoreService.ts:219` — `${sourceTable}` interpolasyonu kaldırılır; kaynak tablo kapalı bir enum'dan seçilir.
**Negative test:** Kötü niyetli `source_table` değeri → 400, sorgu çalışmıyor.

### Y-P09-009 — `context_packs` yazımının kapatılması + okuma köprüsü

## Parallelizable Tasks

```text
Y-P09-001 + 002 ∥ Y-P09-003        (hash modülü vs şema)
Y-P09-006 ∥ Y-P09-007
```
Sıralı: `001 → 002 → 004 → 005`.

## Tests

| Suite | İçerik |
|---|---|
| `canonical-json.test.ts` | Anahtar sırası bağımsızlığı; unicode; sayı formatı |
| `determinism.test.ts` | Aynı girdi → aynı `manifest_hash` (P08 ile ortak, burada manifest düzeyinde) |
| `builder.test.ts` | Her aday items veya exclusions'ta; token toplamı bütçeyle tutarlı |
| `verify.test.ts` | Elle bozulmuş kayıt → `tampered` |
| `provenance-coverage.test.ts` | %100 kapsama |

## Negative Tests

- Manifest UPDATE denemesi → trigger reddi.
- `items` + `exclusions` toplamı aday sayısından azsa → test **fail**.
- `source_hash`'i chunk'la uyuşmayan item → test **fail**.
- Hash alanı manuel değiştirilirse → `verify` `tampered` döner.
- Manifest yazılmadan run `ready` olamaz (P12 ile ortak negative test).
- `source_table` enjeksiyon denemesi → 400.

## Security Tests

T-17/T-18 ailesi (immutability + tamper detection), P0-10 regresyon testi.

## E2E

`tests/e2e/manifest.spec.ts` — compile sonrası manifest çekilir; her fragment'ın satır aralığı gerçek dosya içeriğiyle eşleşiyor; DENY'li bir kaynak `exclusions`'ta `policy_denied` ile var; bütçeye sığmayan bir kaynak `budget` ile var; `verify` `ok` dönüyor.

## Observability

`manifest_size_bytes`, `manifest_item_count`, `manifest_exclusion_count{reason}`, `provenance_coverage` (her zaman 1.0 olmalı — 1.0'ın altı **alarm**), `manifest_verify_failure_total`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Kapsama < %100 | Kayıp aday | Compile **başarısız olur**; eksik provenance ile manifest yazılmaz |
| Hash uyuşmazlığı | `verify` tampered | Run `blocked`; güvenlik olayı; operatör incelemesi |
| Canonical JSON regresyonu | Determinism kırılır | CI determinism testi yakalar |
| Manifest çok büyük | Depolama/aktarım | Fragment içerikleri CAS'ta; manifest yalnız referans + hash tutar |

## Rollback / Recovery

Manifest immutable olduğu için geri alma yok; hatalı bir manifest yeni bir compile ile **yeni** manifest üretir. Eski manifest kanıt olarak kalır (`superseded_by` alanı ile bağlanır).

## Acceptance Criteria

1. Her fragment için `source_hash` + `chunk_hash` + reason + permission decision + token sayısı var.
2. Her dışlanan aday sebebiyle kayıtlı; kapsama **%100**.
3. Manifest immutable (trigger ile).
4. `manifest_hash` deterministik ve doğrulanabilir.
5. `verify` endpoint'i tamper tespit ediyor.
6. Export imzalı.
7. P0-10 (SQL interpolasyonu) kapalı.
8. `context_packs`'e yazım yok.

## Evidence Required

```text
provenance-coverage.test.ts                %100, PASS
determinism.test.ts                        aynı hash
tests/e2e/manifest.spec.ts                 PASS
psql: UPDATE context_manifests ...         trigger reddi (hata çıktısı)
örnek manifest JSON'u                      dosya, Appendix'e referans
manifest verify çıktısı                    ok
```

## Exit Gate

```bash
pnpm test --filter @y/context
pnpm run test:integration -- tests/integration/manifest
pnpm run test:e2e -- tests/e2e/manifest.spec.ts
pnpm --filter @y/db run test:migrations:fresh
pnpm --filter @y/db run test:migrations:upgrade
```

**Bu gate, ürünün "model tam olarak ne gördü?" iddiasının kanıtıdır.** `provenance_coverage < 1.0` ise gate geçilmez.

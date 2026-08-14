# 09 — Doküman ↔ Kod Çelişkileri

> Her satır, bir dokümanın iddiasını envanterden gelen ölçülmüş değerle karşılaştırır.

| İddia | Kaynak | Ölçülen gerçek | Kanıt |
|---|---|---|---|
| "15 navigation categories and 78 UI routes" | `docs/audit/02-route-inventory.md` | 15 kategori, **113 item** | `03-ui-inventory.csv` |
| 12 API endpoint | `docs/audit/03-api-inventory.md` | **184 route** | `02-api-inventory.csv` |
| "Tüm 15 kategori PASS" | `docs/audit/10-feature-traceability-matrix.md` | 103/113 ekran fabrikasyon | `03-ui-inventory.csv` |
| "162 assertion, 0 failure" | `docs/audit/08-test-inventory.md` | 52 adet `assert("...", true)` | `10-false-green-findings.csv` |
| Stage 27–35 "SUCCESSFUL PASS" | `docs/stages/*.md` | Suite CI'da migration'lardan **önce** çalışıyor; DB dalları sandbox'a düşüyor | `.github/workflows/ci.yml`, 36 skip-then-pass bulgusu |
| "Phase 8 Cockpit UX Overhaul tamamlandı" | `README.md:332` | `awwwards-loop/state.json`: `"hardGatesPassed": false, "lastScore": null` | dosya |
| `qa-debug-tags` "fdescribe/fit reddeder" | `README.md:84` | Script'te bu string'ler yok | `scripts/qa-debug-tags.ts` |
| "`test:db` 0 failure, 0 skip ile geçti" | `implementation.md:25` | `test:db` CI'da hiç çalışmıyor | `.github/workflows/ci.yml` |
| "4 worker" | `docs/audit/06-worker-job-inventory.md` | Yalnız `workers/index-worker.ts` var | dizin listesi |
| "Gemini + Claude 3.5 + DeepSeek + GCP/Vertex/BigQuery connector" | `docs/audit/07-provider-connector-inventory.md` | Yalnız `@google/genai`; `@anthropic-ai/*` ve `openai` bağımlılığı yok | `package.json` |

## Kapanış

Bu çelişkilerin tamamı **P20'de** tek tek kapatılır (`Y-P20-010`).
O ana kadar ilgili belgelerde `SUPERSEDED` banner'ı bulunur.

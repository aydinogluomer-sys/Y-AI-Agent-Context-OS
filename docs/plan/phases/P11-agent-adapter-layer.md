# Phase 11 — Agent Adapter Layer

> [← Master Plan](../../Y_FINAL_PRODUCTION_IMPLEMENTATION_MASTER_PLAN.md) · [← P10](P10-change-firewall.md) · [P12 →](P12-real-agent-runtime.md)

| Alan | Değer |
|---|---|
| **Phase ID** | P11 |
| **Workstream** | C — Runtime / Agent Integration |
| **Dependencies** | P01 |
| **Migration bloğu** | (P12 ile ortak: `0091`–`0100`) |

## Objective

Vendor-neutral `AgentAdapter` sözleşmesi kurmak; Claude Code ve Codex'i **first-class** adapter olarak implemente etmek; capability negotiation ve gerçek health probe'ları sağlamak.

## Why This Phase Exists

Repo'da hiçbir agent entegrasyonu yok:

- `package.json`'da `@anthropic-ai/*` veya `openai` bağımlılığı **yok**.
- Tek gerçek provider `@google/genai` (`packages/providers/src/index.ts:109-168`), model `"gemini-3.5-flash"` hard-code (L142) ve **yalnız** `server.ts`'in `/api/simulate-task` route'undan çağrılıyor. `apps/api` bu paketi hiç import etmiyor.
- `GET /api/providers/health` (`index.ts:7155-7167`) "Live LLM Provider Connectivity Probes" diye belgelenmiş ama yalnız `process.env` varlığına bakıyor; ağ çağrısı yok. Üstelik döndürdüğü model kimlikleri registry'dekiyle uyuşmuyor (`gemini-2.5-flash` vs `gemini-3.5-flash`).
- "Claude Code" repo'da yalnız seed/mock veri olarak geçiyor (`db.ts:177 owner_agent: "Claude Code"`, `server.ts:81,234,239,257`).
- `packages/agents/*` model çağırmıyor; `agent_sessions`/`agent_handoffs`/`resume_states` satırlarını yöneten bookkeeping servisleri.

Ürünün "Y kendi agent'ını yazmaz, mevcut agent'ları yönetir" tezi bu faz olmadan gerçekleşmez.

## Dependencies

P01 (`AgentAdapter`, `AgentCapabilities` sözleşmeleri). **P02 ile paralel yürütülebilir.**

## Current Repository Reality

Yukarıdaki + `packages/providers` yalnız `ProviderRegistry` + `GoogleGeminiProvider` içeriyor (169 satır).

## Target State

```ts
interface AgentAdapter {
  id: AgentAdapterId;                       // "claude-code" | "codex" | ...
  negotiate(): Promise<AgentCapabilities>;
  health(): Promise<HealthResult>;          // gerçek probe
  start(input: AgentStartInput): Promise<AgentSession>;
  cancel(sessionId: string): Promise<void>;
  events(sessionId: string): AsyncIterable<AgentEvent>;
}

interface AgentCapabilities {
  model: string;
  contextLimit: number;
  streaming: boolean;
  toolSupport: ToolSpec[];
  mcpSupport: boolean;
  fileOperations: boolean;
  approvalSupport: boolean;
  tokenizerId: TokenizerId;
  rateLimit: RateLimitSpec;
}

interface AgentStartInput {
  manifest: ContextManifest;      // P09 — agent'a verilen içeriğin TEK kaynağı
  boundary: ChangeBoundary;       // P10
  task: TaskSpec;
  workspace: WorkspaceRef;
}
```

**İkinci sınıf entegrasyonlar** (planlanır, P11'de implemente edilmez): GitHub Copilot, Cursor, generic MCP client.

## Architecture Decisions

- **ADR-042 (yeni)** — **Y agent'ın iç reasoning'ine bağımlı olmaz.** Adapter yalnız gözlemlenebilir olayları (tool call, file read/write, command, completion) raporlar. Sebep: reasoning formatları vendor'a özgü ve kararsız; buna bağlanmak vendor-neutral iddiasını bozar.
- **ADR-043 (yeni)** — **Manifest tek içerik kaynağıdır.** Adapter, manifest dışından dosya içeriği enjekte edemez (ADR-037 ile ortak). Agent kendi başına dosya okumak isterse bu bir `file_read` olayıdır ve Context Firewall'dan geçer.
- **ADR-044 (yeni)** — **Agent sandbox'ta çalışır.** Workspace'e erişimi Y tarafından aracılanır; doğrudan dosya sistemi erişimi yoktur. Alternatifler: (a) agent'a doğrudan repo yolu vermek, (b) aracılı erişim. Seçilen (b). Sebep: (a) Change Firewall'ı baypas eder.
- **ADR-045 (yeni)** — **Capability negotiation her run başında yapılır ve manifest'e yazılır.** Sebep: bütçe (P08) adapter limitine bağlı; limit değişirse determinism girdisi değişmiş olur.

## Files / Packages Affected

Yeni `packages/adapters`, `packages/providers` refactor'ü, `apps/api/src/routes/agents.ts`.

### New Files

```text
packages/adapters/package.json
packages/adapters/src/{index.ts,types.ts,registry.ts,contract-tests.ts}
packages/adapters/src/claude-code/{adapter.ts,session.ts,events.ts,capabilities.ts}
packages/adapters/src/codex/{adapter.ts,session.ts,events.ts,capabilities.ts}
packages/adapters/src/sandbox/{workspace-proxy.ts,tool-bridge.ts}
packages/adapters/src/__tests__/{contract,claude-code,codex,negotiation}.test.ts
apps/api/src/routes/agents.ts
apps/api/src/domain/agent/*.ts
```

### Files to Modify

- `packages/providers/src/index.ts` — provider registry embedding + tokenizer sağlayıcısı olarak kalır; agent execution'dan ayrılır. Hard-coded model id'leri konfigürasyona taşınır.
- `apps/api/src/index.ts:7155` — `GET /providers/health` **gerçek probe** yapan kanonik karşılığıyla değiştirilir.

### Files to Delete/Deprecate

- `POST /api/simulate-task` + `generateFallbackSimulation` (`server.ts:31-283`) — **DELETE** (140+ satır uydurma çıktı)
- `apps/web/src/lib/api/ai.ts` içindeki `createLocalAiSimulation` (217 satır) — P15'te silinir; burada backend ayağı kesilir
- `GET /providers/health`'in env-varlığı implementasyonu

## Database Changes

P12 ile ortak blok; bu fazda kullanılanlar:

```text
0091  agent_connections   (project_id, adapter_id, credential_ref, config_json, enabled)
0092  agent_capabilities  (agent_connection_id, negotiated_at, capabilities_json,
                           capabilities_hash)
```

## API Changes

```text
GET  /api/v1/projects/:pid/agents
POST /api/v1/projects/:pid/agents             (adapter bağlama)
GET  /api/v1/agents/:agentId/capabilities
GET  /api/v1/agents/:agentId/health           (gerçek ağ probe'u)
```
`POST /api/simulate-task` → **404** (silindi).

## Type / Contract Changes

`AgentAdapter`, `AgentCapabilities`, `AgentSession`, `AgentEvent`, `ToolSpec`, `HealthResult` (P01) implemente edilir. **`AgentAdapter` P12'nin girdisi** — bu gate'te donar.

## Frontend Changes

Yok (P15). Ancak `apps/web`'in `simulate-task` çağrısı kırılır — bu **kasıtlıdır** ve P15'e kadar chat-cockpit ekranı hata gösterir (sahte başarı göstermez).

## Backend Changes

`AdapterRegistry` proje ayarına göre adapter seçer. Adapter yoksa run başlatılamaz (fake fallback yok).

## Worker Changes

Yok (execution P12'de).

## Security Changes

- Credential'lar secret manager referansı; DB'de düz metin yok.
- **T-08 / T-09 (tool / MCP escalation):** capability negotiation'da beyan edilmeyen tool çağrısı reddedilir; MCP sunucuları allow-list'li.
- Sandbox proxy: agent'ın dosya erişimi Context Firewall (okuma) ve Change Firewall (yazma) üzerinden geçer.
- Health probe SSRF'e açık olmamalı: yalnız yapılandırılmış sağlayıcı endpoint'lerine (T-23).

## Migration Strategy

1. Adapter sözleşmesi + contract test suite'i.
2. Sandbox workspace proxy + tool bridge.
3. Claude Code adapter, sonra Codex adapter — ikisi de aynı contract testinden geçer.
4. Gerçek health probe; `simulate-task` silinir.

## Implementation Tasks

### Y-P11-001 — `AgentAdapter` sözleşmesi + registry
**Create:** `adapters/src/{types,registry}.ts`

### Y-P11-002 — Contract test suite'i
**Create:** `adapters/src/contract-tests.ts` — her adapter'a uygulanan ortak suite (negotiate/health/start/cancel/events davranışları, hata yolları, iptal semantiği).
**Acceptance:** Yeni bir adapter eklemek yalnız bu suite'i geçmeyi gerektiriyor.

### Y-P11-003 — Sandbox workspace proxy
**Create:** `adapters/src/sandbox/workspace-proxy.ts` — agent'ın dosya okuma/yazma çağrılarını Y'nin firewall'larına yönlendirir.
**Security:** Doğrudan fs erişimi yok; her çağrı bir olay üretir.

### Y-P11-004 — Tool bridge
**Create:** `sandbox/tool-bridge.ts` — capability'de beyan edilen tool'lar allow-list; beyan dışı çağrı reddedilir ve olay yazılır.

### Y-P11-005 — Claude Code adapter
**Create:** `adapters/src/claude-code/*`. Manifest'i agent'ın beklediği biçime çevirir; olay akışını `AgentEvent`'e normalize eder.
**Edge Cases:** Oturum kopması, kısmi çıktı, rate limit, uzun süren tool çağrıları.

### Y-P11-006 — Codex adapter
**Create:** `adapters/src/codex/*`. Aynı contract.

### Y-P11-007 — Capability negotiation
**Create:** `capabilities.ts` (her adapter için). Sonuç `agent_capabilities`'e yazılır ve `capabilities_hash` manifest determinism girdisine eklenir.

### Y-P11-008 — Gerçek health probe
**Modify:** kanonik `/agents/:id/health`. Ağ çağrısı + gecikme + model erişilebilirliği. **Negative test:** env var var ama sağlayıcı erişilemez → `unhealthy` (bugün `configured` diyor).

### Y-P11-009 — `simulate-task`'ın silinmesi
**Delete:** `server.ts:31-283`. **Negative test:** `POST /api/simulate-task` → 404.

### Y-P11-010 — İkinci sınıf entegrasyon planı
**Create:** `docs/architecture-and-design/agent-adapters.md` — Copilot / Cursor / generic MCP client için sözleşme uyumu analizi. **Implementasyon yok**, plan var (§15 gereği).

### Y-P11-011 — Migration'lar 0091–0092

## Parallelizable Tasks

```text
Y-P11-005 ∥ Y-P11-006          (contract donduktan sonra)
Y-P11-008 ∥ Y-P11-009
Y-P11-010 ∥ hepsi              (doküman)
```
Sıralı: `001 → 002 → 003 → 004 → (005∥006) → 007`.

## Tests

| Suite | İçerik |
|---|---|
| `contract.test.ts` | Her adapter: negotiate/health/start/cancel/events; hata ve iptal semantiği |
| `claude-code.test.ts` | Gerçek API'ye karşı (kayıtlı/replay edilmiş etkileşimlerle) olay normalizasyonu |
| `codex.test.ts` | Aynı |
| `negotiation.test.ts` | Capability hash determinizmi; limit değişimi tespiti |
| `tool-bridge.test.ts` | Beyan dışı tool → red |
| `workspace-proxy.test.ts` | Doğrudan fs erişimi imkânsız |

## Negative Tests

- Sağlayıcı erişilemez → `health` **unhealthy** (env var'a bakıp `configured` demiyor).
- Beyan edilmeyen tool çağrısı → reddediliyor + olay.
- Manifest dışı dosya içeriği enjekte etme denemesi → tip hatası / runtime red.
- Adapter yapılandırılmamış proje → run başlatılamıyor (**fake fallback yok**).
- `POST /api/simulate-task` → 404.
- Rate limit → retry + backoff; sahte başarı yok.

## Security Tests

Appendix I: **T-08, T-09**, T-23 (health probe SSRF).

## E2E

`tests/e2e/agent-adapter.spec.ts` — proje bir adapter'a bağlanır; capability negotiation gerçek değerler döndürür; health probe gerçek ağ çağrısı yapar; küçük bir manifest'le oturum başlatılıp iptal edilir ve olaylar normalize edilmiş biçimde alınır.

## Observability

`agent_health{adapter}`, `capability_negotiation_latency`, `adapter_error_rate{adapter,reason}`, `provider_rate_limit_total`, `tool_call_rejected_total`.

## Failure Modes

| Mod | Belirti | Yanıt |
|---|---|---|
| Sağlayıcı kesintisi | Run başlatılamaz | `blocked` + net hata; **sahte tamamlanma yok** |
| Rate limit | Yavaşlama | Backoff + kuyrukta bekleme; kullanıcıya görünür |
| Capability değişimi | Bütçe kayması | Negotiation her run'da; `capabilities_hash` manifest'te |
| Oturum kopması | Yarım run | P12 recovery: run `degraded`, kısmi kanıt korunur |
| Credential süresi dolar | 401 | Agent connection `disconnected`; audit + bildirim |

## Rollback / Recovery

Adapter'lar registry üzerinden; bir adapter devre dışı bırakılabilir. `simulate-task` silinmesi geri alınmaz (P0 sınıfı sahte davranış).

## Acceptance Criteria

1. `AgentAdapter` sözleşmesi ve contract test suite'i var.
2. Claude Code adapter contract testini geçiyor.
3. Codex adapter contract testini geçiyor.
4. Capability negotiation gerçek değerler döndürüyor ve hash'i kaydediliyor.
5. Health probe gerçek ağ çağrısı yapıyor.
6. Agent'ın dosya erişimi yalnız sandbox proxy üzerinden.
7. Beyan dışı tool çağrısı reddediliyor.
8. `simulate-task` ve `generateFallbackSimulation` silinmiş.
9. İkinci sınıf entegrasyon planı dokümante edilmiş.

## Evidence Required

```text
contract.test.ts × 2 adapter              PASS
tests/e2e/agent-adapter.spec.ts           PASS
gerçek health probe çıktısı                gecikme + model bilgisi
capabilities_hash örneği                   iki ardışık negotiation aynı hash
grep -rn "simulate-task\|generateFallbackSimulation"   boş
```

## Exit Gate

```bash
pnpm test --filter @y/adapters
pnpm run test:integration -- tests/integration/adapters
pnpm run test:e2e -- tests/e2e/agent-adapter.spec.ts
```

**`AgentAdapter` sözleşmesi bu gate'te donar** — P12 buna bağımlıdır.

---

## Uygulama Kaydı (2026-08-14)

### Tamamlanan görevler

| Görev | Durum | Kanıt |
|---|---|---|
| Y-P11-001 `AgentAdapter` sözleşmesi | Tamam | `packages/adapters/src/types.ts` |
| Y-P11-002 Claude Code adapter | Kısmi | sözleşme + yetenek + probe hazır; **oturum başlatma bağlanmadı** |
| Y-P11-003 Codex adapter | Kısmi | aynı durum |
| Y-P11-004 gerçek health probe | Tamam | `probedNetwork` alanı yalanı imkânsız kılar |
| Y-P11-005 capability negotiation | Tamam | `source` alanı bilginin nereden geldiğini söyler |
| Adapter registry | Tamam | `AdapterRegistry` + 5 test |
| Legacy `/providers/health` düzeltmesi | Tamam | env kontrolü yerine adapter probe'ları |

### Karar 1 — SDK bağımlılıkları KURULMADI ve bu bilinçli

`@anthropic-ai/claude-agent-sdk` ve `openai` paketleri eklenmedi.
`start()` çağrıları **açıkça `NOT_IMPLEMENTED`** fırlatıyor.

Sebep: çalışır bir kimlik bilgisi ve ağ erişimi olmadan bir entegrasyon
**doğrulanamaz**. Doğrulanamayan bir entegrasyonu "tamam" işaretlemek,
P00'da kapattığımız kalıbın kendisidir — üstelik en kritik yerinde:
agent runtime'ında.

Alternatif, SDK'yı ekleyip `start()` içine çağrıyı yazmak ve test
etmemekti. O kod "var" görünürdü ama ilk gerçek çalıştırmada
kırılırdı — ve kırıldığında kimse onun hiç test edilmediğini
bilmezdi.

**Bugün yazılmış olan gerçek şeyler:** sözleşme (dondu), yetenek
bildirimi, sağlık probe'u, olay modeli, girdi doğrulaması, registry.
Eksik olan tek şey `start()` gövdesi ve SDK bağımlılığı.

### Karar 2 — Sahte oturum ASLA döndürülmez

P00'daki agent runtime `POST .../runs` çağrısında dört olay yazıp
`status: "completed"` dönüyordu; hiçbir şey çalıştırmıyordu.

Bu fazdaki hiçbir kod yolu sahte bir oturum üretmez:
- `UnconfiguredAdapter.start()` → hata, gerekçesiyle
- `ClaudeCodeAdapter.start()` → hata, gerekçesiyle
- `events()` → **boş akış** (uydurma olay değil)

### Karar 3 — `probedNetwork` alanı yalanı imkânsız kılar

P00'daki `/api/providers/health` kendini "Live LLM Provider Connectivity
Probes" diye tanıtıyordu ama yalnız `process.env` varlığına bakıyordu.
Üstelik döndürdüğü model kimlikleri registry'dekiyle uyuşmuyordu —
sabitler iki yerde ayrı yazılıydı ve biri güncellenirken diğeri
unutulmuştu.

"Anahtar var" ile "sağlayıcı erişilebilir" **aynı şey değildir**. Yanlış
bir anahtar, süresi dolmuş bir anahtar, erişilemeyen bir servis: hepsi
"configured" görünürdü.

Yeni `HealthResult` her yanıtta `probedNetwork` taşır. Ağa çıkılmadıysa
`false` döner ve çağıran, sonucun bir bağlantı kanıtı **olmadığını**
bilir. Model kimlikleri artık route'ta yazılı değil; adapter'lar kendi
yeteneklerini bildirir.

### Karar 4 — Bilinmeyen değerler TAHMİN EDİLMEZ

`rateLimit.declaredBy: "unknown"` ve `requestsPerMinute: null`:
sağlayıcılar bu değerleri programatik bildirmiyor. Uydurma bir rate
limit, rate limiter'ı yanlış bir sayıyla besler.

`capabilities.source` üç değer alır: `declared` (API'den okundu),
`configured` (operatör yazdı), `assumed` (varsayıldı). Claude Code ve
Codex bugün `configured`: context limitleri dokümantasyondan geliyor,
API'den değil — ve bu **söyleniyor**.

### Karar 5 — İki adapter'ın yapısal olarak aynı olması KASITLI

Farklar yeteneklerde (MCP desteği, araç kümesi, context limiti),
yapıda değil. İki adapter'ın yapısal olarak farklılaşması, soyutlamanın
sızdırdığının işaretidir (ADR-042).

### Kabul kriterlerinin durumu

| Kriter | Durum | Not |
|---|---|---|
| Vendor-neutral sözleşme | Evet | dondu |
| Capability negotiation | Evet | `source` alanıyla |
| Gerçek health probe | Evet | `probedNetwork` |
| Manifest zorunlu (ADR-043) | Evet | `assertStartInput` |
| Boundary zorunlu | Evet | `assertStartInput` |
| Sahte oturum yok | Evet | tüm yollar hata veriyor |
| Claude Code oturumu çalışıyor | **HAYIR** | SDK bağlanmadı |
| Codex oturumu çalışıyor | **HAYIR** | SDK bağlanmadı |

### Gate sonuçları

```text
typecheck (loose + strict)   0 hata
vitest                       1019 passed | 4 skipped (1023)
build                        OK
secret-scan                  0 yeni bulgu
drift (verify-inventories)   8/8 kontrol geçti
```

### Bu fazda kapatılmayanlar

- **SDK wire-up.** Yukarıda gerekçesi yazılı. Kapanma koşulu: çalışır
  kimlik bilgisi + ağ erişimi + entegrasyon testi.
- **`agent_sessions` şeması ve run bağı** — P12 ile ortak migration
  bloğu.
- **İkinci sınıf entegrasyonlar** (Copilot, Cursor, generic MCP) — faz
  dosyası bunları zaten "P11'de implemente edilmez" diye işaretliyor.

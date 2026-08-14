# Agent Adapter'ları

> spec §15 · ADR-042…ADR-045

## Sözleşme

Y hiçbir vendor'un iç muhakemesine bağlanmaz (ADR-042). Sözleşme yalnız
**gözlemlenebilir** olaylar üzerinedir:

```ts
interface AgentAdapter {
  readonly id: AgentAdapterId;
  health(): Promise<HealthResult>;
  negotiate(): Promise<AgentCapabilities>;
  start(input: AgentStartInput): Promise<AgentSession>;
  events(session: AgentSession): AsyncIterable<AgentEvent>;
  cancel(session: AgentSession): Promise<void>;
}
```

Yeni bir agent eklemek bu yüzeyi implemente etmekten ibarettir.

## Kurallar

| Kural | ADR |
|---|---|
| Manifest olmadan agent **başlatılamaz** | ADR-043 |
| Adapter'a repository **yolu verilmez**; dosya işlemleri Y üzerinden | ADR-044 |
| Yetenek müzakeresi **her run başında** | ADR-045 |
| `HealthResult.probedNetwork` gerçek ağ yoklamasını bildirir | ADR-045 |

`probedNetwork` alanı bir P00 bulgusunu yapısal olarak imkânsız kılar:
adapter sağlığı ağa hiç çıkmadan `healthy` dönüyordu. Alan artık ölçümün
kendisidir — ağa çıkmadan `true` döndürülemez.

## Durum

| Adapter | Durum |
|---|---|
| `claude-code` | Sözleşme + yetenek + probe hazır; **`start()` `NOT_IMPLEMENTED` fırlatır** |
| `codex` | aynı |
| `gemini-cli` | Kayıtlı değil |
| `generic-mcp` | Kayıtlı değil |

**SDK'lar bilerek kurulmadı.** Çalışır kimlik bilgisi ve ağ erişimi olmadan
bir entegrasyon doğrulanamaz; doğrulanamayan bir entegrasyonu "tamam"
işaretlemek, bu projede kapatılan kalıbın kendisidir.

Sonuç: `AdapterRegistry` boş, `providerCheck` probe'u `degraded` ve
`/api/readyz` "agent çalıştırılamaz" der.

## MCP

MCP araçları `AgentCapabilities.mcpTools` ile bildirilir ama bildirim
**izin demek değildir**. Policy `filterMcpTools` ile süzer,
`decideMcpToolCall` çağrı anında yeniden karar verir. Bkz.
[policy dili](../security/policy-language.md).

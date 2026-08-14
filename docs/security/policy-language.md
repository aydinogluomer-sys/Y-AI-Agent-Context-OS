# Policy Dili

> spec §9, §23 · ADR-028, ADR-029, ADR-030

## Kapsamlar

Bir policy, yol kalıplarını üç kapsamdan birine atar:

```
ALLOW      src/**  tests/**  docs/**
APPROVAL   migrations/**  infra/**
DENY       secrets/**  production/**  customer-data/**
```

## Çözümleme kuralları

1. **DENY her zaman kazanır.** Bir yol birden fazla kurala uyuyorsa sonuç
   DENY'dir. Kural sırası güvenlik açısından önemsizdir — belirsiz bir
   öncelik, sıralamayı bir güvenlik parametresine dönüştürürdü.
2. **Retrieval'da APPROVAL = DENY.** Onay mutation için anlamlıdır; okuma
   için değil. APPROVAL'ın retrieval'da izin vermesi, içeriğin onay
   alınmadan okunması demek olurdu (ADR-029).
3. **Universe run'a bağlıdır ve değişmezdir.** Policy sonradan değişse bile
   çalışan run kendi universe'ü ile tamamlanır (ADR-030).

## Desteklenen glob sözdizimi

| Kalıp | Anlamı |
|---|---|
| `*` | Bir yol bileşeni içinde herhangi bir dizi |
| `**` | Sıfır veya daha fazla yol bileşeni |
| `?` | Tek karakter |

**Desteklenmeyen** karakterler açıkça reddedilir: `{ } ( ) | ! + @`.

Sessizce yanlış yorumlamak yerine hata vermek bilinçlidir: operatörün
verdiğini sandığı izinle gerçek iznin ayrışması, en tehlikeli policy
hatasıdır.

## Derleme

Universe bir **SQL predikatına** derlenir ve her retrieval sorgusuna
eklenir (ADR-028). Sonuç kümesi üzerinde filtreleme yapılmaz:

- Uygulama katmanında filtreleme, satırların zaten okunmuş olması demektir
  (ADR-027 ihlali).
- `LIMIT` ile birlikte yanlış sonuç verir: veritabanı izin verilmeyen
  satırları da sayarak limiti doldurur.

## MCP policy'si

MCP araçları ayrı bir allow-list'e tabidir ve **joker desteklemez**:

```ts
{ grants: [{ serverId: "github", tools: ["search_issues"] }] }
```

Gerekçe: bir MCP sunucusunun araç kümesi sürüm sürüm değişir. Sunucuya
güvenmek, gelecekte ekleyeceği her araca peşin güvenmek olurdu.

Uygulama: `packages/security/src/context-firewall/`,
`packages/security/src/mcp/allowlist.ts`.

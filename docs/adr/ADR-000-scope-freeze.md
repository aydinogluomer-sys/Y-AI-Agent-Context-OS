# ADR-000 — Product Scope Freeze

| Alan | Değer |
|---|---|
| Durum | **Kabul edildi** |
| Tarih | 2026-08-13 |
| Faz | P00 (Y-P00-013) |
| Baseline commit | `9f10f70` |

## Decision

Y'nin ürün kategorisi **AI Software Engineering Agent Context + Governance Control Plane**
olarak dondurulmuştur. Teknik konumlandırma: **Context + Change Firewall for AI Coding Agents.**

Üç sütun: **CONTROL — CONTEXT — PROOF.**

Primary product scope, yedi capability ile sınırlıdır:

```text
1. Repository Intelligence     5. Change Firewall
2. Task-Aware Retrieval        6. Agent Integration
3. Context Compiler            7. Evidence + Governance
4. Context Firewall
```

Kullanıcıya görünen yüzey **5 birincil + Settings + role-gated Advanced** ile sınırlıdır:

```text
Projects · Tasks/Runs · Context · Policies · Evidence   +  Settings
Advanced ▸ Providers · Indexes · Workers · Locks · Health · Diagnostics · Graph Explorer
```

## Context

`docs/audit/2026-08-13-truth-audit/` envanterine göre bugünkü durum:

| Ölçüt | Değer |
|---|---|
| UI nav item | 113 |
| Gerçek API'ye bağlı | 10 |
| Fabrikasyon | 103 |
| API route | 200 |
| Gölgelenmiş (ölü) route | 27 |
| Tenant izolasyon kolonu olmayan tablo | 43 / 43 |
| Sahte başarı bulgusu | 197 (119 P0) |

Ürün, backend'de gerçekten çalışan bir çekirdek (Event Store, Evidence Store, CAS,
File Locking, TypeScript AST parser, knowledge graph) ile UI'da 103 fabrikasyon
ekranın bir arada yaşadığı bir durumda. Kapsam donmazsa, her faz yeni yüzey
üreterek aynı hataya geri döner.

## Alternatives

1. **Genel amaçlı "AI Agent Operating System"** — mevcut 15 kategoriyi ürün alanı
   sayıp hepsini gerçekleştirmek. Reddedildi: 113 yüzeyin tamamını production
   kalitesine çıkarmak, çekirdek golden path'i tamamlamaktan önce kaynak tüketir
   ve ürün tezini bulanıklaştırır.
2. **Yalnız "50K Context Pack generator"** — dar bir araç. Reddedildi: CONTROL ve
   PROOF sütunları olmadan Y'nin savunulabilir bir farkı kalmaz; ayrıca 50K
   sabiti P08'de zaten kaldırılıyor.
3. **Kapsamı dondurmadan devam** — reddedildi (yukarıdaki Context).

## Reason

Bir önceki turda ürün "AI Agent Operating System" olarak genişlemiş ve
40+ modüle dağılmıştı; hiçbiri uçtan uca çalışmıyordu. Kapsamı dondurmak,
mevcut yeteneklerin silinmesi değil, **hangisinin kullanıcıya yüzey
olacağının** kararıdır (bkz. spec §25 headless module principle).

Kapsam donmadan yapılan her iyileştirme, yeni bir yarım yüzey daha
üretme riskini taşır.

## Explicit Non-Goals

Aşağıdakiler **ayrı ürün alanı olarak geliştirilmeyecektir**. Bunlara ekleme
yapmak veya bu listeden çıkarmak **yeni bir ADR gerektirir**.

```text
✗ Y'nin kendi coding agent'ını yazması
    Claude Code ve Codex zaten güçlü execution agent'larıdır. Y onların yerine
    geçmez; context / permission / governance / provenance katmanı olur.

✗ multi-agent council / agent voting / agent social UI
✗ cinematic mission control / dekoratif cybernetic UI / particle landing
✗ standalone CAS ürünü
✗ standalone event explorer
✗ standalone artifact manager
✗ onlarca ayrı dashboard
✗ ilgisiz SaaS connector'ları
✗ karmaşık görselleştirme sistemleri (graph explorer tek advanced ekranla sınırlı)
✗ UI'dan yıkıcı DB işlemleri (dev-reset, migration tetikleme, DB yeniden yapılandırma)
✗ UI'dan release sign-off
✗ test çalıştırmayan "test runner" ekranları
✗ agent'ın iç reasoning'ine bağımlı özellikler
```

## Consequences

**Olumlu**

- 113 route → 6 birincil + 7 advanced (Appendix F'de her route'un kaderi tek tek kayıtlı).
- Backend capability'leri silinmez; **headless** olarak yaşar ve doğru ürün yüzeylerine compose edilir.
- Her faz sonlu bir exit gate'e sahiptir; "sonra bakarız" borcu bırakılamaz.

**Olumsuz / kabul edilen maliyet**

- ~6.000 satır fabrikasyon ve ölü frontend kodu silinecek (P15).
- Mevcut sidebar'a alışkın bir kullanıcı 68 ekranın kaybolduğunu görecek.
  Her biri için gerekçe Appendix F'dedir; gerekirse **Advanced**'e eklenir,
  birincil navigasyona değil.
- Legacy `/api/*` yüzeyi P19'da tamamen silinecek.

**Bağlayıcılık**

Bu ADR, master plan Appendix N ile birlikte okunur. Bir faz kapsamına
buradaki non-goal'lardan biri eklenmek isteniyorsa, önce bu ADR'yi
değiştiren yeni bir ADR yazılmalıdır.

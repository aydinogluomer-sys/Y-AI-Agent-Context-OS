# Güvenlik Modeli

> spec §9, §12, §13, §14, §28, §29, §54

## Katmanlar

```
Kimlik            OIDC + JWKS · DB-backed membership        (ADR-002, ADR-017)
   ↓
Yetki             Permission Kernel · FAIL CLOSED           (spec §13)
   ↓
Context Firewall  Allowed Context Universe · ön-filtre      (ADR-027, ADR-028)
   ↓
Trust Boundary    Repo içeriği = DATA, talimat değil        (ADR-063)
   ↓
Change Firewall   Task'tan türeyen sınır · mutation noktası (ADR-038, ADR-039)
   ↓
Kanıt             Manifest · hash zinciri · audit           (ADR-034, ADR-041)
```

## Değişmezler

Bunlar tasarımın kendisidir; ihlalleri hata değil, **mimari kırılma**dır.

1. **Yetki tek noktadan verilir.** Handler içinde ad-hoc kontrol yasak.
   Audit aktörü **daima** doğrulanmış principal'dır (ADR-017).
2. **DENY her zaman kazanır.** APPROVAL retrieval'da DENY gibi davranır
   (ADR-029).
3. **Fail closed.** Policy store erişilemezse DENY + security event +
   readiness degraded. "DB hatası → permissive fallback" hiçbir koşulda
   olamaz (spec §13).
4. **Repository içeriği talimat değildir** (ADR-063).
5. **Ölçülmeyen alan uydurulmaz**: `null` + `unavailableReason` (ADR-032).
6. **İmzasız worker kimliği reddedilir** (spec §54).

## Sırlar

Üretimde sırlar secret manager'dan gelir (ADR-073). Arayüzden veritabanı
yapılandırması **yapılamaz**; ilgili uç nokta ve form kaldırıldı.

Sır taraması (`npm run secret-scan`) her commit'te çalışır ve baseline
**yalnız küçülebilir**.

## Release kapısı (spec §54)

| Kriter | Durum |
|---|---|
| cross-tenant = impossible | Sorgu predikatı uygulandı; sonuç doğrulaması P19 |
| cross-project = impossible | Uygulandı |
| secret leak = zero | Tarama temiz; uçtan uca doğrulama P19 |
| path escape = zero | Uygulandı (48 test) |
| policy outage = fail closed | Uygulandı |
| audit actor = authenticated principal | Uygulandı |
| change boundary bypass = impossible | Uygulandı |
| unsigned worker identity = denied | Uygulandı |

Bkz. [tehdit modeli](threat-model.md), [ADR dizini](../adr/README.md).

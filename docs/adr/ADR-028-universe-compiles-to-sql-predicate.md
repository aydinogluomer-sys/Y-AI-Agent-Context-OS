# ADR-028 — Universe SQL predicate'ine derlenir

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P07 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/context/src/retrieval/lexical.ts:49` |

## Decision

Allowed Context Universe, parametrize edilmiş bir SQL predikatına
**derlenir** ve her retrieval sorgusuna eklenir. Sonuç kümesi üzerinde
filtreleme yapılmaz.

## Context

Universe glob kalıplarından oluşur (`src/**`, `secrets/**`). Bunları
uygulamanın iki yolu vardı: sonuçları çekip JS'te filtrelemek, veya
sorguya predikat olarak koymak.

## Reason

Uygulama katmanında filtreleme ADR-027'yi ihlal eder — satırlar zaten
dönmüştür. Ayrıca `LIMIT` ile birlikte yanlış sonuç verir: veritabanı
izin verilmeyen satırları da sayarak limiti doldurur.

Derleme sırasında desteklenmeyen glob sözdizimi (`{} () | ! + @`)
**reddedilir** — sessizce yanlış yorumlanmaz.

## Consequences

- Predikat parametrizedir; enjeksiyon yüzeyi yok.
- Desteklenmeyen glob = açık hata, sessiz kabul değil.
- `AllowedContextUniverse` retrieval tiplerinde **zorunlu** alandır.

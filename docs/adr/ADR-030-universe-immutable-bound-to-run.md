# ADR-030 — Universe immutable ve run'a bağlı

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P07 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/security/src/context-firewall/universe.ts:2` |

## Decision

Bir run için hesaplanan Allowed Context Universe **değişmezdir** ve o
run'a bağlıdır. Policy sonradan değişse bile run kendi universe'ü ile
tamamlanır.

## Context

Policy'ler zamanla değişir. Bir run sürerken policy güncellenirse
retrieval'ın hangi kurallara uyduğu belirsizleşir.

## Reason

Değişebilen bir universe, kanıtı **doğrulanamaz** yapar: manifest "şu
kurallara göre seçildi" der ama o kurallar artık yoktur.

Ayrıca run ortasında daralan bir universe, yarısı bir kurala yarısı
başkasına göre derlenmiş bir context üretir — hiçbir kurala uymayan bir
sonuç.

## Consequences

- Universe hash'i manifest'e yazılır; sonradan doğrulanabilir.
- Policy değişikliği ancak yeni run'da etkili olur.
- `policy_version` her kararla birlikte kaydedilir.

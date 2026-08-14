# ADR-009 — Provider-agnostic EmbeddingProvider

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P06 |
| Tarih | 2026-08-14 |
| Kanıt | `packages/providers/src/embedding/provider.ts:2` |

## Decision

Embedding üretimi `EmbeddingProvider` arayüzü arkasındadır. Model adı,
boyut ve sağlayıcı kimliği üretilen her vektörle birlikte **kaydedilir**.

## Context

Ürünün tezi vendor-neutral olmaktır (bkz. spec §2, §15). Bu tez
agent adapter'ında uygulanıp embedding'de uygulanmazsa tutarsız olur.

## Reason

Sağlayıcıya hard-code edilmiş bir embedding katmanı, ürünün kendi ana
iddiasını ihlal eder. Ayrıca model değiştiğinde eski vektörlerin hangi
modelle üretildiği bilinmezse **karşılaştırılamaz vektörler** aynı indeks
içinde karışır.

## Consequences

- Model/boyut değişimi tespit edilebilir; yeniden indeksleme tetiklenir.
- Sağlayıcı değişimi bir konfigürasyon işidir, yeniden yazım değil.

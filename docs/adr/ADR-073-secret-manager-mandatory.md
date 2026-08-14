# ADR-073 — Secret manager zorunlu (production)

| Alan | Değer |
|---|---|
| Durum | Uygulandı |
| Faz | P19 |
| Tarih | 2026-08-14 |
| Kanıt | `apps/web/src/App.tsx:845` |

## Decision

Üretimde sırlar bir secret manager'dan gelir. `DATABASE_URL` ve benzeri
bağlantı bilgileri **arayüzden yapılandırılamaz** ve `.env` dosyasına
yazılmaz.

## Context

P00 Truth Audit (P0-2, P0-12): `POST /api/db/configure` gövdeden
connection string alıp global `db` referansını çalışma zamanında
değiştiriyor ve **düz metin parolayı `.env`'e yazıyordu**. Arayüz ise
`config/inspect` yanıtını regex'leyip parolayı React state'ine koyuyordu.

Spec §40: "Secret'lar browser üzerinden `.env` dosyasına yazılmamalıdır."

## Reason

Çalışma zamanında değiştirilebilen bir veritabanı hedefi, SSRF ve
credential harvest için doğrudan bir araçtır: saldırgan kendi sunucusunu
hedef gösterir ve uygulamanın ona bağlanmasını sağlar.

Arayüzde bir parola alanı bırakmak, çalışmasa bile zararlıdır: kullanıcıyı
üretim parolasını uygulama arayüzüne yazmaya alıştırır — kimlik avının
işlediği refleks tam olarak budur.

## Consequences

- Bağlantı bilgisi yalnız ortam değişkeninden okunur.
- Arayüzdeki kimlik bilgisi formu tamamen kaldırıldı (P17).
- `db-credential-surface.test.ts` geri gelmesini engeller.

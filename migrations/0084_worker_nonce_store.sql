-- Migration 0084
-- Ledger version: 3.1.0-worker-nonce-store
--
-- P19 / T7 — T-14 TEKRAR SALDIRISI: KULLANILMIŞ NONCE DEPOSU.
--
-- P17'de worker kimliği imzalandı (T-15) ve her kimlik benzersiz bir
-- `nonce` taşımaya başladı. Ama nonce **saklanmıyordu**: aynı token TTL
-- süresince (≤1 saat) sınırsız kez kullanılabiliyordu.
--
-- `identity.test.ts` bu sınırı açıkça kayıt altına almıştı:
--
--     it("KAYIT: nonce tek başına tekrarı ENGELLEMEZ", ...)
--
-- Bu migration o kaydı kapatır.
--
-- ## Neden veritabanı, neden bellek değil
--
-- Bellek içi bir küme, tek süreçte çalışır. Y birden çok API örneği ve
-- worker çalıştırdığında, bir örnekte kullanılmış nonce diğerinde hâlâ
-- geçerli görünür — yani koruma yatay ölçeklendiğinde SESSİZCE kaybolur.
--
-- ## Neden TTL'e göre temizlik
--
-- Nonce'lar sonsuza kadar tutulamaz: saatte binlerce kimlik üretilirse
-- tablo sınırsız büyür. Bir nonce'un yararlı ömrü, taşıdığı token'ın
-- son kullanma zamanına kadardır; sonrasında token zaten reddedilir
-- (`EXPIRED`), yani kaydı tutmanın değeri kalmaz.

-- +up

CREATE TABLE IF NOT EXISTS used_worker_nonces (
  -- Nonce'un KENDISI birincil anahtar: ikinci kullanim INSERT ile
  -- carpisir ve veritabani tarafindan reddedilir. Once SELECT edip
  -- sonra INSERT etmek, iki esszamanli istegin ikisinin de "kullanilmamis"
  -- gormesine yol acardi (TOCTOU).
  nonce         VARCHAR(64)  PRIMARY KEY,
  worker_id     VARCHAR(255) NOT NULL,
  -- Token'in son kullanma zamani. Temizlik bunu kullanir.
  expires_at    TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE used_worker_nonces IS
  'P19/T7 (T-14). Kullanilmis worker nonce''lari. Nonce birincil anahtar: '
  'ikinci kullanim INSERT carpismasiyla reddedilir, TOCTOU yok.';

-- Temizlik sorgusu icin: suresi dolmuslari bulmak tam tarama olmamali.
CREATE INDEX IF NOT EXISTS idx_used_worker_nonces_expires
  ON used_worker_nonces (expires_at);

-- +down

DROP INDEX IF EXISTS idx_used_worker_nonces_expires;
DROP TABLE IF EXISTS used_worker_nonces;

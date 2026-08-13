-- Migration 0057
-- Ledger version: 2.2.4-legacy-chunk-audit
--
-- P04 / Y-P04-012 — `context_chunks` -> `chunks` göçünün KARARI ve kaydı.
--
-- PLAN NE DİYORDU
--   P04 fazı "0059 chunks veri göçü: context_chunks -> chunks" ve
--   "0060 context_chunks DROP" adımlarını öngörüyordu.
--
-- NEDEN SATIR KOPYALANMIYOR
--   İki tablo aynı şeyi tutmuyor:
--
--     context_chunks(id, context_item_id, chunk_index, content, token_count,
--                    embedding_id)
--
--     chunks(snapshot_id NOT NULL, path NOT NULL, ordinal, start_line,
--            end_line, start_byte, end_byte, symbol_id, ...)
--
--   Eski tabloda snapshot yok, dosya yolu yok, satır/bayt offset'i yok,
--   sembol bağı yok. `context_chunks` satırları YÜKLENMİŞ DOKÜMANLARA
--   (`context_items`: wiki sayfası, PDF metni) aittir; `chunks` ise bir
--   commit'te sabitlenmiş REPO DOSYALARINA.
--
--   Bu alanları doldurmak için bir snapshot uydurmak, olmayan bir bayt
--   offset'i hesaplamak ve fragment'ı var olmayan bir dosyaya bağlamak
--   gerekirdi. Master plan §7 bunu açıkça yasaklar: üretilmemiş kanıt
--   üretilmiş gibi yazılamaz. Yanlış provenance, provenance'ın hiç
--   olmamasından daha tehlikelidir — çünkü sorgulanmaz.
--
-- BUNUN YERİNE
--   Kanonik `chunks` içeriği GERÇEK kaynaktan yeniden üretilir: repository
--   snapshot alınır (P03) ve index worker dosyaları ayrıştırıp yazar (P04).
--   Bu, kopyalamaktan hem daha doğru hem de daha ucuzdur.
--
--   Bu migration yalnızca kararı ve göç anındaki sayıları KAYDEDER; böylece
--   P06 cutover'ında "eski satırlara ne oldu?" sorusu yanıtlanabilir olur.
--
-- `context_chunks` DROP'U NEDEN BURADA DEĞİL
--   Legacy retrieval yüzeyi (`apps/api/src/index.ts`, `packages/context`,
--   `packages/agents`) bu tabloyu HÂLÂ okuyup yazıyor. ADR-001 paralel
--   kanonik yüzey + cutover diyor: tablo, okuyucuları kanonik yüzeye
--   geçtikten sonra (P06) düşer. Bugün DROP etmek çalışan sistemi bozardı.

-- +up
CREATE TABLE IF NOT EXISTS legacy_chunk_migration_audit (
  id SERIAL PRIMARY KEY,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  legacy_chunk_count BIGINT NOT NULL,
  legacy_item_count BIGINT NOT NULL,
  -- Kopyalanan satır sayısı. Bilerek 0; sebebi `decision` alanında.
  migrated_row_count BIGINT NOT NULL DEFAULT 0,
  decision TEXT NOT NULL,
  drop_blocked_by TEXT NOT NULL
);

INSERT INTO legacy_chunk_migration_audit
  (legacy_chunk_count, legacy_item_count, migrated_row_count, decision, drop_blocked_by)
SELECT
  (SELECT COUNT(*) FROM context_chunks),
  (SELECT COUNT(*) FROM context_items),
  0,
  'Satir kopyalanmadi: context_chunks satirlarinda snapshot_id, path ve bayt '
    || 'offset yok. Bu alanlari uydurmak sahte provenance uretmek olurdu. '
    || 'Kanonik chunks icerigi gercek dosyalardan yeniden uretilir (P03 snapshot '
    || '-> P04 index worker).',
  'Legacy retrieval yuzeyi context_chunks tablosunu hala okuyup yaziyor. '
    || 'DROP, okuyucular kanonik yuzeye gectikten sonra (P06) ayri bir '
    || 'migration ile yapilir.';

COMMENT ON TABLE context_chunks IS
  'DEPRECATED (P04). Kanonik karsilik: chunks. Bu tablo P06 retrieval '
  'cutover''inda dusurulecek; karar kaydi legacy_chunk_migration_audit.';

-- +down
DROP TABLE IF EXISTS legacy_chunk_migration_audit;

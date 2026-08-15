-- P19/T1 + P21/4 — Eklentiler ORTAMIN parcasi ve AYRI BIR SEMADA.
--
-- Onceki hali eklentileri `public` semasina kuruyordu ve her test
-- semasinin search_path'i `<sema>, public` idi.
--
-- P21/4'te bunun SEMA IZOLASYONUNU SIZDIRDIGI olculdu: fail-closed
-- testi test semasindaki `projects` tablosunu DUSURDU ve sorgu hata
-- vermek yerine `public.projects`e DUSTU. Sonuc 503 yerine 403 oldu —
-- yani "depo erisilemez" ile "uyelik yok" birbirine karisti.
--
-- `public`te tablo olmasinin sebebi `npm run db:migrate` (CI'da da ayni
-- adim var): migration'lari public'e uyguluyor. Yani sizinti CI'da da
-- gecerliydi.
--
-- Eklentiler artik `ext` semasinda ve test search_path'i `<sema>, ext`.
-- `public` yolun DISINDA: bir test semasinda eksik olan tablo artik
-- sessizce baska bir yere cozulmez, sorgu HATA VERIR.

CREATE SCHEMA IF NOT EXISTS ext;
CREATE EXTENSION IF NOT EXISTS vector SCHEMA ext;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA ext;

-- VERITABANI DUZEYINDE search_path: `public` YANINDA `ext`.
--
-- Eklentileri `ext`e tasimak entegrasyon testlerinin izolasyonunu
-- duzeltti ama UYGULAMAYI kirdi: `server.ts` migration'lari `public`e
-- uyguluyor ve `CREATE EXTENSION IF NOT EXISTS vector` eklenti BASKA
-- semada zaten kurulu oldugu icin hicbir sey yapmiyor. Sonuc:
--
--   FATAL Startup Error: type "vector" does not exist
--
-- Bu satir varsayilan yolu genisletir: acikca search_path VERMEYEN her
-- baglanti (uygulama, psql, migrate) `ext`i de gorur.
--
-- IZOLASYON BOZULMAZ: entegrasyon havuzu search_path'i `-c` ile ACIKCA
-- `<sema>, ext` yapiyor ve bu varsayilani EZER. Yani testler `public`i
-- gormemeye devam eder.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path = %L, public, ext', current_database(), '$user');
END
$$;

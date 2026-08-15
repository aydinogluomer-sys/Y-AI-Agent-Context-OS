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

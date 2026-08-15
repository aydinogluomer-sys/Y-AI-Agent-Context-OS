-- P19 / T1 — Eklentiler ORTAMIN parcasi, testin yan etkisi degil.
--
-- Onceki hali: eklentiler yalnizca `createIntegrationDb` icinde
-- kuruluyordu. Yani soguk kalkistan sonra, HERHANGI bir test kosmadan
-- once, veritabaninda `vector` ve `pg_trgm` YOKTU.
--
-- Belirti: `npm run db:test:reset` sonrasi elle bir sorgu ya da
-- `verify:evidence-chain` calistirmak, eklentiye bagliysa patlardi.
-- Kurulum sirasina bagli bir ortam, sirayi bilmeyen icin bozuktur.
--
-- Bu dosya `docker-entrypoint-initdb.d` icinde: konteyner ILK acilista
-- calistirir. `createIntegrationDb` icindeki `CREATE EXTENSION IF NOT
-- EXISTS` KALDIRILMADI - CI kendi Postgres servisini kullaniyor ve bu
-- init dizinini gormuyor. Iki yol da kapali olmali.

CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;

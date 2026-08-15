/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P20 / FAZ 4 — T8 OLCEK OLCUMU (canli Postgres).
 *
 * ## Erteleme gerekcesi YANLISTI
 *
 * T8 "adanmis makine ister, bu makinede yayilim %60" diye ertelenmisti.
 * Bu MIKRO-BENCHMARK'lar icin dogru: dosya basina 0.58 ms olcerken
 * zamanlayici cozunurlugu ve isletim sistemi gurultusu baskin.
 *
 * 10K dosyalik gercek index kosusu icin YANLIS: onlarca saniye surer ve
 * I/O baskindir. %60 gurultu, 40 saniyelik bir olcumde 40 +/- 24 sn
 * anlamina gelmez.
 *
 * ## Ne olculuyor
 *
 * Gercek uretim yolu: LocalRepoAdapter -> SnapshotService.ingest().
 * Sahte bir dongu degil; migration'lari uygulanmis izole bir semaya
 * yazan asil kod.
 *
 * ## Durustluk kurali
 *
 * OLCULEN sayi yazilir. Butce asilirsa BUTCE YUKSELTILMEZ — asim
 * kaydedilir. Olcume uydurulan bir butce, olcum degildir.
 *
 * Makine kunyesi (CPU, RAM, Postgres surumu) ciktiya girer: kunyesiz
 * bir performans sayisi okunamaz.
 */

import { cpus, totalmem } from "node:os";
import { writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import dotenv from "dotenv";

/*
 * `.env.test` yuklenir ama `override` YOK: komut satirindan verilen
 * DATABASE_URL dosyaya YENIK DUSMEMELI.
 *
 * P21/6'da bu kalip depodaki 13 dosyadan KALDIRILDI ve
 * `gate:dotenv-precedence` ile geri gelmesi engellendi.
 */
dotenv.config({ path: ".env.test" });
import { createIntegrationDb, type IntegrationDb } from "../../tests/integration/setup.js";

interface ScaleResult {
  readonly name: string;
  readonly unit: string;
  readonly value: number;
  readonly note?: string;
}

function fingerprint() {
  const cpu = cpus();
  return {
    cpuModel: cpu[0]?.model ?? "bilinmiyor",
    cpuCount: cpu.length,
    totalMemGb: Number((totalmem() / 1024 ** 3).toFixed(1)),
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`
  };
}

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const value = await fn();
  return [value, performance.now() - start];
}

async function main(): Promise<void> {
  const fixtureRoot = process.argv.includes("--fixture")
    ? process.argv[process.argv.indexOf("--fixture") + 1]
    : ".perf/repo-10k";
  // Mutlak yol ZORUNLU: LocalRepositoryAdapter goreli yolu reddeder (ADR-018).
  const absRoot = resolve(fixtureRoot);

  const { LocalRepositoryAdapter } = await import("../../packages/core/src/repo/local-adapter.js");
  const { SnapshotService } = await import("../../packages/core/src/ingestion/snapshot-service.js");
  const { seedTenant } = await import("../../tests/integration/seed.js");

  console.log("T8 — OLCEK OLCUMU\n");
  const machine = fingerprint();
  console.log(`makine : ${machine.cpuModel} (${machine.cpuCount} cekirdek, ${machine.totalMemGb} GB)`);
  console.log(`fixture: ${fixtureRoot}\n`);

  let db: IntegrationDb | undefined;
  const results: ScaleResult[] = [];

  try {
    db = await createIntegrationDb("scale-10k");
    const [, migrateMs] = await timed(() => db!.migrate());
    console.log(`migration : ${(migrateMs / 1000).toFixed(1)} sn`);

    const pg = (await db.query("SHOW server_version;")).rows[0].server_version;

    // Tenant zinciri: ingest'in yazacagi organizasyon ve repository.
    const tenant = await seedTenant(db, "org_scale", "snap_unused");

    const adapter = new LocalRepositoryAdapter(absRoot);
    await adapter.connect();
    const service = new SnapshotService({
      query: (sql: string, params?: unknown[]) => db!.query(sql, params)
    });

    // --- 1. ILK INDEX ------------------------------------------------
    // Gercek uretim yolu. `scanSecrets` KAPALI: sir taramasi ayri bir
    // maliyet kalemi ve onu index suresine karistirmak iki farkli seyi
    // tek sayida gizlerdi.
    const [snapshot, ingestMs] = await timed(() =>
      service.ingest(adapter, {
        organizationId: tenant.organizationId,
        repositoryId: tenant.repositoryId,
        scanSecrets: false
      })
    );

    const fileCount = Number(
      (await db.query("SELECT COUNT(*)::int AS c FROM files WHERE snapshot_id = $1;", [snapshot.snapshotId]))
        .rows[0].c
    );

    if (fileCount === 0) {
      throw new Error(
        "POZITIF KONTROL BASARISIZ: ingest 0 dosya yazdi. Olculecek bir sey yok; " +
          "sifir dosyayi hizli islemek bir performans sonucu degildir."
      );
    }

    results.push({ name: "index.initial", unit: "ms", value: Math.round(ingestMs) });
    results.push({
      name: "index.initial.perFile",
      unit: "ms/dosya",
      value: Number((ingestMs / fileCount).toFixed(3))
    });
    console.log(`ilk index : ${(ingestMs / 1000).toFixed(1)} sn  (${fileCount} dosya)`);

    // --- 2. IDEMPOTENT YENIDEN INDEX ---------------------------------
    // Ayni commit ikinci kez islenmemeli (snapshot-service.ts:62). Bu
    // "artimli" degil ama artimli yolun ON KOSULU: degismemis bir repo
    // yeniden taranmamali.
    const [, reIngestMs] = await timed(() =>
      service.ingest(adapter, {
        organizationId: tenant.organizationId,
        repositoryId: tenant.repositoryId,
        scanSecrets: false
      })
    );
    results.push({ name: "index.idempotent", unit: "ms", value: Math.round(reIngestMs) });
    console.log(`yeniden   : ${reIngestMs.toFixed(0)} ms  (idempotent kisa devre)`);

    // --- 3. VERITABANI BOYUTU ----------------------------------------
    const sizeBytes = Number(
      (
        await db.query(
          `SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0)::bigint AS bytes
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relkind = 'r';`,
          [db.schema]
        )
      ).rows[0].bytes
    );
    results.push({ name: "db.size", unit: "MB", value: Number((sizeBytes / 1024 ** 2).toFixed(1)) });
    results.push({
      name: "db.sizePerFile",
      unit: "KB/dosya",
      value: Number((sizeBytes / fileCount / 1024).toFixed(2))
    });
    console.log(`db boyutu : ${(sizeBytes / 1024 ** 2).toFixed(1)} MB`);

    // --- 4. INDEKSLI SORGU, 10K OLCEGINDE ----------------------------
    // Bes kez olcup MEDYAN alinir: tek olcum, arka plan yuku yuzunden
    // yaniltici olabilir. Ortalama degil medyan, cunku tek bir yavas
    // kosu ortalamayi kaydirir.
    const lookupSamples: number[] = [];
    const { rows: sample } = await db.query(
      "SELECT path FROM files WHERE snapshot_id = $1 LIMIT 1;",
      [snapshot.snapshotId]
    );
    for (let i = 0; i < 5; i++) {
      const [, ms] = await timed(() =>
        db!.query("SELECT id FROM files WHERE snapshot_id = $1 AND path = $2;", [
          snapshot.snapshotId,
          sample[0].path
        ])
      );
      lookupSamples.push(ms);
    }
    lookupSamples.sort((a, b) => a - b);
    results.push({
      name: "query.fileByPath.median",
      unit: "ms",
      value: Number(lookupSamples[2].toFixed(2)),
      note: `5 olcumun medyani; yayilim ${lookupSamples[0].toFixed(2)}-${lookupSamples[4].toFixed(2)} ms`
    });
    console.log(`yol sorgu : ${lookupSamples[2].toFixed(2)} ms (medyan)`);

    // --- CIKTI -------------------------------------------------------
    mkdirSync("docs/perf", { recursive: true });
    const payload = {
      measuredAt: new Date().toISOString(),
      fixture: { root: fixtureRoot, fileCount },
      machine: { ...machine, postgres: pg },
      /*
       * SPEC SAYISAL HEDEF VERMIYOR.
       *
       * Kaynak spec 41. bolum: "Targetlar plan icerisinde
       * netlestirilsin" — olculecek SINIFLARI sayiyor (10K/50K/100K
       * dosya) ama esik vermiyor. Dolayisiyla bu kosu bir butceyi
       * GECMIYOR ya da KALMIYOR: ilk TABAN olcumu.
       *
       * Hedef uydurup ona gore "gecti" demek, olcumu ters cevirmek
       * olurdu. Esik, bu sayilara bakilarak insan tarafindan konur.
       */
      specTarget: null,
      specTargetReason:
        "Kaynak spec 41 olculecek siniflari sayiyor, esik vermiyor. Bu kosu ilk taban.",
      results,
      /*
       * OLCULMEYENLER — ADR-032: olculemeyen alan UYDURULMAZ.
       *
       * `SnapshotService.ingest` yalniz `files` yazar; chunk uretmez
       * (snapshot-service.ts icinde INSERT INTO chunks YOK). Bu yuzden
       * asagidakiler bu kosuda OLCULEMEDI ve tahmin de yazilmadi.
       */
      notMeasured: [
        {
          name: "chunking",
          reason: "ingest chunk uretmiyor; ayri bir index worker adimi ve o adim henuz surulmedi"
        },
        {
          name: "retrieval.fts",
          reason: "chunk olmadan tsv yok; FTS olcumu chunk uretimine bagli"
        },
        {
          name: "retrieval.semantic",
          reason: "embedding saglayicisi yok (Engel B)"
        },
        {
          name: "graph.traversal",
          reason: "graf dugumleri symbol cikarimindan turer; bu kosuda uretilmedi"
        }
      ]
    };
    writeFileSync("docs/perf/scale-10k.json", JSON.stringify(payload, null, 2) + "\n");
    console.log("\nyazildi: docs/perf/scale-10k.json");
    console.log(`OLCULMEYEN ${payload.notMeasured.length} kalem ciktida ADIYLA kayitli.`);
  } finally {
    await db?.close();
  }
}

main().catch((err) => {
  console.error("OLCUM BASARISIZ:", err instanceof Error ? err.message : err);
  process.exit(1);
});

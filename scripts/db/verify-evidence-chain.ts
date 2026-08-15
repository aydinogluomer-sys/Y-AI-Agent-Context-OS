/**
 * P19 / T9 — KANIT ZİNCİRİ DOĞRULAYICISI.
 *
 * `docs/operations/backup-restore.md` bu komuttan söz ediyordu ama komut
 * **yoktu**. Belgede geçen ama var olmayan bir komut, en çok ihtiyaç
 * duyulduğu anda — geri yükleme sonrası — bulunamaz.
 *
 * ## Neden geri yükleme sonrası ZORUNLU
 *
 * Kısmi bir geri yükleme sıra boşluğu bırakır ve bu, dışarıdan bir
 * saldırıdan **ayırt edilemez**. `verifyChain` üç durumu ayrı ayrı
 * raporlar (silme / ekleme / değiştirme); operatör hangisiyle karşı
 * karşıya olduğunu bilmeden müdahale edemez.
 *
 * ## Bilinen sınır
 *
 * Zincirin **tamamı** yeniden yazılırsa doğrulama geçer. Bunu kapatmak
 * dış bir çıpa gerektirir (imzalı zaman damgası ya da harici depo).
 * Sınır `chain.test.ts` içinde de kayıtlı ve burada da bildiriliyor —
 * "doğrulama geçti" ifadesinin neyi kapsamadığı görünür olmalı.
 *
 * ## Kullanım
 *
 * ```bash
 * npm run verify:evidence-chain
 * npm run verify:evidence-chain -- --run-id run_123
 * ```
 */

import { Pool } from "pg";
import { verifyChain, type EvidenceEntry } from "@y/security";

interface Options {
  readonly runId: string | null;
  readonly databaseUrl: string;
}

function parseArgs(argv: readonly string[]): Options {
  const runIdIndex = argv.indexOf("--run-id");
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    // Kaynak koda gomulu varsayilan YOK (ADR-073). Sessizce bir
    // varsayilana dusmek, YANLIS veritabanini "saglam" raporlamaya
    // yol acabilir - ki bu, hicbir sey raporlamamaktan kotudur.
    throw new Error(
      "DATABASE_URL ayarlanmamis. Kanit zinciri hangi veritabaninda " +
        "dogrulanacagi TAHMIN EDILEMEZ."
    );
  }

  return {
    runId: runIdIndex >= 0 ? (argv[runIdIndex + 1] ?? null) : null,
    databaseUrl
  };
}

async function loadEntries(pool: Pool, runId: string | null): Promise<EvidenceEntry[]> {
  const { rows } = await pool.query(
    `SELECT id, run_id, kind, payload_json, sequence, previous_hash, entry_hash, created_at
       FROM evidence_chain
      ${runId ? "WHERE run_id = $1" : ""}
      ORDER BY sequence;`,
    runId ? [runId] : []
  );

  return rows.map((row) => ({
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    payload: row.payload_json ?? {},
    sequence: Number(row.sequence),
    previousHash: row.previous_hash,
    entryHash: row.entry_hash,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  }));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: options.databaseUrl });

  try {
    const entries = await loadEntries(pool, options.runId);
    const result = verifyChain(entries);

    console.log("=== KANIT ZINCIRI DOGRULAMASI ===");
    console.log(`  kapsam        : ${options.runId ?? "TUM ZINCIR"}`);
    console.log(`  kayit sayisi  : ${entries.length}`);
    console.log(`  dogrulanan    : ${result.verifiedCount}`);

    if (result.valid) {
      console.log("  sonuc         : SAGLAM");
      console.log("");
      console.log("  BILINEN SINIR: zincirin TAMAMI yeniden yazilirsa bu");
      console.log("  dogrulama gecer. Bunu kapatmak dis bir cipa gerektirir");
      console.log("  (imzali zaman damgasi ya da harici depo).");
      return;
    }

    console.error("  sonuc         : KIRIK");
    console.error(`  kirilma sirasi: ${result.brokenAtSequence}`);
    console.error(`  sebep         : ${result.reason}`);
    console.error("");
    console.error("  Uc durum ayirt edilir:");
    console.error("    sira boslugu  -> kayit SILINDI");
    console.error("    bag kopuklugu -> araya kayit EKLENDI");
    console.error("    icerik hash'i -> kayit DEGISTIRILDI");
    console.error("");
    console.error("  Bkz. docs/operations/incident-response.md");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Dogrulama calistirilamadi:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

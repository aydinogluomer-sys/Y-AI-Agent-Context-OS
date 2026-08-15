/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P20 / FAZ 1 — MUTASYON KAPISI.
 *
 * "Gecen test" bir kanit degildir. Kanit, KIRILABILEN testtir.
 *
 * Bu arac her mutasyon kaydi icin: dosyayi bozar, ilgili suiti kosturur,
 * suitin KIRILDIGINI dogrular, dosyayi geri yukler. Suit gecerse mutasyon
 * "hayatta kalmis" demektir — o test yanlis yesildir ve kapi exit 1 verir.
 *
 * ## Bu aracin kendi guvenligi
 *
 * Arac uretim kodunu diske yazar. Bozuk kod birakmasi, yakalamaya calistigi
 * hatadan beterdir. Dort onlem:
 *
 *   1. Kirli calisma agacinda KOSMAZ (geri yukleme kaydedilmemis isi yok eder)
 *   2. Geri yukleme SHA-256 ile dogrulanir; uymuyorsa surec HEMEN durur
 *   3. SIGINT/SIGTERM/uncaughtException'da da geri yukler
 *   4. `find` metni tam bir kez esleseme zorunlu — kayitlarin curumesini engeller
 *
 * Kullanim:
 *   tsx scripts/mutation/run.ts               # tum mutasyonlar
 *   tsx scripts/mutation/run.ts --id firewall-deny
 *   tsx scripts/mutation/run.ts --self-test   # harness'in kendi pozitif kontrolu
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MUTATIONS, SELF_TEST, type Mutation } from "./mutations.js";

const ROOT = resolve(import.meta.dirname, "..", "..");

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Geri yukleme icin acik dosyalar. Sinyal yakalandiginda bunlar yazilir. */
const openFiles = new Map<string, string>();

function restoreAll(): void {
  for (const [path, original] of openFiles) {
    writeFileSync(path, original, "utf8");
  }
  openFiles.clear();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.error(`\n${signal} alindi — dosyalar geri yukleniyor...`);
    restoreAll();
    process.exit(130);
  });
}
process.on("uncaughtException", (err) => {
  console.error("\nBeklenmeyen hata — dosyalar geri yukleniyor...");
  restoreAll();
  console.error(err);
  process.exit(1);
});

/**
 * Hedef dosyalarin git'e gore TEMIZ oldugunu dogrular.
 *
 * Geri yukleme, dosyayi surecin BASINDAKI diskteki haline dondurur.
 * Kaydedilmemis bir degisiklik varsa bu onu korur — ama surec cokerse
 * ve geri yukleme yarim kalirsa kullanicinin isi kaybolur. Riski en
 * bastan reddetmek daha dogru.
 */
function assertCleanTree(files: readonly string[]): void {
  const result = spawnSync("git", ["status", "--porcelain", "--", ...files], {
    cwd: ROOT,
    encoding: "utf8"
  });
  const dirty = (result.stdout ?? "").trim();
  if (dirty.length > 0) {
    console.error("HATA: hedef dosyalarda kaydedilmemis degisiklik var.\n");
    console.error(dirty);
    console.error("\nMutasyon kapisi bu dosyalari gecici olarak BOZAR ve geri yukler.");
    console.error("Kaydedilmemis is riske atilmasin diye kapi kosmayi reddediyor.");
    console.error("Once commit edin ya da stash'leyin.");
    process.exit(1);
  }
}

interface Outcome {
  readonly mutation: Mutation;
  /** Suit kirildi mi? true = mutasyon YAKALANDI. */
  readonly caught: boolean;
  readonly durationMs: number;
}

/**
 * Tek bir mutasyonu uygular, suiti kosturur, geri yukler.
 *
 * Geri yukleme `finally` icinde VE hash dogrulamali. Hash uymuyorsa
 * `process.exit(1)` — bozuk uretim kodu birakip devam etmek kabul edilemez.
 */
function runMutation(m: Mutation): Outcome {
  const path = resolve(ROOT, m.file);
  const original = readFileSync(path, "utf8");
  const originalHash = sha256(original);

  const occurrences = original.split(m.find).length - 1;
  if (occurrences !== 1) {
    console.error(`\nHATA [${m.id}]: 'find' metni ${occurrences} kez eslesti, 1 bekleniyordu.`);
    console.error(`  dosya: ${m.file}`);
    if (occurrences === 0) {
      console.error("  Sebep: kod tasinmis ya da degismis. Mutasyon kaydi CURUMUS.");
      console.error("  Bu bir kapi hatasidir: yoklamadigi bir seyi yokluyor sanmak,");
      console.error("  hic yoklamamaktan daha tehlikelidir. Kaydi guncelleyin.");
    } else {
      console.error("  Sebep: metin birden cok yerde geciyor; hangisinin bozuldugu belirsiz.");
      console.error("  'find' metnini daha fazla baglam ekleyerek tekillestirin.");
    }
    process.exit(1);
  }

  openFiles.set(path, original);
  const started = Date.now();
  let caught: boolean;

  try {
    writeFileSync(path, original.replace(m.find, m.replace), "utf8");

    /*
     * vitest DOGRUDAN node ile cagriliyor — npx ya da shell:true yok.
     *
     * shell:true argumanlari kabuga birlestirir (DEP0190). Alternatif
     * npx.cmd ise Windows'ta calismaz: Node, CVE-2024-27980'den sonra
     * .cmd dosyalarini shell'siz spawn etmeyi reddediyor.
     *
     * Bu regresyonu harness'in kendi pozitif kontrolu yakaladi — kapinin
     * kendisi de yoklanmali olmasinin somut kaniti.
     */
    const result = spawnSync(
      process.execPath,
      [
        resolve(ROOT, "node_modules", "vitest", "vitest.mjs"),
        "run",
        // Birim testleri entegrasyon config'iyle KOSMAZ (include kalibi
        // yalnizca tests/ altini kapsar). Suit yoluna gore secilir.
        ...(m.suite.startsWith("tests/")
          ? ["--config", "vitest.integration.config.ts"]
          : []),
        m.suite,
        "--reporter=dot"
      ],
      { cwd: ROOT, encoding: "utf8", timeout: 300_000 }
    );

    // Sifir DISI cikis = suit kirildi = mutasyon YAKALANDI.
    caught = result.status !== 0;
  } finally {
    writeFileSync(path, original, "utf8");
    openFiles.delete(path);

    const restoredHash = sha256(readFileSync(path, "utf8"));
    if (restoredHash !== originalHash) {
      console.error(`\nOLUMCUL [${m.id}]: geri yukleme DOGRULANAMADI.`);
      console.error(`  beklenen: ${originalHash}`);
      console.error(`  bulunan : ${restoredHash}`);
      console.error(`  DOSYA BOZUK OLABILIR: ${m.file} — 'git checkout' ile geri alin.`);
      process.exit(1);
    }
  }

  return { mutation: m, caught, durationMs: Date.now() - started };
}

function main(): void {
  const argv = process.argv.slice(2);
  const selfTest = argv.includes("--self-test");
  const idFlag = argv.indexOf("--id");
  const onlyId = idFlag >= 0 ? argv[idFlag + 1] : undefined;

  if (selfTest) {
    console.log("MUTASYON KAPISI — POZITIF KONTROL\n");
    console.log("Davranisi degistirmeyen bir mutasyon uygulaniyor (yorum satiri).");
    console.log("Beklenti: suit GECMELI, yani mutasyon HAYATTA KALMALI.");
    console.log("Harness bunu 'yakalandi' derse harness'in kendisi bozuktur.\n");

    assertCleanTree([SELF_TEST.file]);
    const outcome = runMutation(SELF_TEST);

    if (outcome.caught) {
      console.error("\nBASARISIZ: harness zararsiz bir mutasyonu 'yakalandi' saydi.");
      console.error("Suit yorum degisikliginden kirildi ya da suit zaten kirikti.");
      console.error("Her iki durumda da bu kapinin sonuclari GUVENILMEZ.");
      process.exit(1);
    }
    console.log(`\nGECTI: mutasyon hayatta kaldi (${(outcome.durationMs / 1000).toFixed(1)} sn).`);
    console.log("Harness hayatta kalani ayirt edebiliyor.");
    return;
  }

  const selected = onlyId ? MUTATIONS.filter((m) => m.id === onlyId) : MUTATIONS;
  if (selected.length === 0) {
    console.error(`HATA: '${onlyId}' kimlikli mutasyon yok.`);
    console.error(`Mevcut: ${MUTATIONS.map((m) => m.id).join(", ")}`);
    process.exit(1);
  }

  assertCleanTree([...new Set(selected.map((m) => m.file))]);

  console.log(`MUTASYON KAPISI — ${selected.length} kayit\n`);
  console.log("Her mutasyon icin: uretim kodu bozulur, suit kosar, geri yuklenir.");
  console.log("Suit KIRILMALIDIR. Gecerse o test yanlis yesildir.\n");

  const outcomes: Outcome[] = [];
  for (const [index, m] of selected.entries()) {
    const label = `[${index + 1}/${selected.length}] ${m.id}`;
    process.stdout.write(`${label} ... `);
    const outcome = runMutation(m);
    outcomes.push(outcome);
    const seconds = (outcome.durationMs / 1000).toFixed(1);
    console.log(outcome.caught ? `YAKALANDI (${seconds} sn)` : `HAYATTA KALDI (${seconds} sn)`);
  }

  const survived = outcomes.filter((o) => !o.caught);

  console.log(`\n${"-".repeat(64)}`);
  console.log(`yakalanan: ${outcomes.length - survived.length}/${outcomes.length}`);

  if (survived.length > 0) {
    console.log(`\nHAYATTA KALAN ${survived.length} MUTASYON = ${survived.length} YANLIS YESIL\n`);
    for (const { mutation } of survived) {
      console.log(`  ${mutation.id}`);
      console.log(`    dosya : ${mutation.file}`);
      console.log(`    suit  : ${mutation.suite}`);
      if (mutation.threat) console.log(`    tehdit: ${mutation.threat}`);
      console.log(`    olcum : ${mutation.why}`);
      console.log("");
    }
    console.log("Bu suitler ilgili korumayi DOGRULAMIYOR. Koruma kaldirildi ve");
    console.log("hicbir test kirilmadi — yani testler baska bir seyi olcuyor.");
    console.log("\nDuzeltme: testin saldiri kurgusunu, korumanin TEK BASINA");
    console.log("belirleyici oldugu bir duruma tasiyin (bkz. docs/implementation.md FAZ 1).");
    process.exit(1);
  }

  console.log("\nTum mutasyonlar yakalandi: bu suitler kirilabilir, dolayisiyla tasiyici.");
}

main();

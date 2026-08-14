import {
  DATABASE_TARGETS,
  DETERMINISTIC_TARGETS,
  runValidationSuite,
} from "./validation-suite";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.DETERMINISTIC_TEST_MODE = "true";

const mode = process.argv[2] || "deterministic";
const strictSkips = mode === "db";
const targets = strictSkips ? DATABASE_TARGETS : DETERMINISTIC_TARGETS;

const results = runValidationSuite(targets, {
  strictSkips,
  echo: true,
});

const failed = results.filter((result) => result.exitCode !== 0);
const skipped = results.flatMap((result) =>
  result.skipped.map((reason) => `${result.name}: ${reason}`)
);

console.log("\n=== VALIDATION SUITE SUMMARY ===");
console.log(`Mode: ${mode}`);
console.log(`Executed: ${results.length}/${targets.length}`);
console.log(`Failed: ${failed.length}`);
console.log(`Skip markers: ${skipped.length}`);

if (skipped.length > 0) {
  for (const reason of skipped) console.log(`- ${reason}`);
}

/**
 * [P17 / ADR-000] ATLANAN KONTROL VARKEN "GECTI" DENMEZ.
 *
 * Onceki hali `Failed: 0` yazip cikis kodu 0 donuyordu; atlanan kontrol
 * sayisi bir satir yukarida yazsa da ozet bir BASARI gibi okunuyordu.
 *
 * Ayrim onemli: `deterministic` modda veritabani YOK, dolayisiyla DB
 * kontrollerinin atlanmasi bir HATA degildir — ama sonucun TAM oldugunu
 * da soylemez. Bu yuzden cikis kodu 0 kalir (mod kendi sinirlari icinde
 * dogru calismistir) ama VERDIKT acikca KISMI yazilir.
 *
 * `db` modunda ayni atlama bir hatadir ve cikis kodunu bozar: orada
 * veritabani VAR olmasi gerekiyordu.
 */
if (failed.length > 0) {
  console.log("VERDIKT: BASARISIZ");
} else if (skipped.length > 0) {
  console.log(
    `VERDIKT: KISMI — ${skipped.length} kontrol CALISTIRILMADI. ` +
      "Bu kosu, atlanan kontroller hakkinda hicbir sey soylemez."
  );
} else {
  console.log("VERDIKT: GECTI");
}

if (failed.length > 0 || (strictSkips && skipped.length > 0)) {
  process.exit(1);
}


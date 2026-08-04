import {
  DATABASE_TARGETS,
  DETERMINISTIC_TARGETS,
  runValidationSuite,
} from "./validation-suite";

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

if (failed.length > 0 || (strictSkips && skipped.length > 0)) {
  process.exit(1);
}


import assert from "node:assert/strict";
import {
  detectSkipMarkers,
  runValidationTarget,
} from "./validation-suite";

assert.deepEqual(detectSkipMarkers("All checks passed."), []);
assert.equal(
  detectSkipMarkers("Skipping Part C Live DB checks because connection failed.")
    .length,
  1
);
assert.equal(
  detectSkipMarkers("Sandbox fallbacks activated for Database schema model checks.")
    .length,
  1
);

const permissive = runValidationTarget(
  { name: "Phase 1 Auth", script: "scripts/validate-phase-1-auth.ts" },
  { strictSkips: false, echo: false }
);
assert.equal(permissive.exitCode, 0);
assert.equal(permissive.skipped.length, 0);

const strictFixture = detectSkipMarkers(
  "Stage result: PASS\nSkipping live database trigger assertions."
);
assert.ok(
  strictFixture.length > 0,
  "Strict runner must detect a success log that hides skipped DB checks."
);

console.log("Phase 2 validation orchestration: PASS");


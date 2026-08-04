import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(
  new URL("../apps/web/src/App.tsx", import.meta.url),
  "utf8",
);
const navigationSource = await readFile(
  new URL("../apps/web/src/app/navigation.ts", import.meta.url),
  "utf8",
);

const navigationBlock = navigationSource.slice(
  navigationSource.indexOf("export const NAVIGATION_CATEGORIES"),
);
const visibleTabIds = Array.from(
  navigationBlock.matchAll(/\{\s*id:\s*"([^"]+)"/g),
  (match) => match[1],
);
const implementedTabIds = new Set(
  Array.from(appSource.matchAll(/case\s+"([^"]+)":/g), (match) => match[1]),
);

assert.ok(visibleTabIds.length > 0, "Navigation must expose at least one tab.");
for (const tabId of visibleTabIds) {
  assert.ok(
    implementedTabIds.has(tabId),
    `Visible navigation tab '${tabId}' must have a concrete App implementation.`,
  );
}

assert.doesNotMatch(appSource, /Sub-system dashboard coordinates loaded/);

for (const [component, apiSignals] of [
  ["EvidenceStorePanel.tsx", ["fetchEvidenceRecords", "verifyEvidenceRecord"]],
  ["QualityGateReportPanel.tsx", ["fetchQualityRuns", "fetchQualityRunDetails"]],
  ["ImpactAnalysisPanel.tsx", ["fetchImpactReports", "runImpactAnalysis"]],
] as const) {
  const source = await readFile(
    new URL(`../apps/web/src/components/${component}`, import.meta.url),
    "utf8",
  );
  for (const apiSignal of apiSignals) {
    assert.match(source, new RegExp(`\\b${apiSignal}\\b`));
  }
  assert.match(source, /role="alert"/);
}

console.log(
  `Phase 6 functional navigation: PASS (${visibleTabIds.length} visible tabs, all implemented)`,
);

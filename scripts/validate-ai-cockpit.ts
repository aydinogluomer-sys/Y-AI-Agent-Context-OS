/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertContains(file: string, pattern: string, message: string) {
  const contents = read(file);
  if (!contents.includes(pattern)) {
    throw new Error(`${message}: missing "${pattern}" in ${file}`);
  }
}

function assertRegex(file: string, regex: RegExp, message: string) {
  const contents = read(file);
  if (!regex.test(contents)) {
    throw new Error(`${message}: ${regex} did not match ${file}`);
  }
}

assertContains(
  "apps/web/src/App.tsx",
  'useState(true)',
  "AI cockpit should be the default route experience"
);
assertContains(
  "apps/web/src/app/navigation.ts",
  "AI Mission Control",
  "Navigation should expose an AI-first command tab"
);
assertContains(
  "apps/web/src/app/AppShell.tsx",
  "AI Engineering Agent Cockpit",
  "Shell header should describe the AI product"
);
assertContains(
  "apps/web/src/components/AIMissionControlPanel.tsx",
  "ai-task-composer",
  "Mission control needs an accessible task composer"
);
assertContains(
  "apps/web/src/components/AIMissionControlPanel.tsx",
  "Run AI analysis",
  "Mission control needs a primary AI action"
);
assertContains(
  "apps/web/src/components/AIMissionControlPanel.tsx",
  "Model council",
  "Mission control needs provider/model visibility"
);
assertContains(
  "apps/web/src/components/AIMissionControlPanel.tsx",
  "Trust rail",
  "Mission control needs trust and blocker visibility"
);
assertContains(
  "apps/web/src/components/AIMissionControlPanel.tsx",
  "Knowledge graph preview",
  "Mission control needs grounded graph context"
);
assertContains(
  "apps/web/src/components/AIMissionControlPanel.tsx",
  "Decision enforcement",
  "Mission control needs decision enforcement visibility"
);
assertContains(
  "apps/web/src/components/AIMissionControlPanel.tsx",
  "Capability advisor",
  "Mission control needs next-action capability guidance"
);
assertContains(
  "apps/web/src/components/AIMissionControlPanel.tsx",
  "Provider visibility",
  "Mission control needs provider/fallback visibility"
);
assertContains(
  "apps/web/src/components/AIMissionControlPanel.tsx",
  "Connect advisor",
  "Mission control needs missing-context guidance"
);
assertContains(
  "apps/web/src/lib/api/ai.ts",
  "/api/simulate-task",
  "AI client should call the simulation endpoint"
);
assertRegex(
  "apps/web/src/lib/api/ai.ts",
  /createLocalAiSimulation/,
  "AI client should provide deterministic local fallback"
);
assertContains(
  "apps/web/src/app/AppShell.tsx",
  "lg:flex-row",
  "Shell should collapse safely on mobile before desktop side navigation"
);
assertContains(
  "src/index.css",
  "prefers-reduced-motion",
  "Global styles should respect reduced motion"
);
assertContains(
  "src/index.css",
  "focus-visible",
  "Global styles should expose keyboard focus"
);

console.log("AI cockpit validation: PASS");

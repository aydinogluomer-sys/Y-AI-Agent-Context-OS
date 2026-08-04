/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import { redactSecretLeaks } from "../packages/security/src/index";

// Directories to ignore
const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".cache",
  ".next",
  ".antigravity"
]);

// Files to ignore
const IGNORED_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "qa-debug-tags.ts", // exclude self to ensure it does not self-flag
  "validate-vault.ts", // exclude vault validation test suite which asserts guardrails
  "quality-gates-debug-tags.md",
  "implementation.md"
]);

// Build a dynamic tag so that the string literal doesn't trigger searches if any regex scans.
const TARGETS = [
  ["[", "Y_TEMP_DEBUG", ":"].join(""),
  "Y_TEMP_DEBUG"
];

interface Violation {
  file: string;
  line: number;
  matchedText: string;
}

const violations: Violation[] = [];

function scanDir(dir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(process.cwd(), fullPath);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      scanDir(fullPath);
    } else if (entry.isFile()) {
      if (
        IGNORED_FILES.has(entry.name) || 
        entry.name.startsWith("validate-") || 
        entry.name.endsWith(".png") || 
        entry.name.endsWith(".jpg") || 
        entry.name.endsWith(".ico") ||
        entry.name.endsWith(".md")
      ) {
        continue;
      }

      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];

        // Check against target strings
        for (const target of TARGETS) {
          if (lineText.includes(target)) {
            // Check if it's in a console.log, console.warn or console.error that contains the tag
            // The instructions specify searching for:
            // - [Y_TEMP_DEBUG:
            // - Y_TEMP_DEBUG
            // - console.log statements containing Y_TEMP_DEBUG
            // - console.warn statements containing Y_TEMP_DEBUG
            // - console.error statements containing Y_TEMP_DEBUG
            // Since searching for Y_TEMP_DEBUG covers all of these, any line containing Y_TEMP_DEBUG is flagged.
            violations.push({
              file: relativePath,
              line: i + 1,
              matchedText: redactSecretLeaks(lineText.trim())
            });
            break; // only flag a line once
          }
        }
      }
    }
  }
}

console.log("=== STARTING TEMPORARY DEBUG INSTRUMENTATION QUALITY GATE CHECK ===");
try {
  scanDir(process.cwd());

  if (violations.length > 0) {
    console.error(`\n❌ QUALITY GATE FAILED: Found ${violations.length} temporary debug instrumentation tags!`);
    console.error("Please remove all temporary debug tags prior to merging.");
    for (const v of violations) {
      console.error(`  - FILE: ${v.file} (Line: ${v.line})`);
      console.error(`    VIOLATION: ${v.matchedText}`);
    }
    process.exit(1);
  } else {
    console.log("\n✅ QUALITY GATE SUCESS: No temporary debug tags found! The code meets quality standards.");
    process.exit(0);
  }
} catch (e: any) {
  console.error(`Error during QA debug tags check execution: ${e.message}`);
  process.exit(1);
}

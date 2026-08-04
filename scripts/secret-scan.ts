/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";

// Exclusions
const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".cache",
  ".next",
  ".antigravity",
  "scratch"
]);

const IGNORED_FILES = new Set([
  ".env",
  ".env.local",
  ".env.development.local",
  ".env.test.local",
  ".env.production.local",
  ".env.example",
  "secret-scan.ts", // exclude self
  "validate-vault.ts", // exclude vault validation test suite
  "verify-permission-manual-checklist.ts", // exclude manual checklist test suite
  "package-lock.json",
  "pnpm-lock.yaml"
]);

const SECRET_DETECTION_PATTERNS = [
  {
    name: "Supabase DB Password",
    regex: /EJfZexrU6oYdPpxH/g,
  },
  {
    name: "Raw PostgreSQL Credentials Link",
    // This looks for postgresql://user:password@host with any actual password not marked as placeholder
    regex: /postgresql?:\/\/([a-zA-Z0-9_\-]+):((?!(?:safe_pass|safe_database_pass|\[REDACTED_PASSWORD\]|username|password))[^@]+)@/gi,
  },
  {
    name: "Committed Environment Secrets",
    regex: /(?:GEMINI_API_KEY|DATABASE_URL|STRIPE_SECRET_KEY|OAUTH_SECRET)\s*=\s*["']([^"'][a-zA-Z0-9_\-]{15,})["']/gi,
  }
];

interface LeakInfo {
  file: string;
  line: number;
  patternName: string;
  matchedText: string;
}

const leaks: LeakInfo[] = [];

function scanDirectory(dir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(process.cwd(), fullPath);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      if (
        IGNORED_FILES.has(entry.name) || 
        entry.name.startsWith("validate-") || 
        entry.name.endsWith(".png") || 
        entry.name.endsWith(".jpg") || 
        entry.name.endsWith(".ico")
      ) {
        continue;
      }

      // Check file content
      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        
        for (const pattern of SECRET_DETECTION_PATTERNS) {
          // Re-instantiate regex for safety
          const rx = new RegExp(pattern.regex);
          const match = rx.exec(lineText);
          if (match) {
            // Confirm it's not a generic placeholder or explanation
            const matchedSegment = match[0];
            if (
              matchedSegment.includes("postgresql://") && 
              (matchedSegment.includes("username:") || matchedSegment.includes("your_pass") || matchedSegment.includes("your-host"))
            ) {
              continue; // Skip interactive design/documentation hints in UI or guidance
            }
            
            leaks.push({
              file: relativePath,
              line: i + 1,
              patternName: pattern.name,
              matchedText: "[REDACTED_FOR_SECURITY_SCAN]"
            });
          }
        }
      }
    }
  }
}

console.log("=== STARTING MULTI-LAYER SECRET AND CREDENTIAL EXPOSURE SCAN ===");
try {
  scanDirectory(process.cwd());
  
  if (leaks.length > 0) {
    console.error(`\n❌ ERROR: ${leaks.length} potential credential leakage(s) detected!`);
    for (const leak of leaks) {
      console.error(`  - FILE: ${leak.file} (Line: ${leak.line})`);
      console.error(`    TYPE: ${leak.patternName}`);
    }
    process.exit(1);
  } else {
    console.log("\n✅ SUCCESS: No secrets or credentials found in tracked files!");
    process.exit(0);
  }
} catch (e: any) {
  console.error(`Failed to execute secret scanner: ${e.message}`);
  process.exit(1);
}

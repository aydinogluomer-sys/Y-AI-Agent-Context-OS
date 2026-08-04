import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function collectMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(absolutePath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(absolutePath);
    }
  }
  return files;
}

const markdownFiles = await collectMarkdownFiles(workspaceRoot);
assert.ok(markdownFiles.length >= 15);
for (const file of markdownFiles) {
  assert.ok((await stat(file)).size > 0, `${file} must not be empty.`);
}

const debtRegister = await readFile(
  path.join(workspaceRoot, "docs/security-boundaries/kernel-debt-register.md"),
  "utf8",
);
const canonicalRows = debtRegister.match(/^\| KDEBT-\d{3} \|/gm) || [];
assert.equal(canonicalRows.length, 16);
assert.match(debtRegister, /## Legacy identifier migration/);
assert.match(debtRegister, /KMVP-013 Append-only events \| KDEBT-001/);

const architecture = await readFile(
  path.join(workspaceRoot, "docs/architecture-and-design/architecture-index.md"),
  "utf8",
);
assert.doesNotMatch(architecture, /^\| \*\*KDEBT-\d{3}\*\*/gm);
assert.match(architecture, /KMVP-014/);
assert.match(architecture, /actor signatures are not implemented/);

const testPlan = await readFile(
  path.join(workspaceRoot, "tests/test.md"),
  "utf8",
);
assert.doesNotMatch(testPlan, /completing the 1028 validation suite/);
assert.match(testPlan, /Historical Claimed Total.*1028/);
assert.match(testPlan, /npm run test:db.*zero failures and zero skipped/);

const viteConfig = await readFile(
  path.join(workspaceRoot, "vite.config.ts"),
  "utf8",
);
assert.match(viteConfig, /manualChunks/);

console.log(
  `Phase 8 documentation reconciliation: PASS (${markdownFiles.length} Markdown files)`,
);

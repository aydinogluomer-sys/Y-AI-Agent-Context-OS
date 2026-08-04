import { spawnSync } from "node:child_process";
import path from "node:path";

export interface ValidationTarget {
  name: string;
  script: string;
}

export interface ValidationTargetResult {
  name: string;
  exitCode: number;
  skipped: string[];
  output: string;
}

const SKIP_PATTERNS = [
  /skipping (?:part|stage|integration|live|sql)[^\r\n]*/gi,
  /simulating standard schema[^\r\n]*/gi,
  /falling back to simulated memory sandbox[^\r\n]*/gi,
  /sandbox fallbacks activated[^\r\n]*/gi,
  /database reference is unavailable[^\r\n]*/gi,
  /database reference bypass[^\r\n]*/gi,
];

export const DETERMINISTIC_TARGETS: ValidationTarget[] = [
  { name: "Phase 1 Auth", script: "scripts/validate-phase-1-auth.ts" },
  { name: "Core Vault", script: "scripts/validate-vault.ts" },
  ...Array.from({ length: 9 }, (_, index) => {
    const stage = index + 27;
    return {
      name: `Stage ${stage}`,
      script: `scripts/validate-stage-${stage}.ts`,
    };
  }),
];

export const DATABASE_TARGETS: ValidationTarget[] = [
  { name: "Core Vault DB", script: "scripts/validate-vault.ts" },
  ...Array.from({ length: 9 }, (_, index) => {
    const stage = index + 27;
    return {
      name: `Stage ${stage} DB`,
      script: `scripts/validate-stage-${stage}.ts`,
    };
  }),
];

export function detectSkipMarkers(output: string): string[] {
  const matches = new Set<string>();
  for (const pattern of SKIP_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of output.matchAll(pattern)) {
      matches.add(match[0].trim());
    }
  }
  return [...matches];
}

export function runValidationTarget(
  target: ValidationTarget,
  options: { strictSkips: boolean; echo: boolean }
): ValidationTargetResult {
  const root = process.cwd();
  const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const execution = spawnSync(
    process.execPath,
    [tsxCli, path.join(root, target.script)],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        STRICT_DB_TESTS: options.strictSkips ? "true" : "false",
      },
      maxBuffer: 20 * 1024 * 1024,
    }
  );

  const output = `${execution.stdout || ""}${execution.stderr || ""}`;
  if (options.echo) process.stdout.write(output);
  const skipped = detectSkipMarkers(output);
  const childExitCode = execution.status ?? 1;
  const exitCode =
    childExitCode !== 0 || (options.strictSkips && skipped.length > 0)
      ? 1
      : 0;

  return {
    name: target.name,
    exitCode,
    skipped,
    output,
  };
}

export function runValidationSuite(
  targets: ValidationTarget[],
  options: { strictSkips: boolean; echo: boolean }
): ValidationTargetResult[] {
  const results: ValidationTargetResult[] = [];
  for (const target of targets) {
    console.log(`\n--- ${target.name} ---`);
    const result = runValidationTarget(target, options);
    results.push(result);
    if (result.exitCode !== 0) break;
  }
  return results;
}

/**
 * Y-P00-012 — Feature registry'yi kanıta bağlı olarak yeniden üretir.
 *
 * Eski registry 15 kaydın tamamına aynı `tests:` bloğunu veriyordu
 * (typecheck + test:deterministic) ve statüler doğrulanmamıştı.
 * Bu script statüleri UI/API envanterinden TÜRETİR; elle yazılmaz.
 *
 * PASS için master plan §7.1'deki 10 koşulun tamamı gerekir. Hiçbir kayıt
 * bu fazda PASS olamaz (kanıt zinciri P01–P20'de kurulacak).
 */

import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT, isMain, readCsv, rel } from "./lib";

/** Master plan §7.1 statü enum'u. */
type Status =
  | "MISSING"
  | "STUB"
  | "SIMULATED"
  | "PARTIAL"
  | "BACKEND_ONLY"
  | "UI_ONLY"
  | "BLOCKED"
  | "BROKEN"
  | "PASS";

const CATEGORY_LABELS: Record<string, string> = {
  "mission-control": "Mission Control",
  "projects-workspace": "Projects & Workspace",
  "context-os": "Context OS",
  "graph-intelligence": "Graph Intelligence",
  "artifact-cas": "Artifact / CAS",
  "task-lifecycle": "Task Lifecycle",
  "agent-network": "Agent Network",
  "security-kernel": "Security Kernel",
  "evidence-audit": "Evidence / Audit",
  "worker-runtime": "Worker Runtime",
  "database-migrations": "Database / Migrations",
  "providers-connectors": "Providers / Connectors",
  "qa-validation": "QA / Validation",
  documentation: "Documentation",
  "governance-kernel-debt": "Governance / Kernel Debt"
};

/** Kategoriyi kapatacak fazlar (master plan Appendix E/F). */
const CATEGORY_PHASES: Record<string, string[]> = {
  "mission-control": ["P12", "P13", "P15"],
  "projects-workspace": ["P02", "P03", "P15"],
  "context-os": ["P04", "P06", "P08", "P09", "P15"],
  "graph-intelligence": ["P04", "P05", "P15"],
  "artifact-cas": ["P14", "P15"],
  "task-lifecycle": ["P12", "P15"],
  "agent-network": ["P11", "P12"],
  "security-kernel": ["P02", "P07", "P10", "P17"],
  "evidence-audit": ["P14", "P15"],
  "worker-runtime": ["P12", "P18"],
  "database-migrations": ["P01", "P19"],
  "providers-connectors": ["P11", "P19"],
  "qa-validation": ["P14", "P16", "P19"],
  documentation: ["P19", "P20"],
  "governance-kernel-debt": ["P10", "P17", "P20"]
};

function deriveStatus(total: number, real: number): Status {
  if (real === 0) return "SIMULATED";
  if (real === total) return "PARTIAL"; // gerçek API'ye bağlı ama kanıt zinciri yok
  return "PARTIAL";
}

function yamlList(values: string[]): string {
  return `[${values.map((v) => JSON.stringify(v)).join(", ")}]`;
}

export function rebuild(): string {
  const ui = readCsv("03-ui-inventory.csv")
    .slice(1)
    .filter((r) => r.length > 1);
  const api = readCsv("02-api-inventory.csv")
    .slice(1)
    .filter((r) => r.length > 1);

  const shadowed = api.filter((r) => r[5]).length;

  const byCategory = new Map<string, string[][]>();
  for (const row of ui) {
    const cat = row[0];
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(row);
  }

  const blocks: string[] = [];
  let idx = 0;

  for (const [cat, rows] of byCategory) {
    const total = rows.length;
    const real = rows.filter((r) => r[7] === "REAL").length;
    const fake = total - real;
    const status = deriveStatus(total, real);
    const label = CATEGORY_LABELS[cat] || cat;
    const phases = CATEGORY_PHASES[cat] || [];
    const id = `Y-${String(idx).padStart(2, "0")}-${cat.toUpperCase()}`;
    idx++;

    const realRoutes = rows.filter((r) => r[7] === "REAL").map((r) => r[3]);
    const fakeRoutes = rows.filter((r) => r[7] === "FAKE").map((r) => r[3]);

    blocks.push(
      [
        `- id: ${id}`,
        `  category: ${JSON.stringify(label)}`,
        `  status: ${status}`,
        `  evidence: null            # PASS için zorunlu — henüz kanıt zinciri yok`,
        `  verified_at: null`,
        `  verified_commit: null`,
        `  ui_routes:`,
        `    total: ${total}`,
        `    backed_by_api: ${real}`,
        `    fabricated: ${fake}`,
        `    real: ${yamlList(realRoutes)}`,
        `    fake: ${yamlList(fakeRoutes)}`,
        `  closes_in_phases: ${yamlList(phases)}`,
        `  source_of_truth: "docs/audit/2026-08-13-truth-audit/03-ui-inventory.csv"`
      ].join("\n")
    );
  }

  const header = `# Y — Feature Registry
#
# ⚠️  Bu dosya 2026-08-13 Truth Audit ile SIFIRLANMIŞTIR.
#
# Önceki sürüm 15 kaydın tamamına aynı test referansını (typecheck +
# test:deterministic) veriyordu ve statüler doğrulanmamıştı. Bu sürümdeki
# statüler docs/audit/2026-08-13-truth-audit/ envanterlerinden TÜRETİLİR.
#
# Yeniden üret:  npx tsx scripts/audit/rebuild-feature-registry.ts
#
# Statü enum'u (master plan §7.1):
#   MISSING · STUB · SIMULATED · PARTIAL · BACKEND_ONLY · UI_ONLY · BLOCKED · BROKEN · PASS
#
# PASS için ZORUNLU (10 koşulun tamamı):
#   implementation · persistence (gerekiyorsa) · policy (gerekiyorsa)
#   unit test · integration test · E2E (user-facing ise) · negative test
#   evidence · commit SHA · verification timestamp
#
# Ölçülen gerçek (bu dosya üretildiğinde):
#   UI nav item        : ${ui.length}
#   gerçek API'ye bağlı : ${ui.filter((r) => r[7] === "REAL").length}
#   fabrikasyon         : ${ui.filter((r) => r[7] === "FAKE").length}
#   API route           : ${api.length}
#   gölgelenmiş route   : ${shadowed}
#   PASS kaydı          : 0
`;

  return `${header}\n${blocks.join("\n\n")}\n`;
}

function main(): void {
  const target = path.join(REPO_ROOT, "docs", "audit", "feature-registry.yaml");
  const content = rebuild();
  fs.writeFileSync(target, content, "utf-8");

  const passCount = (content.match(/^\s*status:\s*PASS\s*$/gm) || []).length;
  console.log(`[audit] Feature registry rebuilt -> ${rel(target)}`);
  console.log(`[audit]   PASS kaydı: ${passCount} (0 olmalı)`);
  if (passCount !== 0) {
    console.error("[audit] HATA: kanıtsız PASS kaydı var.");
    process.exit(1);
  }
}

if (isMain(import.meta.url)) {
  main();
}

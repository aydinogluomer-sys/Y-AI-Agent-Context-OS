/**
 * Y-P00-002 — API inventory.
 *
 * apps/api/src/index.ts içindeki ~200 route'u kayıt SIRASIYLA çıkarır.
 * Kayıt sırası kritik: router.all(["/tasks","/tasks/*"]) kendisinden sonra
 * kaydedilen tüm /tasks/* handler'larını gölgeliyor.
 */

import * as path from "path";
import { REPO_ROOT, readLines, rel, writeCsv, isMain } from "./lib";

const API_INDEX = path.join(REPO_ROOT, "apps", "api", "src", "index.ts");
const SERVER_TS = path.join(REPO_ROOT, "server.ts");

export interface RouteRecord {
  method: string;
  routePath: string;
  file: string;
  line: number;
  guard: string;
  shadowedBy: string;
  verdict: string;
}

const METHOD_RE = /^\s*(?:router|app)\.(get|post|put|patch|delete|all|use)\s*\(\s*(.+)$/;

/** router.all(["/a","/b"], ...) veya router.get("/a", ...) — path argümanlarını çıkarır. */
function extractPaths(argText: string): string[] {
  const trimmed = argText.trim();
  if (trimmed.startsWith("[")) {
    const close = trimmed.indexOf("]");
    if (close === -1) return [];
    const inner = trimmed.slice(1, close);
    return [...inner.matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  }
  const single = trimmed.match(/^["'`]([^"'`]+)["'`]/);
  return single ? [single[1]] : [];
}

/** Express path'ini, gölgeleme testi için regex'e çevirir. */
function pathToMatcher(p: string): RegExp {
  const escaped = p
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "§STAR§")
    .replace(/:[A-Za-z0-9_]+/g, "[^/]+")
    .replace(/§STAR§/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function classifyGuard(lines: string[], startIdx: number): string {
  const window = lines.slice(startIdx, Math.min(startIdx + 4, lines.length)).join(" ");
  if (/requireProjectScope/.test(window)) return "requireProjectScope";
  if (/principalCanAccessProject/.test(window)) return "principalCanAccessProject";
  return "bearer-only";
}

function classifyVerdict(routePath: string, guard: string, shadowedBy: string): string {
  if (shadowedBy) return "DELETE (shadowed/dead)";
  if (/^\/auth\/dev-session$/.test(routePath)) return "DELETE (P0-1)";
  if (/^\/db\/configure$/.test(routePath)) return "DELETE (P0-2)";
  if (/^\/config\/inspect$/.test(routePath)) return "REPLACE (admin health)";
  if (/^\/simulate-task$/.test(routePath)) return "DELETE (fabricated)";
  if (/redact-check/.test(routePath)) return "DELETE (reflects secret)";
  if (/^\/health|^\/healthz|^\/readyz/.test(routePath)) return "KEEP";
  if (guard === "requireProjectScope") return "CHANGE (move to /api/v1)";
  if (/:projectId|:project_id/.test(routePath)) return "CHANGE (move to /api/v1)";
  return "REVIEW (unscoped)";
}

export function collectRoutes(): RouteRecord[] {
  const records: RouteRecord[] = [];
  const blockers: { pattern: RegExp; source: string; methodAll: boolean }[] = [];

  for (const file of [API_INDEX, SERVER_TS]) {
    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      const m = METHOD_RE.exec(lines[i]);
      if (!m) continue;
      const method = m[1].toUpperCase();
      const paths = extractPaths(m[2]);
      if (paths.length === 0) continue;

      for (const p of paths) {
        // Gölgeleyen bir blocker var mı?
        let shadowedBy = "";
        for (const b of blockers) {
          if (b.pattern.test(p)) {
            shadowedBy = b.source;
            break;
          }
        }
        const guard = classifyGuard(lines, i);
        records.push({
          method,
          routePath: p,
          file: rel(file),
          line: i + 1,
          guard,
          shadowedBy,
          verdict: classifyVerdict(p, guard, shadowedBy)
        });
      }

      // router.all([...]) terminal bir yanıt döndürüyorsa sonraki route'ları gölgeler.
      if (method === "ALL") {
        const body = lines.slice(i, Math.min(i + 12, lines.length)).join(" ");
        if (/res\.status\(\s*4\d\d\s*\)|res\.status\(\s*5\d\d\s*\)/.test(body)) {
          for (const p of paths) {
            blockers.push({ pattern: pathToMatcher(p), source: `${rel(file)}:${i + 1}`, methodAll: true });
          }
        }
      }
    }
  }
  return records;
}

function main(): void {
  const records = collectRoutes();
  const target = writeCsv(
    "02-api-inventory.csv",
    ["method", "path", "file", "line", "guard", "shadowed_by", "verdict"],
    records.map((r) => [r.method, r.routePath, r.file, r.line, r.guard, r.shadowedBy, r.verdict])
  );

  const shadowed = records.filter((r) => r.shadowedBy);
  const unscoped = records.filter((r) => r.guard === "bearer-only" && /^\/(?!health|healthz|readyz|auth|db|config)/.test(r.routePath));

  console.log(`[audit] API inventory -> ${rel(target)}`);
  console.log(`[audit]   total routes    : ${records.length}`);
  console.log(`[audit]   shadowed (dead) : ${shadowed.length}`);
  console.log(`[audit]   bearer-only     : ${unscoped.length}`);
  if (shadowed.length > 0) {
    console.log(`[audit]   shadow source   : ${shadowed[0].shadowedBy}`);
  }
}

if (isMain(import.meta.url)) {
  main();
}

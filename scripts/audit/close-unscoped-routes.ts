/**
 * Y-P02-009 (devam) — IDOR riski taşıyan unscoped route'ların kapatılması (P0-8).
 *
 * P00 Truth Audit: bu route'lar bir kaynağı yalnız kendi id'siyle alıyor ve
 * kaynağın hangi projeye/organizasyona ait olduğunu HİÇ doğrulamıyordu.
 * `GET /audit-logs` tüm projelerin audit kaydını döndürüyordu.
 *
 * Neden 410 (silme) yerine değil de 410 İLE kapatma:
 *   Bu route'ları "doğru" hale getirmek, her biri için kaynağın projesini
 *   çözüp `requireProjectScope`'a bağlamak demek. Ancak bunların kanonik
 *   karşılıkları `/api/v1` altında yeniden yazılıyor (ADR-001) ve legacy
 *   yüzey P19'da tamamen siliniyor. Ara dönemde bu route'ların AÇIK kalması
 *   kabul edilemez; sessizce silinmesi ise çağıranı köre çevirir.
 *
 * 410 + `Sunset` header + kanonik hedefe `Link` = master plan Appendix J'deki
 * deprecation protokolü.
 */

import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT, isMain, rel } from "./lib";

const TARGET = path.join(REPO_ROOT, "apps", "api", "src", "index.ts");

interface UnscopedRoute {
  method: string;
  routePath: string;
  finding: string;
  canonical: string;
}

/**
 * Kapatılacak route'lar.
 *
 * Listeye yalnız GERÇEKTEN proje kapsamı doğrulamayan route'lar alındı.
 * `/projects/:projectId/...` biçimindekiler `principalCanAccessProject`
 * çağırdıkları için burada YOK — onlar P19'da kanonik yüzeye taşınır.
 */
const ROUTES: UnscopedRoute[] = [
  { method: "get", routePath: "/audit-logs", finding: "tum projelerin audit kaydini donduruyordu", canonical: "GET /api/v1/projects/:projectId/audit" },
  { method: "patch", routePath: "/context-items/:contextItemId", finding: "kaynagin projesi dogrulanmiyordu", canonical: "PATCH /api/v1/projects/:projectId/context-items/:id" },
  { method: "delete", routePath: "/context-items/:contextItemId", finding: "kaynagin projesi dogrulanmiyordu", canonical: "DELETE /api/v1/projects/:projectId/context-items/:id" },
  { method: "post", routePath: "/context-items/:id/summarize", finding: "kaynagin projesi dogrulanmiyordu", canonical: "POST /api/v1/projects/:projectId/context-items/:id/summarize" },
  { method: "post", routePath: "/context/isolated-retrieve", finding: "project_id GOVDEDEN aliniyordu", canonical: "POST /api/v1/projects/:projectId/context/compile" },
  { method: "post", routePath: "/context-packs/:id/rehydrate", finding: "kaynagin projesi dogrulanmiyordu", canonical: "GET /api/v1/runs/:runId/context/manifest" },
  { method: "patch", routePath: "/resume-states/:resumeStateId", finding: "kaynagin projesi dogrulanmiyordu", canonical: "P12 run runtime" },
  { method: "patch", routePath: "/resume-schedules/:scheduleId", finding: "kaynagin projesi dogrulanmiyordu", canonical: "P12 run runtime" },
  { method: "delete", routePath: "/resume-schedules/:scheduleId", finding: "kaynagin projesi dogrulanmiyordu", canonical: "P12 run runtime" },
  { method: "patch", routePath: "/agent-sessions/:agentSessionId", finding: "kaynagin projesi dogrulanmiyordu", canonical: "P12 run runtime" },
  { method: "get", routePath: "/handoffs/:handoffId", finding: "kaynagin projesi dogrulanmiyordu", canonical: "GET /api/v1/runs/:runId/timeline" },
  { method: "patch", routePath: "/handoffs/:handoffId", finding: "kaynagin projesi dogrulanmiyordu", canonical: "P12 run runtime" },
  { method: "post", routePath: "/handoffs/:handoffId/validate", finding: "kaynagin projesi dogrulanmiyordu", canonical: "P12 run runtime" }
];

const SUNSET_DATE = "Wed, 31 Dec 2025 23:59:59 GMT";

function findBlockEnd(lines: string[], startIdx: number): number {
  let depth = 0;
  let started = false;
  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "(") {
        depth++;
        started = true;
      } else if (ch === ")") depth--;
    }
    if (started && depth === 0) return i;
  }
  throw new Error(`Blok sonu bulunamadi (satir ${startIdx + 1}).`);
}

function replacementFor(route: UnscopedRoute): string {
  return `/**
 * [P02 / Y-P02-009] KAPATILDI — P0-8 (IDOR).
 *
 * Onceki hali: ${route.finding}.
 * Kanonik karsilik: ${route.canonical}
 *
 * Legacy yuzey P19'da tamamen silinecek (ADR-001).
 */
router.${route.method}(${JSON.stringify(route.routePath)}, (req: Request, res: Response) => {
  res.setHeader("Sunset", ${JSON.stringify(SUNSET_DATE)});
  res.setHeader("Link", '<${route.canonical}>; rel="successor-version"');
  return res.status(410).json({
    error: {
      code: "UNSCOPED_ROUTE_CLOSED",
      message:
        "Bu route proje kapsami dogrulamadigi icin kapatildi (P0-8). " +
        "Kanonik karsilik: ${route.canonical}"
    }
  });
});`;
}

export function closeRoutes(source: string): { source: string; closed: string[]; skipped: string[] } {
  let lines = source.split("\n");
  const closed: string[] = [];
  const skipped: string[] = [];

  for (const route of ROUTES) {
    const signature = `router.${route.method}(${JSON.stringify(route.routePath)}`;
    const idx = lines.findIndex((l) => l.trimStart().startsWith(signature));
    if (idx === -1) {
      skipped.push(`${route.method.toUpperCase()} ${route.routePath}`);
      continue;
    }
    const end = findBlockEnd(lines, idx);
    lines = [...lines.slice(0, idx), ...replacementFor(route).split("\n"), ...lines.slice(end + 1)];
    closed.push(`${route.method.toUpperCase()} ${route.routePath} (${end - idx + 1} satir)`);
  }

  return { source: lines.join("\n"), closed, skipped };
}

function main(): void {
  const before = fs.readFileSync(TARGET, "utf-8");
  const { source, closed, skipped } = closeRoutes(before);
  if (closed.length > 0) fs.writeFileSync(TARGET, source, "utf-8");

  console.log(`[close-unscoped] ${rel(TARGET)}`);
  for (const c of closed) console.log(`  KAPATILDI  ${c}`);
  for (const s of skipped) console.log(`  BULUNAMADI ${s}`);
  console.log(`  satir: ${before.split("\n").length} -> ${source.split("\n").length}`);
}

if (isMain(import.meta.url)) {
  main();
}

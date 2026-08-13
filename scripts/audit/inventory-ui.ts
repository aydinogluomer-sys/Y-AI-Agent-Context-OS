/**
 * Y-P00-003 — UI inventory.
 *
 * navigation.ts'teki her nav item'ı App.tsx'teki `case` etiketleriyle eşleştirir.
 * Eşleşmeyen her item ModuleSimulationPanel'e (default:) düşer = fabrikasyon.
 */

import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT, readLines, rel, walk, writeCsv, isMain } from "./lib";

const NAV = path.join(REPO_ROOT, "apps", "web", "src", "app", "navigation.ts");
const APP = path.join(REPO_ROOT, "apps", "web", "src", "App.tsx");
const WEB_SRC = path.join(REPO_ROOT, "apps", "web", "src");

/**
 * Bir bileşenin GERÇEKTEN backend'e gidip gitmediğini belirler.
 * `case` etiketine sahip olmak yeterli değildir: chat-cockpit'in kendi
 * `case`'i var ama tek bir ağ çağrısı yapmadan setTimeout ile sahte
 * pipeline oynatıyor.
 */
function componentHitsBackend(
  componentName: string,
  caseBody: string
): "api" | "simulated" | "unknown" {
  let joined: string;

  if (componentName === "inline JSX") {
    // Ayrı bir bileşen dosyası yok: yalnız bu `case` bloğunun gövdesine bak.
    // (App.tsx'in tamamına bakmak yanıltıcı olur — dosyada başka ekranların
    //  gerçek fetch'leri var.)
    joined = caseBody;
  } else {
    const candidates = walk(WEB_SRC, [".tsx", ".ts"]).filter(
      (f) => path.basename(f, path.extname(f)) === componentName
    );
    if (candidates.length === 0) return "unknown";
    joined = candidates.map((f) => fs.readFileSync(f, "utf-8")).join("\n");
  }

  const callsApi = /fetch\s*\(|from\s+["'][^"']*lib\/api|apiGet|apiPost|useIndexOrchestration|useTaskLifecycle/.test(joined);
  const isSimulated =
    /createLocalAiSimulation|simulateTask|ModuleSimulationPanel|await\s+delay\(|setTimeout\(/.test(joined);

  if (callsApi && !/simulate-task/.test(joined)) return "api";
  if (isSimulated) return "simulated";
  return callsApi ? "api" : "unknown";
}

export interface NavItem {
  category: string;
  id: string;
  label: string;
  route: string;
  declaredStatus: string;
  component: string;
  dataSource: string;
  verdict: string;
}

const CATEGORY_RE = /^\s*\{\s*$|^\s*id:\s*"([^"]+)",\s*$/;
const ITEM_RE = /\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]*)",\s*route:\s*"([^"]*)",[^}]*?status:\s*"([^"]+)"/;

export function collectNavItems(): NavItem[] {
  const navLines = readLines(NAV);
  const appLines = readLines(APP);

  // App.tsx içindeki `case "x":` etiketleri = gerçek ekran
  const cases = new Set<string>();
  const caseComponent = new Map<string, string>();
  const caseBodies = new Map<string, string>();

  // Her `case` etiketinin gövdesi = bir sonraki case/default'a kadar
  const caseIdx: { id: string; line: number }[] = [];
  for (let i = 0; i < appLines.length; i++) {
    const m = /case\s+"([^"]+)"\s*:/.exec(appLines[i]);
    if (m) caseIdx.push({ id: m[1], line: i });
    else if (/^\s*default\s*:/.test(appLines[i]) && caseIdx.length > 0) {
      caseIdx.push({ id: "__default__", line: i });
    }
  }

  for (let k = 0; k < caseIdx.length; k++) {
    const { id, line } = caseIdx[k];
    if (id === "__default__") continue;
    const end = k + 1 < caseIdx.length ? caseIdx[k + 1].line : appLines.length;
    const body = appLines.slice(line, end).join("\n");
    cases.add(id);
    caseBodies.set(id, body);
    const comp = /<([A-Z][A-Za-z0-9_]*)/.exec(body);
    caseComponent.set(id, comp ? comp[1] : "inline JSX");
  }

  // Kategori başlıkları: NAVIGATION_CATEGORIES içindeki üst düzey id'ler
  const items: NavItem[] = [];
  let currentCategory = "(unknown)";
  let inCategories = false;

  for (let i = 0; i < navLines.length; i++) {
    const line = navLines[i];
    if (/NAVIGATION_CATEGORIES\s*:/.test(line) || /NAVIGATION_CATEGORIES\s*=/.test(line)) {
      inCategories = true;
      continue;
    }
    if (!inCategories) continue;

    // Kategori satırı: `id: "mission-control",` (item değil, tek başına)
    const catMatch = /^\s{4}id:\s*"([^"]+)",\s*$/.exec(line);
    if (catMatch) {
      currentCategory = catMatch[1];
      continue;
    }

    const im = ITEM_RE.exec(line);
    if (!im) continue;

    const [, id, label, route, declaredStatus] = im;
    const hasCase = cases.has(id);
    const component = hasCase ? caseComponent.get(id) || "?" : "ModuleSimulationPanel";

    let dataSource: string;
    let verdict: string;

    if (!hasCase) {
      // App.tsx `default:` dalı → ModuleSimulationPanel = tamamen fabrikasyon
      dataSource = "client literal / setTimeout";
      verdict = "FAKE";
    } else {
      const backend = componentHitsBackend(component, caseBodies.get(id) || "");
      if (backend === "api") {
        dataSource = "backend API";
        verdict = "REAL";
      } else if (backend === "simulated") {
        dataSource = "setTimeout / local simulation";
        verdict = "FAKE";
      } else {
        // Bileşenin kendi `case` bloğu var ama hiçbir backend çağrısı yok
        // (chat-cockpit: JSX render eder, sahtelik handler'dadır).
        dataSource = "ağ çağrısı tespit edilmedi";
        verdict = "FAKE";
      }
    }

    items.push({ category: currentCategory, id, label, route, declaredStatus, component, dataSource, verdict });
  }

  return items;
}

function main(): void {
  const items = collectNavItems();
  const target = writeCsv(
    "03-ui-inventory.csv",
    ["category", "id", "label", "route", "declared_status", "component", "data_source", "verdict"],
    items.map((i) => [i.category, i.id, i.label, i.route, i.declaredStatus, i.component, i.dataSource, i.verdict])
  );

  const real = items.filter((i) => i.verdict === "REAL").length;
  const fake = items.filter((i) => i.verdict === "FAKE").length;
  const declaredImplemented = items.filter((i) => i.declaredStatus === "implemented").length;
  const declaredPlaceholder = items.filter((i) => i.declaredStatus === "placeholder").length;
  const categories = new Set(items.map((i) => i.category)).size;

  console.log(`[audit] UI inventory -> ${rel(target)}`);
  console.log(`[audit]   nav items            : ${items.length}`);
  console.log(`[audit]   categories           : ${categories}`);
  console.log(`[audit]   REAL (backed by API) : ${real}`);
  console.log(`[audit]   FAKE (fabricated)    : ${fake}`);
  console.log(`[audit]   declared implemented : ${declaredImplemented}`);
  console.log(`[audit]   declared placeholder : ${declaredPlaceholder}`);
  console.log(
    `[audit]   HONESTY GAP          : ${declaredImplemented - real} item gerçekte fabrikasyon olduğu halde "implemented" ilan edilmiş`
  );
}

if (isMain(import.meta.url)) {
  main();
}

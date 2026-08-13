/**
 * Y-P02-009 — P0 endpoint'lerinin kaldırılması.
 *
 * P00 Truth Audit'te release blocker olarak işaretlenen dört route:
 *
 *   P0-1  GET  /auth/dev-session       auth'suz admin token dağıtıyor
 *   P0-2  POST /db/configure           SSRF + düz metin parolayı .env'e yazıyor
 *   —     GET  /config/inspect         DB URL'ini istemciye veriyor (P0-12'nin kaynağı)
 *   —     POST /security/redact-check  `original` ve `redacted` birlikte dönüyor
 *
 * Script route'un `router.<method>(` satırından, blok dengesi kapanana kadar
 * olan aralığı siler ve yerine ne olduğunu açıklayan bir yorum bırakır.
 * Sessiz silme yerine iz bırakılır: bir sonraki okuyucu neden yok olduğunu
 * görmelidir.
 */

import * as fs from "fs";
import * as path from "path";
import { REPO_ROOT, isMain, rel } from "./lib";

const TARGET = path.join(REPO_ROOT, "apps", "api", "src", "index.ts");

interface Removal {
  /** `router.get("/auth/dev-session"` gibi eşsiz bir başlangıç imzası. */
  signature: string;
  finding: string;
  replacement: string;
}

const REMOVALS: Removal[] = [
  {
    signature: 'router.get("/auth/dev-session"',
    finding: "P0-1",
    replacement: `// [P02 / Y-P02-009] KALDIRILDI — P0-1
// GET /auth/dev-session, kimlik dogrulamasi OLMADAN role:"admin",
// projectIds:["*"] tasiyan bir bearer token dagitiyordu. Tek kosul
// ENABLE_MOCK_DB=true idi ve yerel .env dosyasi bunu tasiyordu; yani
// porta erisen herkes tam yetki alabiliyordu.
// Yerine: gercek OIDC akisi (apps/api/src/middleware/authn.ts, ADR-016).
// Yerel gelistirme icin docker/idp altindaki IdP kullanilir.`
  },
  {
    signature: 'router.post("/db/configure"',
    finding: "P0-2",
    replacement: `// [P02 / Y-P02-009] KALDIRILDI — P0-2
// POST /db/configure govdeden connection string aliyor, global db
// referansini calisma zamaninda degistiriyor, DUZ METIN PAROLAYI
// <cwd>/.env dosyasina yaziyor ve ardindan migration calistiriyordu.
// Tek koruma "production degil" + herhangi bir gecerli bearer'di.
// Etki: SSRF + credential harvest + kalici config zehirlenmesi.
// Yerine: DATABASE_URL yalnizca ortam degiskeni / secret manager'dan gelir;
// migration calistirma bir CLI/deploy adimidir (npm run db:migrate).`
  },
  {
    signature: 'router.get("/config/inspect"',
    finding: "P0-12 kaynagi",
    replacement: `// [P02 / Y-P02-009] KALDIRILDI
// GET /config/inspect yapilandirmayi istemciye donduruyordu. Frontend
// (apps/web/src/hooks/useWorkspace.ts) yanitini regex'leyip DUZ METIN DB
// PAROLASINI React state'ine yaziyordu (P0-12) — parola bir <input>
// value'sunda DOM'da bulunuyordu.
// Yerine: /api/v1/admin/health, sir alani icermeyen operasyonel ozet doner.`
  },
  {
    signature: 'router.post("/security/redact-check"',
    finding: "sir yansitma",
    replacement: `// [P02 / Y-P02-009] KALDIRILDI
// POST /security/redact-check yanitinda hem \`original\` hem \`redacted\`
// alanlarini donduruyordu; yani gonderilen ham sirri geri yansitiyordu.
// Redaksiyon dogrulamasi bir urun yuzeyi degil, bir testtir
// (packages/security testleri).`
  }
];

/** Bir route bildiriminin bittiği satırı, parantez dengesiyle bulur. */
function findBlockEnd(lines: string[], startIdx: number): number {
  let depth = 0;
  let started = false;

  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "(") {
        depth++;
        started = true;
      } else if (ch === ")") {
        depth--;
      }
    }
    if (started && depth === 0) return i;
  }
  throw new Error(`Blok sonu bulunamadi (satir ${startIdx + 1}).`);
}

export function removeEndpoints(source: string): { source: string; removed: string[]; skipped: string[] } {
  let lines = source.split("\n");
  const removed: string[] = [];
  const skipped: string[] = [];

  for (const removal of REMOVALS) {
    const idx = lines.findIndex((l) => l.includes(removal.signature));
    if (idx === -1) {
      skipped.push(removal.signature);
      continue;
    }
    const end = findBlockEnd(lines, idx);
    lines = [...lines.slice(0, idx), ...removal.replacement.split("\n"), ...lines.slice(end + 1)];
    removed.push(`${removal.signature} (${removal.finding}) — ${end - idx + 1} satir`);
  }

  return { source: lines.join("\n"), removed, skipped };
}

function main(): void {
  const before = fs.readFileSync(TARGET, "utf-8");
  const { source, removed, skipped } = removeEndpoints(before);

  if (removed.length > 0) fs.writeFileSync(TARGET, source, "utf-8");

  console.log(`[remove-p0] ${rel(TARGET)}`);
  for (const r of removed) console.log(`  KALDIRILDI  ${r}`);
  for (const s of skipped) console.log(`  ZATEN YOK   ${s}`);
  console.log(
    `  satir: ${before.split("\n").length} -> ${source.split("\n").length}`
  );
}

if (isMain(import.meta.url)) {
  main();
}

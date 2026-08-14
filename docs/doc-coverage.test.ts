import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

/**
 * P17 / A10 — spec §39 DOKÜMANTASYON KAPSAMI.
 *
 * Spec §39 on altı belge sayıyor ve şunu şart koşuyor:
 *
 *   "Dokümantasyon production gerçekliğiyle eşleşmelidir. Doküman
 *    tamamlanmış diyorsa kod bunu kanıtlamalıdır."
 *
 * P17 denetiminde on üçü **yoktu**. Bu test, birinin sessizce silinmesini
 * ya da yeni bir gereksinimin karşılıksız kalmasını engeller.
 *
 * Test yalnız VARLIK kontrol eder, içeriğin doğruluğunu değil — onu bir
 * test doğrulayamaz. İçerik doğruluğunun güvencesi, her belgenin kendi
 * sınırlarını açıkça yazması ve `gate:drift`'in envanterleri kodla
 * karşılaştırmasıdır.
 */

/** spec §39'un saydığı belgeler ve depodaki karşılıkları. */
const REQUIRED: ReadonlyArray<readonly [string, string]> = [
  ["README", "README.md"],
  ["architecture", "docs/architecture-and-design/architecture-index.md"],
  ["local development", "docs/operations/local-development.md"],
  ["deployment", "docs/operations/deployment.md"],
  ["security model", "docs/security/security-model.md"],
  ["threat model", "docs/security/threat-model.md"],
  ["agent adapters", "docs/adapters/agent-adapters.md"],
  ["repository adapters", "docs/adapters/repository-adapters.md"],
  ["context compiler", "docs/architecture-and-design/context-compiler.md"],
  ["policy language", "docs/security/policy-language.md"],
  ["evidence model", "docs/security/evidence-model.md"],
  ["API", "docs/api/api-surface.md"],
  ["operations", "docs/operations/operations.md"],
  ["incident response", "docs/operations/incident-response.md"],
  ["backup/restore", "docs/operations/backup-restore.md"],
  ["upgrade", "docs/operations/upgrade.md"]
];

describe("spec §39 — dokümantasyon kapsamı", () => {
  it("spec'in saydığı on altı belgenin hepsi var", () => {
    const missing = REQUIRED.filter(([, path]) => !existsSync(join(REPO, path))).map(
      ([label, path]) => `${label} -> ${path}`
    );
    expect(
      missing,
      "spec §39'un istedigi belgeler eksik:\n  " + missing.join("\n  ")
    ).toEqual([]);
  });

  it("hiçbir belge boş değil", () => {
    const tooShort: string[] = [];
    for (const [label, path] of REQUIRED) {
      const full = join(REPO, path);
      if (!existsSync(full)) continue;
      const text = readFileSync(full, "utf-8");
      // 400 karakterin altindaki bir "belge", varlik testini gecmek icin
      // konmus bir yer tutucudur.
      if (text.trim().length < 400) tooShort.push(`${label}: ${text.trim().length} karakter`);
    }
    expect(tooShort).toEqual([]);
  });

  it("belge dizini her belgeye bağlantı veriyor", () => {
    const index = readFileSync(join(REPO, "docs/README.md"), "utf-8");
    const unlinked = REQUIRED.filter(([, path]) => {
      if (path === "README.md") return false; // kok README, docs disinda
      const relative = path.replace(/^docs\//, "");
      return !index.includes(relative);
    }).map(([label]) => label);
    expect(unlinked).toEqual([]);
  });

  it("POZİTİF KONTROL: liste gerçekten dolu ve yollar okunuyor", () => {
    expect(REQUIRED.length).toBe(16);
    // Var olmayan bir yolun gercekten yakalandigini kanitla.
    expect(existsSync(join(REPO, "docs/kesinlikle-olmayan-belge.md"))).toBe(false);
    expect(existsSync(join(REPO, "README.md"))).toBe(true);
  });
});

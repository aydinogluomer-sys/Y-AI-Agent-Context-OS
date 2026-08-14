import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(resolve(HERE, "../App.tsx"), "utf8");
const HOOK = readFileSync(resolve(HERE, "./useWorkspace.ts"), "utf8");

/**
 * P17 / P0-12 kalintisi — on yuz VERITABANI KIMLIK BILGISI TOPLAMAZ.
 *
 * Arayuzde tam islevli bir baglanti formu duruyordu: ham connection string,
 * kullanici adi ve <input type="password"> ile parola. Arkasindaki
 * POST /api/db/configure P02'de silinmisti, yani form hicbir sey yapmiyordu
 * ama kullanicidan hala uretim parolasi istiyordu.
 *
 * `dbHost` varsayilani ise GERCEK bir Supabase host adiydi ve on yuz
 * paketine gomulu geliyordu.
 *
 * Bu test her ikisinin de geri gelmesini engeller.
 */
describe("P0-12 kalintisi — DB kimlik bilgisi yuzeyi geri gelemez", () => {
  // Kaliplari PARCALARDAN kuruyoruz; aksi halde bu dosyanin kendisi
  // taramada eslesir ve test kendini dogrulamis olurdu.
  const CRED_STATE = ["db" + "Password", "db" + "ConnStr", "db" + "Username"];
  const SUPABASE_HOST_FRAGMENT = "vnnfcwpywd" + "xepdwwuqoo";

  function codeLines(src: string): string[] {
    return src
      .split("\n")
      .map((l) => l.trim())
      // Eski kaliplari ACIKLAYAN yorumlar mesru; yalniz kodu tariyoruz.
      .filter((l) => !l.startsWith("*") && !l.startsWith("//") && !l.startsWith("/*"));
  }

  it("useWorkspace kodunda DB kimlik bilgisi state'i yok", () => {
    const lines = codeLines(HOOK);
    for (const name of CRED_STATE) {
      expect(lines.filter((l) => l.includes(name))).toEqual([]);
    }
  });

  it("App.tsx kodunda DB kimlik bilgisi alanina baglanma yok", () => {
    const lines = codeLines(APP);
    for (const name of CRED_STATE) {
      expect(lines.filter((l) => l.includes(name))).toEqual([]);
    }
  });

  it("kaynak koda gomulu GERCEK Supabase host'u yok", () => {
    expect(HOOK).not.toContain(SUPABASE_HOST_FRAGMENT);
    expect(APP).not.toContain(SUPABASE_HOST_FRAGMENT);
  });

  it("POZITIF KONTROL: dosyalar gercekten okunuyor", () => {
    expect(APP.length).toBeGreaterThan(10000);
    expect(HOOK).toContain("useWorkspace");
    expect(codeLines(HOOK).length).toBeGreaterThan(50);
  });

  it("POZITIF KONTROL: kaliplar gercek metinde esleseiyor", () => {
    expect(codeLines(`const [${CRED_STATE[0]}, x] = useState("");`)).toHaveLength(1);
    expect(`host: ${SUPABASE_HOST_FRAGMENT}.supabase.co`).toContain(SUPABASE_HOST_FRAGMENT);
  });
});

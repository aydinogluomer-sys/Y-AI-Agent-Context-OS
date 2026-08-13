/**
 * P03 / Y-P03-002 — PathGuard güvenlik testleri.
 *
 * Master plan Appendix I: T-03 (path traversal), T-04 (symlink escape).
 * Gerçek dosya sistemi kullanılır — sahte fs ile symlink kaçışı test edilemez.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PathGuard, isPathAllowed, isBinaryBuffer, DENIED_BASENAMES, DENIED_EXTENSIONS } from "./index";

let root: string;
let outside: string;

/**
 * Symlink yetenegi MODUL SEVIYESINDE yoklanir.
 *
 * `it.runIf(...)` kosulu test TOPLAMA aninda degerlendirilir; `beforeAll`
 * icinde set edilen bir degisken o an henuz baslangic degerindedir ve
 * testler yanlislikla kosar. (Bu tam olarak ilk denemede yasandi.)
 */
const symlinkSupported: boolean = (() => {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), "y-symlink-probe-"));
  try {
    fs.writeFileSync(path.join(probe, "target.txt"), "x");
    fs.symlinkSync(path.join(probe, "target.txt"), path.join(probe, "link"), "file");
    return true;
  } catch {
    return false;
  } finally {
    try {
      fs.rmSync(probe, { recursive: true, force: true });
    } catch {
      /* yoklama temizligi kritik degil */
    }
  }
})();

beforeAll(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "y-pathguard-"));
  root = path.join(base, "repo");
  outside = path.join(base, "outside");

  fs.mkdirSync(path.join(root, "src", "services"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });

  fs.writeFileSync(path.join(root, "src", "index.ts"), "export const a = 1;\n");
  fs.writeFileSync(path.join(root, "src", "services", "auth.ts"), "export const auth = true;\n");
  fs.writeFileSync(path.join(root, ".env"), "DATABASE_URL=postgres://u:p@h/db\n");
  fs.writeFileSync(path.join(root, "server.pem"), "-----BEGIN PRIVATE KEY-----\n");
  fs.writeFileSync(path.join(root, "node_modules", "pkg", "index.js"), "module.exports = {};\n");
  fs.writeFileSync(path.join(outside, "secret.txt"), "ust dizin sirri\n");

  if (symlinkSupported) {
    fs.symlinkSync(outside, path.join(root, "escape-link"), "dir");
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(root, "escape-file"), "file");
  }
});

afterAll(() => {
  try {
    fs.rmSync(path.dirname(root), { recursive: true, force: true });
  } catch {
    /* temizlik hatasi testi dusurmemeli */
  }
});

describe("PathGuard — izin verilen yollar", () => {
  it("kök altındaki normal dosyayı kabul eder", () => {
    const r = new PathGuard(root).check("src/index.ts");
    expect(isPathAllowed(r)).toBe(true);
    if (isPathAllowed(r)) expect(r.relativePath).toBe("src/index.ts");
  });

  it("iç içe dizinleri kabul eder", () => {
    expect(isPathAllowed(new PathGuard(root).check("src/services/auth.ts"))).toBe(true);
  });

  it("henüz var olmayan dosyayı (yazma senaryosu) kabul eder", () => {
    expect(isPathAllowed(new PathGuard(root).check("src/new-file.ts"))).toBe(true);
  });

  it("Windows ayraçlarını normalize eder", () => {
    const r = new PathGuard(root).check("src\\services\\auth.ts");
    expect(isPathAllowed(r)).toBe(true);
    if (isPathAllowed(r)) expect(r.relativePath).toBe("src/services/auth.ts");
  });

  it("./ öneki taşıyan yolu kabul eder", () => {
    expect(isPathAllowed(new PathGuard(root).check("./src/index.ts"))).toBe(true);
  });
});

describe("PathGuard — traversal (T-03)", () => {
  const guard = () => new PathGuard(root);

  const traversalPayloads = [
    "../outside/secret.txt",
    "../../etc/passwd",
    "src/../../outside/secret.txt",
    "src/../../../etc/shadow",
    "..",
    "../",
    "./../outside/secret.txt",
    "src/./../../outside/secret.txt",
    "a/b/c/../../../../outside/secret.txt"
  ];

  for (const payload of traversalPayloads) {
    it(`reddeder: ${payload}`, () => {
      const r = guard().check(payload);
      expect(isPathAllowed(r), `${payload} gecmemeli`).toBe(false);
    });
  }

  it("mutlak POSIX yolunu reddeder", () => {
    const r = guard().check("/etc/passwd");
    expect(isPathAllowed(r)).toBe(false);
    if (!isPathAllowed(r)) expect(r.reason).toBe("ABSOLUTE_PATH");
  });

  it("mutlak Windows yolunu reddeder", () => {
    const r = guard().check("C:\\Windows\\System32\\config\\SAM");
    expect(isPathAllowed(r)).toBe(false);
    if (!isPathAllowed(r)) expect(r.reason).toBe("ABSOLUTE_PATH");
  });

  it("boş yolu reddeder", () => {
    expect(isPathAllowed(guard().check(""))).toBe(false);
  });
});

describe("PathGuard — symlink kaçışı (T-04)", () => {
  /**
   * Symlink olusturmak Windows'ta yonetici hakki ister. Bu testleri
   * `return` ile atlamak, master plan 7'deki "skip-then-pass" kalibinin
   * ta kendisi olurdu: rapor "gecti" der ama hicbir sey dogrulanmamistir.
   *
   * Bunun yerine `it.runIf` kullaniliyor — vitest bunlari ATLANMIS olarak
   * raporlar, gecmis olarak degil. Ayrica asagidaki test, CI'da symlink
   * desteginin ZORUNLU oldugunu dogrular: Linux runner'da bu kapsam
   * atlanamaz.
   */
  it.runIf(symlinkSupported)("kök dışına işaret eden dizin symlink'ini reddeder", () => {
    const r = new PathGuard(root).check("escape-link/secret.txt");
    expect(isPathAllowed(r)).toBe(false);
    if (!isPathAllowed(r)) {
      expect(["SYMLINK_ESCAPE", "ESCAPES_ROOT"]).toContain(r.reason);
    }
  });

  it.runIf(symlinkSupported)("kök dışına işaret eden dosya symlink'ini reddeder", () => {
    const r = new PathGuard(root).check("escape-file");
    expect(isPathAllowed(r)).toBe(false);
  });

  it("CI ortamında symlink kapsamı atlanamaz", () => {
    // Yerel Windows'ta symlink hakki olmayabilir; CI (Linux) icin mazeret yok.
    if (process.env.CI === "true") {
      expect(
        symlinkSupported,
        "CI'da symlink olusturulamadi: T-04 kapsami dogrulanamiyor"
      ).toBe(true);
    } else if (!symlinkSupported) {
      console.warn(
        "[path-guard.test] Bu ortamda symlink olusturulamadi; T-04 kapsami YEREL olarak eksik. " +
          "CI'da zorunlu olarak dogrulanacak."
      );
    }
    expect(true).toBe(true);
  });
});

describe("PathGuard — denylist", () => {
  it.each(DENIED_BASENAMES.map((b) => [b]))("reddeder: %s", (basename) => {
    const r = new PathGuard(root).check(basename as string);
    expect(isPathAllowed(r)).toBe(false);
  });

  it.each(DENIED_EXTENSIONS.map((e) => [e]))("reddeder uzantı: %s", (ext) => {
    const r = new PathGuard(root).check(`server${ext}`);
    expect(isPathAllowed(r)).toBe(false);
    if (!isPathAllowed(r)) expect(r.reason).toBe("DENIED_EXTENSION");
  });

  it("büyük/küçük harf farkını yok sayar", () => {
    expect(isPathAllowed(new PathGuard(root).check(".ENV"))).toBe(false);
    expect(isPathAllowed(new PathGuard(root).check("Secrets.JSON"))).toBe(false);
  });

  it("alt dizindeki .env dosyasını da reddeder", () => {
    expect(isPathAllowed(new PathGuard(root).check("src/.env"))).toBe(false);
  });

  it("node_modules içeriğini reddeder", () => {
    const r = new PathGuard(root).check("node_modules/pkg/index.js");
    expect(isPathAllowed(r)).toBe(false);
    if (!isPathAllowed(r)) expect(r.reason).toBe("DENIED_DIRECTORY");
  });

  it(".git içeriğini reddeder", () => {
    expect(isPathAllowed(new PathGuard(root).check(".git/config"))).toBe(false);
  });

  it("ek denylist girdilerini uygular", () => {
    const guard = new PathGuard(root, { extraDeniedBasenames: ["ozel-sir.txt"] });
    expect(isPathAllowed(guard.check("ozel-sir.txt"))).toBe(false);
    expect(isPathAllowed(guard.check("src/index.ts"))).toBe(true);
  });
});

describe("PathGuard — kök çözümlenemezse", () => {
  it("var olmayan kökte fail-closed davranır", () => {
    const r = new PathGuard(path.join(root, "yok-boyle-bir-dizin")).check("a.ts");
    expect(isPathAllowed(r)).toBe(false);
    if (!isPathAllowed(r)) expect(r.reason).toBe("ROOT_UNRESOLVABLE");
  });
});

describe("isBinaryBuffer", () => {
  it("NUL baytı içeren tamponu binary sayar", () => {
    expect(isBinaryBuffer(Buffer.from([0x41, 0x00, 0x42]))).toBe(true);
  });

  it("düz metni binary saymaz", () => {
    expect(isBinaryBuffer(Buffer.from("export const a = 1;\n", "utf-8"))).toBe(false);
  });

  it("yalnız örnek boyutu kadarına bakar", () => {
    const buf = Buffer.concat([Buffer.alloc(600, 0x41), Buffer.from([0x00])]);
    expect(isBinaryBuffer(buf, 512)).toBe(false);
    expect(isBinaryBuffer(buf, 1024)).toBe(true);
  });

  it("boş tamponu binary saymaz", () => {
    expect(isBinaryBuffer(Buffer.alloc(0))).toBe(false);
  });
});

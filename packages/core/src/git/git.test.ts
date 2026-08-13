/**
 * P03 / Y-P03-004 — Git servisi testleri.
 *
 * GERÇEK bir git deposu üzerinde koşar. Mock'lanmış git ile
 * "changedFiles gerçekten çalışıyor mu" sorusu yanıtlanamaz — P00'da
 * tam olarak bu vardı: `getDiff()` git'e hiç bakmadan iki string'i
 * karşılaştırıyor ve testler bunu yakalamıyordu.
 *
 * Güvenlik kapsamı: T-22 (command injection), T-23 (SSRF).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import {
  runGit,
  assertNotFlag,
  assertValidRef,
  assertSafeRemoteUrl,
  isPrivateHost,
  GitSecurityError,
  ALLOWED_SUBCOMMANDS
} from "./git-cli";
import { GitRepository, cloneRepository, parseNameStatusZ, parseNumstatZ } from "./repository";

/** Ortamda git var mı? Yoksa testler ATLANIR, sessizce geçmez. */
const gitAvailable: boolean = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

let repoDir: string;
let firstSha = "";
let secondSha = "";

beforeAll(() => {
  if (!gitAvailable) return;

  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "y-git-test-"));
  const run = (args: string[]) =>
    execFileSync("git", args, { cwd: repoDir, stdio: "pipe", encoding: "utf-8" });

  run(["init", "-q", "-b", "main"]);
  run(["config", "user.email", "test@y-os.local"]);
  run(["config", "user.name", "Y Test"]);
  run(["config", "commit.gpgsign", "false"]);

  fs.mkdirSync(path.join(repoDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(repoDir, "src", "a.ts"), "export const a = 1;\n");
  fs.writeFileSync(path.join(repoDir, "README.md"), "# test\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "ilk commit"]);
  firstSha = run(["rev-parse", "HEAD"]).trim();

  fs.writeFileSync(path.join(repoDir, "src", "a.ts"), "export const a = 1;\nexport const b = 2;\n");
  fs.writeFileSync(path.join(repoDir, "src", "yeni.ts"), "export const c = 3;\n");
  fs.rmSync(path.join(repoDir, "README.md"));
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "ikinci commit"]);
  secondSha = run(["rev-parse", "HEAD"]).trim();
});

afterAll(() => {
  if (repoDir) {
    try {
      fs.rmSync(repoDir, { recursive: true, force: true });
    } catch {
      /* Windows'ta .git kilidi kalabilir */
    }
  }
});

// ---------------------------------------------------------------------------
// Güvenlik: argüman doğrulaması (T-22)
// ---------------------------------------------------------------------------

describe("assertNotFlag", () => {
  it("'-' ile başlayan değeri reddeder", () => {
    expect(() => assertNotFlag("--upload-pack=evil", "ref")).toThrow(GitSecurityError);
    expect(() => assertNotFlag("-x", "ref")).toThrow(GitSecurityError);
  });

  it("NUL baytı içeren değeri reddeder", () => {
    expect(() => assertNotFlag("a\0b", "ref")).toThrow(GitSecurityError);
  });

  it("normal değeri kabul eder", () => {
    expect(() => assertNotFlag("main", "ref")).not.toThrow();
  });
});

describe("assertValidRef", () => {
  it("geçerli ref adlarını kabul eder", () => {
    for (const ref of ["main", "HEAD", "feature/x-1", "v1.2.3", "a".repeat(40)]) {
      expect(() => assertValidRef(ref), ref).not.toThrow();
    }
  });

  it("flag enjeksiyonunu reddeder", () => {
    expect(() => assertValidRef("--exec=rm -rf /")).toThrow(GitSecurityError);
  });

  it("shell metakarakterlerini reddeder", () => {
    for (const bad of ["main; rm -rf /", "main|sh", "main`whoami`", "main$(id)", "main&&ls", "a b"]) {
      expect(() => assertValidRef(bad), bad).toThrow(GitSecurityError);
    }
  });

  it("`..` içeren ref'i reddeder", () => {
    expect(() => assertValidRef("main..evil")).toThrow(GitSecurityError);
  });

  it("boş ve aşırı uzun ref'i reddeder", () => {
    expect(() => assertValidRef("")).toThrow(GitSecurityError);
    expect(() => assertValidRef("a".repeat(300))).toThrow(GitSecurityError);
  });
});

// ---------------------------------------------------------------------------
// Güvenlik: SSRF (T-23)
// ---------------------------------------------------------------------------

describe("isPrivateHost", () => {
  const privateHosts = [
    "localhost",
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "0.0.0.0",
    "::1",
    "db.internal",
    "svc.local"
  ];

  it.each(privateHosts.map((h) => [h]))("özel sayar: %s", (host) => {
    expect(isPrivateHost(host as string)).toBe(true);
  });

  const publicHosts = ["github.com", "gitlab.com", "8.8.8.8", "172.32.0.1", "192.169.1.1"];
  it.each(publicHosts.map((h) => [h]))("genel sayar: %s", (host) => {
    expect(isPrivateHost(host as string)).toBe(false);
  });
});

describe("assertSafeRemoteUrl", () => {
  it("https github URL'ini kabul eder", () => {
    expect(() => assertSafeRemoteUrl("https://github.com/org/repo.git")).not.toThrow();
  });

  it("http'yi reddeder", () => {
    expect(() => assertSafeRemoteUrl("http://github.com/org/repo.git")).toThrow(GitSecurityError);
  });

  it("git:// ve ssh:// protokollerini reddeder", () => {
    expect(() => assertSafeRemoteUrl("git://github.com/org/repo.git")).toThrow(GitSecurityError);
    expect(() => assertSafeRemoteUrl("ssh://git@github.com/org/repo.git")).toThrow(GitSecurityError);
  });

  it("file:// protokolünü reddeder", () => {
    expect(() => assertSafeRemoteUrl("file:///etc/passwd")).toThrow(GitSecurityError);
  });

  it("iç ağ adresini reddeder (SSRF)", () => {
    expect(() => assertSafeRemoteUrl("https://169.254.169.254/latest/meta-data/")).toThrow(GitSecurityError);
    expect(() => assertSafeRemoteUrl("https://10.0.0.1/repo.git")).toThrow(GitSecurityError);
    expect(() => assertSafeRemoteUrl("https://localhost:8080/repo.git")).toThrow(GitSecurityError);
  });

  it("URL içindeki kimlik bilgisini reddeder", () => {
    expect(() => assertSafeRemoteUrl("https://user:token@github.com/org/repo.git")).toThrow(GitSecurityError);
  });

  it("allow-list dışındaki host'u reddeder", () => {
    expect(() => assertSafeRemoteUrl("https://evil.com/repo.git", ["github.com"])).toThrow(GitSecurityError);
    expect(() => assertSafeRemoteUrl("https://github.com/o/r.git", ["github.com"])).not.toThrow();
  });
});

describe("runGit — alt komut allow-list", () => {
  it("allow-list dışı alt komutu reddeder", async () => {
    await expect(
      runGit("push" as any, [], { cwd: process.cwd() })
    ).rejects.toBeInstanceOf(GitSecurityError);
  });

  it("allow-list makul bir küme", () => {
    expect(ALLOWED_SUBCOMMANDS).toContain("log");
    expect(ALLOWED_SUBCOMMANDS).not.toContain("push");
    expect(ALLOWED_SUBCOMMANDS).not.toContain("reset");
  });
});

// ---------------------------------------------------------------------------
// Gerçek repository davranışı
// ---------------------------------------------------------------------------

describe.runIf(gitAvailable)("GitRepository — gerçek depo", () => {
  it("git deposu olduğunu tanır", async () => {
    expect(await new GitRepository(repoDir).isRepository()).toBe(true);
  });

  it("git olmayan dizinde false döner", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "y-notgit-"));
    expect(await new GitRepository(tmp).isRepository()).toBe(false);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("HEAD commit SHA'sını döndürür", async () => {
    const sha = await new GitRepository(repoDir).currentCommit();
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(sha).toBe(secondSha);
  });

  it("dal adını döndürür", async () => {
    expect(await new GitRepository(repoDir).currentBranch()).toBe("main");
  });

  it("izlenen dosyaları listeler", async () => {
    const files = await new GitRepository(repoDir).listFiles();
    expect(files).toContain("src/a.ts");
    expect(files).toContain("src/yeni.ts");
    expect(files).not.toContain("README.md"); // ikinci commit'te silindi
  });

  it("değişen dosyaları durumlarıyla döndürür", async () => {
    const changes = await new GitRepository(repoDir).changedFiles(firstSha, secondSha);
    const byPath = new Map(changes.map((c) => [c.path, c]));

    expect(byPath.get("src/a.ts")?.status).toBe("modified");
    expect(byPath.get("src/yeni.ts")?.status).toBe("added");
    expect(byPath.get("README.md")?.status).toBe("deleted");
  });

  it("değişiklik satır sayılarını GERÇEKTEN sayar", async () => {
    // P00 bulgusu: `recent_diffs` alani `line_changes: "+45 -12"` seklinde
    // UYDURMAYDI ve git'e hic bakilmiyordu (ADR-032).
    const changes = await new GitRepository(repoDir).changedFiles(firstSha, secondSha);
    const modified = changes.find((c) => c.path === "src/a.ts");

    expect(modified).toBeDefined();
    expect(modified!.insertions).toBe(1); // bir satir eklendi
    expect(modified!.deletions).toBe(0);
  });

  it("unified diff üretir", async () => {
    const diff = await new GitRepository(repoDir).diff(firstSha, secondSha, "src/a.ts");
    expect(diff).toContain("+export const b = 2;");
    expect(diff).toContain("diff --git");
  });

  it("commit geçmişini döndürür", async () => {
    const log = await new GitRepository(repoDir).log({ maxCount: 10 });
    expect(log.length).toBe(2);
    expect(log[0].subject).toBe("ikinci commit");
    expect(log[0].authorEmail).toBe("test@y-os.local");
    expect(log[0].sha).toBe(secondSha);
    expect(log[0].committedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("belirli commit'teki dosya içeriğini okur", async () => {
    const content = await new GitRepository(repoDir).readFileAtRef(firstSha, "src/a.ts");
    expect(content).toBe("export const a = 1;\n");
    expect(content).not.toContain("export const b");
  });

  it("çalışma ağacı durumunu döndürür", async () => {
    fs.writeFileSync(path.join(repoDir, "src", "kirli.ts"), "x\n");
    const status = await new GitRepository(repoDir).status();
    expect(status.some((s) => s.path === "src/kirli.ts")).toBe(true);
    fs.rmSync(path.join(repoDir, "src", "kirli.ts"));
  });

  it("geçersiz ref ile çağrıyı reddeder", async () => {
    await expect(new GitRepository(repoDir).diff("--exec=evil", "HEAD")).rejects.toBeInstanceOf(
      GitSecurityError
    );
  });

  it("log maxCount sınırını doğrular", async () => {
    await expect(new GitRepository(repoDir).log({ maxCount: 0 })).rejects.toBeInstanceOf(RangeError);
    await expect(new GitRepository(repoDir).log({ maxCount: 99_999 })).rejects.toBeInstanceOf(RangeError);
  });
});

describe("cloneRepository — güvenlik ön kontrolleri", () => {
  it("iç ağ adresine clone denemesini reddeder", async () => {
    await expect(
      cloneRepository({ url: "https://169.254.169.254/repo.git", targetDir: path.join(os.tmpdir(), "x") })
    ).rejects.toBeInstanceOf(GitSecurityError);
  });

  it("geçersiz depth'i reddeder", async () => {
    await expect(
      cloneRepository({
        url: "https://github.com/org/repo.git",
        targetDir: path.join(os.tmpdir(), "x"),
        depth: -1
      })
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("flag enjeksiyonlu dal adını reddeder", async () => {
    await expect(
      cloneRepository({
        url: "https://github.com/org/repo.git",
        targetDir: path.join(os.tmpdir(), "x"),
        branch: "--upload-pack=evil"
      })
    ).rejects.toBeInstanceOf(GitSecurityError);
  });
});

// ---------------------------------------------------------------------------
// Ayrıştırıcılar
// ---------------------------------------------------------------------------

describe("parseNameStatusZ", () => {
  const NUL = "\0";

  it("basit durumları ayrıştırır", () => {
    const raw = ["M", "src/a.ts", "A", "src/b.ts", "D", "README.md"].join(NUL) + NUL;
    const out = parseNameStatusZ(raw);
    expect(out).toEqual([
      { path: "src/a.ts", status: "modified", previousPath: null },
      { path: "src/b.ts", status: "added", previousPath: null },
      { path: "README.md", status: "deleted", previousPath: null }
    ]);
  });

  it("rename kayıtlarını üç token olarak ayrıştırır", () => {
    const raw = ["R100", "eski.ts", "yeni.ts"].join(NUL) + NUL;
    expect(parseNameStatusZ(raw)).toEqual([
      { path: "yeni.ts", status: "renamed", previousPath: "eski.ts" }
    ]);
  });

  it("boş girdide boş dizi döner", () => {
    expect(parseNameStatusZ("")).toEqual([]);
  });

  it("yarım kalan kaydı sessizce atlar", () => {
    expect(parseNameStatusZ("M" + NUL)).toEqual([]);
  });
});

describe("parseNumstatZ", () => {
  const NUL = "\0";

  it("ekleme/silme sayılarını ayrıştırır", () => {
    const raw = ["5\t3\tsrc/a.ts", "1\t0\tsrc/b.ts"].join(NUL) + NUL;
    const m = parseNumstatZ(raw);
    expect(m.get("src/a.ts")).toEqual({ insertions: 5, deletions: 3 });
    expect(m.get("src/b.ts")).toEqual({ insertions: 1, deletions: 0 });
  });

  it("binary dosyalar için 0 sayar ('-' işareti)", () => {
    const raw = ["-\t-\timage.png"].join(NUL) + NUL;
    expect(parseNumstatZ(raw).get("image.png")).toEqual({ insertions: 0, deletions: 0 });
  });
});

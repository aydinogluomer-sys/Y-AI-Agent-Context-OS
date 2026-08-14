/**
 * P03 / Y-P03-005 — Local adapter testleri.
 *
 * Gerçek dosya sistemi + gerçek git deposu üzerinde koşar.
 * P00'da `getDiff()` git'e hiç bakmadan iki string'i karşılaştırıyordu ve
 * testler bunu yakalamıyordu; buradaki testler gerçek commit'ler üretip
 * çıktıyı git'in kendisiyle doğruluyor.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { LocalRepositoryAdapter } from "./local-adapter";
import { AdapterError, classifyFileShape, isWritable } from "./adapter";

const gitAvailable: boolean = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

let repoDir: string;
let plainDir: string;
let firstSha = "";

beforeAll(() => {
  plainDir = fs.mkdtempSync(path.join(os.tmpdir(), "y-plain-"));
  fs.mkdirSync(path.join(plainDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(plainDir, "src", "a.ts"), "export const a = 1;\n");
  fs.writeFileSync(path.join(plainDir, ".env"), "SECRET_TOKEN=abc123\n");
  fs.writeFileSync(path.join(plainDir, "big.txt"), "x".repeat(10_000));
  fs.writeFileSync(path.join(plainDir, "image.bin"), Buffer.from([0x89, 0x50, 0x00, 0x4e]));
  fs.mkdirSync(path.join(plainDir, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(plainDir, "node_modules", "pkg", "i.js"), "module.exports={}\n");
  fs.writeFileSync(path.join(plainDir, "app.min.js"), "var a=1;".repeat(200));

  if (!gitAvailable) return;

  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "y-adapter-git-"));
  const run = (args: string[]) => execFileSync("git", args, { cwd: repoDir, encoding: "utf-8", stdio: "pipe" });

  run(["init", "-q", "-b", "main"]);
  run(["config", "user.email", "t@y.local"]);
  run(["config", "user.name", "T"]);
  run(["config", "commit.gpgsign", "false"]);

  fs.mkdirSync(path.join(repoDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(repoDir, "src", "a.ts"), "export const a = 1;\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "ilk"]);
  firstSha = run(["rev-parse", "HEAD"]).trim();

  fs.writeFileSync(path.join(repoDir, "src", "a.ts"), "export const a = 1;\nexport const b = 2;\n");
  fs.writeFileSync(path.join(repoDir, "src", "b.ts"), "export const c = 3;\n");
  run(["add", "-A"]);
  run(["commit", "-q", "-m", "ikinci"]);
});

afterAll(() => {
  for (const d of [plainDir, repoDir]) {
    if (!d) continue;
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* Windows kilidi */
    }
  }
});

describe("LocalRepositoryAdapter — kurulum", () => {
  it("göreli kökü reddeder (ADR-018)", () => {
    expect(() => new LocalRepositoryAdapter("./relative")).toThrow(AdapterError);
  });

  it("connect() öncesi kullanımı reddeder", async () => {
    const a = new LocalRepositoryAdapter(plainDir);
    await expect(a.readFile("src/a.ts")).rejects.toBeInstanceOf(AdapterError);
  });

  it("var olmayan dizinde connect() başarısız olur", async () => {
    const a = new LocalRepositoryAdapter(path.join(plainDir, "yok"));
    await expect(a.connect()).rejects.toBeInstanceOf(AdapterError);
  });

  it("yazma yetenekli olarak raporlanır", async () => {
    const a = new LocalRepositoryAdapter(plainDir);
    await a.connect();
    expect(a.capabilities.writable).toBe(true);
    expect(isWritable(a)).toBe(true);
  });

  it("git olmayan dizinde hasHistory=false", async () => {
    const a = new LocalRepositoryAdapter(plainDir);
    await a.connect();
    expect(a.capabilities.hasHistory).toBe(false);
  });
});

describe("LocalRepositoryAdapter — okuma", () => {
  const adapter = async () => {
    const a = new LocalRepositoryAdapter(plainDir);
    await a.connect();
    return a;
  };

  it("normal dosyayı okur", async () => {
    const f = await (await adapter()).readFile("src/a.ts");
    expect(f.content).toBe("export const a = 1;\n");
    expect(f.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it(".env dosyasını REDDEDER", async () => {
    await expect((await adapter()).readFile(".env")).rejects.toBeInstanceOf(AdapterError);
  });

  it("traversal denemesini reddeder", async () => {
    await expect((await adapter()).readFile("../../etc/passwd")).rejects.toBeInstanceOf(AdapterError);
  });

  it("var olmayan dosyada NOT_FOUND fırlatır", async () => {
    try {
      await (await adapter()).readFile("src/yok.ts");
      expect.unreachable("hata bekleniyordu");
    } catch (e) {
      expect((e as AdapterError).code).toBe("NOT_FOUND");
    }
  });

  it("boyut sınırını aşan dosyada TOO_LARGE fırlatır", async () => {
    const a = new LocalRepositoryAdapter(plainDir, { maxFileBytes: 100 });
    await a.connect();
    try {
      await a.readFile("big.txt");
      expect.unreachable("hata bekleniyordu");
    } catch (e) {
      expect((e as AdapterError).code).toBe("TOO_LARGE");
    }
  });

  it("binary dosyada BINARY fırlatır", async () => {
    try {
      await (await adapter()).readFile("image.bin");
      expect.unreachable("hata bekleniyordu");
    } catch (e) {
      expect((e as AdapterError).code).toBe("BINARY");
    }
  });
});

describe("LocalRepositoryAdapter — listFiles", () => {
  const collect = async (opts?: Parameters<LocalRepositoryAdapter["listFiles"]>[0]) => {
    const a = new LocalRepositoryAdapter(plainDir);
    await a.connect();
    const out = [];
    for await (const f of a.listFiles(opts)) out.push(f);
    return out;
  };

  it("normal dosyaları listeler", async () => {
    const files = await collect();
    expect(files.map((f) => f.path)).toContain("src/a.ts");
  });

  it(".env dosyasını listelemez", async () => {
    const files = await collect();
    expect(files.map((f) => f.path)).not.toContain(".env");
  });

  it("node_modules içine hiç girmez", async () => {
    const files = await collect();
    expect(files.some((f) => f.path.startsWith("node_modules/"))).toBe(false);
  });

  it("maxFiles sınırına uyar", async () => {
    const files = await collect({ maxFiles: 2 });
    expect(files.length).toBeLessThanOrEqual(2);
  });

  it("binary dosyayı işaretler", async () => {
    const files = await collect();
    expect(files.find((f) => f.path === "image.bin")?.isBinary).toBe(true);
  });

  it("minified dosyayı işaretler", async () => {
    const files = await collect();
    expect(files.find((f) => f.path === "app.min.js")?.isMinified).toBe(true);
  });

  it("her dosya için içerik hash'i üretir", async () => {
    const files = await collect();
    for (const f of files) expect(f.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("LocalRepositoryAdapter — yazma (T-20)", () => {
  let scratch: string;

  beforeAll(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "y-write-"));
  });
  afterAll(() => {
    try {
      fs.rmSync(scratch, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  const adapter = async () => {
    const a = new LocalRepositoryAdapter(scratch);
    await a.connect();
    return a;
  };

  it("yeni dosya yazar", async () => {
    const r = await (await adapter()).writeFile({
      relativePath: "src/new.ts",
      content: "export const x = 1;\n",
      expectedHashBefore: null
    ,
      changeDecision: "ALLOW" as const,
      decisionReason: "test: sinir ici"});
    expect(r.hashBefore).toBeNull();
    expect(r.hashAfter).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.readFileSync(path.join(scratch, "src", "new.ts"), "utf-8")).toBe("export const x = 1;\n");
  });

  it("hash eşleşmesiyle üzerine yazar", async () => {
    const a = await adapter();
    const first = await a.writeFile({ relativePath: "x.ts", content: "a", expectedHashBefore: null ,
      changeDecision: "ALLOW" as const,
      decisionReason: "test: sinir ici"});
    const second = await a.writeFile({
      relativePath: "x.ts",
      content: "b",
      expectedHashBefore: first.hashAfter
    ,
      changeDecision: "ALLOW" as const,
      decisionReason: "test: sinir ici"});
    expect(second.hashBefore).toBe(first.hashAfter);
  });

  it("hash uyuşmazlığında yazımı REDDEDER (eşzamanlı değişiklik)", async () => {
    const a = await adapter();
    await a.writeFile({ relativePath: "y.ts", content: "orijinal", expectedHashBefore: null ,
      changeDecision: "ALLOW" as const,
      decisionReason: "test: sinir ici"});

    await expect(
      a.writeFile({ relativePath: "y.ts", content: "cakisan", expectedHashBefore: "f".repeat(64) ,
      changeDecision: "ALLOW" as const,
      decisionReason: "test: sinir ici"})
    ).rejects.toBeInstanceOf(AdapterError);

    // Dosya DEGISMEMIS olmali.
    expect(fs.readFileSync(path.join(scratch, "y.ts"), "utf-8")).toBe("orijinal");
  });

  it("denylist'teki yola yazımı reddeder", async () => {
    const a = await adapter();
    await expect(
      a.writeFile({ relativePath: ".env", content: "SECRET=x", expectedHashBefore: null ,
      changeDecision: "ALLOW" as const,
      decisionReason: "test: sinir ici"})
    ).rejects.toBeInstanceOf(AdapterError);
  });

  it("traversal ile yazımı reddeder", async () => {
    const a = await adapter();
    await expect(
      a.writeFile({ relativePath: "../escape.ts", content: "x", expectedHashBefore: null ,
      changeDecision: "ALLOW" as const,
      decisionReason: "test: sinir ici"})
    ).rejects.toBeInstanceOf(AdapterError);
  });

  it("geçici dosya bırakmaz (atomik rename)", async () => {
    const a = await adapter();
    await a.writeFile({ relativePath: "atomic.ts", content: "x", expectedHashBefore: null ,
      changeDecision: "ALLOW" as const,
      decisionReason: "test: sinir ici"});
    const leftovers = fs.readdirSync(scratch).filter((f) => f.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });
});

describe.runIf(gitAvailable)("LocalRepositoryAdapter — git entegrasyonu", () => {
  const adapter = async () => {
    const a = new LocalRepositoryAdapter(repoDir);
    await a.connect();
    return a;
  };

  it("git deposunda hasHistory=true", async () => {
    expect((await adapter()).capabilities.hasHistory).toBe(true);
  });

  it("gerçek commit SHA'sı döndürür", async () => {
    expect(await (await adapter()).currentCommit()).toMatch(/^[0-9a-f]{40}$/);
  });

  it("metadata dal ve commit taşır", async () => {
    const m = await (await adapter()).metadata();
    expect(m.currentBranch).toBe("main");
    expect(m.currentCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("changedFiles GERÇEK git diff sonucu döndürür", async () => {
    const changed = await (await adapter()).changedFiles(firstSha, "HEAD");
    expect(changed).toContain("src/a.ts");
    expect(changed).toContain("src/b.ts");
  });

  it("diff gerçek unified diff üretir", async () => {
    const d = await (await adapter()).diff(firstSha, "HEAD", "src/a.ts");
    expect(d).toContain("diff --git");
    expect(d).toContain("+export const b = 2;");
  });

  it("diff'te geçersiz ref'i reddeder", async () => {
    await expect((await adapter()).diff("--exec=evil", "HEAD")).rejects.toBeTruthy();
  });
});

describe("git olmayan dizinde geçmiş işlemleri", () => {
  it("changedFiles UNSUPPORTED fırlatır (sessiz boş dizi DEĞİL)", async () => {
    const a = new LocalRepositoryAdapter(plainDir);
    await a.connect();
    try {
      await a.changedFiles("a", "b");
      expect.unreachable("hata bekleniyordu");
    } catch (e) {
      expect((e as AdapterError).code).toBe("UNSUPPORTED");
    }
  });
});

describe("classifyFileShape", () => {
  it("dist/ altını generated sayar", () => {
    expect(classifyFileShape("dist/app.js", "").isGenerated).toBe(true);
  });

  it("lockfile'ları generated sayar", () => {
    expect(classifyFileShape("pnpm-lock.yaml", "").isGenerated).toBe(true);
    expect(classifyFileShape("package-lock.json", "").isGenerated).toBe(true);
  });

  it("@generated başlığını tanır", () => {
    expect(classifyFileShape("src/x.ts", "// @generated by protoc\n").isGenerated).toBe(true);
  });

  it("DO NOT EDIT başlığını tanır", () => {
    expect(classifyFileShape("src/x.ts", "/* DO NOT EDIT */\n").isGenerated).toBe(true);
  });

  it("normal kaynağı generated saymaz", () => {
    expect(classifyFileShape("src/auth.ts", "export const a = 1;\n").isGenerated).toBe(false);
  });

  it("uzun tek satırlı içeriği minified sayar", () => {
    expect(classifyFileShape("app.js", "var a=1;".repeat(200)).isMinified).toBe(true);
  });

  it("normal kaynağı minified saymaz", () => {
    const src = Array(50).fill("export const a = 1;").join("\n");
    expect(classifyFileShape("src/a.ts", src).isMinified).toBe(false);
  });
});

describe("LocalRepositoryAdapter — Change Firewall (P10 / ADR-039)", () => {
  it("DENY karariyla yazim REDDEDILIR", async () => {
    const adapter = new LocalRepositoryAdapter(repoDir);
    await adapter.connect();

    await expect(
      adapter.writeFile({
        relativePath: "src/yeni.ts",
        content: "x",
        expectedHashBefore: null,
        changeDecision: "DENY",
        decisionReason: "sinir disi"
      })
    ).rejects.toThrow(/Change Firewall yazimi engelledi/);
  });

  it("ASK_APPROVAL karariyla da yazim REDDEDILIR", async () => {
    // "Onay bekleniyor" diye gecici izin verilmez: onay geldiginde
    // YENI bir karar alinir.
    const adapter = new LocalRepositoryAdapter(repoDir);
    await adapter.connect();

    await expect(
      adapter.writeFile({
        relativePath: "src/yeni.ts",
        content: "x",
        expectedHashBefore: null,
        changeDecision: "ASK_APPROVAL",
        decisionReason: "migration onay ister"
      })
    ).rejects.toThrow(/ASK_APPROVAL/);
  });

  it("reddedilen yazim dosyayi OLUSTURMAZ", async () => {
    const adapter = new LocalRepositoryAdapter(repoDir);
    await adapter.connect();

    await adapter
      .writeFile({
        relativePath: "src/olusmamali.ts",
        content: "x",
        expectedHashBefore: null,
        changeDecision: "DENY",
        decisionReason: "sinir disi"
      })
      .catch(() => undefined);

    await expect(adapter.readFile("src/olusmamali.ts")).rejects.toBeTruthy();
  });
});


/**
 * P03 / Y-P03-003 — Yönetilen workspace testleri (P0-9 regresyonu).
 *
 * P00 bulgusu: API keyfi bir mutlak `root_path` kabul ediyordu ve
 * yapılandırılmamışsa sunucunun cwd'sini repository sayıyordu.
 * Bu testler, kökün artık YALNIZ Y tarafından hesaplandığını kanıtlar.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  WorkspaceManager,
  WorkspaceError,
  assertSafeSegment,
  DEFAULT_QUOTA
} from "./workspace";

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "y-workspace-"));
});

afterAll(() => {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* temizlik hatasi testi dusurmemeli */
  }
});

describe("assertSafeSegment", () => {
  it("normal kimlikleri kabul eder", () => {
    for (const s of ["org_abc", "proj-1", "a", "A1", "user_3f1a-2b", "x".repeat(128)]) {
      expect(() => assertSafeSegment(s, "test"), s).not.toThrow();
    }
  });

  it("traversal denemelerini reddeder", () => {
    for (const bad of ["..", "../etc", "a/b", "a\\b", "./x", "/abs"]) {
      expect(() => assertSafeSegment(bad, "test"), bad).toThrow(WorkspaceError);
    }
  });

  it("boş ve aşırı uzun segmenti reddeder", () => {
    expect(() => assertSafeSegment("", "test")).toThrow(WorkspaceError);
    expect(() => assertSafeSegment("x".repeat(129), "test")).toThrow(WorkspaceError);
  });

  it("NUL ve kontrol karakterlerini reddeder", () => {
    expect(() => assertSafeSegment("a\u0000b", "test")).toThrow(WorkspaceError);
    expect(() => assertSafeSegment("a\nb", "test")).toThrow(WorkspaceError);
  });

  it("tire ile başlayan segmenti reddeder (flag benzeri)", () => {
    expect(() => assertSafeSegment("-rf", "test")).toThrow(WorkspaceError);
  });
});

describe("WorkspaceManager — konum hesabı (ADR-018)", () => {
  it("deterministik yol üretir", () => {
    const wm = new WorkspaceManager(root);
    const loc = wm.locate("org_a", "proj_b", "repo_c");
    expect(loc.absolutePath).toBe(path.join(root, "org_a", "proj_b", "repo_c"));
  });

  it("aynı girdi için aynı yolu üretir", () => {
    const wm = new WorkspaceManager(root);
    expect(wm.locate("o", "p", "r").absolutePath).toBe(wm.locate("o", "p", "r").absolutePath);
  });

  it("traversal içeren kimlikleri reddeder (P0-9)", () => {
    const wm = new WorkspaceManager(root);
    expect(() => wm.locate("../..", "p", "r")).toThrow(WorkspaceError);
    expect(() => wm.locate("o", "../../etc", "r")).toThrow(WorkspaceError);
    expect(() => wm.locate("o", "p", "..")).toThrow(WorkspaceError);
  });

  it("mutlak yol enjeksiyonunu reddeder", () => {
    const wm = new WorkspaceManager(root);
    expect(() => wm.locate("/etc", "p", "r")).toThrow(WorkspaceError);
    expect(() => wm.locate("o", "C:\\Windows", "r")).toThrow(WorkspaceError);
  });

  it("üretilen yol her zaman workspace kökünün altındadır", () => {
    const wm = new WorkspaceManager(root);
    const loc = wm.locate("org_a", "proj_b", "repo_c");
    const rel = path.relative(root, loc.absolutePath);
    expect(rel.startsWith("..")).toBe(false);
    expect(path.isAbsolute(rel)).toBe(false);
  });

  it("göreli workspace kökünü reddeder", () => {
    expect(() => new WorkspaceManager("./relative")).toThrow(WorkspaceError);
    expect(() => new WorkspaceManager(".")).toThrow(WorkspaceError);
  });

  it("kullanıcıdan kök yolu ALMAZ (API yüzeyi kontrolü)", () => {
    const wm = new WorkspaceManager(root);
    // locate() yalnizca kimlik alir; herhangi bir path parametresi yoktur.
    expect(wm.locate.length).toBe(3);
    const paramNames = wm.locate.toString().slice(0, 80);
    expect(paramNames).not.toContain("rootPath");
    expect(paramNames).not.toContain("absolutePath");
  });
});

describe("WorkspaceManager — dizin yaşam döngüsü", () => {
  it("dizin oluşturur ve varlığını bildirir", async () => {
    const wm = new WorkspaceManager(root);
    const loc = wm.locate("org_x", "proj_x", "repo_x");

    expect(wm.exists(loc)).toBe(false);
    await wm.ensureDirectory(loc);
    fs.mkdirSync(loc.absolutePath, { recursive: true });
    expect(wm.exists(loc)).toBe(true);
  });

  it("repository'yi tamamen kaldırır", async () => {
    const wm = new WorkspaceManager(root);
    const loc = wm.locate("org_y", "proj_y", "repo_y");
    fs.mkdirSync(path.join(loc.absolutePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(loc.absolutePath, "src", "a.ts"), "x");

    expect(wm.exists(loc)).toBe(true);
    await wm.remove(loc);
    expect(wm.exists(loc)).toBe(false);
  });
});

describe("WorkspaceManager — kota (T-06)", () => {
  it("boyut ve dosya sayısını ölçer", async () => {
    const wm = new WorkspaceManager(root);
    const loc = wm.locate("org_q", "proj_q", "repo_q");
    fs.mkdirSync(path.join(loc.absolutePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(loc.absolutePath, "src", "a.ts"), "a".repeat(100));
    fs.writeFileSync(path.join(loc.absolutePath, "src", "b.ts"), "b".repeat(200));

    const m = await wm.measure(loc);
    expect(m.files).toBe(2);
    expect(m.bytes).toBe(300);
  });

  it("boyut kotası aşımında hata fırlatır", async () => {
    const wm = new WorkspaceManager(root, { maxRepositoryBytes: 50, maxFileCount: 1000 });
    const loc = wm.locate("org_big", "proj_big", "repo_big");
    fs.mkdirSync(loc.absolutePath, { recursive: true });
    fs.writeFileSync(path.join(loc.absolutePath, "big.txt"), "x".repeat(500));

    await expect(wm.assertWithinQuota(loc)).rejects.toBeInstanceOf(WorkspaceError);
  });

  it("dosya sayısı kotası aşımında hata fırlatır", async () => {
    const wm = new WorkspaceManager(root, { maxRepositoryBytes: 10 ** 9, maxFileCount: 3 });
    const loc = wm.locate("org_many", "proj_many", "repo_many");
    fs.mkdirSync(loc.absolutePath, { recursive: true });
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(loc.absolutePath, `f${i}.txt`), "x");
    }

    await expect(wm.assertWithinQuota(loc)).rejects.toBeInstanceOf(WorkspaceError);
  });

  it("kota içindeyse geçer", async () => {
    const wm = new WorkspaceManager(root);
    const loc = wm.locate("org_ok", "proj_ok", "repo_ok");
    fs.mkdirSync(loc.absolutePath, { recursive: true });
    fs.writeFileSync(path.join(loc.absolutePath, "a.ts"), "x");

    await expect(wm.assertWithinQuota(loc)).resolves.toBeUndefined();
  });

  it("varsayılan kota makul sınırlar taşır", () => {
    expect(DEFAULT_QUOTA.maxRepositoryBytes).toBeGreaterThan(100 * 1024 * 1024);
    expect(DEFAULT_QUOTA.maxFileCount).toBeGreaterThan(10_000);
  });

  it("var olmayan dizinde 0 ölçer, çökmez", async () => {
    const wm = new WorkspaceManager(root);
    const loc = wm.locate("org_yok", "proj_yok", "repo_yok");
    const m = await wm.measure(loc);
    expect(m).toEqual({ bytes: 0, files: 0 });
  });
});

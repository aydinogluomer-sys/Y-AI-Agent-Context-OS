/**
 * P04 / Y-P04-009 — Symbol indexer testleri.
 *
 * P00 bulgusu: eski index worker dosyaları sayıp `/complete` çağırıyordu.
 * En kritik test bu yüzden "gerçekten satır yazıldı mı" sorusudur.
 */

import { describe, it, expect } from "vitest";
import { SymbolIndexer, type FileToIndex, type IndexerDb } from "./symbol-indexer";
import { createDefaultRegistry } from "./registry";
import { AdapterError, type AdapterCapabilities, type RepositoryAdapter } from "../repo/adapter";

const TS_FILE = `
export function topla(a: number, b: number): number {
  return a + b;
}

export class Hesap {
  bakiye = 0;

  yatir(miktar: number): void {
    this.bakiye += miktar;
  }
}
`;

const PY_FILE = `
def hesapla(x):
    return x * 2

class Kutu:
    def ac(self):
        pass
`;

function createDb() {
  const symbolInserts: unknown[][] = [];
  const chunkInserts: unknown[][] = [];
  const statusUpdates: unknown[][] = [];
  const parserVersions: unknown[][] = [];
  const deletes: string[] = [];

  const db: IndexerDb & {
    symbolInserts: typeof symbolInserts;
    chunkInserts: typeof chunkInserts;
    statusUpdates: typeof statusUpdates;
    parserVersions: typeof parserVersions;
    deletes: typeof deletes;
  } = {
    symbolInserts,
    chunkInserts,
    statusUpdates,
    parserVersions,
    deletes,
    async query(sql: string, params: unknown[] = []) {
      if (/INSERT INTO symbols/i.test(sql)) symbolInserts.push(params);
      else if (/INSERT INTO chunks/i.test(sql)) chunkInserts.push(params);
      else if (/INSERT INTO parser_versions/i.test(sql)) parserVersions.push(params);
      else if (/UPDATE files SET parse_status/i.test(sql)) statusUpdates.push(params);
      else if (/^DELETE FROM/i.test(sql.trim())) deletes.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
      return { rows: [], rowCount: 1 };
    }
  };
  return db;
}

const CAPS: AdapterCapabilities = {
  kind: "local",
  writable: false,
  hasHistory: true,
  canFetch: false,
  readCost: "local"
};

function createAdapter(contents: Record<string, string>, failFor: string[] = []): RepositoryAdapter {
  return {
    capabilities: CAPS,
    async connect() {},
    async disconnect() {},
    async metadata() {
      return { kind: "local", defaultBranch: null, currentBranch: "main", currentCommit: "a".repeat(40), remoteUrl: null };
    },
    async currentCommit() {
      return "a".repeat(40);
    },
    async branch() {
      return "main";
    },
    async *listFiles() {},
    async readFile(p: string) {
      if (failFor.includes(p)) throw new AdapterError("TOO_LARGE", "cok buyuk", p);
      const content = contents[p];
      if (content === undefined) throw new AdapterError("NOT_FOUND", "yok", p);
      return { path: p, content, contentHash: "h".repeat(64), sizeBytes: content.length, redacted: false };
    },
    async changedFiles() {
      return [];
    },
    async diff() {
      return "";
    },
    async fetch() {},
    async checkout() {}
  };
}

const OPTIONS = {
  organizationId: "org_a",
  repositoryId: "repo_1",
  snapshotId: "snap_1",
  commitSha: "a".repeat(40)
};

function file(path: string, overrides: Partial<FileToIndex> = {}): FileToIndex {
  return { fileId: `f_${path}`, path, language: null, isBinary: false, sizeBytes: 100, ...overrides };
}

describe("SymbolIndexer — gerçekten yazar (P00 regresyonu)", { timeout: 60_000 }, () => {
  it("sembolleri veritabanına YAZAR", async () => {
    const db = createDb();
    const indexer = new SymbolIndexer(db, createDefaultRegistry());

    const result = await indexer.indexSnapshot(
      createAdapter({ "src/a.ts": TS_FILE }),
      [file("src/a.ts")],
      OPTIONS
    );

    // Eski worker'in yapmadigi sey.
    expect(db.symbolInserts.length).toBeGreaterThan(0);
    expect(result.symbolsWritten).toBe(db.symbolInserts.length);
  });

  it("chunk'ları veritabanına YAZAR", async () => {
    const db = createDb();
    await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({ "src/a.ts": TS_FILE }),
      [file("src/a.ts")],
      OPTIONS
    );
    expect(db.chunkInserts.length).toBeGreaterThan(0);
  });

  it("dosya sayısı değil, GERÇEK sembol sayısı raporlar", async () => {
    const db = createDb();
    const result = await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({ "src/a.ts": TS_FILE }),
      [file("src/a.ts")],
      OPTIONS
    );

    // Tek dosya ama birden fazla sembol: topla, Hesap, bakiye, yatir.
    expect(result.filesProcessed).toBe(1);
    expect(result.symbolsWritten).toBeGreaterThan(1);
  });

  it("14 zorunlu alanın tamamını yazar", async () => {
    const db = createDb();
    await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({ "src/a.ts": TS_FILE }),
      [file("src/a.ts")],
      OPTIONS
    );

    const params = db.symbolInserts[0];
    // symbol_id, repository_id, commit_sha, path, language, symbol_type,
    // symbol_name, start_line, end_line, start_byte, end_byte, content_hash,
    // parent_symbol, exports, imports + org, snapshot, file, is_exported
    expect(params.length).toBe(19);
    expect(params[1]).toBe("repo_1");
    expect(params[2]).toBe("a".repeat(40));
    expect(params[3]).toBe("src/a.ts");
    expect(String(params[11])).toMatch(/^[0-9a-f]{64}$/); // content_hash
  });

  it("dosya parse durumunu günceller", async () => {
    const db = createDb();
    await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({ "src/a.ts": TS_FILE }),
      [file("src/a.ts")],
      OPTIONS
    );

    expect(db.statusUpdates[0][1]).toBe("parsed");
    expect(Number(db.statusUpdates[0][2])).toBeGreaterThan(0); // confidence
  });

  it("parser sürümlerini kaydeder (P09 determinizm girdisi)", async () => {
    const db = createDb();
    await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({ "src/a.ts": TS_FILE }),
      [file("src/a.ts")],
      OPTIONS
    );
    expect(db.parserVersions.length).toBeGreaterThanOrEqual(3);
  });

  it("yeniden index'lemede eski kayıtları siler (hayalet sembol olmaz)", async () => {
    const db = createDb();
    await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({ "src/a.ts": TS_FILE }),
      [file("src/a.ts")],
      OPTIONS
    );

    expect(db.deletes.some((d) => d.includes("chunks"))).toBe(true);
    expect(db.deletes.some((d) => d.includes("symbols"))).toBe(true);
  });
});

describe("SymbolIndexer — çok dilli", { timeout: 60_000 }, () => {
  it("TypeScript ve Python dosyalarını aynı çalıştırmada işler", async () => {
    const db = createDb();
    const result = await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({ "src/a.ts": TS_FILE, "src/b.py": PY_FILE }),
      [file("src/a.ts"), file("src/b.py")],
      OPTIONS
    );

    expect(result.filesProcessed).toBe(2);

    const languages = new Set(db.symbolInserts.map((p) => p[4]));
    expect(languages).toContain("typescript");
    expect(languages).toContain("python");
  });

  it("Python sembollerini javascript olarak ETİKETLEMEZ", async () => {
    const db = createDb();
    await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({ "src/b.py": PY_FILE }),
      [file("src/b.py")],
      OPTIONS
    );

    for (const params of db.symbolInserts) {
      expect(params[4]).not.toBe("javascript");
    }
  });
});

describe("SymbolIndexer — hata izolasyonu", { timeout: 60_000 }, () => {
  it("binary dosyayı atlar ve durumu işaretler", async () => {
    const db = createDb();
    const result = await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({}),
      [file("img.png", { isBinary: true })],
      OPTIONS
    );

    expect(result.filesSkipped).toBe(1);
    expect(db.statusUpdates[0][1]).toBe("skipped_binary");
  });

  it("bir dosyanın hatası diğerlerini düşürmez", async () => {
    const db = createDb();
    const result = await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({ "ok.ts": TS_FILE }, ["buyuk.ts"]),
      [file("buyuk.ts"), file("ok.ts")],
      OPTIONS
    );

    expect(result.filesProcessed).toBe(1);
    expect(result.filesSkipped).toBe(1);
    expect(db.symbolInserts.length).toBeGreaterThan(0);
  });

  it("hatayı SESSİZCE yutmaz, failures listesine yazar", async () => {
    const db = createDb();
    const result = await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({}, ["buyuk.ts"]),
      [file("buyuk.ts")],
      OPTIONS
    );

    expect(result.failures.length).toBe(1);
    expect(result.failures[0].path).toBe("buyuk.ts");
    expect(result.failures[0].reason).toContain("TOO_LARGE");
  });

  it("boyut hatasında parse_status skipped_size olur", async () => {
    const db = createDb();
    await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({}, ["buyuk.ts"]),
      [file("buyuk.ts")],
      OPTIONS
    );
    expect(db.statusUpdates[0][1]).toBe("skipped_size");
  });

  it("okunamayan dosyada parse_status error olur", async () => {
    const db = createDb();
    await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({}),
      [file("yok.ts")],
      OPTIONS
    );
    expect(db.statusUpdates[0][1]).toBe("error");
  });

  it("bozuk sözdiziminde çökmez, düşük confidence ile devam eder", async () => {
    const db = createDb();
    const result = await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({ "bad.ts": "export class {{{ ???" }),
      [file("bad.ts")],
      OPTIONS
    );

    expect(result.filesProcessed).toBe(1);
    expect(result.averageConfidence).toBeLessThan(1);
  });
});

describe("SymbolIndexer — tenant izolasyonu", { timeout: 60_000 }, () => {
  it("her sembol ve chunk organization_id taşır", async () => {
    const db = createDb();
    await new SymbolIndexer(db, createDefaultRegistry()).indexSnapshot(
      createAdapter({ "src/a.ts": TS_FILE }),
      [file("src/a.ts")],
      OPTIONS
    );

    for (const params of db.symbolInserts) expect(params).toContain("org_a");
    for (const params of db.chunkInserts) expect(params).toContain("org_a");
  });
});

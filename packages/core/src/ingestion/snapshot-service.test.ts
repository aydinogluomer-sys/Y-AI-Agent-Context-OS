/**
 * P03 / Y-P03-008 — Snapshot ingestion testleri.
 *
 * P00 bulgusu: eski index worker dosyaları yalnızca SAYIYOR, sonra
 * `/complete` çağırıp başarı raporluyordu. Bu testler "gerçekten iş
 * yapıldı mı" sorusunu yanıtlar: yazılan satırlar sayılır.
 */

import { describe, it, expect } from "vitest";
import { SnapshotService, detectLanguage, type SnapshotDb } from "./snapshot-service";
import { AdapterError, type AdapterCapabilities, type FileEntry, type RepositoryAdapter } from "../repo/adapter";

/** Yazılan satırları kaydeden dürüst sahte DB. */
function createDb(options: { readySnapshot?: boolean } = {}) {
  const inserted: { table: string; params: unknown[] }[] = [];
  const updates: { sql: string; params: unknown[] }[] = [];

  const db: SnapshotDb & { inserted: typeof inserted; updates: typeof updates } = {
    inserted,
    updates,
    async query(sql: string, params: unknown[] = []) {
      if (/SELECT[\s\S]*FROM repository_snapshots/i.test(sql)) {
        if (!options.readySnapshot) return { rows: [], rowCount: 0 };
        return {
          rows: [
            { id: "snap_existing", commit_sha: params[1], status: "ready", file_count: 7, total_bytes: 700 }
          ],
          rowCount: 1
        };
      }
      if (/INSERT INTO repository_snapshots/i.test(sql)) {
        inserted.push({ table: "repository_snapshots", params });
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO files/i.test(sql)) {
        inserted.push({ table: "files", params });
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE repository_snapshots/i.test(sql)) {
        updates.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
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

function entry(overrides: Partial<FileEntry> & { path: string }): FileEntry {
  return {
    sizeBytes: 100,
    contentHash: "a".repeat(64),
    isBinary: false,
    isGenerated: false,
    isMinified: false,
    ...overrides
  };
}

function createAdapter(params: {
  files: FileEntry[];
  contents?: Record<string, string>;
  capabilities?: Partial<AdapterCapabilities>;
  failOnList?: boolean;
}): RepositoryAdapter {
  return {
    capabilities: { ...CAPS, ...params.capabilities },
    async connect() {},
    async disconnect() {},
    async metadata() {
      return { kind: "local", defaultBranch: null, currentBranch: "main", currentCommit: "c".repeat(40), remoteUrl: null };
    },
    async currentCommit() {
      return "c".repeat(40);
    },
    async branch() {
      return "main";
    },
    async *listFiles() {
      if (params.failOnList) throw new AdapterError("REMOTE_ERROR", "liste basarisiz");
      for (const f of params.files) yield f;
    },
    async readFile(p: string) {
      const content = params.contents?.[p];
      if (content === undefined) throw new AdapterError("NOT_FOUND", "yok", p);
      return { path: p, content, contentHash: "b".repeat(64), sizeBytes: content.length, redacted: false };
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

const OPTIONS = { organizationId: "org_a", repositoryId: "repo_1" };

describe("SnapshotService — temel akış", () => {
  it("snapshot oluşturur ve dosyaları YAZAR", async () => {
    const db = createDb();
    const adapter = createAdapter({
      files: [entry({ path: "src/a.ts" }), entry({ path: "src/b.ts" }), entry({ path: "README.md" })]
    });

    const result = await new SnapshotService(db).ingest(adapter, OPTIONS);

    expect(result.status).toBe("ready");
    expect(result.fileCount).toBe(3);

    // Eski worker'in yapmadigi sey: gercekten satir yazmak.
    const fileRows = db.inserted.filter((i) => i.table === "files");
    expect(fileRows.length).toBe(3);
  });

  it("toplam bayt sayısını hesaplar", async () => {
    const db = createDb();
    const adapter = createAdapter({
      files: [entry({ path: "a.ts", sizeBytes: 120 }), entry({ path: "b.ts", sizeBytes: 380 })]
    });

    const result = await new SnapshotService(db).ingest(adapter, OPTIONS);
    expect(result.totalBytes).toBe(500);
  });

  it("snapshot'ı commit SHA'sına bağlar", async () => {
    const db = createDb();
    const adapter = createAdapter({ files: [entry({ path: "a.ts" })] });

    const result = await new SnapshotService(db).ingest(adapter, OPTIONS);
    expect(result.commitSha).toBe("c".repeat(40));

    const snapRow = db.inserted.find((i) => i.table === "repository_snapshots");
    expect(snapRow?.params).toContain("c".repeat(40));
  });

  it("başarıda snapshot'ı ready olarak işaretler", async () => {
    const db = createDb();
    await new SnapshotService(db).ingest(adapterWithOneFile(), OPTIONS);

    const update = db.updates.find((u) => u.sql.includes("'ready'"));
    expect(update).toBeDefined();
  });

  it("dosya kayıtları organization_id taşır (tenant izolasyonu)", async () => {
    const db = createDb();
    await new SnapshotService(db).ingest(adapterWithOneFile(), OPTIONS);

    const fileRow = db.inserted.find((i) => i.table === "files");
    expect(fileRow?.params).toContain("org_a");
  });
});

function adapterWithOneFile(): RepositoryAdapter {
  return createAdapter({ files: [entry({ path: "src/a.ts" })] });
}

describe("SnapshotService — idempotency", () => {
  it("aynı commit zaten ready ise yeniden işlemez", async () => {
    const db = createDb({ readySnapshot: true });
    const result = await new SnapshotService(db).ingest(adapterWithOneFile(), OPTIONS);

    expect(result.snapshotId).toBe("snap_existing");
    expect(result.fileCount).toBe(7);
    // Hicbir yeni yazim olmamali.
    expect(db.inserted.length).toBe(0);
  });
});

describe("SnapshotService — hata yolları", () => {
  it("git geçmişi yoksa UNSUPPORTED fırlatır", async () => {
    const db = createDb();
    const adapter = createAdapter({ files: [], capabilities: { hasHistory: false } });

    await expect(new SnapshotService(db).ingest(adapter, OPTIONS)).rejects.toBeInstanceOf(AdapterError);
    // Snapshot kaydi hic olusturulmamali.
    expect(db.inserted.length).toBe(0);
  });

  it("listeleme hatasında snapshot'ı failed işaretler ve hatayı YUTMAZ", async () => {
    const db = createDb();
    const adapter = createAdapter({ files: [], failOnList: true });

    await expect(new SnapshotService(db).ingest(adapter, OPTIONS)).rejects.toBeTruthy();

    const failed = db.updates.find((u) => u.sql.includes("'failed'"));
    expect(failed).toBeDefined();
    // Sebep KAYDEDILMELI — sessizce yarim kalmamali.
    expect(String(failed?.params[1])).toContain("liste basarisiz");
  });

  it("dosya sayısı sınırını aşarsa başarısız olur", async () => {
    const db = createDb();
    const many = Array.from({ length: 10 }, (_, i) => entry({ path: `f${i}.ts` }));
    const adapter = createAdapter({ files: many });

    await expect(
      new SnapshotService(db).ingest(adapter, { ...OPTIONS, maxFiles: 3 })
    ).rejects.toBeInstanceOf(AdapterError);

    const failed = db.updates.find((u) => u.sql.includes("'failed'"));
    expect(failed).toBeDefined();
  });
});

describe("SnapshotService — sınıflandırma", () => {
  it("binary dosyaları sayar ve parse_status işaretler", async () => {
    const db = createDb();
    const adapter = createAdapter({
      files: [entry({ path: "img.png", isBinary: true }), entry({ path: "a.ts" })]
    });

    const result = await new SnapshotService(db).ingest(adapter, OPTIONS);
    expect(result.skipped.binary).toBe(1);

    const binaryRow = db.inserted.find((i) => i.table === "files" && i.params.includes("img.png"));
    expect(binaryRow?.params).toContain("skipped_binary");
  });

  it("generated dosyaları sayar", async () => {
    const db = createDb();
    const adapter = createAdapter({
      files: [entry({ path: "dist/app.js", isGenerated: true }), entry({ path: "a.ts" })]
    });

    const result = await new SnapshotService(db).ingest(adapter, OPTIONS);
    expect(result.skipped.generated).toBe(1);
  });

  it("sır taraması açıkken içeriği kontrol eder ve işaretler", async () => {
    const db = createDb();
    const adapter = createAdapter({
      files: [entry({ path: "config.ts" }), entry({ path: "clean.ts" })],
      contents: {
        "config.ts": 'const t = "ghp_' + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8" + '";',
        "clean.ts": "export const a = 1;"
      }
    });

    const result = await new SnapshotService(db).ingest(adapter, { ...OPTIONS, scanSecrets: true });
    expect(result.skipped.withSecrets).toBe(1);

    const flagged = db.inserted.find((i) => i.table === "files" && i.params.includes("config.ts"));
    // contains_secret parametresi true olmali.
    expect(flagged?.params).toContain(true);
  });

  it("sır taraması kapalıyken içerik okumaz", async () => {
    const db = createDb();
    let readCount = 0;
    const base = createAdapter({ files: [entry({ path: "a.ts" })], contents: { "a.ts": "x" } });
    const adapter: RepositoryAdapter = {
      ...base,
      async readFile(p: string) {
        readCount++;
        return base.readFile(p);
      }
    };

    await new SnapshotService(db).ingest(adapter, OPTIONS);
    expect(readCount).toBe(0);
  });

  it("okunamayan dosya ingestion'ı düşürmez", async () => {
    const db = createDb();
    const adapter = createAdapter({
      files: [entry({ path: "yok.ts" }), entry({ path: "var.ts" })],
      contents: { "var.ts": "export const a = 1;" }
    });

    const result = await new SnapshotService(db).ingest(adapter, { ...OPTIONS, scanSecrets: true });
    expect(result.status).toBe("ready");
    expect(result.fileCount).toBe(2);
  });
});

describe("detectLanguage", () => {
  it("yaygın uzantıları tanır", () => {
    expect(detectLanguage("src/a.ts")).toBe("typescript");
    expect(detectLanguage("src/a.tsx")).toBe("tsx");
    expect(detectLanguage("app.py")).toBe("python");
    expect(detectLanguage("schema.sql")).toBe("sql");
    expect(detectLanguage("README.md")).toBe("markdown");
    expect(detectLanguage("main.go")).toBe("go");
  });

  it("Python dosyasını javascript SAYMAZ (P00 bulgusu)", () => {
    // Eski static-analysis.ts dili typescript/javascript olarak hard-code
    // ediyordu; .py dosyasi "javascript" etiketiyle regex parser'a gidiyordu.
    expect(detectLanguage("app.py")).not.toBe("javascript");
  });

  it("büyük/küçük harf farkını yok sayar", () => {
    expect(detectLanguage("A.TS")).toBe("typescript");
  });

  it("bilinmeyen uzantıda null döner", () => {
    expect(detectLanguage("a.xyz")).toBeNull();
    expect(detectLanguage("Makefile")).toBeNull();
  });
});

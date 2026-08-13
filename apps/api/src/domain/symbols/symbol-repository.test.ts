/**
 * P04 / Y-P04-007 — Symbol okuma katmanı testleri.
 *
 * İki soruyu yanıtlarlar:
 *   1. Sorgular tenant sınırını SQL seviyesinde koruyor mu (T-01, T-02)?
 *   2. Index durumu ÖLÇÜLEN sayıları mı döndürüyor, yoksa "başarılı" mı
 *      diyor (P00'daki `resultCount` kalıbı)?
 */

import { describe, it, expect } from "vitest";
import { SymbolRepository, type Db } from "./symbol-repository";

const SNAPSHOT_ROW = {
  id: "snap_1",
  repository_id: "repo_1",
  commit_sha: "c".repeat(40),
  status: "ready"
};

const SYMBOL_ROW = {
  symbol_id: "sym_1",
  path: "src/a.ts",
  language: "typescript",
  symbol_type: "function",
  symbol_name: "topla",
  start_line: 2,
  end_line: 4,
  start_byte: 1,
  end_byte: 60,
  content_hash: "d".repeat(64),
  parent_symbol: null,
  is_exported: true,
  exports: ["topla"],
  imports: ["./b"],
  commit_sha: "c".repeat(40),
  snapshot_id: "snap_1",
  contains_secret: false
};

function createDb(overrides: { snapshot?: any[]; rows?: Record<string, any[]> } = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db: Db & { calls: typeof calls } = {
    calls,
    async query(sql: string, params: unknown[] = []) {
      const flat = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: flat, params });

      for (const [needle, rows] of Object.entries(overrides.rows ?? {})) {
        if (flat.includes(needle)) return { rows, rowCount: rows.length };
      }
      if (/FROM repository_snapshots/i.test(flat)) {
        const rows = overrides.snapshot ?? [SNAPSHOT_ROW];
        return { rows, rowCount: rows.length };
      }
      if (/FROM symbols sym/i.test(flat)) {
        return { rows: [SYMBOL_ROW], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  return db;
}

describe("SymbolRepository — tenant izolasyonu", () => {
  it("snapshot sorgusu organization_id VE proje sahipliği üzerinden filtreler", async () => {
    const db = createDb();
    await new SymbolRepository(db).latestSnapshot("org_a", "proj_1");

    const q = db.calls.find((c) => /FROM repository_snapshots/i.test(c.sql));
    expect(q?.sql).toContain("s.organization_id = $1");
    // Repository'nin projeye ait oldugu SQL'de dogrulanir; yalniz
    // repository_id ile sorgulamak IDOR olurdu (T-01).
    expect(q?.sql).toContain("JOIN repositories r ON r.id = s.repository_id");
    expect(q?.sql).toContain("r.project_id = $2");
    expect(q?.params).toEqual(["org_a", "proj_1", null]);
  });

  it("sembol sorgusu snapshot VE organization_id ile sınırlıdır", async () => {
    const db = createDb();
    await new SymbolRepository(db).listSymbols({ organizationId: "org_a", projectId: "proj_1" });

    const q = db.calls.find((c) => /FROM symbols sym/i.test(c.sql));
    expect(q?.sql).toContain("sym.snapshot_id = $1");
    expect(q?.sql).toContain("sym.organization_id = $2");
  });

  it("başka tenant'ın repository_id'si verilse bile sorgu kendi org'una bağlı kalır", async () => {
    const db = createDb({ snapshot: [] });
    const result = await new SymbolRepository(db).listSymbols({
      organizationId: "org_a",
      projectId: "proj_1",
      repositoryId: "repo_baska_tenant"
    });

    // Snapshot bulunamaz cunku JOIN proje sahipligini dogruluyor.
    expect(result.symbols).toEqual([]);
    expect(result.snapshotId).toBeNull();
  });
});

describe("SymbolRepository — listSymbols", () => {
  it("sembolleri DTO'ya çevirir", async () => {
    const db = createDb();
    const result = await new SymbolRepository(db).listSymbols({
      organizationId: "org_a",
      projectId: "proj_1"
    });

    expect(result.symbols.length).toBe(1);
    expect(result.symbols[0]).toMatchObject({
      symbolId: "sym_1",
      symbolName: "topla",
      symbolType: "function",
      isExported: true,
      language: "typescript"
    });
    expect(result.symbols[0].exports).toEqual(["topla"]);
  });

  it("sır içeren dosyanın sembolünü işaretler (P07 girdisi)", async () => {
    const db = createDb({
      rows: { "FROM symbols sym": [{ ...SYMBOL_ROW, contains_secret: true }] }
    });
    const result = await new SymbolRepository(db).listSymbols({
      organizationId: "org_a",
      projectId: "proj_1"
    });

    expect(result.symbols[0].fileContainsSecret).toBe(true);
  });

  it("limit üst sınırı uygulanır (tek istekte tüm tablo çekilemez)", async () => {
    const db = createDb();
    await new SymbolRepository(db).listSymbols({
      organizationId: "org_a",
      projectId: "proj_1",
      limit: 100_000
    });

    const q = db.calls.find((c) => /FROM symbols sym/i.test(c.sql));
    expect(q?.params[5]).toBe(500);
  });

  it("negatif offset sıfıra çekilir", async () => {
    const db = createDb();
    await new SymbolRepository(db).listSymbols({
      organizationId: "org_a",
      projectId: "proj_1",
      offset: -50
    });

    const q = db.calls.find((c) => /FROM symbols sym/i.test(c.sql));
    expect(q?.params[6]).toBe(0);
  });

  it("hazır snapshot yoksa boş liste ve null snapshotId döner", async () => {
    const db = createDb({ snapshot: [] });
    const result = await new SymbolRepository(db).listSymbols({
      organizationId: "org_a",
      projectId: "proj_1"
    });

    // "Sembol yok" ile "snapshot yok" AYNI SEY DEGIL; ayrimi cagiran yapar.
    expect(result.snapshotId).toBeNull();
    expect(result.symbols).toEqual([]);
  });
});

describe("SymbolRepository — indexStatus", () => {
  function statusDb() {
    return createDb({
      rows: {
        "FROM files WHERE snapshot_id = $1 GROUP BY parse_status": [
          { parse_status: "parsed", count: 8, avg_confidence: 0.9 },
          { parse_status: "skipped_binary", count: 2, avg_confidence: null }
        ],
        "FROM symbols WHERE snapshot_id = $1 GROUP BY language": [
          { language: "typescript", count: 40 },
          { language: "python", count: 12 }
        ],
        "FROM chunks WHERE snapshot_id = $1": [{ count: 61 }],
        "FROM parser_versions WHERE snapshot_id = $1": [
          { parser_id: "typescript", version: "5.9.3" }
        ],
        "FROM index_jobs": [
          {
            id: "job_1",
            status: "completed",
            job_phase: "index",
            attempts: 1,
            last_error: null,
            updated_at: "2026-08-13T10:00:00.000Z",
            metadata_json: { symbolsWritten: 52, chunksWritten: 61, mode: "full" }
          }
        ]
      }
    });
  }

  it("ÖLÇÜLEN sayıları döndürür (dosya sayısı değil, yazılan satır)", async () => {
    const status = await new SymbolRepository(statusDb()).indexStatus("org_a", "proj_1", "repo_1");

    expect(status.filesTotal).toBe(10);
    expect(status.symbolsTotal).toBe(52);
    expect(status.chunksTotal).toBe(61);
    expect(status.fileCounts.parsed).toBe(8);
    expect(status.fileCounts.skipped_binary).toBe(2);
  });

  it("dil dağılımını döndürür (9 dil kabul kriterinin ölçüm noktası)", async () => {
    const status = await new SymbolRepository(statusDb()).indexStatus("org_a", "proj_1", "repo_1");
    expect(status.languages).toEqual([
      { language: "typescript", symbols: 40 },
      { language: "python", symbols: 12 }
    ]);
  });

  it("ortalama parse confidence'ı dosya sayısıyla ağırlıklandırır", async () => {
    const status = await new SymbolRepository(statusDb()).indexStatus("org_a", "proj_1", "repo_1");
    // Yalniz confidence'i olan 8 dosya sayilir: 0.9.
    expect(status.averageParseConfidence).toBeCloseTo(0.9, 5);
  });

  it("son job'ın KANITINI döndürür", async () => {
    const status = await new SymbolRepository(statusDb()).indexStatus("org_a", "proj_1", "repo_1");
    expect(status.lastJob?.status).toBe("completed");
    expect(status.lastJob?.evidence).toMatchObject({ symbolsWritten: 52, chunksWritten: 61 });
  });

  it("parser sürümlerini döndürür (determinizm girdisi)", async () => {
    const status = await new SymbolRepository(statusDb()).indexStatus("org_a", "proj_1", "repo_1");
    expect(status.parserVersions).toEqual([{ parserId: "typescript", version: "5.9.3" }]);
  });

  it("snapshot yoksa sıfır döndürür ama 'başarılı' demez", async () => {
    const db = createDb({ snapshot: [] });
    const status = await new SymbolRepository(db).indexStatus("org_a", "proj_1", "repo_1");

    expect(status.snapshotId).toBeNull();
    expect(status.snapshotStatus).toBeNull();
    expect(status.symbolsTotal).toBe(0);
  });
});

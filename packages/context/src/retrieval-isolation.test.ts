/**
 * P01 / Y-P01-008 — `packages/context/test/retrieval-isolation.test.ts` göçü.
 *
 * Önceki hali el yazımı bir `assert(name, condition)` script'iydi ve
 * **hiçbir yerden çağrılmıyordu** (P00 audit: 0 referans; ne npm script'inde
 * ne `scripts/validation-suite.ts` içinde). İçeriği değerliydi, koşumu yoktu.
 *
 * Bu sürüm vitest'e taşındı: artık `pnpm test` ile koşuyor, tek bir
 * assertion başarısız olduğunda suite kırmızıya düşüyor ve hiçbir dal
 * "bağımlılık yok" diye atlanmıyor.
 *
 * Davranış değiştirilmedi; yalnız koşum mekanizması değişti.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SearchServer } from "./search-server";
import { RetrievalRankingService } from "./retrieval-ranking-service";
import { SecretLeakedError, NotFoundError, PermissionDeniedError } from "@y/shared";

interface MockPool {
  queriesExecuted: string[];
  auditActionsLogged: string[];
  query: (sql: string, params?: any[]) => Promise<any>;
}

function createMockPool(): MockPool {
  const pool: MockPool = {
    queriesExecuted: [],
    auditActionsLogged: [],
    query: async (sql: string, params: any[] = []): Promise<any> => {
      pool.queriesExecuted.push(sql);

      if (sql.includes("INSERT INTO audit_logs")) {
        if (params && params[3]) pool.auditActionsLogged.push(params[3]);
      }

      if (/FROM\s+projects/i.test(sql)) {
        if (params[0] === "proj_not_exist") return { rowCount: 0, rows: [] };
        return { rowCount: 1, rows: [{ id: params[0], name: "Test Project" }] };
      }

      if (/FROM\s+tasks/i.test(sql)) {
        if (params[0] === "task_cross_project") {
          return {
            rowCount: 1,
            rows: [{ id: "task_cross_project", project_id: "other_project_999", title: "Cross task" }]
          };
        }
        if (params[0] === "task_valid") {
          return {
            rowCount: 1,
            rows: [
              {
                id: "task_valid",
                project_id: "proj_valid_123",
                title: "Implement security validation credentials flow",
                category: "Security"
              }
            ]
          };
        }
        return { rowCount: 0, rows: [] };
      }

      if (/FROM\s+context_items/i.test(sql)) {
        return {
          rowCount: 2,
          rows: [
            {
              id: "item_auth",
              project_id: params[0],
              source_type: "code",
              source_uri: "src/auth.ts",
              created_at: new Date(Date.now() - 3_600_000),
              updated_at: new Date(Date.now() - 1_800_000)
            },
            {
              id: "item_spec",
              project_id: params[0],
              source_type: "markdown",
              source_uri: "docs/architecture.md",
              created_at: new Date(Date.now() - 86_400_000),
              updated_at: new Date(Date.now() - 43_200_000)
            }
          ]
        };
      }

      if (/FROM\s+context_chunks/i.test(sql)) {
        return {
          rowCount: 2,
          rows: [
            {
              id: "chunk_auth_0",
              context_item_id: "item_auth",
              chunk_index: 0,
              content: "Implement validation credentials auth method.",
              token_count: 85
            },
            {
              id: "chunk_spec_0",
              context_item_id: "item_spec",
              chunk_index: 0,
              content: "High integrity architecture specification. Decouples search paths.",
              token_count: 140
            }
          ]
        };
      }

      return { rowCount: 1, rows: [] };
    }
  };
  return pool;
}

const mockGraphService: any = {
  getGraph: async () => ({
    nodes: [
      { id: "task_valid", taskId: "task_valid", label: "Implement security validation credentials flow" },
      { id: "item_auth", contextItemId: "item_auth", label: "src/auth.ts" },
      { id: "item_spec", contextItemId: "item_spec", label: "docs/architecture.md" }
    ],
    edges: [
      { source: "task_valid", target: "item_auth", relationship: "belongs_to", weight: 1.0 },
      { source: "task_valid", target: "item_spec", relationship: "references", weight: 0.8 }
    ]
  })
};

/** Sızıntı testinde kullanılan sahte credential — parça parça kurulur ki
 *  secret scanner'ın kendi kaynağımızda bulguya dönüşmesin. */
const leakedQuery = "postgres" + "ql://" + "postgres" + ":" + "mysecretpassword123" + "@api-database.internal:5432/y-os-production";

describe("SearchServer backend modları", () => {
  let pool: MockPool;
  beforeEach(() => {
    pool = createMockPool();
  });

  it("bilinmeyen backend modu SESSIZCE bos donmez, hata verir", async () => {
    // P06 / Y-P06-012: statik bellek stub modu silindi. O mod uc uydurma
    // dosya donduruyordu (`src/services/auth.ts` dahil) ve bu testin eski
    // hali tam da o uydurmayi dogruluyordu.
    const server = new SearchServer(null as any, "kaldirilmis_mod" as any);
    await expect(
      server.queryCandidates({ project_id: "proj_valid_123", query: "auth" } as any)
    ).rejects.toThrow(/Unsupported SearchServer kind/);
  });

  it("external_stub_only uzak aday üretmez (dürüst boş dizi)", async () => {
    const server = new SearchServer(null as any, "external_stub_only");
    const candidates = await server.queryCandidates({ project_id: "proj_valid_123", query: "context" } as any);
    expect(candidates.length).toBe(0);
  });

  it("local_sql tablodan çeker ve skora göre azalan sıralar", async () => {
    const server = new SearchServer(pool as any, "local_sql");
    const candidates = await server.queryCandidates({ project_id: "proj_valid_123", query: "validation" } as any);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].final_score).toBeGreaterThanOrEqual(candidates[1].final_score);
  });
});

describe("RetrievalRankingService güvenlik korumaları", () => {
  let pool: MockPool;
  let service: RetrievalRankingService;

  beforeEach(() => {
    pool = createMockPool();
    const server = new SearchServer(pool as any, "local_sql");
    service = new RetrievalRankingService(pool as any, server, mockGraphService);
  });

  it("var olmayan projede arama NotFoundError fırlatır", async () => {
    await expect(
      service.queryAndRankDirect({ project_id: "proj_not_exist", query: "schema query" } as any)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("başka projeye ait task ile çağrı PermissionDeniedError fırlatır", async () => {
    await expect(
      service.queryAndRankDirect({
        project_id: "proj_valid_123",
        task_id: "task_cross_project",
        query: "cross boundaries"
      } as any)
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("sorgu içindeki ham DB credential'ı SecretLeakedError fırlatır", async () => {
    await expect(
      service.queryAndRankDirect({ project_id: "proj_valid_123", query: leakedQuery } as any)
    ).rejects.toBeInstanceOf(SecretLeakedError);
  });
});

describe("Strateji tabanlı sıralama ve token bütçesi", () => {
  let pool: MockPool;
  let service: RetrievalRankingService;

  beforeEach(() => {
    pool = createMockPool();
    const server = new SearchServer(pool as any, "local_sql");
    service = new RetrievalRankingService(pool as any, server, mockGraphService);
  });

  it("hybrid_local stratejisi çözülür ve etiketlenir", async () => {
    const res = await service.queryAndRankDirect({
      project_id: "proj_valid_123",
      task_id: "task_valid",
      query: "validation"
    } as any);
    expect(res.candidates.length).toBeGreaterThan(0);
    expect(res.ranking_strategy).toBe("hybrid_local_mvp");
  });

  it("graph ağırlıklandırma belongs_to ve references katkısını işaretler", async () => {
    const res = await service.queryAndRankDirect({
      project_id: "proj_valid_123",
      task_id: "task_valid",
      query: "validation",
      include_graph_weights: true
    } as any);

    expect(res.ranking_strategy).toBe("graph_weighted_mvp");
    expect(res.candidates.find((c: any) => c.id === "item_auth")?.reason_codes).toContain("GRAPH_PRIMARY_BELONGS_TO");
    expect(res.candidates.find((c: any) => c.id === "item_spec")?.reason_codes).toContain("GRAPH_RELATED_REFERENCES");
  });

  it("token bütçesi seçimi sıkı biçimde sınırlar", async () => {
    // chunk toplamı 85 + 140 = 225; bütçe 100 → yalnız item_auth sığar
    const res = await service.queryAndRankDirect({
      project_id: "proj_valid_123",
      task_id: "task_valid",
      query: "validation",
      budget_tokens: 100
    } as any);
    expect(res.selected.length).toBe(1);
    expect(res.selected[0].id).toBe("item_auth");
  });
});

describe("Audit olaylarının yazılması", () => {
  let pool: MockPool;
  let service: RetrievalRankingService;

  beforeEach(() => {
    pool = createMockPool();
    const server = new SearchServer(pool as any, "local_sql");
    service = new RetrievalRankingService(pool as any, server, mockGraphService);
  });

  it("başarılı akışta dört standart audit olayı yazılır", async () => {
    await service.queryAndRankDirect({
      project_id: "proj_valid_123",
      task_id: "task_valid",
      query: "validation"
    } as any);

    expect(pool.auditActionsLogged).toContain("RETRIEVAL_RANKING_REQUESTED");
    expect(pool.auditActionsLogged).toContain("RETRIEVAL_CANDIDATES_SELECTED");
    expect(pool.auditActionsLogged).toContain("RETRIEVAL_BUDGET_APPLIED");
    expect(pool.auditActionsLogged).toContain("RETRIEVAL_RANKING_COMPLETED");
  });

  it("sır tespitinde RETRIEVAL_SECRET_REDACTED yazılır", async () => {
    await expect(
      service.queryAndRankDirect({ project_id: "proj_valid_123", query: leakedQuery } as any)
    ).rejects.toBeTruthy();
    expect(pool.auditActionsLogged).toContain("RETRIEVAL_SECRET_REDACTED");
  });

  it("cross-project denemesinde RETRIEVAL_CROSS_PROJECT_ACCESS_BLOCKED yazılır", async () => {
    await expect(
      service.queryAndRankDirect({
        project_id: "proj_valid_123",
        task_id: "task_cross_project",
        query: "cross boundaries"
      } as any)
    ).rejects.toBeTruthy();
    expect(pool.auditActionsLogged).toContain("RETRIEVAL_CROSS_PROJECT_ACCESS_BLOCKED");
  });
});

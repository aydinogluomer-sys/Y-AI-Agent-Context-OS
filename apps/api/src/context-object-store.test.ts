/**
 * P09 / Y-P09-008 — P0-10 (SQL enjeksiyonu) regresyon testleri.
 *
 * ESKİ HALİ
 *
 *     const res = await this.query(
 *       `SELECT project_id FROM ${sourceTable} WHERE id = $1 LIMIT 1;`,
 *       [sourceId]
 *     );
 *
 *   `sourceTable` istek gövdesinden (`dto.source_table`) geliyordu ve
 *   doğrudan SQL'e interpole ediliyordu.
 *
 *   Daha da kötüsü: sorgu bir `try/catch` içindeydi ve hata
 *   `sysLogger.debug` ile YUTULUYORDU. Bir enjeksiyon denemesi hiçbir
 *   alarm üretmeden sessizce geçiyordu — saldırganın en sevdiği durum.
 *
 * BU TESTLERİN DOĞRULADIĞI
 *   1. Kötü niyetli tablo adı SQL'e ULAŞMIYOR.
 *   2. Bilinmeyen tablo adı SESSİZCE GEÇİLMİYOR, reddediliyor.
 *   3. Bilinen tablolar için kapsam kontrolü hâlâ çalışıyor.
 */

import { describe, it, expect } from "vitest";
import { ContextObjectStoreService } from "./ContextObjectStoreService";

function createService(rows: any[] = []) {
  const queries: { sql: string; params: unknown[] }[] = [];

  const query = async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (/FROM projects/i.test(sql)) return { rows: [{ id: "proj_1" }], rowCount: 1 };
    if (/FROM tasks/i.test(sql)) {
      return { rows: [{ id: "task_1", project_id: "proj_1" }], rowCount: 1 };
    }
    return { rows, rowCount: rows.length };
  };

  const service = new ContextObjectStoreService(query as any, (async () => ({})) as any);
  return { service, queries };
}

const INJECTIONS = [
  "users; DROP TABLE context_items; --",
  "context_items WHERE 1=1 UNION SELECT password FROM users --",
  "pg_shadow",
  "context_items/**/UNION/**/SELECT",
  "'; DELETE FROM projects; --"
];

describe("validateSourceScope — P0-10: kötü niyetli tablo adı SQL'e ulaşmaz", () => {
  for (const injection of INJECTIONS) {
    it(`reddeder: ${injection.slice(0, 40)}`, async () => {
      const { service, queries } = createService();

      await expect(
        service.validateSourceScope("proj_1", injection, "src_1")
      ).rejects.toThrow(/Desteklenmeyen source_table/);

      // En kritik iddia: bu metin HICBIR sorguya girmedi.
      for (const q of queries) {
        expect(q.sql).not.toContain(injection);
        expect(q.sql).not.toContain("DROP");
        expect(q.sql).not.toContain("UNION");
      }
    });
  }

  it("bilinmeyen tablo SESSİZCE GEÇİLMEZ", async () => {
    // Eski kod hatayi `sysLogger.debug` ile yutuyordu: kapsam
    // dogrulanamayan bir referans kabul ediliyordu.
    const { service } = createService();
    await expect(service.validateSourceScope("proj_1", "bilinmeyen_tablo", "x")).rejects.toThrow(
      /Kapsam dogrulamasi yapilamayan/
    );
  });

  it("bilinmeyen tablo için hiç sorgu çalıştırılmaz", async () => {
    const { service, queries } = createService();
    await service.validateSourceScope("proj_1", "bilinmeyen", "x").catch(() => undefined);
    expect(queries.length).toBe(0);
  });
});

describe("validateSourceScope — meşru yollar korunuyor", () => {
  it("kaynak yoksa kontrol atlanır", async () => {
    const { service, queries } = createService();
    await service.validateSourceScope("proj_1", null, null);
    expect(queries.length).toBe(0);
  });

  it("tasks için görev kapsamı doğrulanır", async () => {
    const { service, queries } = createService();
    await service.validateSourceScope("proj_1", "tasks", "task_1");
    expect(queries.some((q) => /FROM tasks/i.test(q.sql))).toBe(true);
  });

  it("başka projenin görevi reddedilir", async () => {
    const queries: { sql: string; params: unknown[] }[] = [];
    const query = async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return { rows: [{ id: "task_1", project_id: "baska_proje" }], rowCount: 1 };
    };
    const service = new ContextObjectStoreService(query as any, (async () => ({})) as any);

    await expect(service.validateSourceScope("proj_1", "tasks", "task_1")).rejects.toThrow(
      /boundaries violation/i
    );
  });

  it("projects için kimlik eşleşmesi aranır", async () => {
    const { service } = createService();
    await service.validateSourceScope("proj_1", "projects", "proj_1");
    await expect(service.validateSourceScope("proj_1", "projects", "baska")).rejects.toThrow(
      /boundary violation/i
    );
  });

  it("izin verilen tablo için kapsam sorgusu çalışır", async () => {
    const { service, queries } = createService([{ project_id: "proj_1" }]);
    await service.validateSourceScope("proj_1", "context_items", "item_1");

    const scopeQuery = queries.find((q) => /FROM context_items/i.test(q.sql));
    expect(scopeQuery).toBeDefined();
    // Kimlik PARAMETRE olarak gecer.
    expect(scopeQuery?.params).toEqual(["item_1"]);
  });

  it("izin verilen tabloda cross-project referans reddedilir", async () => {
    const { service } = createService([{ project_id: "baska_proje" }]);
    await expect(
      service.validateSourceScope("proj_1", "context_items", "item_1")
    ).rejects.toThrow(/boundaries violation/i);
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import {
  isReadOnlyStatement,
  isConnectionError,
  queryWithReadRetry
} from "./db-retry";

const OK = { rows: [], rowCount: 0 };
const CONN = () => new Error("terminating connection due to administrator command");

describe("isReadOnlyStatement", () => {
  it("SELECT salt-okunur sayılır (baştaki boşluk ve yorum dahil)", () => {
    expect(isReadOnlyStatement("SELECT 1")).toBe(true);
    expect(isReadOnlyStatement("  \n select id from t")).toBe(true);
    expect(isReadOnlyStatement("-- yorum\nSELECT 1")).toBe(true);
  });

  it("yazma ifadeleri salt-okunur SAYILMAZ", () => {
    for (const sql of ["INSERT INTO t VALUES (1)", "UPDATE t SET a=1", "DELETE FROM t", "TRUNCATE t"]) {
      expect(isReadOnlyStatement(sql)).toBe(false);
    }
  });

  it("CTE'ler salt-okunur SAYILMAZ — `WITH ... INSERT` geçerli bir yazmadır", () => {
    // Ayirt etmek SQL ayristirmak gerektirirdi. Supheli durumda yeniden
    // DENEMEMEK dogru taraftir.
    expect(isReadOnlyStatement("WITH x AS (SELECT 1) SELECT * FROM x")).toBe(false);
  });
});

describe("queryWithReadRetry", () => {
  it("POZİTİF KONTROL: hata yoksa TEK kez çalışır", async () => {
    let calls = 0;
    await queryWithReadRetry(async () => { calls++; return OK; }, "SELECT 1");
    expect(calls).toBe(1);
  });

  it("bağlantı hatasında SELECT bir kez YENİDEN denenir", async () => {
    let calls = 0;
    const res = await queryWithReadRetry(async () => {
      calls++;
      if (calls === 1) throw CONN();
      return { rows: [{ ok: true }], rowCount: 1 };
    }, "SELECT 1");

    expect(calls).toBe(2);
    expect(res.rowCount).toBe(1);
  });

  it("YAZMA bağlantı hatasında yeniden DENENMEZ", async () => {
    /*
     * En onemli test. Baglanti koptugunda "ifade hic ulasmadi" ile
     * "ifade CALISTI ama yanit kayboldu" ayirt edilemez. Ikincisinde
     * yeniden denemek IKINCI KEZ yazardi.
     */
    let calls = 0;
    await expect(
      queryWithReadRetry(async () => { calls++; throw CONN(); }, "INSERT INTO t VALUES (1)")
    ).rejects.toThrow(/terminating connection/);

    expect(calls).toBe(1);
  });

  it("bağlantı DIŞI hata yeniden DENENMEZ", async () => {
    // Sozdizimi hatasi ya da kisit ihlali tekrar denemekle duzelmez;
    // denemek yalnizca yuku ikiye katlar.
    let calls = 0;
    await expect(
      queryWithReadRetry(async () => { calls++; throw new Error("syntax error at or near"); }, "SELECT 1")
    ).rejects.toThrow(/syntax error/);

    expect(calls).toBe(1);
  });

  it("ikinci deneme de düşerse hata YUTULMAZ", async () => {
    let calls = 0;
    await expect(
      queryWithReadRetry(async () => { calls++; throw CONN(); }, "SELECT 1")
    ).rejects.toThrow(/terminating connection/);

    expect(calls).toBe(2);
  });
});

describe("isConnectionError", () => {
  it("bağlantı hatalarını tanır", () => {
    for (const m of ["terminating connection", "Connection terminated unexpectedly", "socket hang up", "ECONNRESET"]) {
      expect(isConnectionError(new Error(m))).toBe(true);
    }
  });

  it("SQL hatalarını bağlantı hatası SAYMAZ", () => {
    expect(isConnectionError(new Error('relation "x" does not exist'))).toBe(false);
  });
});

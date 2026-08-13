/**
 * P01 / Y-P01-008 — İlk gerçek unit test.
 *
 * Bu dosya bilinçli olarak "assert(true)" içermez ve hiçbir bağımlılık
 * eksikliğinde atlanmaz. Repo'daki önceki doğrulama script'leriyle farkı budur.
 */

import { describe, it, expect } from "vitest";
import { newId, newSortableId, isValidId } from "./ids";

describe("newId", () => {
  it("prefix verilmediğinde UUID v4 üretir", () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("prefix'i id'ye ekler ve ayrıştırılabilir bırakır", () => {
    const id = newId("run");
    expect(id.startsWith("run_")).toBe(true);
    expect(isValidId(id)).toBe(true);
  });

  it("geçersiz prefix'i reddeder", () => {
    expect(() => newId("Run")).toThrow(TypeError);
    expect(() => newId("9run")).toThrow(TypeError);
    expect(() => newId("run-id")).toThrow(TypeError);
    expect(() => newId("x".repeat(25))).toThrow(TypeError);
  });

  it("100.000 üretimde çakışma vermez", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100_000; i++) seen.add(newId());
    expect(seen.size).toBe(100_000);
  });

  it("Math.random tabanlı eski kalıptan ölçülebilir biçimde daha uzun/entropiktir", () => {
    // Eski kalıp: Math.random().toString(36).substring(2, 11) -> 9 karakter
    const legacyLength = 9;
    expect(newId().length).toBeGreaterThan(legacyLength * 3);
  });
});

describe("newSortableId", () => {
  it("zaman içinde monoton artar", async () => {
    const first = newSortableId();
    await new Promise((r) => setTimeout(r, 5));
    const second = newSortableId();
    expect(second > first).toBe(true);
  });

  it("26 karakterlik Crockford base32 gövdesi üretir", () => {
    const id = newSortableId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(isValidId(id)).toBe(true);
  });

  it("prefix ile de doğrulanabilir kalır", () => {
    expect(isValidId(newSortableId("evt"))).toBe(true);
  });

  it("10.000 üretimde çakışma vermez", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(newSortableId());
    expect(seen.size).toBe(10_000);
  });
});

describe("isValidId", () => {
  it("eski Math.random tabanlı id'leri geçersiz sayar", () => {
    // Bu, göç sırasında kalıntı kimlik biçimlerini yakalamak içindir.
    const legacy = Math.random().toString(36).substring(2, 11);
    expect(isValidId(legacy)).toBe(false);
  });

  it("boş ve string olmayan girdileri reddeder", () => {
    expect(isValidId("")).toBe(false);
    expect(isValidId(null)).toBe(false);
    expect(isValidId(42)).toBe(false);
    expect(isValidId(undefined)).toBe(false);
  });
});

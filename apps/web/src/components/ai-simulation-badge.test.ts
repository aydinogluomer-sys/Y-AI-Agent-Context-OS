import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalAiSimulation } from "../lib/api/ai";

const HERE = dirname(fileURLToPath(import.meta.url));
const PANEL = readFileSync(
  resolve(HERE, "./AIMissionControlPanel.tsx"),
  "utf8"
);

/**
 * P17 / ADR-056 — simulasyon rozeti VERIDEN turer, elle tutulan bir
 * alandan degil.
 *
 * Rozet daha once `lastRunMode` adli ayri bir state'ten okunuyordu ve her
 * cagri yerinde elle guncelleniyordu. Yeni bir cagri yeri eklenip o satir
 * unutuldugunda rozet, gosterdigi sonucla ilgisiz bir sey soylemeye devam
 * ederdi.
 */
describe("ADR-056 — simulasyon rozeti veriden turer", () => {
  it("yerel simulasyon isFallback: true tasir", () => {
    const sim = createLocalAiSimulation("bir gorev");
    expect(sim.isFallback).toBe(true);
  });

  it("gorev metninden bagimsiz olarak HER ZAMAN fallback isaretli", () => {
    // Rozet bu alana guveniyor; alanin bazi girdilerde dusmesi rozeti
    // sessizce yalanci yapardi.
    for (const task of ["ui tasarim", "postgres schema", "auth jwt", ""]) {
      expect(createLocalAiSimulation(task).isFallback).toBe(true);
    }
  });

  it("panelde ELLE tutulan lastRunMode state'i YOK", () => {
    // Kalibi parcalardan kuruyoruz ki bu dosyanin kendisi eslesmesin.
    const HAND_FIELD = "last" + "RunMode";
    const NEWLINE = String.fromCharCode(10);
    const offenders = PANEL.split(NEWLINE)
      .map((l) => l.trim())
      // Eski kalibi ACIKLAYAN yorumlar mesru.
      .filter((l) => !l.startsWith("*") && !l.startsWith("//") && !l.startsWith("/*"))
      .filter((l) => l.includes(HAND_FIELD));
    expect(offenders).toEqual([]);
  });

  it("rozet isFallback'ten turetiliyor", () => {
    expect(PANEL).toContain("result.isFallback !== true");
  });

  it("POZITIF KONTROL: panel gercekten okunuyor", () => {
    expect(PANEL.length).toBeGreaterThan(5000);
    expect(PANEL).toContain("isProviderBacked");
  });
});

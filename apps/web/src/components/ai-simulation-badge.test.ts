import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLocalAiSimulation,
  isMeasured,
  type SimulatedAiResult,
  type MeasuredAiAnalysis,
  type AiAnalysisResult
} from "../lib/api/ai";

const HERE = dirname(fileURLToPath(import.meta.url));
const PANEL = readFileSync(resolve(HERE, "./AIMissionControlPanel.tsx"), "utf8");
const API = readFileSync(resolve(HERE, "../lib/api/ai.ts"), "utf8");
const SERVER = readFileSync(resolve(HERE, "../../../../server.ts"), "utf8");

/**
 * P17 / ADR-056 · spec §37 — "Production DTO ile simulation DTO aynı
 * olmamalıdır."
 *
 * Önceki hâlde `AiSimulationResponse` HEM gerçek sağlayıcı çağrısının HEM
 * yerel üretecin dönüş tipiydi; simülasyon sonucu ölçülmüş sonuç bekleyen
 * her yere derleme hatası vermeden geçebiliyordu.
 *
 * Rozet ise `lastRunMode` adlı elle tutulan bir state'ten okunuyordu ve
 * "Sağlayıcı Destekli" diyordu — oysa `/api/simulate-task` bir dil
 * modeline dosya yolu ÜRETTİRİYOR, repository indeksinden okumuyor.
 */
describe("ADR-056 · spec §37 — simülasyon tip düzeyinde ayrı", () => {
  it("yerel simülasyon origin ve kaynak taşır", () => {
    const sim = createLocalAiSimulation("bir görev");
    expect(sim.origin).toBe("simulation");
    expect(sim.simulationSource).toBe("local");
    expect(sim.simulationReason.length).toBeGreaterThan(10);
  });

  it("görev metninden BAĞIMSIZ olarak her zaman simülasyon işaretli", () => {
    // Alanın bazı girdilerde düşmesi rozeti sessizce yalancı yapardı.
    for (const task of ["ui tasarım", "postgres schema", "auth jwt", ""]) {
      const r = createLocalAiSimulation(task);
      expect(r.origin).toBe("simulation");
      expect(r.isFallback).toBe(true);
    }
  });

  it("simülasyon sonucu ÖLÇÜLMÜŞ sayılmaz", () => {
    const sim: AiAnalysisResult = createLocalAiSimulation("x");
    expect(isMeasured(sim)).toBe(false);
  });

  it("ölçülmüş analiz manifest hash'i taşımak ZORUNDA", () => {
    // Kanıtsız "ölçülmüş" sonuç olamaz. Bu nesne yalnız tip sözleşmesini
    // gösterir; sistem henüz MeasuredAiAnalysis ÜRETMİYOR.
    const measured: MeasuredAiAnalysis = {
      ...createLocalAiSimulation("x"),
      origin: "measured",
      manifestHash: "a".repeat(64)
    } as MeasuredAiAnalysis;
    expect(isMeasured(measured)).toBe(true);
    expect(measured.manifestHash).toHaveLength(64);
  });

  it("simülasyon ölçülmüş metrik TAŞIMAZ (ADR-032)", () => {
    const sim = createLocalAiSimulation("auth jwt");
    expect(sim.contextOS.confidenceScore).toBeNull();
    expect(sim.contextOS.totalScannedDocs).toBeNull();
  });
});

describe("kaynak kilidi — eski kalıplar geri gelemez", () => {
  // Kalıpları PARÇALARDAN kuruyoruz ki bu dosya taramada eşleşmesin.
  const HAND_FIELD = "last" + "RunMode";
  const OLD_DTO = "Ai" + "SimulationResponse";
  const NEWLINE = String.fromCharCode(10);

  function codeLines(src: string): string[] {
    return src
      .split(NEWLINE)
      .map((l) => l.trim())
      // Eski kalıbı AÇIKLAYAN yorumlar meşrudur.
      .filter((l) => !l.startsWith("*") && !l.startsWith("//") && !l.startsWith("/*"));
  }

  it("panelde elle tutulan lastRunMode state'i yok", () => {
    expect(codeLines(PANEL).filter((l) => l.includes(HAND_FIELD))).toEqual([]);
  });

  it("birleşik DTO adı kodda kalmadı", () => {
    expect(codeLines(API).filter((l) => l.includes(OLD_DTO))).toEqual([]);
    expect(codeLines(PANEL).filter((l) => l.includes(OLD_DTO))).toEqual([]);
  });

  it("sunucu LLM yanıtını doğrulamadan geçirmiyor", () => {
    // Eski hâli: JSON.parse(...) sonucunu doğrudan res.json'a veriyordu.
    expect(SERVER).toContain("stripFabricatedMetrics");
    const raw = codeLines(SERVER).filter((l) => l.includes("res.json(parsedData)"));
    expect(raw).toEqual([]);
  });

  it("POZİTİF KONTROL: dosyalar gerçekten okunuyor", () => {
    expect(PANEL.length).toBeGreaterThan(5000);
    expect(API.length).toBeGreaterThan(3000);
    expect(SERVER.length).toBeGreaterThan(3000);
    expect(codeLines(PANEL).length).toBeGreaterThan(100);
  });

  it("POZİTİF KONTROL: kalıplar gerçek metinde eşleşiyor", () => {
    expect(codeLines(`const [${HAND_FIELD}, set] = useState();`)).toHaveLength(1);
    expect(codeLines(`let x: ${OLD_DTO};`)[0]).toContain(OLD_DTO);
  });
});

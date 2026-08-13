/**
 * P01 / Y-P01-001 — Domain sözleşmelerinin davranış testleri.
 *
 * Bu tipler yalnız şekil tanımı değil; içlerindeki saf fonksiyonlar
 * P02–P14'ün güvenlik kararlarını taşıyor. Her biri burada doğrulanır.
 */

import { describe, it, expect } from "vitest";

import { projectRoleAtLeast, orgRoleAtLeast, FAIL_CLOSED_DENIAL } from "./identity";
import { production, simulated, isProduction, requiresProvenanceBadge } from "./provenance";
import {
  RUN_STATES,
  TERMINAL_STATES,
  canTransition,
  guardTransition,
  isTerminal,
  RUN_EVENT_TYPES,
  type RunState
} from "./run";
import { computeAvailableBudget, provenanceCoverage } from "./context";
import { decideVerdict } from "./change";

/**
 * Not: `tsconfig.json`'da `strict` acik olmadigi icin discriminated union
 * daraltmasi (`if (!res.ok) res.reason`) calismiyor. Bu bir P00 sonrasi
 * bulgudur ve P19'da (Y-P19-004, eslint + strict mode) kapatilacaktir.
 * Testler bu arada daraltmaya bagimli olmadan yazilir.
 */
function denialReason(res: { ok: boolean } & { reason?: string }): string {
  return res.reason ?? "";
}

describe("rol hiyerarşisi", () => {
  it("proje rolleri doğru sıralanır", () => {
    expect(projectRoleAtLeast("maintainer", "developer")).toBe(true);
    expect(projectRoleAtLeast("developer", "maintainer")).toBe(false);
    expect(projectRoleAtLeast("viewer", "viewer")).toBe(true);
    expect(projectRoleAtLeast("reviewer", "developer")).toBe(false);
  });

  it("org rolleri doğru sıralanır", () => {
    expect(orgRoleAtLeast("owner", "admin")).toBe(true);
    expect(orgRoleAtLeast("member", "admin")).toBe(false);
  });

  it("fail-closed reddi policy store erişilemezliğini işaret eder", () => {
    expect(FAIL_CLOSED_DENIAL).toBe("POLICY_STORE_UNAVAILABLE");
  });
});

describe("provenance ayrımı (ADR-015)", () => {
  it("production sonucu evidence referansı olmadan üretilemez", () => {
    expect(() => production({ a: 1 }, "")).toThrow();
    expect(isProduction(production({ a: 1 }, "sha256:abc"))).toBe(true);
  });

  it("simüle sonuç sebep olmadan üretilemez", () => {
    expect(() => simulated({ a: 1 }, "")).toThrow();
    expect(() => simulated({ a: 1 }, "   ")).toThrow();
  });

  it("production olmayan her sonuç rozet gerektirir", () => {
    expect(requiresProvenanceBadge(simulated({ a: 1 }, "saglayici erisilemez"))).toBe(true);
    expect(requiresProvenanceBadge(production({ a: 1 }, "sha256:abc"))).toBe(false);
  });

  it("DEMO ve FIXTURE de rozet gerektirir", () => {
    expect(requiresProvenanceBadge(simulated({}, "demo", "DEMO"))).toBe(true);
    expect(requiresProvenanceBadge(simulated({}, "fixture", "FIXTURE"))).toBe(true);
  });
});

describe("Run FSM", () => {
  it("13 durum tanımlı", () => {
    expect(RUN_STATES.length).toBe(13);
  });

  it("18 olay tipi tanımlı (master plan §17)", () => {
    expect(RUN_EVENT_TYPES.length).toBe(18);
  });

  it("terminal durumlardan çıkış yoktur (ADR-047)", () => {
    for (const state of TERMINAL_STATES) {
      expect(isTerminal(state)).toBe(true);
      for (const target of RUN_STATES) {
        expect(canTransition(state, target), `${state} -> ${target} olmamali`).toBe(false);
      }
    }
  });

  it("tamamlanmış run iptal edilemez", () => {
    // P00 bulgusu: mevcut cancel handler'i durum kontrolu yapmiyordu ve
    // zaten "completed" olmus bir run'a cancelled event'i ekliyordu.
    expect(canTransition("completed", "cancelled")).toBe(false);
  });

  it("geçerli mutlu yol geçişleri tanımlı", () => {
    const happyPath: RunState[] = [
      "created",
      "queued",
      "preparing_context",
      "awaiting_policy",
      "ready",
      "running",
      "verifying",
      "completed"
    ];
    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(canTransition(happyPath[i], happyPath[i + 1]), `${happyPath[i]} -> ${happyPath[i + 1]}`).toBe(true);
    }
  });

  it("manifest olmadan ready'e geçilemez (ADR-046)", () => {
    const res = guardTransition("awaiting_policy", "ready", {
      hasManifest: false,
      hasChangeBoundary: true,
      hasAgentSession: false
    });
    expect(res.ok).toBe(false);
    expect(denialReason(res)).toContain("manifest");
  });

  it("change boundary olmadan running'e geçilemez (ADR-046)", () => {
    const res = guardTransition("ready", "running", {
      hasManifest: true,
      hasChangeBoundary: false,
      hasAgentSession: false
    });
    expect(res.ok).toBe(false);
    expect(denialReason(res)).toContain("boundary");
  });

  it("koşullar sağlandığında geçişe izin verir", () => {
    expect(
      guardTransition("awaiting_policy", "ready", {
        hasManifest: true,
        hasChangeBoundary: true,
        hasAgentSession: false
      }).ok
    ).toBe(true);
  });
});

describe("token bütçesi (ADR-031)", () => {
  const base = {
    providerContextLimit: 200_000,
    systemPromptReserve: 5_000,
    toolDefinitionReserve: 5_000,
    expectedOutputTokens: 8_000,
    safetyMargin: 2_000,
    policyCeiling: null,
    tokenizerId: "test"
  };

  it("bütçe sağlayıcı limitinden rezervler düşülerek hesaplanır", () => {
    expect(computeAvailableBudget(base)).toBe(180_000);
  });

  it("policy tavanı bütçeyi yukarıdan sınırlar", () => {
    expect(computeAvailableBudget({ ...base, policyCeiling: 50_000 })).toBe(50_000);
  });

  it("tavan hesaplanandan büyükse etkisizdir", () => {
    expect(computeAvailableBudget({ ...base, policyCeiling: 900_000 })).toBe(180_000);
  });

  it("rezervler limiti aşarsa negatif döner (çağıran reddetmeli)", () => {
    // P08 acceptance: negatif butce ile devam edilmez, compile
    // `insufficient_budget` ile basarisiz olur.
    const tight = { ...base, providerContextLimit: 1_000 };
    expect(computeAvailableBudget(tight)).toBeLessThan(0);
  });

  it("50.000 bir ürün sabiti değildir", () => {
    // Farkli saglayici limitleri farkli butceler uretmeli.
    const a = computeAvailableBudget({ ...base, providerContextLimit: 128_000 });
    const b = computeAvailableBudget({ ...base, providerContextLimit: 1_000_000 });
    expect(a).not.toBe(b);
  });
});

describe("provenance kapsaması (ADR-036)", () => {
  it("her aday items veya exclusions'ta ise kapsama 1.0", () => {
    const cov = provenanceCoverage(10, {
      items: Array(6).fill({}) as any,
      exclusions: Array(4).fill({}) as any
    });
    expect(cov).toBe(1);
  });

  it("kayıp aday kapsamayı 1.0'ın altına düşürür", () => {
    const cov = provenanceCoverage(10, {
      items: Array(6).fill({}) as any,
      exclusions: Array(2).fill({}) as any
    });
    expect(cov).toBeLessThan(1);
  });

  it("aday yoksa kapsama tanımlı ve 1.0", () => {
    expect(provenanceCoverage(0, { items: [], exclusions: [] })).toBe(1);
  });
});

describe("Change Firewall karar sırası (ADR-038)", () => {
  it("DENY her zaman kazanır", () => {
    expect(
      decideVerdict({ denied: true, approval: true, expected: true, allowed: true }).verdict
    ).toBe("DENY");
  });

  it("APPROVAL, expected/allowed'ı geçersiz kılar", () => {
    expect(
      decideVerdict({ denied: false, approval: true, expected: true, allowed: true }).verdict
    ).toBe("ASK_APPROVAL");
  });

  it("expected kümesi ALLOW verir", () => {
    const r = decideVerdict({ denied: false, approval: false, expected: true, allowed: false });
    expect(r.verdict).toBe("ALLOW");
    expect(r.ruleMatched).toBe("expected");
  });

  it("hiçbir kümeye uymayan yol varsayılan olarak REDDEDİLİR", () => {
    const r = decideVerdict({ denied: false, approval: false, expected: false, allowed: false });
    expect(r.verdict).toBe("DENY");
    expect(r.ruleMatched).toBe("default_deny");
  });
});

/**
 * P10 — Change Firewall testleri.
 *
 * Ürün tezinin CHANGE sütunu. P00'da bu sütun tamamen eksikti: agent
 * (gerçek bir runtime olsaydı) herhangi bir dosyayı değiştirebilirdi.
 */

import { describe, it, expect } from "vitest";
import {
  BoundaryError,
  bandFor,
  deriveBoundary,
  hashBoundary,
  testPathsFor,
  type ChangeBoundary
} from "./boundary";
import { decideMutation, decideWithDeletionGuard, type MutationRequest } from "./decide";
import {
  DEFAULT_COMMAND_POLICY,
  assertNoShellNeeded,
  decideCommand
} from "./command-policy";

const MANIFEST = ["packages/payments/retry.ts", "packages/payments/gateway.ts"];

function boundary(overrides: Partial<Parameters<typeof deriveBoundary>[0]> = {}): ChangeBoundary {
  return deriveBoundary({
    manifestPaths: MANIFEST,
    directDependencies: ["packages/shared/money.ts"],
    directDependents: ["apps/api/src/payments-route.ts"],
    knownPaths: [...MANIFEST, "packages/payments/retry.test.ts"],
    approvalGlobs: ["migrations/**", "infra/**"],
    deniedGlobs: ["secrets/**", "production/**", "customer-data/**"],
    ...overrides
  });
}

function request(overrides: Partial<MutationRequest> = {}): MutationRequest {
  return {
    path: "packages/payments/retry.ts",
    operation: "modify",
    expectedHashBefore: "a".repeat(64),
    actualHashBefore: "a".repeat(64),
    ...overrides
  };
}

describe("deriveBoundary — task'tan türetilir (ADR-038)", () => {
  it("manifest fragment'ları expected banda girer", () => {
    const b = boundary();
    expect(b.expected).toContain("packages/payments/retry.ts");
    expect(b.expected).toContain("packages/payments/gateway.ts");
  });

  it("var olan test dosyası da expected banda girer", () => {
    // Agent testi guncelleyemezse degisikligini dogrulayamaz.
    expect(boundary().expected).toContain("packages/payments/retry.test.ts");
  });

  it("VAR OLMAYAN test yoluna izin verilmez", () => {
    // Var olmayan bir teste yazma izni, agent'in oraya YENI DOSYA
    // acabilmesi demektir ve bu ayri bir karardir.
    const b = boundary({ knownPaths: MANIFEST });
    expect(b.expected).not.toContain("packages/payments/retry.test.ts");
  });

  it("graph bağımlılıkları allowed banda girer", () => {
    expect(boundary().allowed).toContain("packages/shared/money.ts");
  });

  it("graph'ta import edenler allowed banda girer", () => {
    expect(boundary().allowed).toContain("apps/api/src/payments-route.ts");
  });

  it("policy onay ve red glob'ları taşınır", () => {
    const b = boundary();
    expect(b.approval).toContain("migrations/**");
    expect(b.denied).toContain("secrets/**");
  });

  it("dizin glob'u DEĞİL tek dosya glob'u üretir", () => {
    // `src/a.ts` gordugu icin `src/**` izni vermek, boundary'yi anlamsiz
    // derecede genisletirdi.
    for (const glob of boundary().expected) {
      expect(glob).not.toContain("**");
    }
  });

  it("her banda giriş GEREKÇE taşır", () => {
    const b = boundary();
    for (const glob of b.expected) {
      expect(b.derivedFrom.some((e) => e.glob === glob)).toBe(true);
    }
  });

  it("boş manifest'te boundary türetilemez", () => {
    // Bos boundary ya "her sey yasak" ya "her sey serbest" anlamina
    // gelebilirdi; belirsizlik ACIKCA reddedilir.
    expect(() => deriveBoundary({ manifestPaths: [] })).toThrow(BoundaryError);
  });
});

describe("boundary hash — determinizm", () => {
  it("aynı girdi aynı hash'i verir", () => {
    expect(boundary().boundaryHash).toBe(boundary().boundaryHash);
  });

  it("manifest sırası hash'i değiştirmez", () => {
    const a = boundary({ manifestPaths: MANIFEST });
    const b = boundary({ manifestPaths: [...MANIFEST].reverse() });
    expect(a.boundaryHash).toBe(b.boundaryHash);
  });

  it("bir glob eklenince hash değişir", () => {
    const a = boundary();
    const b = boundary({ deniedGlobs: ["secrets/**", "production/**", "customer-data/**", "vendor/**"] });
    expect(a.boundaryHash).not.toBe(b.boundaryHash);
  });

  it("band sırası hash'i değiştirmez", () => {
    const bands = { expected: ["b", "a"], allowed: [], approval: [], denied: [] };
    const reversed = { expected: ["a", "b"], allowed: [], approval: [], denied: [] };
    expect(hashBoundary(bands)).toBe(hashBoundary(reversed));
  });
});

describe("bandFor — DENY her zaman kazanır", () => {
  const b = boundary();

  it("merkez dosya expected", () => {
    expect(bandFor(b, "packages/payments/retry.ts")).toBe("expected");
  });

  it("komşu dosya allowed", () => {
    expect(bandFor(b, "packages/shared/money.ts")).toBe("allowed");
  });

  it("migration approval", () => {
    expect(bandFor(b, "migrations/0001_x.sql")).toBe("approval");
  });

  it("sır dizini denied", () => {
    expect(bandFor(b, "secrets/prod.env")).toBe("denied");
  });

  it("expected olsa bile DENY kazanır", () => {
    const overlapping = deriveBoundary({
      manifestPaths: ["secrets/config.ts"],
      deniedGlobs: ["secrets/**"]
    });
    // "Bu gorev icin gerekli" olmasi, yasak olmasini degistirmez.
    expect(bandFor(overlapping, "secrets/config.ts")).toBe("denied");
  });

  it("bilinmeyen yol OUTSIDE", () => {
    expect(bandFor(b, "apps/web/src/App.tsx")).toBe("outside");
  });
});

describe("decideMutation — backend enforcement (ADR-039)", () => {
  const b = boundary();

  it("expected banddaki değişikliğe izin verir", () => {
    const result = decideMutation(b, request());
    expect(result.decision).toBe("ALLOW");
    expect(result.ruleMatched).toBe("boundary_expected");
  });

  it("allowed banddaki değişikliğe izin verir", () => {
    const result = decideMutation(b, request({ path: "packages/shared/money.ts" }));
    expect(result.decision).toBe("ALLOW");
  });

  it("approval banddaki değişiklik ONAY ister", () => {
    const result = decideMutation(b, request({ path: "migrations/0001.sql" }));
    expect(result.decision).toBe("ASK_APPROVAL");
  });

  it("denied banddaki değişikliği REDDEDER", () => {
    const result = decideMutation(b, request({ path: "secrets/prod.env" }));
    expect(result.decision).toBe("DENY");
    expect(result.ruleMatched).toBe("boundary_denied");
  });

  it("sınır DIŞINDAKİ değişikliği reddeder (varsayılan izin yok)", () => {
    const result = decideMutation(b, request({ path: "apps/web/src/App.tsx" }));
    expect(result.decision).toBe("DENY");
    expect(result.band).toBe("outside");
    expect(result.reason).toContain("DISINDA");
  });

  it("her karar GEREKÇE ve eşleşen kural taşır", () => {
    for (const path of ["packages/payments/retry.ts", "secrets/x.env", "apps/web/a.tsx"]) {
      const result = decideMutation(b, request({ path }));
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.ruleMatched.length).toBeGreaterThan(0);
    }
  });
});

describe("decideMutation — write race (ADR-041, T-20)", () => {
  const b = boundary();

  it("dosya arada değiştiyse REDDEDER", () => {
    const result = decideMutation(
      b,
      request({ expectedHashBefore: "a".repeat(64), actualHashBefore: "b".repeat(64) })
    );

    expect(result.decision).toBe("DENY");
    expect(result.ruleMatched).toBe("write_race_detected");
  });

  it("race kontrolü sınır kontrolünden ÖNCE yapılır", () => {
    // Sinir icinde bile olsa, bayat bir hash uzerine yazmak baskasinin
    // isini sessizce siler.
    const result = decideMutation(
      b,
      request({ path: "packages/payments/retry.ts", actualHashBefore: "z".repeat(64) })
    );
    expect(result.ruleMatched).toBe("write_race_detected");
  });

  it("yeni dosyada hash null olabilir", () => {
    const result = decideMutation(
      b,
      request({ operation: "create", expectedHashBefore: null, actualHashBefore: null })
    );
    expect(result.decision).toBe("ALLOW");
  });

  it("beklenen null ama dosya varsa reddeder", () => {
    // "Yeni dosya aciyorum" diyip var olan bir dosyanin uzerine yazmak.
    const result = decideMutation(
      b,
      request({ operation: "create", expectedHashBefore: null, actualHashBefore: "a".repeat(64) })
    );
    expect(result.decision).toBe("DENY");
  });
});

describe("decideWithDeletionGuard — silme onay ister", () => {
  const b = boundary();

  it("expected banddaki silme bile ONAY ister", () => {
    const result = decideWithDeletionGuard(b, request({ operation: "delete" }));
    expect(result.decision).toBe("ASK_APPROVAL");
    expect(result.ruleMatched).toBe("deletion_requires_approval");
  });

  it("değiştirme onay istemez", () => {
    expect(decideWithDeletionGuard(b, request({ operation: "modify" })).decision).toBe("ALLOW");
  });

  it("zaten reddedilen silme reddedilmiş kalır", () => {
    const result = decideWithDeletionGuard(
      b,
      request({ path: "secrets/x.env", operation: "delete" })
    );
    expect(result.decision).toBe("DENY");
  });
});

describe("decideCommand — ALLOWLIST (T-22)", () => {
  it("izin verilen komuta izin verir", () => {
    const result = decideCommand(DEFAULT_COMMAND_POLICY, { command: "git", args: ["status"] });
    expect(result.decision).toBe("ALLOW");
  });

  it("listede olmayan komutu reddeder", () => {
    const result = decideCommand(DEFAULT_COMMAND_POLICY, { command: "curl", args: ["x"] });
    expect(result.decision).toBe("DENY");
    expect(result.ruleMatched).toBe("not_in_allowlist");
  });

  it("yol vererek allowlist baypas edilemez", () => {
    // `./git` calistirmak `git` calistirmak degildir.
    for (const command of ["/usr/bin/git", "./git", "..\\git"]) {
      const result = decideCommand(DEFAULT_COMMAND_POLICY, { command, args: [] });
      expect(result.decision, command).toBe("DENY");
      expect(result.ruleMatched).toBe("path_in_command_name");
    }
  });

  it("kabuk zincirleme argümanını reddeder", () => {
    const result = decideCommand(DEFAULT_COMMAND_POLICY, {
      command: "git",
      args: ["log; rm -rf /"]
    });
    expect(result.decision).toBe("DENY");
  });

  it("yıkıcı git argümanlarını reddeder", () => {
    for (const arg of ["--force", "--hard", "push"]) {
      const result = decideCommand(DEFAULT_COMMAND_POLICY, { command: "git", args: [arg] });
      expect(result.decision, arg).toBe("DENY");
    }
  });

  it("uzak URL argümanını reddeder", () => {
    const result = decideCommand(DEFAULT_COMMAND_POLICY, {
      command: "npm",
      args: ["install", "https://evil.example/pkg.tgz"]
    });
    expect(result.decision).toBe("DENY");
  });

  it("boş komutu reddeder", () => {
    expect(decideCommand(DEFAULT_COMMAND_POLICY, { command: "  ", args: [] }).decision).toBe("DENY");
  });

  it("varsayılan politikada dış dünyaya etki eden komutlar YOK", () => {
    for (const command of ["docker", "kubectl", "ssh", "curl", "wget", "rm"]) {
      expect(DEFAULT_COMMAND_POLICY.allowedCommands, command).not.toContain(command);
    }
  });
});

describe("assertNoShellNeeded", () => {
  it("temiz argümanlar geçer", () => {
    expect(() => assertNoShellNeeded({ command: "git", args: ["log", "--oneline"] })).not.toThrow();
  });

  it("kabuk metakarakteri içeren argüman reddedilir", () => {
    for (const arg of ["a;b", "a|b", "a`b`", "$(x)", "a>b"]) {
      expect(() => assertNoShellNeeded({ command: "git", args: [arg] }), arg).toThrow(/execFile/);
    }
  });
});

describe("testPathsFor", () => {
  it("var olan testi bulur", () => {
    expect(testPathsFor("src/a.ts", ["src/a.ts", "src/a.test.ts"])).toEqual(["src/a.test.ts"]);
  });

  it("spec dosyasını da bulur", () => {
    expect(testPathsFor("src/a.ts", ["src/a.spec.ts"])).toEqual(["src/a.spec.ts"]);
  });

  it("var olmayan testi döndürmez", () => {
    expect(testPathsFor("src/a.ts", ["src/a.ts"])).toEqual([]);
  });

  it("kod olmayan dosyada boş döner", () => {
    expect(testPathsFor("README.md", ["README.md"])).toEqual([]);
  });
});

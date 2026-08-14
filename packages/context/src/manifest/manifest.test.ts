/**
 * P09 — Canonical JSON, manifest ve provenance testleri.
 *
 * En kritik iddia: bir aday üretildiyse ve manifest'te yoksa,
 * `exclusions`'ta SEBEBİYLE bulunmak zorundadır (ADR-036). "Neyi neden
 * görmedi" sorusu, "ne gördü" sorusundan daha önemlidir: agent'ın
 * bilmediği şey, yanlış yapmasının sebebidir.
 */

import { describe, it, expect } from "vitest";
import { CanonicalJsonError, canonicalJson } from "./canonical-json";
import {
  ManifestError,
  buildManifest,
  hashManifest,
  provenanceCoverage,
  verifyManifest,
  type BuildManifestInput,
  type ContextManifest
} from "./builder";
import type { CompiledContext } from "../compiler/compile";
import { emptySignals, type RankedCandidate } from "../retrieval/types";

// --- Canonical JSON --------------------------------------------------------

describe("canonicalJson — alan sırası hash'i etkilemez (ADR-035)", () => {
  it("farklı inşa sırası AYNI bayt dizisi verir", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("iç içe nesnelerde de sıralar", () => {
    expect(canonicalJson({ x: { b: 1, a: 2 } })).toBe(canonicalJson({ x: { a: 2, b: 1 } }));
  });

  it("dizi sırasını KORUR (dizi sırası anlamlıdır)", () => {
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it("`undefined` atlanır, `null` korunur", () => {
    // Ikisi FARKLI seydir: `null` "hesaplandi ve yok", `undefined`
    // "hic yazilmadi".
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("dizideki `undefined` `null` olur (indeksler kaymamalı)", () => {
    expect(canonicalJson([1, undefined as never, 3])).toBe("[1,null,3]");
  });

  it("`-0` ile `0` aynı serileşir", () => {
    expect(canonicalJson({ a: -0 })).toBe(canonicalJson({ a: 0 }));
  });

  it("unicode NFC'ye normalize edilir", () => {
    // Ayni gorunen iki string farkli kompozisyona sahip olabilir.
    const composed = "é"; // é
    const decomposed = "é"; // e + birlestirici aksan
    expect(canonicalJson({ a: composed })).toBe(canonicalJson({ a: decomposed }));
  });

  it("NaN ve Infinity REDDEDİLİR (sessizce null olmaz)", () => {
    // `JSON.stringify` bunlari sessizce `null` yapar — sessiz veri kaybi.
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(CanonicalJsonError);
    expect(() => canonicalJson({ a: Number.POSITIVE_INFINITY })).toThrow(/NaN\/Infinity/);
  });

  it("dairesel referans reddedilir", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => canonicalJson(obj as never)).toThrow(/Dairesel/);
  });

  it("boolean, string ve sayı doğru serileşir", () => {
    expect(canonicalJson({ b: true, s: "x", n: 1.5 })).toBe('{"b":true,"n":1.5,"s":"x"}');
  });

  it("aynı girdi 50 kez → aynı çıktı", () => {
    const value = { z: [3, 1], a: { m: null, k: "ü" }, n: 42 };
    const first = canonicalJson(value);
    for (let i = 0; i < 50; i++) expect(canonicalJson(value)).toBe(first);
  });
});

// --- Manifest --------------------------------------------------------------

function rankedCandidate(id: string, rank: number): RankedCandidate {
  return {
    candidate: {
      chunkId: id,
      path: `src/${id}.ts`,
      symbolName: id,
      symbolType: "function",
      content: `export function ${id}() {}`,
      startLine: 1,
      endLine: 5,
      estimatedTokens: 100,
      containsSecret: false,
      channels: ["lexical"],
      rawScores: { lexical: 0.5 }
    },
    signals: emptySignals(),
    finalScore: 0.9 - rank * 0.1,
    rank,
    explanation: { topReasons: ["metin eslesmesi"], contributions: {}, missingSignals: [] }
  };
}

function compiled(overrides: Partial<CompiledContext> = {}): CompiledContext {
  return {
    fragments: [
      {
        chunkId: "a",
        path: "src/a.ts",
        symbolName: "a",
        startLine: 1,
        endLine: 5,
        content: "export function a() {}",
        tokens: 100,
        rank: 1,
        finalScore: 0.9,
        includedBecause: ["metin eslesmesi"],
        sourceContentHash: "1".repeat(64),
        truncated: false
      }
    ],
    exclusions: [{ chunkId: "b", path: "src/b.ts", reason: "budget", detail: "sigmadi" }],
    unavailableFields: [{ field: "recentDiffs", reason: "git yok" }],
    tokensUsed: 100,
    tokensAvailable: 1_000,
    budgetUtilization: 0.1,
    inputHash: "i".repeat(64),
    recentDiffs: null,
    tokenizerApproximate: true,
    ...overrides
  };
}

function buildInput(overrides: Partial<BuildManifestInput> = {}): BuildManifestInput {
  return {
    compiled: compiled(),
    allCandidates: [rankedCandidate("a", 1), rankedCandidate("b", 2)],
    taskId: "task_1",
    runId: "run_1",
    snapshotId: "snap_1",
    repositoryId: "repo_1",
    commitSha: "c".repeat(40),
    compilerVersion: "1.0.0",
    policyVersion: "v1",
    universeHash: "u".repeat(64),
    weightsHash: "w".repeat(32),
    tokenizerId: "heuristic-v1",
    parserVersions: { typescript: "5.9.3" },
    ...overrides
  };
}

describe("buildManifest — her aday hesaplanır (ADR-036)", () => {
  it("dahil edilen adaylar items'ta", () => {
    const manifest = buildManifest(buildInput());
    expect(manifest.items.length).toBe(1);
    expect(manifest.items[0].path).toBe("src/a.ts");
  });

  it("dışlanan adaylar SEBEBİYLE exclusions'ta", () => {
    const manifest = buildManifest(buildInput());
    expect(manifest.exclusions.length).toBe(1);
    expect(manifest.exclusions[0].reason).toBe("budget");
    expect(manifest.exclusions[0].detail).toBe("sigmadi");
  });

  it("dışlanan adayın havuzdaki sırası korunur", () => {
    const manifest = buildManifest(buildInput());
    expect(manifest.exclusions[0].candidateRank).toBe(2);
  });

  it("bir aday sessizce kaybolursa manifest ÜRETİLMEZ", () => {
    // `c` adayi ne dahil edildi ne disllandi.
    expect(() =>
      buildManifest(
        buildInput({
          allCandidates: [rankedCandidate("a", 1), rankedCandidate("b", 2), rankedCandidate("c", 3)]
        })
      )
    ).toThrow(ManifestError);
  });

  it("eksik kapsama hatası kaybolan adayları ADLANDIRIR", () => {
    try {
      buildManifest(
        buildInput({ allCandidates: [rankedCandidate("a", 1), rankedCandidate("b", 2), rankedCandidate("kayip", 3)] })
      );
      expect.unreachable("hata bekleniyordu");
    } catch (error) {
      expect((error as Error).message).toContain("kayip");
    }
  });

  it("firewall dışlamaları da manifest'e girer", () => {
    const manifest = buildManifest(
      buildInput({
        firewallExclusions: [
          {
            path: "secrets/prod.env",
            symbolName: null,
            reason: "policy_denied",
            detail: "universe DENY",
            candidateRank: null
          }
        ]
      })
    );

    expect(manifest.exclusions.some((e) => e.reason === "policy_denied")).toBe(true);
  });
});

describe("buildManifest — provenance", () => {
  it("her item kaynak ve chunk hash'i taşır", () => {
    const manifest = buildManifest(buildInput());
    const item = manifest.items[0];

    expect(item.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(item.chunkHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("kırpılmış içerikte chunk hash'i kaynak hash'inden FARKLIDIR", () => {
    // Kirpma yapildiginda manifest hem kaynagi hem verileni tasir.
    const manifest = buildManifest(buildInput());
    expect(manifest.items[0].chunkHash).not.toBe(manifest.items[0].sourceHash);
  });

  it("her item commit SHA'sına bağlıdır", () => {
    const manifest = buildManifest(buildInput());
    expect(manifest.items[0].commitSha).toBe("c".repeat(40));
  });

  it("her item 'bu neden seçildi' bilgisini taşır", () => {
    const manifest = buildManifest(buildInput());
    expect(manifest.items[0].reason.includedBecause).toEqual(["metin eslesmesi"]);
  });

  it("provenance kapsaması %100", () => {
    expect(provenanceCoverage(buildManifest(buildInput()))).toBe(1);
  });

  it("boş manifest kapsaması 1 sayılır (bölme hatası yok)", () => {
    const manifest = buildManifest(
      buildInput({
        compiled: compiled({ fragments: [], exclusions: [{ chunkId: "a", path: "src/a.ts", reason: "budget", detail: "x" }, { chunkId: "b", path: "src/b.ts", reason: "budget", detail: "x" }] }),
      })
    );
    expect(provenanceCoverage(manifest)).toBe(1);
  });
});

describe("buildManifest — determinizm girdileri manifest'te", () => {
  it("tüm determinizm girdilerini taşır", () => {
    const manifest = buildManifest(buildInput());

    expect(manifest.compilerVersion).toBe("1.0.0");
    expect(manifest.policyVersion).toBe("v1");
    expect(manifest.universeHash).toBe("u".repeat(64));
    expect(manifest.weightsHash).toBe("w".repeat(32));
    expect(manifest.parserVersions).toEqual({ typescript: "5.9.3" });
    expect(manifest.deterministicInputsHash).toBe("i".repeat(64));
  });

  it("tokenizer yaklaşıklığı manifest'e YAZILIR", () => {
    // Butce yaklasik bir sayiya dayandiysa okuyan bunu bilmeli.
    expect(buildManifest(buildInput()).tokenizerApproximate).toBe(true);
  });

  it("hesaplanamayan alanlar manifest'te görünür", () => {
    const manifest = buildManifest(buildInput());
    expect(manifest.unavailableFields).toEqual([{ field: "recentDiffs", reason: "git yok" }]);
  });

  it("bütçe kullanımı kaydedilir", () => {
    const manifest = buildManifest(buildInput());
    expect(manifest.budgetLimit).toBe(1_000);
    expect(manifest.budgetUsed).toBe(100);
  });
});

describe("manifest hash — kendi hash'ini içermez", () => {
  it("aynı manifest aynı hash'i üretir", () => {
    expect(buildManifest(buildInput()).manifestHash).toBe(buildManifest(buildInput()).manifestHash);
  });

  it("tek bir alan değişince hash değişir", () => {
    const a = buildManifest(buildInput()).manifestHash;
    const b = buildManifest(buildInput({ policyVersion: "v2" })).manifestHash;
    expect(a).not.toBe(b);
  });

  it("hash hesabı manifestHash alanını DIŞLAR", () => {
    const manifest = buildManifest(buildInput());
    const { manifestHash, ...withoutHash } = manifest;
    expect(hashManifest(withoutHash)).toBe(manifestHash);
  });
});

describe("verifyManifest — tamper tespiti", () => {
  it("değiştirilmemiş manifest geçerlidir", () => {
    const result = verifyManifest(buildManifest(buildInput()));
    expect(result.valid).toBe(true);
    expect(result.verdict).toBe("valid");
  });

  it("içeriği değiştirilmiş manifest TAMPERED döner", () => {
    const manifest = buildManifest(buildInput());
    const tampered: ContextManifest = {
      ...manifest,
      budgetUsed: 999_999
    };

    const result = verifyManifest(tampered);
    expect(result.valid).toBe(false);
    expect(result.verdict).toBe("tampered");
  });

  it("item eklenmiş manifest TAMPERED döner", () => {
    const manifest = buildManifest(buildInput());
    const tampered: ContextManifest = {
      ...manifest,
      items: [...manifest.items, { ...manifest.items[0], fragmentId: "frag_uydurma" }]
    };

    expect(verifyManifest(tampered).valid).toBe(false);
  });

  it("dışlama silinmiş manifest TAMPERED döner", () => {
    const manifest = buildManifest(buildInput());
    const tampered: ContextManifest = { ...manifest, exclusions: [] };
    expect(verifyManifest(tampered).valid).toBe(false);
  });

  it("doğrulama beklenen ve depolanan hash'i birlikte döndürür", () => {
    const result = verifyManifest(buildManifest(buildInput()));
    expect(result.expectedHash).toBe(result.storedHash);
  });
});

/**
 * P04 — Parser testleri.
 *
 * Her dil için gerçek kaynak fixture'ı kullanılır ve beklenen semboller
 * doğrulanır. P00 bulgusu: `.py` dosyası "javascript" etiketiyle regex
 * parser'a gidiyordu ve hiçbir test bunu yakalamıyordu.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { TypeScriptParser } from "./typescript-parser";
import { TreeSitterParser } from "./tree-sitter-parser";
import { StructuralParser } from "./structural-parser";
import { createDefaultRegistry, ParserRegistry } from "./registry";
import { computeConfidence } from "./types";

const TS_SOURCE = `
import { readFile } from "fs/promises";
import type { Config } from "./config";
import * as path from "path";

export interface Repository {
  id: string;
}

export type RepoKind = "local" | "github";

export enum Status { Active, Archived }

export const MAX_FILES = 1000;

const helper = () => 42;

export async function loadRepository(id: string): Promise<Repository> {
  return { id };
}

export class RepositoryService {
  private cache = new Map<string, Repository>();

  async get(id: string): Promise<Repository | null> {
    return this.cache.get(id) ?? null;
  }

  clear(): void {
    this.cache.clear();
  }
}
`;

const PY_SOURCE = `
import os
from typing import Optional

MAX_RETRIES = 3

def public_helper(value: str) -> str:
    return value.strip()

def _private_helper():
    pass

class RepositoryService:
    def __init__(self):
        self.cache = {}

    def get(self, key):
        return self.cache.get(key)
`;

const GO_SOURCE = `
package main

import "fmt"

func ExportedFunc() string {
	return "x"
}

func unexportedFunc() int {
	return 1
}

type Repository struct {
	ID string
}
`;

describe("TypeScriptParser", () => {
  const parser = new TypeScriptParser();
  const parse = () => parser.parse(TS_SOURCE, { filePath: "src/repo.ts" });

  it("dili typescript olarak raporlar", async () => {
    expect((await parse()).language).toBe("typescript");
  });

  it("interface, type, enum çıkarır", async () => {
    const { symbols } = await parse();
    const byName = new Map(symbols.map((s) => [s.symbolName, s]));

    expect(byName.get("Repository")?.symbolType).toBe("interface");
    expect(byName.get("RepoKind")?.symbolType).toBe("type");
    expect(byName.get("Status")?.symbolType).toBe("enum");
  });

  it("fonksiyon, sınıf ve metotları çıkarır", async () => {
    const { symbols } = await parse();
    const byName = new Map(symbols.map((s) => [s.symbolName, s]));

    expect(byName.get("loadRepository")?.symbolType).toBe("function");
    expect(byName.get("RepositoryService")?.symbolType).toBe("class");
    expect(byName.get("get")?.symbolType).toBe("method");
  });

  it("metodun parentSymbol'ünü sınıfa bağlar", async () => {
    const { symbols } = await parse();
    expect(symbols.find((s) => s.symbolName === "get")?.parentSymbol).toBe("RepositoryService");
  });

  it("ok fonksiyonu atanmış değişkeni FONKSİYON sayar", async () => {
    const { symbols } = await parse();
    expect(symbols.find((s) => s.symbolName === "helper")?.symbolType).toBe("function");
  });

  it("const'u constant olarak ayırır", async () => {
    const { symbols } = await parse();
    expect(symbols.find((s) => s.symbolName === "MAX_FILES")?.symbolType).toBe("constant");
  });

  it("export edilenleri işaretler", async () => {
    const { symbols, exports } = await parse();
    expect(exports).toContain("loadRepository");
    expect(exports).toContain("RepositoryService");
    // `helper` export edilmiyor.
    expect(symbols.find((s) => s.symbolName === "helper")?.exported).toBe(false);
  });

  it("import'ları adlarıyla çıkarır", async () => {
    const { imports } = await parse();
    const bySource = new Map(imports.map((i) => [i.source, i]));

    expect(bySource.get("fs/promises")?.names).toContain("readFile");
    expect(bySource.get("path")?.names).toContain("*");
    expect(bySource.get("./config")?.isTypeOnly).toBe(true);
  });

  it("satır ve bayt offset'leri tutarlı", async () => {
    const { symbols } = await parse();
    for (const s of symbols) {
      expect(s.startLine).toBeGreaterThan(0);
      expect(s.endLine).toBeGreaterThanOrEqual(s.startLine);
      expect(s.endByte).toBeGreaterThan(s.startByte);
      // `text` gercekten o araligin icerigi olmali (chunk sinirlari buna dayanacak).
      expect(TS_SOURCE.slice(s.startByte, s.endByte)).toBe(s.text);
    }
  });

  it("tsx dosyasını tsx olarak raporlar", async () => {
    const result = await parser.parse("export const A = () => <div />;", { filePath: "a.tsx" });
    expect(result.language).toBe("tsx");
  });

  it("temiz kaynakta yüksek confidence verir", async () => {
    expect((await parse()).confidence).toBeGreaterThan(0.9);
  });

  it("bozuk kaynakta confidence DÜŞER (sabit 0.95 değil)", async () => {
    // P00 bulgusu: eski parser her durumda 0.95 veriyordu.
    const broken = await parser.parse("export class {{{ ???", { filePath: "bad.ts" });
    const clean = await parse();
    expect(broken.confidence).toBeLessThan(clean.confidence);
    expect(broken.diagnostics.length).toBeGreaterThan(0);
  });

  it("confidence yöntemini ast olarak bildirir", async () => {
    expect((await parse()).confidenceBasis.method).toBe("ast");
  });
});

describe("TreeSitterParser", { timeout: 60_000 }, () => {
  const parser = new TreeSitterParser();

  beforeAll(async () => {
    await parser.initialize();
  });

  it("Python fonksiyon ve sınıflarını çıkarır", async () => {
    const { symbols, language } = await parser.parse(PY_SOURCE, { filePath: "app.py" });
    expect(language).toBe("python");

    const names = symbols.map((s) => s.symbolName);
    expect(names).toContain("public_helper");
    expect(names).toContain("RepositoryService");
    expect(names).toContain("get");
  });

  it("Python'da _ önekli sembolü dışa aktarılmış saymaz", async () => {
    const { symbols } = await parser.parse(PY_SOURCE, { filePath: "app.py" });
    expect(symbols.find((s) => s.symbolName === "_private_helper")?.exported).toBe(false);
    expect(symbols.find((s) => s.symbolName === "public_helper")?.exported).toBe(true);
  });

  it("Python dosyasını JAVASCRIPT saymaz (P00 regresyonu)", async () => {
    const { language } = await parser.parse(PY_SOURCE, { filePath: "app.py" });
    expect(language).not.toBe("javascript");
    expect(language).toBe("python");
  });

  it("Go'da büyük harfli sembolü dışa aktarılmış sayar", async () => {
    const { symbols } = await parser.parse(GO_SOURCE, { filePath: "main.go" });
    expect(symbols.find((s) => s.symbolName === "ExportedFunc")?.exported).toBe(true);
    expect(symbols.find((s) => s.symbolName === "unexportedFunc")?.exported).toBe(false);
  });

  it("bayt offset'leri kaynakla tutarlı", async () => {
    const { symbols } = await parser.parse(PY_SOURCE, { filePath: "app.py" });
    for (const s of symbols) {
      expect(PY_SOURCE.slice(s.startByte, s.endByte)).toBe(s.text);
    }
  });

  it("bozuk kaynakta hata düğümü bildirir ve confidence düşer", async () => {
    const broken = await parser.parse("def broken(:\n    ???", { filePath: "bad.py" });
    const clean = await parser.parse(PY_SOURCE, { filePath: "app.py" });
    expect(broken.confidence).toBeLessThan(clean.confidence);
  });

  it("desteklenmeyen dosya için hata fırlatır (sessizce boş dönmez)", async () => {
    await expect(parser.parse("x", { filePath: "a.unknownext" })).rejects.toBeTruthy();
  });

  it("confidence yöntemini tree-sitter olarak bildirir", async () => {
    const r = await parser.parse(PY_SOURCE, { filePath: "app.py" });
    expect(r.confidenceBasis.method).toBe("tree-sitter");
  });
});

describe("StructuralParser", () => {
  const parser = new StructuralParser();

  it("bilinmeyen dilde kaba sembol çıkarır", async () => {
    const source = "function topla(a, b) {\n  return a + b;\n}\n";
    const { symbols } = await parser.parse(source, { filePath: "a.bilinmeyen" });
    expect(symbols[0]?.symbolName).toBe("topla");
  });

  it("markdown başlıklarını bölüm sayar", async () => {
    const { symbols } = await parser.parse("# Baslik\n\nmetin\n", { filePath: "a.md" });
    expect(symbols[0]?.symbolType).toBe("markdown_section");
  });

  it("DÜŞÜK confidence verir ve bunu açıkça bildirir", async () => {
    const r = await parser.parse("function a() {}", { filePath: "a.xyz" });
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.confidenceBasis.method).toBe("structural");
    expect(r.diagnostics[0].message).toContain("gercek bir gramer yok");
  });
});

describe("ParserRegistry", { timeout: 60_000 }, () => {
  let registry: ParserRegistry;

  beforeAll(async () => {
    registry = createDefaultRegistry();
    await registry.initialize();
  });

  it("TypeScript'i TS compiler'a yönlendirir", () => {
    expect(registry.parserFor("typescript").id).toBe("typescript-compiler");
  });

  it("Python'ı tree-sitter'a yönlendirir", () => {
    expect(registry.parserFor("python").id).toBe("tree-sitter");
  });

  it("bilinmeyen dili yapısal parser'a yönlendirir", () => {
    expect(registry.parserFor(null).id).toBe("structural");
    expect(registry.parserFor("klingon").id).toBe("structural");
  });

  it("desteklenen dilleri doğru bildirir", () => {
    expect(registry.supports("typescript")).toBe(true);
    expect(registry.supports("python")).toBe(true);
    expect(registry.supports("klingon")).toBe(false);
    expect(registry.supports(null)).toBe(false);
  });

  it("dosya yolundan doğru parser'ı seçip ayrıştırır", async () => {
    const ts = await registry.parse(TS_SOURCE, { filePath: "src/a.ts" });
    expect(ts.confidenceBasis.method).toBe("ast");

    const py = await registry.parse(PY_SOURCE, { filePath: "src/a.py" });
    expect(py.confidenceBasis.method).toBe("tree-sitter");
  });

  it("parser sürümlerini raporlar (P09 determinizm girdisi)", () => {
    const versions = registry.versions();
    expect(versions["typescript-compiler"]).toBeTruthy();
    expect(versions["tree-sitter"]).toBeTruthy();
    expect(versions["structural"]).toBeTruthy();
  });

  it("9+ dil için gerçek gramer sağlar", () => {
    const languages = ["typescript", "tsx", "javascript", "jsx", "python", "go", "rust", "java", "sql", "yaml", "json", "markdown"];
    const supported = languages.filter((l) => registry.supports(l));
    // SQL grammar'i tree-sitter-wasms'te yok; onu haric tutuyoruz.
    expect(supported.length).toBeGreaterThanOrEqual(9);
  });
});

describe("computeConfidence", () => {
  it("yöntem tabanını uygular", () => {
    const clean = { errorNodeRatio: 0, unresolvedImportRatio: 0 };
    expect(computeConfidence({ ...clean, method: "ast" })).toBe(1);
    expect(computeConfidence({ ...clean, method: "tree-sitter" })).toBeCloseTo(0.95);
    expect(computeConfidence({ ...clean, method: "structural" })).toBeCloseTo(0.55);
  });

  it("hata oranı arttıkça confidence düşer", () => {
    const a = computeConfidence({ errorNodeRatio: 0, unresolvedImportRatio: 0, method: "ast" });
    const b = computeConfidence({ errorNodeRatio: 0.5, unresolvedImportRatio: 0, method: "ast" });
    expect(b).toBeLessThan(a);
  });

  it("0..1 aralığında kalır", () => {
    expect(computeConfidence({ errorNodeRatio: 5, unresolvedImportRatio: 5, method: "structural" })).toBe(0);
    expect(computeConfidence({ errorNodeRatio: 0, unresolvedImportRatio: 0, method: "ast" })).toBe(1);
  });
});

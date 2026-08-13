/**
 * P04 / Y-P04-008 — Symbol-aware chunking testleri (ADR-020).
 *
 * En kritik iddia: chunk sınırları SEMBOL sınırlarına denk gelir.
 * P00'daki `content.slice(i, i + 4000)` fonksiyon ortasından kesiyordu;
 * bu testler bunun bir daha olmayacağını kilitler.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { chunkBySymbols, estimateTokens, type Chunk } from "./symbol-chunker";
import { TypeScriptParser } from "./typescript-parser";
import type { ParsedSymbol } from "./types";

const SOURCE = `// Lisans basligi
import { a } from "b";

export function birinci(): number {
  return 1;
}

export function ikinci(): number {
  return 2;
}

export class Kutu {
  private deger = 0;

  ac(): void {
    this.deger = 1;
  }

  kapat(): void {
    this.deger = 0;
  }
}

// dosya sonu yorumu
`;

let symbols: readonly ParsedSymbol[];

beforeAll(async () => {
  const result = await new TypeScriptParser().parse(SOURCE, { filePath: "test.ts" });
  symbols = result.symbols;
});

describe("chunkBySymbols — sembol sınırları (ADR-020)", () => {
  it("her chunk kaynağın gerçek bir dilimidir", () => {
    const chunks = chunkBySymbols(SOURCE, symbols);
    for (const c of chunks) {
      expect(SOURCE.slice(c.startByte, c.endByte)).toBe(c.content);
    }
  });

  it("fonksiyonu ORTADAN KESMEZ", () => {
    const chunks = chunkBySymbols(SOURCE, symbols, { maxTokens: 10_000 });
    const withFn = chunks.find((c) => c.content.includes("function birinci"));

    expect(withFn).toBeDefined();
    // Fonksiyon govdesi ayni chunk'ta tamamlanmali.
    expect(withFn!.content).toContain("return 1;");
    expect(withFn!.content).toContain("}");
  });

  it("chunk'ları sembole bağlar", () => {
    const chunks = chunkBySymbols(SOURCE, symbols, { maxTokens: 10_000, minTokens: 1 });
    const named = chunks.filter((c) => c.symbolName !== null);
    expect(named.length).toBeGreaterThan(0);
    expect(named.map((c) => c.symbolName)).toContain("Kutu");
  });

  it("iç içe sembolleri iki kez saymaz", () => {
    const chunks = chunkBySymbols(SOURCE, symbols, { maxTokens: 10_000, minTokens: 1 });
    // `ac` metodu `Kutu` sinifinin icinde; ayri bir chunk uretmemeli.
    const acChunks = chunks.filter((c) => c.symbolName === "ac");
    expect(acChunks.length).toBe(0);
  });

  it("sembol dışındaki içeriği kaybetmez", () => {
    const chunks = chunkBySymbols(SOURCE, symbols, { maxTokens: 10_000, minTokens: 1 });
    const all = chunks.map((c) => c.content).join("");

    // Lisans basligi ve dosya sonu yorumu bir yerde bulunmali.
    expect(all).toContain("Lisans basligi");
    expect(all).toContain("dosya sonu yorumu");
  });

  it("chunk'lar sıralı ve çakışmasız (bölünme yoksa)", () => {
    const chunks = chunkBySymbols(SOURCE, symbols, { maxTokens: 10_000, minTokens: 1 });
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startByte).toBeGreaterThanOrEqual(chunks[i - 1].endByte);
      expect(chunks[i].ordinal).toBe(chunks[i - 1].ordinal + 1);
    }
  });

  it("satır numaraları içerikle tutarlı", () => {
    const chunks = chunkBySymbols(SOURCE, symbols, { maxTokens: 10_000, minTokens: 1 });
    const lines = SOURCE.split("\n");
    for (const c of chunks) {
      expect(c.startLine).toBeGreaterThan(0);
      expect(c.endLine).toBeLessThanOrEqual(lines.length);
      expect(c.endLine).toBeGreaterThanOrEqual(c.startLine);
    }
  });
});

describe("chunkBySymbols — bütçe aşımı", () => {
  const bigSource = [
    "export function devasa(): void {",
    ...Array.from({ length: 400 }, (_, i) => `  const degisken${i} = ${i} * 2 + 1;`),
    "}"
  ].join("\n");

  it("bütçeden büyük sembolü alt-chunk'lara böler", async () => {
    const parsed = await new TypeScriptParser().parse(bigSource, { filePath: "big.ts" });
    const chunks = chunkBySymbols(bigSource, parsed.symbols, { maxTokens: 200 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].partCount).toBeGreaterThan(1);
  });

  it("alt-chunk'lar aynı sembole bağlı kalır", async () => {
    const parsed = await new TypeScriptParser().parse(bigSource, { filePath: "big.ts" });
    const chunks = chunkBySymbols(bigSource, parsed.symbols, { maxTokens: 200 });
    const parts = chunks.filter((c) => c.partCount > 1);

    for (const p of parts) expect(p.symbolName).toBe("devasa");
  });

  it("alt-chunk'lar sırayla numaralanır", async () => {
    const parsed = await new TypeScriptParser().parse(bigSource, { filePath: "big.ts" });
    const chunks = chunkBySymbols(bigSource, parsed.symbols, { maxTokens: 200 });
    const parts = chunks.filter((c) => c.partCount > 1);

    parts.forEach((p, i) => expect(p.partIndex).toBe(i));
  });

  it("bölünme satır sınırında olur (satır ortasından kesmez)", async () => {
    const parsed = await new TypeScriptParser().parse(bigSource, { filePath: "big.ts" });
    const chunks = chunkBySymbols(bigSource, parsed.symbols, { maxTokens: 200 });

    for (const c of chunks.slice(0, -1)) {
      // Bir chunk ya yeni satirla biter ya da kaynagin sonundadir.
      const endsCleanly = c.content.endsWith("\n") || c.endByte >= bigSource.length;
      expect(endsCleanly, `chunk ${c.ordinal} satir ortasindan kesilmis`).toBe(true);
    }
  });

  it("bölünen parçalar arasında örtüşme bırakır", async () => {
    const parsed = await new TypeScriptParser().parse(bigSource, { filePath: "big.ts" });
    const chunks = chunkBySymbols(bigSource, parsed.symbols, { maxTokens: 200, overlapLines: 2 });
    const parts = chunks.filter((c) => c.partCount > 1);

    if (parts.length > 1) {
      // Ikinci parca, birincinin bittigi yerden ONCE baslar.
      expect(parts[1].startByte).toBeLessThan(parts[0].endByte);
    }
  });

  it("tüm içerik parçalarda temsil edilir", async () => {
    const parsed = await new TypeScriptParser().parse(bigSource, { filePath: "big.ts" });
    const chunks = chunkBySymbols(bigSource, parsed.symbols, { maxTokens: 200 });

    expect(chunks[0].startByte).toBe(0);
    expect(chunks[chunks.length - 1].endByte).toBe(bigSource.length);
  });
});

describe("chunkBySymbols — küçük sembollerin birleştirilmesi", () => {
  it("çok küçük komşu sembolleri tek chunk'ta toplar", async () => {
    const tiny = [
      "export const a = 1;",
      "export const b = 2;",
      "export const c = 3;",
      "export const d = 4;"
    ].join("\n");

    const parsed = await new TypeScriptParser().parse(tiny, { filePath: "tiny.ts" });
    const chunks = chunkBySymbols(tiny, parsed.symbols, { minTokens: 100, maxTokens: 1000 });

    // Dort ayri sabit tek chunk'ta toplanmali.
    expect(chunks.length).toBeLessThan(4);
  });

  it("birleştirme bütçeyi aşmaz", async () => {
    const tiny = Array.from({ length: 50 }, (_, i) => `export const s${i} = ${i};`).join("\n");
    const parsed = await new TypeScriptParser().parse(tiny, { filePath: "t.ts" });
    const chunks = chunkBySymbols(tiny, parsed.symbols, { minTokens: 1000, maxTokens: 60 });

    for (const c of chunks) {
      // Tek basina butceden buyuk olan bir birim bolunur; birlestirme
      // asla butceyi asmamali.
      if (c.partCount === 1) expect(c.estimatedTokens).toBeLessThanOrEqual(60 * 1.5);
    }
  });
});

describe("chunkBySymbols — sınır durumları", () => {
  it("boş kaynakta boş dizi döner", () => {
    expect(chunkBySymbols("", [])).toEqual([]);
  });

  it("yalnız boşluktan oluşan kaynakta chunk üretmez", () => {
    expect(chunkBySymbols("   \n\n  \n", [])).toEqual([]);
  });

  it("sembol yoksa içeriği yine de chunk'lar", () => {
    const text = "sadece duz metin\nikinci satir\n";
    const chunks = chunkBySymbols(text, []);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].symbolName).toBeNull();
  });
});

describe("estimateTokens", () => {
  it("boş metinde 0 döner", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("uzun metinde daha büyük değer verir", () => {
    expect(estimateTokens("a".repeat(1000))).toBeGreaterThan(estimateTokens("a".repeat(10)));
  });

  it("en az 1 döner", () => {
    expect(estimateTokens("x")).toBeGreaterThanOrEqual(1);
  });

  it("chars/4 sabitine bağlı DEĞİLDİR", () => {
    // P00 bulgusu: chunkContent chars/4 kullaniyordu. Kelime yogunlugu
    // farkli iki metin ayni uzunlukta olsa da farkli tahmin almali.
    const dense = "a ".repeat(100);
    const sparse = "a".repeat(200);
    expect(estimateTokens(dense)).not.toBe(estimateTokens(sparse));
  });
});

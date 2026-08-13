/**
 * P04 — Legacy `chunkContent` davranış testleri.
 *
 * Bu fonksiyon P06'da kaldırılacak ama o güne kadar canlı. P00 bulgusu
 * (sabit karakter dilimi, satır ortasından kesme) burada kilitlenir;
 * ayrıca legacy doğrulama script'lerinin dayandığı "birebir yeniden
 * birleşme" sözleşmesi korunur.
 */

import { describe, it, expect } from "vitest";
import { chunkContent } from "./index";

describe("chunkContent", () => {
  it("boş içerikte boş liste döner", () => {
    expect(chunkContent("")).toEqual([]);
  });

  it("parçaların birleşimi kaynağın BİREBİR aynısıdır", () => {
    const source = "import { useState } from 'react';\n".repeat(200);
    const chunks = chunkContent(source, 100);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.content).join("")).toBe(source);
  });

  it("satır ortasından KESMEZ (P00 bulgusu)", () => {
    const source = "aaaaaaaaaa\nbbbbbbbbbb\ncccccccccc\ndddddddddd\n";
    // 1 token ~ 4 karakter; 3 token ~ 12 karakter: her chunk 1 satir alir.
    const chunks = chunkContent(source, 3);

    for (const chunk of chunks) {
      // Her parca ya satir sonuyla biter ya da dosyanin sonudur.
      const endsAtLineBoundary = chunk.content.endsWith("\n");
      const isLast = chunk.chunkIndex === chunks.length - 1;
      expect(endsAtLineBoundary || isLast).toBe(true);
    }
  });

  it("chunkIndex sıralıdır ve sıfırdan başlar", () => {
    const chunks = chunkContent("satir\n".repeat(50), 2);
    expect(chunks[0].chunkIndex).toBe(0);
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });

  it("her parça token tahmini ve checksum taşır", () => {
    const chunks = chunkContent("merhaba dunya\n");
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
    expect(chunks[0].checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("aynı girdi aynı çıktıyı verir (deterministik)", () => {
    const source = "satir icerigi\n".repeat(30);
    expect(chunkContent(source, 5)).toEqual(chunkContent(source, 5));
  });

  it("bütçeden büyük TEK satır bölünür (minified dosya sınırsız chunk üretmez)", () => {
    // Tek satir, satir sonu yok, 500 karakter; butce 10 token = 40 karakter.
    const source = "x".repeat(500);
    const chunks = chunkContent(source, 10);

    expect(chunks.length).toBe(Math.ceil(500 / 40));
    expect(chunks.map((c) => c.content).join("")).toBe(source);
    for (const chunk of chunks) expect(chunk.content.length).toBeLessThanOrEqual(40);
  });

  it("bütçeye sığan içerik tek parça kalır", () => {
    const chunks = chunkContent("kisa icerik\n", 1000);
    expect(chunks.length).toBe(1);
  });

  it("son satırda newline yoksa içerik kaybolmaz", () => {
    const source = "birinci\nikinci\nucuncu";
    expect(chunkContent(source, 2).map((c) => c.content).join("")).toBe(source);
  });
});

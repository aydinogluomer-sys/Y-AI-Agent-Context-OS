/**
 * P04 / Y-P04-008 — Symbol-aware chunking (ADR-020).
 *
 * P00 Truth Audit bulgusu (`packages/context/src/index.ts:317-344`):
 *
 *     const charsPerToken = 4;
 *     const charsPerChunk = maxTokensPerChunk * charsPerToken;
 *     for (let i = 0; i < content.length; i += charsPerChunk) {
 *       const chunkText = content.slice(i, i + charsPerChunk);
 *
 * Sabit genişlikte karakter dilimi. Fonksiyonun ortasından kesiyor,
 * dil bilmiyor, örtüşme yok.
 *
 * Bu neden önemli: manifest'in (P09) "bu fonksiyon dahil edildi"
 * diyebilmesi için fragment'ın bir SEMBOLE karşılık gelmesi gerekir.
 * Rastgele bir karakter dilimi provenance'ı anlamsızlaştırır — agent'a
 * yarım bir fonksiyon verip "işte bağlam" demek olur.
 *
 * ADR-020: chunk sınırı = symbol sınırı. Sembol bütçeden büyükse
 * alt-chunk'lara bölünür ve `parentSymbol` ile bağlanır.
 */

import type { ParsedSymbol } from "./types";

export interface Chunk {
  /** Kaynak dosyadaki sıra numarası. */
  readonly ordinal: number;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly startByte: number;
  readonly endByte: number;
  /** Bu chunk hangi sembole karşılık geliyor? */
  readonly symbolName: string | null;
  readonly symbolType: ParsedSymbol["symbolType"] | null;
  /** Sembol bütçeden büyük olduğu için bölündüyse, kaçıncı parça. */
  readonly partIndex: number;
  readonly partCount: number;
  /** Tahmini token sayısı. Gerçek tokenizer P08'de bağlanır. */
  readonly estimatedTokens: number;
}

export interface ChunkOptions {
  /** Chunk başına azami token. */
  readonly maxTokens?: number;
  /**
   * Bir chunk'ın anlamlı sayılması için gereken asgari token.
   * Bunun altındaki komşu semboller birleştirilir — 3 satırlık bir
   * getter'ı tek başına bir fragment yapmak bütçeyi israf eder.
   */
  readonly minTokens?: number;
  /** Alt-chunk'lar arasında tekrarlanacak satır sayısı. */
  readonly overlapLines?: number;
}

const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_MIN_TOKENS = 40;
const DEFAULT_OVERLAP_LINES = 2;

/**
 * Kaba token tahmini.
 *
 * DİKKAT: bu GEÇİCİDİR. P08 gerçek tokenizer'ı bağlayacak (ADR-010).
 * Burada `chars/4` yerine kelime + bayt karışımı kullanılıyor çünkü
 * kod, düz metinden farklı tokenize olur; ama yine de yaklaşıktır ve
 * `Chunk.estimatedTokens` adı bunu açıkça söyler.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  const words = text.split(/\s+/).filter((w) => w.length > 0).length;
  const bytes = Buffer.byteLength(text, "utf-8");
  return Math.max(1, Math.ceil(Math.max(words * 1.3, bytes / 3.5)));
}

/**
 * Sembolleri chunk'lara böler.
 *
 * Semboller iç içe olabilir (sınıf > metot). Yalnız EN DIŞTAKİ semboller
 * chunk üretir; iç semboller onun içinde kalır. Aksi halde bir metot hem
 * kendi chunk'ında hem sınıfın chunk'ında iki kez sayılırdı.
 */
export function chunkBySymbols(
  source: string,
  symbols: readonly ParsedSymbol[],
  options: ChunkOptions = {}
): Chunk[] {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const minTokens = options.minTokens ?? DEFAULT_MIN_TOKENS;
  const overlapLines = options.overlapLines ?? DEFAULT_OVERLAP_LINES;

  const topLevel = selectTopLevel(symbols);
  const chunks: Chunk[] = [];
  let ordinal = 0;

  // Sembol disinda kalan icerik (lisans basligi, import blogu, dosya
  // sonu) kaybolmamali: bunlar da chunk'lanir.
  const gaps = findGaps(source, topLevel);

  const units: { start: number; end: number; symbol: ParsedSymbol | null }[] = [
    ...topLevel.map((s) => ({ start: s.startByte, end: s.endByte, symbol: s })),
    ...gaps.map((g) => ({ start: g.start, end: g.end, symbol: null }))
  ].sort((a, b) => a.start - b.start);

  // Kucuk komsu birimleri birlestir.
  const merged = mergeSmallUnits(source, units, minTokens, maxTokens);

  for (const unit of merged) {
    const text = source.slice(unit.start, unit.end);
    if (text.trim().length === 0) continue;

    const tokens = estimateTokens(text);

    if (tokens <= maxTokens) {
      chunks.push(
        buildChunk(source, ordinal++, unit.start, unit.end, unit.symbol, 0, 1)
      );
      continue;
    }

    // Sembol butceden buyuk: alt-chunk'lara bol.
    const parts = splitOversized(source, unit.start, unit.end, maxTokens, overlapLines);
    for (let i = 0; i < parts.length; i++) {
      chunks.push(
        buildChunk(source, ordinal++, parts[i].start, parts[i].end, unit.symbol, i, parts.length)
      );
    }
  }

  return chunks;
}

/** İç içe sembollerden yalnız en dıştakileri seçer. */
function selectTopLevel(symbols: readonly ParsedSymbol[]): ParsedSymbol[] {
  const sorted = [...symbols].sort((a, b) => a.startByte - b.startByte || b.endByte - a.endByte);
  const out: ParsedSymbol[] = [];

  for (const symbol of sorted) {
    const containedInPrevious = out.some(
      (prev) => symbol.startByte >= prev.startByte && symbol.endByte <= prev.endByte
    );
    if (!containedInPrevious) out.push(symbol);
  }
  return out;
}

/** Semboller arasında kalan boşluklar. */
function findGaps(source: string, symbols: readonly ParsedSymbol[]): { start: number; end: number }[] {
  const gaps: { start: number; end: number }[] = [];
  let cursor = 0;

  for (const symbol of symbols) {
    if (symbol.startByte > cursor) gaps.push({ start: cursor, end: symbol.startByte });
    cursor = Math.max(cursor, symbol.endByte);
  }
  if (cursor < source.length) gaps.push({ start: cursor, end: source.length });

  return gaps.filter((g) => source.slice(g.start, g.end).trim().length > 0);
}

/**
 * Küçük komşu birimleri birleştirir.
 *
 * `minTokens` altındaki ardışık birimler tek chunk'ta toplanır — ama
 * birleşim `maxTokens`'ı aşmamalı. Bir sembol tek başına yeterince
 * büyükse dokunulmaz.
 */
function mergeSmallUnits(
  source: string,
  units: { start: number; end: number; symbol: ParsedSymbol | null }[],
  minTokens: number,
  maxTokens: number
): { start: number; end: number; symbol: ParsedSymbol | null }[] {
  const out: { start: number; end: number; symbol: ParsedSymbol | null }[] = [];

  for (const unit of units) {
    const tokens = estimateTokens(source.slice(unit.start, unit.end));
    const previous = out[out.length - 1];

    if (
      previous &&
      tokens < minTokens &&
      estimateTokens(source.slice(previous.start, unit.end)) <= maxTokens
    ) {
      // Birlestirilen chunk'in sembolu: varsa oncekinin, yoksa bunun.
      out[out.length - 1] = {
        start: previous.start,
        end: unit.end,
        symbol: previous.symbol ?? unit.symbol
      };
      continue;
    }
    out.push({ ...unit });
  }
  return out;
}

/** Bütçeyi aşan bir birimi satır sınırlarında böler. */
function splitOversized(
  source: string,
  start: number,
  end: number,
  maxTokens: number,
  overlapLines: number
): { start: number; end: number }[] {
  const text = source.slice(start, end);
  const lines = text.split("\n");

  // Satir baslangic offset'leri (birim icinde, mutlak degil).
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += Buffer.byteLength(line, "utf-8") + 1;
  }

  const parts: { start: number; end: number }[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    let last = cursor;
    let acc = 0;

    while (last < lines.length) {
      acc += estimateTokens(lines[last]);
      if (acc > maxTokens && last > cursor) break;
      last++;
    }

    const partStart = start + lineStarts[cursor];
    const partEnd = last >= lines.length ? end : start + lineStarts[last];
    parts.push({ start: partStart, end: partEnd });

    if (last >= lines.length) break;
    // Ortusme: bir sonraki parca birkac satir geriden baslar ki
    // sinira denk gelen bir ifade tamamen kaybolmasin.
    cursor = Math.max(cursor + 1, last - overlapLines);
  }

  return parts;
}

function buildChunk(
  source: string,
  ordinal: number,
  start: number,
  end: number,
  symbol: ParsedSymbol | null,
  partIndex: number,
  partCount: number
): Chunk {
  const content = source.slice(start, end);
  return {
    ordinal,
    content,
    startLine: lineAt(source, start),
    endLine: lineAt(source, Math.max(start, end - 1)),
    startByte: start,
    endByte: end,
    symbolName: symbol?.symbolName ?? null,
    symbolType: symbol?.symbolType ?? null,
    partIndex,
    partCount,
    estimatedTokens: estimateTokens(content)
  };
}

function lineAt(source: string, byteOffset: number): number {
  let line = 1;
  for (let i = 0; i < byteOffset && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

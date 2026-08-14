/**
 * P04 / Y-P04-001 — Parser registry.
 *
 * Dil -> parser eşlemesi. Yeni bir dil eklemek, `LanguageParser`
 * implemente edip buraya kaydolmaktan ibarettir (ADR-007).
 *
 * P00 bulgusu: dil tespiti `typescript`/`javascript` olarak hard-code'du
 * ve desteklenmeyen her dil regex fallback'e düşüyordu — hem yanlış
 * etiketle hem sessizce.
 */

import { detectLanguage } from "../ingestion/snapshot-service";
import { TypeScriptParser } from "./typescript-parser";
import { TreeSitterParser } from "./tree-sitter-parser";
import { StructuralParser } from "./structural-parser";
import { SqlParser } from "./sql-parser";
import type { LanguageParser, ParseOptions, ParseResult } from "./types";

export class ParserRegistry {
  private readonly byLanguage = new Map<string, LanguageParser>();
  private readonly fallback: LanguageParser;
  private initialized = false;

  constructor(parsers: readonly LanguageParser[], fallback: LanguageParser) {
    for (const parser of parsers) {
      for (const language of parser.languages) {
        this.byLanguage.set(language, parser);
      }
    }
    this.fallback = fallback;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const seen = new Set<LanguageParser>();
    for (const parser of this.byLanguage.values()) {
      if (seen.has(parser)) continue;
      seen.add(parser);
      await parser.initialize?.();
    }
    this.initialized = true;
  }

  /** Bu dil için gerçek bir gramer var mı? */
  supports(language: string | null): boolean {
    return language !== null && this.byLanguage.has(language);
  }

  parserFor(language: string | null): LanguageParser {
    if (language === null) return this.fallback;
    return this.byLanguage.get(language) ?? this.fallback;
  }

  /**
   * Dosyayı ayrıştırır.
   *
   * Desteklenmeyen dilde SESSİZCE yanlış parser'a düşmez: yapısal
   * parser'a düşer ve sonuç `confidenceBasis.method = "structural"`
   * ile AÇIKÇA işaretlenir.
   */
  async parse(source: string, options: ParseOptions): Promise<ParseResult> {
    await this.initialize();
    const language = detectLanguage(options.filePath);
    const parser = this.parserFor(language);

    try {
      return await parser.parse(source, options);
    } catch (error) {
      // Gramer yuklenemezse veya parse coker ise yapisal parser'a duseriz —
      // ama bu DURUM KAYDEDILIR, sessizce yutulmaz.
      if (parser === this.fallback) throw error;

      const result = await this.fallback.parse(source, options);
      return {
        ...result,
        diagnostics: [
          {
            severity: "warning",
            message: `${parser.id} basarisiz, yapisal ayristirmaya dusuldu: ${
              error instanceof Error ? error.message : String(error)
            }`,
            line: 1
          },
          ...result.diagnostics
        ]
      };
    }
  }

  /** Kayıtlı parser'ların sürümleri — manifest determinizmi girdisi (P09). */
  versions(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const parser of new Set(this.byLanguage.values())) {
      out[parser.id] = parser.version;
    }
    out[this.fallback.id] = this.fallback.version;
    return out;
  }
}

/** Varsayılan registry: TS compiler + tree-sitter + yapısal fallback. */
export function createDefaultRegistry(): ParserRegistry {
  return new ParserRegistry(
    [
      new TypeScriptParser(),
      new TreeSitterParser(),
      // [P17 / A7] SQL, spec §6'nin zorunlu dil listesindeydi ama
      // tree-sitter-wasms SQL grammar'i icermiyor; dosyalar yapisal
      // parser'a dusuyor ve HIC SEMBOL URETMIYORDU. Bu urunde `schema`
      // ve `migration` birinci sinif sembol tipleri (spec §6) ve depoda
      // 82 migration var.
      new SqlParser()
    ],
    new StructuralParser()
  );
}

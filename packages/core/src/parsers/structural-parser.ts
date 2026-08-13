/**
 * P04 — Yapısal (son çare) parser.
 *
 * `RegexFallbackParser`'ın yerini alır. İki önemli fark:
 *
 *   1. Confidence AÇIKÇA düşüktür (`method: "structural"`, taban 0.55).
 *      Eski parser sabit `0.6` veriyordu ama bu değer sonuçların
 *      güvenilirliğiyle ilişkili değildi.
 *   2. Bir dili "anladığını" iddia ETMEZ. Yalnız girinti ve yaygın
 *      anahtar kelimelerle kaba sembol sınırları çıkarır; bunu da
 *      diagnostic olarak bildirir.
 *
 * Amaç, bilinmeyen bir dilde bile chunk sınırlarının satır ortasından
 * geçmemesini sağlamaktır (ADR-020).
 */

import {
  computeConfidence,
  type LanguageParser,
  type ParsedSymbol,
  type ParseOptions,
  type ParseResult
} from "./types";

/** Çok dilli, kaba tanım kalıpları. */
const DEFINITION_PATTERNS: { re: RegExp; type: ParsedSymbol["symbolType"] }[] = [
  { re: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, type: "function" },
  { re: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, type: "class" },
  { re: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/, type: "interface" },
  { re: /^\s*def\s+([A-Za-z_][\w]*)/, type: "function" },
  { re: /^\s*func\s+([A-Za-z_][\w]*)/, type: "function" },
  { re: /^\s*(?:pub\s+)?fn\s+([A-Za-z_][\w]*)/, type: "function" },
  { re: /^\s*(?:public|private|protected)?\s*(?:static\s+)?[\w<>\[\]]+\s+([A-Za-z_][\w]*)\s*\(/, type: "method" },
  { re: /^#{1,6}\s+(.+)$/, type: "markdown_section" }
];

export class StructuralParser implements LanguageParser {
  readonly id = "structural";
  readonly version = "1";
  readonly languages: readonly string[] = [];

  async parse(source: string, options: ParseOptions): Promise<ParseResult> {
    const lines = source.split("\n");
    const symbols: ParsedSymbol[] = [];

    let byteOffset = 0;
    const lineStartByte: number[] = [];
    for (const line of lines) {
      lineStartByte.push(byteOffset);
      byteOffset += Buffer.byteLength(line, "utf-8") + 1;
    }

    for (let i = 0; i < lines.length; i++) {
      for (const { re, type } of DEFINITION_PATTERNS) {
        const m = re.exec(lines[i]);
        if (!m) continue;

        const end = findBlockEnd(lines, i);
        symbols.push({
          symbolType: type,
          symbolName: m[1].trim(),
          startLine: i + 1,
          endLine: end + 1,
          startByte: lineStartByte[i],
          endByte: lineStartByte[Math.min(end + 1, lines.length - 1)],
          parentSymbol: null,
          exported: /^\s*(?:export|pub|public)\b/.test(lines[i]),
          text: lines.slice(i, end + 1).join("\n")
        });
        break;
      }
    }

    const basis = { errorNodeRatio: 0, unresolvedImportRatio: 0, method: "structural" as const };

    return {
      language: "unknown",
      symbols,
      imports: [],
      exports: symbols.filter((s) => s.exported).map((s) => s.symbolName),
      diagnostics: [
        {
          severity: "warning",
          message:
            `${options.filePath} icin gercek bir gramer yok; yapisal ayristirma kullanildi. ` +
            "Sembol sinirlari yaklasiktir.",
          line: 1
        }
      ],
      confidence: computeConfidence(basis),
      confidenceBasis: basis
    };
  }
}

/** Girinti tabanlı blok sonu tespiti — süslü parantez ve Python için çalışır. */
function findBlockEnd(lines: string[], start: number): number {
  const baseIndent = indentOf(lines[start]);
  let depth = 0;
  let sawBrace = false;

  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") {
        depth++;
        sawBrace = true;
      } else if (ch === "}") depth--;
    }
    if (sawBrace && depth === 0 && i > start) return i;

    // Suslu parantez yoksa girintiye bak (Python, YAML).
    if (!sawBrace && i > start && lines[i].trim().length > 0 && indentOf(lines[i]) <= baseIndent) {
      return i - 1;
    }
  }
  return lines.length - 1;
}

function indentOf(line: string): number {
  const m = /^(\s*)/.exec(line);
  return m ? m[1].length : 0;
}

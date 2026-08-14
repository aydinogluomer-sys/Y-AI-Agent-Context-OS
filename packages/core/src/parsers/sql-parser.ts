/**
 * P17 / A7 — SQL parser (spec §6).
 *
 * Spec §6 minimum üretim desteği olarak şunları sayıyor:
 *
 *     TypeScript · JavaScript · TSX · JSX · JSON · Markdown · YAML · SQL · Python
 *
 * P17 denetiminde **SQL karşılanmıyordu**. `detectLanguage` `.sql` için
 * `"sql"` döndürüyor, ama `tree-sitter-wasms` paketinde SQL grammar'ı yok;
 * dosyalar yapısal parser'a düşüyor ve **hiç sembol üretmiyordu**.
 *
 * Bu, bu üründe özellikle önemli: spec §6 `schema` ve `migration`'ı
 * **birinci sınıf sembol tipi** sayıyor, ve depoda 82 migration dosyası
 * var. Migration'ları sembolsüz bırakmak, graph'ta (ADR-022) ve
 * retrieval'da veritabanı şemasının hiç görünmemesi demektir — bir "veritabanı
 * değişikliği" görevi için tam olarak gereken context eksik kalır.
 *
 * ## Neden tree-sitter değil
 *
 * `tree-sitter-wasms` SQL grammar'ı içermiyor; ayrı bir grammar paketi
 * eklemek yeni bir bağımlılık ve WASM yükleme yolu demek. SQL'in DDL alt
 * kümesi (CREATE / ALTER / INDEX / FUNCTION / TRIGGER / VIEW) satır tabanlı
 * olarak güvenilir biçimde tanınabildiği için yapısal parser yeterli.
 *
 * Bu bir ödün değil, kapsam kararı: parser DDL'i tanır, tam SQL ifade
 * ağacını **çıkarmaz** ve bunu `method: "structural"` ile bildirir —
 * confidence buna göre düşük hesaplanır (ADR-021). Sorgu gövdelerinin
 * semantik analizi gerekirse gerçek bir grammar gerekir; o zaman bu karar
 * yeniden verilir.
 */

import {
  computeConfidence,
  type LanguageParser,
  type ParseOptions,
  type ParseResult,
  type ParsedSymbol,
  type SymbolType
} from "./types";

interface DdlPattern {
  readonly regex: RegExp;
  readonly symbolType: SymbolType;
  /** Ad hangi yakalama grubunda. */
  readonly nameGroup: number;
}

/**
 * DDL kalıpları.
 *
 * `IF NOT EXISTS`, şema öneki (`public.users`) ve tırnaklı tanımlayıcılar
 * (`"user"`) desteklenir — üçü de gerçek migration dosyalarında yaygın ve
 * atlanırsa sembol sessizce kaybolur.
 */
const PATTERNS: readonly DdlPattern[] = [
  {
    regex: /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/i,
    symbolType: "schema",
    nameGroup: 1
  },
  {
    regex: /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/i,
    symbolType: "schema",
    nameGroup: 1
  },
  {
    regex: /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w".]+)/i,
    symbolType: "schema",
    nameGroup: 1
  },
  {
    regex: /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w".]+)/i,
    symbolType: "function",
    nameGroup: 1
  },
  {
    regex: /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+([\w".]+)/i,
    symbolType: "function",
    nameGroup: 1
  },
  {
    regex: /^\s*CREATE\s+TYPE\s+([\w".]+)/i,
    symbolType: "type",
    nameGroup: 1
  },
  {
    regex: /^\s*ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?([\w".]+)/i,
    symbolType: "migration",
    nameGroup: 1
  },
  {
    regex: /^\s*DROP\s+(?:TABLE|INDEX|VIEW|TYPE|FUNCTION|TRIGGER)\s+(?:IF\s+EXISTS\s+)?([\w".]+)/i,
    symbolType: "migration",
    nameGroup: 1
  }
];

/** `public."user"` -> `public.user` */
function normalizeName(raw: string): string {
  return raw.replace(/"/g, "");
}

/**
 * Bir ifadenin bittiği satırı bulur.
 *
 * SQL ifadeleri `;` ile biter, ama `;` bir string sabiti ya da dolar
 * işaretli gövde (`$$ ... $$`, PL/pgSQL fonksiyonları) içinde de geçebilir.
 * İkisini de saymamak, fonksiyon gövdesindeki ilk `;`'de ifadeyi bitirir ve
 * sembol sınırını yanlış üretir.
 */
function findStatementEnd(lines: readonly string[], startIndex: number): number {
  let inDollarBody = false;
  let dollarTag = "";

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    // Dolar isaretli gövde acilis/kapanis
    const dollarMatches = line.match(/\$([A-Za-z_]*)\$/g) ?? [];
    for (const token of dollarMatches) {
      if (!inDollarBody) {
        inDollarBody = true;
        dollarTag = token;
      } else if (token === dollarTag) {
        inDollarBody = false;
        dollarTag = "";
      }
    }

    if (inDollarBody) continue;

    // Tek tirnak icindeki `;` sayilmaz.
    const withoutStrings = line.replace(/'(?:[^']|'')*'/g, "''");
    const withoutComment = withoutStrings.replace(/--.*$/, "");
    if (withoutComment.includes(";")) return i;
  }

  return lines.length - 1;
}

function isCommentOrBlank(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("--");
}

export class SqlParser implements LanguageParser {
  readonly languages: readonly string[] = ["sql"];
  readonly id = "sql-structural";
  readonly version = "1.0.0";

  async parse(source: string, options: ParseOptions): Promise<ParseResult> {
    const lines = source.split("\n");
    const symbols: ParsedSymbol[] = [];

    // Bayt ofsetleri: satir baslangicinin kumulatif bayt konumu.
    const lineByteOffsets: number[] = new Array(lines.length);
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      lineByteOffsets[i] = offset;
      offset += Buffer.byteLength(lines[i], "utf-8") + 1; // +1 = newline
    }

    let statementCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isCommentOrBlank(line)) continue;

      for (const pattern of PATTERNS) {
        const match = pattern.regex.exec(line);
        if (!match) continue;

        statementCount++;
        const endLine = findStatementEnd(lines, i);
        const text = lines.slice(i, endLine + 1).join("\n");
        const endOffset =
          lineByteOffsets[endLine] + Buffer.byteLength(lines[endLine], "utf-8");

        symbols.push({
          symbolType: pattern.symbolType,
          symbolName: normalizeName(match[pattern.nameGroup]),
          startLine: i + 1,
          endLine: endLine + 1,
          startByte: lineByteOffsets[i],
          endByte: endOffset,
          parentSymbol: null,
          // SQL'de "export" kavrami yok; DDL nesneleri semaya gore
          // gorunurdur. `false` demek yaniltici olurdu; `true` da oyle.
          // Kanonik secim: DDL nesneleri semada GORUNUR sayilir.
          exported: true,
          text
        });
        break; // bir satir tek bir DDL ifadesi baslatir
      }
    }

    const basis = {
      // Yapisal parser hata dugumu URETMEZ; oran her zaman 0 ve bu
      // durustce boyle raporlanir. Uydurma bir hata orani, confidence'i
      // olculmus gibi gosterirdi (ADR-021).
      errorNodeRatio: 0,
      // SQL'de import yok.
      unresolvedImportRatio: 0,
      method: "structural" as const
    };

    return {
      language: "sql",
      symbols,
      imports: [],
      exports: symbols.map((s) => s.symbolName),
      diagnostics:
        statementCount === 0 && source.trim().length > 0
          ? [
              {
                severity: "warning" as const,
                message:
                  "DDL ifadesi bulunamadi. Dosya yalniz DML (SELECT/INSERT) " +
                  "iceriyor olabilir; bu parser DDL tanir.",
                line: 1
              }
            ]
          : [],
      confidence: computeConfidence(basis),
      confidenceBasis: basis
    };
  }
}

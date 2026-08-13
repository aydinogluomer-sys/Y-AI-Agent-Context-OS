/**
 * P04 / Y-P04-001 — LanguageParser sözleşmesi (ADR-007).
 *
 * P00 Truth Audit bulguları:
 *   - `static-analysis.ts` YALNIZ TypeScript/JS destekliyordu. `analyzeFile`
 *     dili `typescript`/`javascript` olarak HARD-CODE ediyordu; bir `.py`
 *     dosyası "javascript" etiketiyle regex parser'a gidiyordu.
 *   - `parseDatabaseTables` Y-OS'un KENDİ 16 tablo adına karşı eşleşiyordu;
 *     başka bir projede hiçbir şey bulmazdı.
 *   - Confidence SABİTTİ: AST için `0.95`, regex için `0.6`. Ölçülmüyordu.
 *   - Sonuç HİÇBİR YERE YAZILMIYORDU: `POST .../static-analysis/analyze-file`
 *     sonucu yalnız HTTP yanıtında dönüyordu; `symbols` tablosu yoktu.
 *
 * Bu sözleşme, dil desteğini plugin haline getirir. Yeni bir dil eklemek
 * `LanguageParser` implemente edip registry'ye kaydolmaktan ibarettir.
 */

/** Master plan §6'daki semantik birimler. */
export type SymbolType =
  | "module"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "function"
  | "method"
  | "variable"
  | "constant"
  | "export"
  | "import"
  | "route"
  | "test"
  | "schema"
  | "migration"
  | "configuration"
  | "markdown_section"
  | "adr";

/**
 * Çıkarılan sembol.
 *
 * Master plan §6'nın zorunlu 14 alanı burada karşılanır; `repositoryId`,
 * `commitSha` ve `symbolId` persist katmanında (indexer) eklenir çünkü
 * parser onları bilmez ve bilmemelidir.
 */
export interface ParsedSymbol {
  readonly symbolType: SymbolType;
  readonly symbolName: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly startByte: number;
  readonly endByte: number;
  /** Kapsayan sembolün adı (metot -> sınıf). Üst düzeyse null. */
  readonly parentSymbol: string | null;
  /** Bu sembol dışa aktarılıyor mu? */
  readonly exported: boolean;
  /** Yalnız bu sembolün gövdesi — chunk üretimi için (P04 chunking). */
  readonly text: string;
}

export interface ParsedImport {
  /** Kaynak modül yolu, örn. `./auth` veya `express`. */
  readonly source: string;
  /** İçe aktarılan adlar; `*` namespace import demektir. */
  readonly names: readonly string[];
  readonly line: number;
  readonly isTypeOnly: boolean;
}

export interface ParseDiagnostic {
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly line: number;
}

/**
 * Parser çıktısı.
 *
 * `confidence` ÖLÇÜLÜR, atanmaz (ADR-021). Hesaplama parser'a bağlıdır ama
 * daima gözlemlenebilir bir orana dayanır: hata düğümü oranı, çözülemeyen
 * import oranı gibi.
 */
export interface ParseResult {
  readonly language: string;
  readonly symbols: readonly ParsedSymbol[];
  readonly imports: readonly ParsedImport[];
  readonly exports: readonly string[];
  readonly diagnostics: readonly ParseDiagnostic[];
  readonly confidence: number;
  /** Confidence'ın nasıl hesaplandığı — denetlenebilirlik için. */
  readonly confidenceBasis: {
    readonly errorNodeRatio: number;
    readonly unresolvedImportRatio: number;
    readonly method: "ast" | "tree-sitter" | "structural";
  };
}

export interface ParseOptions {
  /** Dosya yolu — bazı parser'lar dosya adından çıkarım yapar (test, route). */
  readonly filePath: string;
  /** Azami parse süresi. Aşılırsa `TimeoutError` (T-06 malicious repo). */
  readonly timeoutMs?: number;
}

export class ParserTimeoutError extends Error {
  constructor(
    readonly filePath: string,
    readonly timeoutMs: number
  ) {
    super(`Parse zaman asimi: ${filePath} (${timeoutMs}ms)`);
    this.name = "ParserTimeoutError";
  }
}

export interface LanguageParser {
  /** Bu parser'ın ele aldığı diller (`detectLanguage` çıktısıyla eşleşir). */
  readonly languages: readonly string[];
  /** İnsan tarafından okunabilir tanım — teşhis çıktılarında görünür. */
  readonly id: string;
  /** Parser sürümü. Manifest determinizminin girdisi (P09). */
  readonly version: string;

  /** Grammar yükleme gibi tek seferlik hazırlık. */
  initialize?(): Promise<void>;

  parse(source: string, options: ParseOptions): Promise<ParseResult>;
}

/**
 * Confidence hesabı (ADR-021).
 *
 * Sabit değer atamak yerine gözlemlenen iki orandan türetilir:
 *   - `errorNodeRatio`: parse ağacındaki hata düğümlerinin oranı
 *   - `unresolvedImportRatio`: çözülemeyen import'ların oranı
 *
 * Yöntem tabanı da farklıdır: gerçek AST, tree-sitter ve yapısal
 * (satır tabanlı) analiz aynı güveni hak etmez.
 */
const METHOD_BASE: Record<ParseResult["confidenceBasis"]["method"], number> = {
  ast: 1.0,
  "tree-sitter": 0.95,
  structural: 0.55
};

export function computeConfidence(basis: ParseResult["confidenceBasis"]): number {
  const base = METHOD_BASE[basis.method];
  const penalty = basis.errorNodeRatio * 0.6 + basis.unresolvedImportRatio * 0.2;
  return Math.max(0, Math.min(1, base - penalty));
}

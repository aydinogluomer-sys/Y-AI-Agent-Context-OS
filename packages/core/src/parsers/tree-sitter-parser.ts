/**
 * P04 / Y-P04-004 + Y-P04-005 — tree-sitter tabanlı parser (ADR-007).
 *
 * WASM grammar'ları kullanılır (`web-tree-sitter` + `tree-sitter-wasms`),
 * native binding DEĞİL. Sebep: native binding'ler platform başına derleme
 * ister ve CI matrisinde kırılgandır; WASM her yerde aynı çalışır.
 *
 * P00 bulgusu: `RegexFallbackParser` TS dışındaki her dil için kullanılıyordu
 * ve dil etiketi zaten yanlıştı (`.py` -> "javascript"). Gerçek bir gramer
 * olmadan sembol sınırları güvenilir değildir; chunk sınırları da öyle
 * (ADR-020: chunk sınırı = symbol sınırı).
 */

import * as path from "path";
import { createRequire } from "module";
import {
  computeConfidence,
  ParserTimeoutError,
  type LanguageParser,
  type ParseDiagnostic,
  type ParsedImport,
  type ParsedSymbol,
  type ParseOptions,
  type ParseResult,
  type SymbolType
} from "./types";

/** WASM grammar dosyalarının bulunduğu dizin. */
function wasmDirectory(): string {
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out");
}

/** Y dil kimliği -> tree-sitter grammar dosya adı. */
const GRAMMAR_FILES: Record<string, string> = {
  python: "tree-sitter-python.wasm",
  go: "tree-sitter-go.wasm",
  rust: "tree-sitter-rust.wasm",
  java: "tree-sitter-java.wasm",
  ruby: "tree-sitter-ruby.wasm",
  php: "tree-sitter-php.wasm",
  csharp: "tree-sitter-c_sharp.wasm",
  css: "tree-sitter-css.wasm",
  scss: "tree-sitter-scss.wasm",
  html: "tree-sitter-html.wasm",
  json: "tree-sitter-json.wasm",
  yaml: "tree-sitter-yaml.wasm",
  toml: "tree-sitter-toml.wasm",
  shell: "tree-sitter-bash.wasm",
  markdown: "tree-sitter-markdown.wasm"
};

/**
 * Dil başına, hangi düğüm tipinin hangi sembole karşılık geldiği.
 *
 * tree-sitter düğüm adları grammar'a özgüdür; bu tablo onları Y'nin
 * kanonik `SymbolType` kümesine çevirir.
 */
interface NodeMapping {
  readonly symbols: Record<string, SymbolType>;
  /** Sembol adını taşıyan alan adı (grammar'a göre değişir). */
  readonly nameFields: readonly string[];
  /** Import düğümleri. */
  readonly importNodes: readonly string[];
}

const DEFAULT_MAPPING: NodeMapping = {
  symbols: {},
  nameFields: ["name", "identifier"],
  importNodes: []
};

const MAPPINGS: Record<string, NodeMapping> = {
  python: {
    symbols: {
      function_definition: "function",
      class_definition: "class",
      decorated_definition: "function"
    },
    nameFields: ["name"],
    importNodes: ["import_statement", "import_from_statement"]
  },
  go: {
    symbols: {
      function_declaration: "function",
      method_declaration: "method",
      type_declaration: "type",
      const_declaration: "constant",
      var_declaration: "variable"
    },
    nameFields: ["name"],
    importNodes: ["import_declaration"]
  },
  rust: {
    symbols: {
      function_item: "function",
      struct_item: "class",
      enum_item: "enum",
      trait_item: "interface",
      impl_item: "class",
      mod_item: "module",
      const_item: "constant"
    },
    nameFields: ["name"],
    importNodes: ["use_declaration"]
  },
  java: {
    symbols: {
      class_declaration: "class",
      interface_declaration: "interface",
      enum_declaration: "enum",
      method_declaration: "method",
      constructor_declaration: "method"
    },
    nameFields: ["name"],
    importNodes: ["import_declaration"]
  },
  ruby: {
    symbols: { method: "method", class: "class", module: "module", singleton_method: "method" },
    nameFields: ["name"],
    importNodes: []
  },
  php: {
    symbols: {
      function_definition: "function",
      class_declaration: "class",
      interface_declaration: "interface",
      method_declaration: "method",
      trait_declaration: "interface"
    },
    nameFields: ["name"],
    importNodes: ["namespace_use_declaration"]
  },
  csharp: {
    symbols: {
      class_declaration: "class",
      interface_declaration: "interface",
      struct_declaration: "class",
      enum_declaration: "enum",
      method_declaration: "method"
    },
    nameFields: ["name"],
    importNodes: ["using_directive"]
  },
  json: { symbols: { pair: "configuration" }, nameFields: ["key"], importNodes: [] },
  yaml: { symbols: { block_mapping_pair: "configuration" }, nameFields: ["key"], importNodes: [] },
  toml: { symbols: { table: "configuration", pair: "configuration" }, nameFields: ["key"], importNodes: [] },
  css: { symbols: { rule_set: "configuration" }, nameFields: [], importNodes: ["import_statement"] },
  scss: { symbols: { rule_set: "configuration" }, nameFields: [], importNodes: ["import_statement"] },
  html: { symbols: { element: "configuration" }, nameFields: ["tag_name"], importNodes: [] },
  shell: { symbols: { function_definition: "function" }, nameFields: ["name"], importNodes: [] },
  markdown: { symbols: { atx_heading: "markdown_section", setext_heading: "markdown_section" }, nameFields: [], importNodes: [] }
};

/** Grammar'lar süreç ömrü boyunca bir kez yüklenir. */
const grammarCache = new Map<string, unknown>();
let parserModule: any = null;
let initPromise: Promise<void> | null = null;

async function ensureParserModule(): Promise<any> {
  if (parserModule) return parserModule;
  if (!initPromise) {
    initPromise = (async () => {
      const mod = await import("web-tree-sitter");
      const Parser = (mod as any).default ?? mod;
      await Parser.init();
      parserModule = Parser;
    })();
  }
  await initPromise;
  return parserModule;
}

export class TreeSitterParser implements LanguageParser {
  readonly id = "tree-sitter";
  readonly version = "0.22";
  readonly languages: readonly string[] = Object.keys(GRAMMAR_FILES);

  async initialize(): Promise<void> {
    await ensureParserModule();
  }

  async parse(source: string, options: ParseOptions): Promise<ParseResult> {
    const language = languageOf(options.filePath);
    const grammarFile = language ? GRAMMAR_FILES[language] : undefined;

    if (!language || !grammarFile) {
      throw new Error(`tree-sitter grammar yok: ${options.filePath}`);
    }

    const Parser = await ensureParserModule();
    const grammar = await loadGrammar(Parser, language, grammarFile);

    const parser = new Parser();
    parser.setLanguage(grammar);

    // T-06: patolojik girdiye karsi sure siniri.
    const timeoutMs = options.timeoutMs ?? 10_000;
    if (typeof parser.setTimeoutMicros === "function") {
      parser.setTimeoutMicros(timeoutMs * 1000);
    }

    let tree: any;
    try {
      tree = parser.parse(source);
    } catch (error) {
      throw new ParserTimeoutError(options.filePath, timeoutMs);
    }
    if (!tree) throw new ParserTimeoutError(options.filePath, timeoutMs);

    const mapping = MAPPINGS[language] ?? DEFAULT_MAPPING;
    const symbols: ParsedSymbol[] = [];
    const imports: ParsedImport[] = [];
    const diagnostics: ParseDiagnostic[] = [];

    let totalNodes = 0;
    let errorNodes = 0;

    const visit = (node: any, parentSymbolName: string | null): void => {
      totalNodes++;
      if (node.type === "ERROR" || node.isMissing) {
        errorNodes++;
        if (diagnostics.length < 50) {
          diagnostics.push({
            severity: "error",
            message: `Ayristirma hatasi: ${node.type}`,
            line: node.startPosition.row + 1
          });
        }
      }

      let nextParent = parentSymbolName;

      const symbolType = mapping.symbols[node.type];
      if (symbolType) {
        const name = extractName(node, mapping.nameFields) ?? `<anonim:${node.type}>`;
        symbols.push({
          symbolType,
          symbolName: name,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          startByte: node.startIndex,
          endByte: node.endIndex,
          parentSymbol: parentSymbolName,
          exported: isExported(node, language, name),
          text: source.slice(node.startIndex, node.endIndex)
        });
        nextParent = name;
      }

      if (mapping.importNodes.includes(node.type)) {
        const parsed = extractImport(node, source);
        if (parsed) imports.push(parsed);
      }

      for (let i = 0; i < node.childCount; i++) {
        visit(node.child(i), nextParent);
      }
    };

    visit(tree.rootNode, null);

    const basis = {
      errorNodeRatio: totalNodes > 0 ? errorNodes / totalNodes : 0,
      unresolvedImportRatio: 0,
      method: "tree-sitter" as const
    };

    return {
      language,
      symbols,
      imports,
      exports: symbols.filter((s) => s.exported).map((s) => s.symbolName),
      diagnostics,
      confidence: computeConfidence(basis),
      confidenceBasis: basis
    };
  }
}

async function loadGrammar(Parser: any, language: string, file: string): Promise<unknown> {
  const cached = grammarCache.get(language);
  if (cached) return cached;

  const grammar = await Parser.Language.load(path.join(wasmDirectory(), file));
  grammarCache.set(language, grammar);
  return grammar;
}

function extractName(node: any, fields: readonly string[]): string | null {
  for (const field of fields) {
    const child = typeof node.childForFieldName === "function" ? node.childForFieldName(field) : null;
    if (child?.text) return child.text;
  }
  // Alan adi yoksa ilk identifier cocugunu dene.
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === "identifier" || child.type === "type_identifier") return child.text;
  }
  return null;
}

/**
 * Dışa aktarım tespiti.
 *
 * Diller çok farklı: Go büyük harfle başlayanları dışa açar, Python `_`
 * öneki olmayanları, Java/C# `public` niteleyicisini kullanır. Bu ayrımı
 * tek bir kurala indirgemek yanlış olurdu.
 */
function isExported(node: any, language: string, name: string): boolean {
  switch (language) {
    case "go":
      return /^[A-Z]/.test(name);
    case "python":
      return !name.startsWith("_");
    case "rust":
      return node.text?.startsWith("pub ") ?? false;
    case "java":
    case "csharp":
    case "php":
      return /\bpublic\b/.test(node.text?.slice(0, 120) ?? "");
    default:
      return true;
  }
}

function extractImport(node: any, source: string): ParsedImport | null {
  const text = source.slice(node.startIndex, node.endIndex);
  const quoted = /["'`]([^"'`]+)["'`]/.exec(text);
  const bare = /(?:import|use|using)\s+([A-Za-z0-9_.:/\\-]+)/.exec(text);
  const sourceName = quoted?.[1] ?? bare?.[1];
  if (!sourceName) return null;

  return {
    source: sourceName,
    names: [],
    line: node.startPosition.row + 1,
    isTypeOnly: false
  };
}

/** Dosya yolundan dil kimliği — `detectLanguage` ile aynı tabloyu kullanır. */
function languageOf(filePath: string): string | null {
  const lower = filePath.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = lower.slice(dot);

  const map: Record<string, string> = {
    ".py": "python",
    ".pyi": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".json": "json",
    ".jsonc": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".sh": "shell",
    ".bash": "shell",
    ".md": "markdown",
    ".mdx": "markdown"
  };
  return map[ext] ?? null;
}

export { GRAMMAR_FILES, languageOf };

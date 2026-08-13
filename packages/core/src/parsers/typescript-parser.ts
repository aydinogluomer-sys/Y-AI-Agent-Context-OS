/**
 * P04 / Y-P04-002 + Y-P04-003 — TypeScript/JavaScript parser.
 *
 * `static-analysis.ts`'teki `TypeScriptASTParser` buraya taşındı. O parser
 * P00'da **REAL** verdict'i almıştı — gerçek `typescript` compiler'ını
 * kullanıyor — ve korunan da odur.
 *
 * Düzeltilenler:
 *   1. Confidence artık ÖLÇÜLÜYOR (ADR-021). Eski hali sabit `0.95` idi;
 *      sözdizimi hatası olan bir dosya da aynı güveni alıyordu.
 *   2. `parseDatabaseTables`'ın Y-OS'a özel 16 tablo adı listesi KALDIRILDI.
 *      Bu liste başka bir projede hiçbir şey bulmazdı — yani özellik
 *      yalnız kendi repository'mizde "çalışıyor" görünüyordu.
 *   3. Semboller `ParsedSymbol` olarak, satır VE bayt offset'leriyle
 *      çıkarılıyor; chunk sınırları buna dayanacak (ADR-020).
 *
 * tree-sitter yerine TS compiler kullanılmasının sebebi: tip bilgisi,
 * `export` semantiği ve JSX'i gramer düzeyinde değil dil düzeyinde
 * anlaması. TS için daha doğru sonuç verir.
 */

import ts from "typescript";
import {
  computeConfidence,
  type LanguageParser,
  type ParseDiagnostic,
  type ParsedImport,
  type ParsedSymbol,
  type ParseOptions,
  type ParseResult,
  type SymbolType
} from "./types";

const SCRIPT_KIND: Record<string, ts.ScriptKind> = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".js": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS
};

export class TypeScriptParser implements LanguageParser {
  readonly id = "typescript-compiler";
  readonly version = ts.version;
  readonly languages: readonly string[] = ["typescript", "tsx", "javascript", "jsx"];

  async parse(source: string, options: ParseOptions): Promise<ParseResult> {
    const ext = extensionOf(options.filePath);
    const scriptKind = SCRIPT_KIND[ext] ?? ts.ScriptKind.TS;
    const language = languageIdFor(ext);

    const sourceFile = ts.createSourceFile(
      options.filePath,
      source,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      scriptKind
    );

    const symbols: ParsedSymbol[] = [];
    const imports: ParsedImport[] = [];
    const diagnostics: ParseDiagnostic[] = [];

    // `parseDiagnostics` resmi API'de degil ama sozdizimi hatalarini
    // olcmenin tek yolu; olmadigi surumde bos kabul edilir.
    const parseErrors = (sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
    for (const d of parseErrors.slice(0, 50)) {
      const pos = d.start !== undefined ? sourceFile.getLineAndCharacterOfPosition(d.start) : { line: 0 };
      diagnostics.push({
        severity: "error",
        message: ts.flattenDiagnosticMessageText(d.messageText, " "),
        line: pos.line + 1
      });
    }

    const lineOf = (pos: number): number => sourceFile.getLineAndCharacterOfPosition(pos).line + 1;

    const push = (
      node: ts.Node,
      symbolType: SymbolType,
      name: string,
      parent: string | null,
      exported: boolean
    ): void => {
      symbols.push({
        symbolType,
        symbolName: name,
        startLine: lineOf(node.getStart(sourceFile)),
        endLine: lineOf(node.getEnd()),
        startByte: node.getStart(sourceFile),
        endByte: node.getEnd(),
        parentSymbol: parent,
        exported,
        text: source.slice(node.getStart(sourceFile), node.getEnd())
      });
    };

    const visit = (node: ts.Node, parent: string | null): void => {
      let nextParent = parent;
      const exported = hasExportModifier(node);

      if (ts.isImportDeclaration(node)) {
        const parsed = readImport(node, lineOf);
        if (parsed) imports.push(parsed);
      } else if (ts.isClassDeclaration(node) && node.name) {
        push(node, "class", node.name.text, parent, exported);
        nextParent = node.name.text;
      } else if (ts.isInterfaceDeclaration(node)) {
        push(node, "interface", node.name.text, parent, exported);
        nextParent = node.name.text;
      } else if (ts.isTypeAliasDeclaration(node)) {
        push(node, "type", node.name.text, parent, exported);
      } else if (ts.isEnumDeclaration(node)) {
        push(node, "enum", node.name.text, parent, exported);
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        push(node, "function", node.name.text, parent, exported);
      } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
        push(node, "method", node.name.text, parent, exported);
      } else if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
        push(node, "module", node.name.text, parent, exported);
        nextParent = node.name.text;
      } else if (ts.isVariableStatement(node)) {
        const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;
        for (const decl of node.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) continue;
          // Ok fonksiyonu atanmis degisken bir FONKSIYONDUR; degisken degil.
          const isFn =
            decl.initializer !== undefined &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer));
          push(node, isFn ? "function" : isConst ? "constant" : "variable", decl.name.text, parent, exported);
        }
      }

      ts.forEachChild(node, (child) => visit(child, nextParent));
    };

    ts.forEachChild(sourceFile, (node) => visit(node, null));

    // ADR-021: confidence olculur.
    // Sozdizimi hatasi sayisini toplam ifade sayisina oranlayarak
    // "ne kadarini anlayabildik" sorusunu yaklasikliyoruz.
    const statementCount = countNodes(sourceFile);
    const basis = {
      errorNodeRatio: statementCount > 0 ? Math.min(1, parseErrors.length / statementCount) : 0,
      unresolvedImportRatio: 0,
      method: "ast" as const
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

function countNodes(root: ts.Node): number {
  let n = 0;
  const walk = (node: ts.Node): void => {
    n++;
    ts.forEachChild(node, walk);
  };
  walk(root);
  return n;
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = (node as unknown as { modifiers?: ts.NodeArray<ts.ModifierLike> }).modifiers;
  if (!modifiers) return false;
  return modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function readImport(node: ts.ImportDeclaration, lineOf: (pos: number) => number): ParsedImport | null {
  if (!ts.isStringLiteral(node.moduleSpecifier)) return null;

  const names: string[] = [];
  const clause = node.importClause;

  if (clause?.name) names.push(clause.name.text);
  if (clause?.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      names.push("*");
    } else {
      for (const el of clause.namedBindings.elements) names.push(el.name.text);
    }
  }

  return {
    source: node.moduleSpecifier.text,
    names,
    line: lineOf(node.getStart()),
    isTypeOnly: clause?.isTypeOnly ?? false
  };
}

function extensionOf(filePath: string): string {
  const lower = filePath.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? "" : lower.slice(dot);
}

function languageIdFor(ext: string): string {
  if (ext === ".tsx") return "tsx";
  if (ext === ".jsx") return "jsx";
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return "javascript";
  return "typescript";
}

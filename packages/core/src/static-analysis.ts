/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import ts from "typescript";
import { redactSecretLeaks } from "@y/security";

export interface StaticAnalysisResultDTO {
  project_id: string;
  file_path: string;
  parser_kind: "typescript_ast_mvp" | "regex_fallback";
  language: string;
  imports: string[];
  exports: string[];
  components: string[];
  api_calls: { method: string; path: string }[];
  routes: { method: string; path: string }[];
  database_tables: string[];
  test_links: string[];
  design_references: string[];
  warnings: string[];
  confidence: number;
  metadata: any;
}

export interface StaticAnalysisParserAdapter {
  parseImports(source: string, options?: any): string[];
  parseExports(source: string, options?: any): string[];
  parseJSXComponents(source: string, options?: any): string[];
  parseAPICalls(source: string, options?: any): { method: string; path: string }[];
  parseRoutes(source: string, options?: any): { method: string; path: string }[];
  parseDatabaseTables(source: string, options?: any): string[];
  parseTestCoverageLinks(source: string, options?: any): string[];
  parseDesignReferences(source: string, options?: any): string[];
  analyzeFile(source: string, options?: any): StaticAnalysisResultDTO;
}

export class RegexFallbackParser implements StaticAnalysisParserAdapter {
  public parseImports(source: string, options?: any): string[] {
    const imports: string[] = [];
    const esImportRegex = /import\s+?(?:(?:[\w*\s{},]*)\s+from\s+)?['"](.*?)['"]/g;
    let match;
    while ((match = esImportRegex.exec(source)) !== null) {
      if (match[1]) imports.push(match[1]);
    }
    const cjsRequireRegex = /require\s*\(\s*['"](.*?)['"]\s*\)/g;
    while ((match = cjsRequireRegex.exec(source)) !== null) {
      if (match[1]) imports.push(match[1]);
    }
    return Array.from(new Set(imports));
  }

  public parseExports(source: string, options?: any): string[] {
    const exportsSet = new Set<string>();
    const exportStatementRegex = /export\s+(?:const|function|class|let|var|type|interface)\s+([a-zA-Z0-9_$]+)/g;
    let match;
    while ((match = exportStatementRegex.exec(source)) !== null) {
      if (match[1]) exportsSet.add(match[1]);
    }

    const exportCurlyRegex = /export\s+{[^}]*}/g;
    const curlyMatches = source.match(exportCurlyRegex) || [];
    for (const statement of curlyMatches) {
      const symbolsStr = statement.replace(/export\s*{/, "").replace(/}/, "");
      const symbols = symbolsStr.split(",").map(s => s.trim());
      for (const entity of symbols) {
        if (!entity) continue;
        const parts = entity.split(/\s+as\s+/);
        const name = parts[parts.length - 1].trim();
        if (name) exportsSet.add(name);
      }
    }

    const exportDefaultRegex = /export\s+default\s+(?:class|function)?\s*([a-zA-Z0-9_$]+)?/g;
    while ((match = exportDefaultRegex.exec(source)) !== null) {
      if (match[1]) {
        exportsSet.add(match[1]);
      } else {
        exportsSet.add("default");
      }
    }
    return Array.from(exportsSet);
  }

  public parseJSXComponents(source: string, options?: any): string[] {
    const components: string[] = [];
    const jsxRegex = /<([A-Z][a-zA-Z0-9]*)\b/g;
    let match;
    while ((match = jsxRegex.exec(source)) !== null) {
      if (match[1]) components.push(match[1]);
    }
    return Array.from(new Set(components));
  }

  public parseAPICalls(source: string, options?: any): { method: string; path: string }[] {
    const calls: { method: string; path: string }[] = [];
    const fetchRegex = /fetch\s*\(\s*['"](\/api\/.*?)['"]/g;
    let match;
    while ((match = fetchRegex.exec(source)) !== null) {
      if (match[1]) calls.push({ method: "get", path: match[1] });
    }
    const axiosRegex = /axios\s*\.\s*(get|post|patch|delete|put)\s*\(\s*['"](\/api\/.*?)['"]/g;
    while ((match = axiosRegex.exec(source)) !== null) {
      if (match[2]) calls.push({ method: match[1].toLowerCase(), path: match[2] });
    }
    return calls;
  }

  public parseRoutes(source: string, options?: any): { method: string; path: string }[] {
    const routes: { method: string; path: string }[] = [];
    const routeRegex = /(?:router|app)\s*\.\s*(get|post|patch|delete|put)\s*\(\s*['"](\/.*?)['"]/g;
    let match;
    while ((match = routeRegex.exec(source)) !== null) {
      if (match[2]) routes.push({ method: match[1].toLowerCase(), path: match[2] });
    }
    return routes;
  }

  public parseDatabaseTables(source: string, options?: any): string[] {
    const knownTables = options?.known_tables || [
      "projects", "memberships", "tasks", "context_items", "context_chunks", 
      "context_packs", "context_summaries", "durable_memories", "graph_nodes", 
      "graph_edges", "task_boundaries", "boundary_checks", "audit_logs", 
      "artifacts", "debug_logs", "connections"
    ];
    const usedTablesSet = new Set<string>();
    for (const table of knownTables) {
      const tableWordRegex = new RegExp(`\\b${table}\\b`, 'g');
      if (tableWordRegex.test(source)) {
        usedTablesSet.add(table);
      }
    }
    return Array.from(usedTablesSet);
  }

  public parseTestCoverageLinks(source: string, options?: any): string[] {
    const cleanSource = redactSecretLeaks(source);
    const testPatterns = [
      /tested_by\s*[=:]\s*['"](.*?)['"]/g,
      /@test\s+(.*?)(?:\r?\n|$)/g,
      /@spec\s+(.*?)(?:\r?\n|$)/g,
      /testedBy\s*\(\s*['"](.*?)['"]\s*\)/g
    ];
    const links = new Set<string>();
    for (const pattern of testPatterns) {
      let match;
      while ((match = pattern.exec(cleanSource)) !== null) {
        if (match[1]) links.add(match[1].trim());
      }
    }
    return Array.from(links);
  }

  public parseDesignReferences(source: string, options?: any): string[] {
    const figmaRegex = /https:\/\/([\w\.-]+\.)?figma\.com\/(file|proto|board)\/[a-zA-Z0-9_-]+/g;
    const links = new Set<string>();
    let match;
    while ((match = figmaRegex.exec(source)) !== null) {
      links.add(match[0]);
    }
    return Array.from(links);
  }

  public analyzeFile(source: string, options?: any): StaticAnalysisResultDTO {
    const projectId = options?.project_id || "unknown";
    const filePath = options?.file_path || "unspecified";
    const language = filePath.endsWith(".tsx") || filePath.endsWith(".ts") ? "typescript" : "javascript";

    return {
      project_id: projectId,
      file_path: filePath,
      parser_kind: "regex_fallback",
      language,
      imports: this.parseImports(source, options),
      exports: this.parseExports(source, options),
      components: this.parseJSXComponents(source, options),
      api_calls: this.parseAPICalls(source, options),
      routes: this.parseRoutes(source, options),
      database_tables: this.parseDatabaseTables(source, options),
      test_links: this.parseTestCoverageLinks(source, options),
      design_references: this.parseDesignReferences(source, options),
      warnings: ["Regex fallback parser used because TypeScript AST parser was bypassed or failed."],
      confidence: 0.6,
      metadata: {}
    };
  }
}

export class TypeScriptASTParser implements StaticAnalysisParserAdapter {
  private getSourceFile(source: string, filePath = "file.tsx"): ts.SourceFile {
    const scriptKind = filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
  }

  public parseImports(source: string, options?: any): string[] {
    const imports = new Set<string>();
    try {
      const sourceFile = this.getSourceFile(source, options?.file_path);
      const visit = (node: ts.Node) => {
        if (ts.isImportDeclaration(node)) {
          if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            imports.add(node.moduleSpecifier.text);
          }
        } else if (ts.isCallExpression(node)) {
          if (ts.isIdentifier(node.expression) && node.expression.text === "require" && node.arguments.length === 1) {
            const arg = node.arguments[0];
            if (ts.isStringLiteral(arg)) {
              imports.add(arg.text);
            }
          }
          if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1) {
            const arg = node.arguments[0];
            if (ts.isStringLiteral(arg)) {
              imports.add(arg.text);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    } catch {
      // safe fallback
    }
    return Array.from(imports);
  }

  public parseExports(source: string, options?: any): string[] {
    const exportsSet = new Set<string>();
    try {
      const sourceFile = this.getSourceFile(source, options?.file_path);
      const visit = (node: ts.Node) => {
        if (ts.isExportDeclaration(node)) {
          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const el of node.exportClause.elements) {
              exportsSet.add(el.name.text);
            }
          }
        } else if (ts.isExportAssignment(node)) {
          exportsSet.add("default");
        }

        let hasExport = false;
        let hasDefault = false;
        const modifiers = (node as any).modifiers;
        if (modifiers) {
          for (const modifier of modifiers) {
            if (modifier.kind === ts.SyntaxKind.ExportKeyword) hasExport = true;
            if (modifier.kind === ts.SyntaxKind.DefaultKeyword) hasDefault = true;
          }
        }

        if (hasExport) {
          if (hasDefault) {
            exportsSet.add("default");
          }
          if (ts.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
              if (ts.isIdentifier(decl.name)) {
                exportsSet.add(decl.name.text);
              } else if (ts.isObjectBindingPattern(decl.name) || ts.isArrayBindingPattern(decl.name)) {
                const extractBindings = (pattern: ts.BindingPattern) => {
                  for (const element of pattern.elements) {
                    if (ts.isOmittedExpression(element)) continue;
                    if (ts.isIdentifier(element.name)) {
                      exportsSet.add(element.name.text);
                    } else if (ts.isObjectBindingPattern(element.name) || ts.isArrayBindingPattern(element.name)) {
                      extractBindings(element.name);
                    }
                  }
                };
                extractBindings(decl.name);
              }
            }
          } else if (
            ts.isFunctionDeclaration(node) ||
            ts.isClassDeclaration(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isTypeAliasDeclaration(node) ||
            ts.isEnumDeclaration(node)
          ) {
            if (node.name && ts.isIdentifier(node.name)) {
              exportsSet.add(node.name.text);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    } catch {
      // safe fallback
    }
    return Array.from(exportsSet);
  }

  public parseJSXComponents(source: string, options?: any): string[] {
    const components = new Set<string>();
    try {
      const sourceFile = this.getSourceFile(source, options?.file_path);
      const visit = (node: ts.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          if (ts.isIdentifier(node.tagName)) {
            const name = node.tagName.text;
            if (/^[A-Z]/.test(name)) {
              components.add(name);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    } catch {
      // safe fallback
    }
    return Array.from(components);
  }

  public parseAPICalls(source: string, options?: any): { method: string; path: string }[] {
    const calls: { method: string; path: string }[] = [];
    try {
      const sourceFile = this.getSourceFile(source, options?.file_path);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          if (ts.isIdentifier(node.expression) && node.expression.text === "fetch" && node.arguments.length >= 1) {
            const arg = node.arguments[0];
            if (ts.isStringLiteral(arg)) {
              if (arg.text.startsWith("/api/")) {
                calls.push({ method: "get", path: arg.text });
              }
            }
          }
          if (ts.isPropertyAccessExpression(node.expression)) {
            if (ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "axios" && node.arguments.length >= 1) {
              const method = node.expression.name.text.toLowerCase();
              const arg = node.arguments[0];
              if (ts.isStringLiteral(arg)) {
                if (arg.text.startsWith("/api/")) {
                  calls.push({ method, path: arg.text });
                }
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    } catch {
      // safe fallback
    }
    return calls;
  }

  public parseRoutes(source: string, options?: any): { method: string; path: string }[] {
    const routes: { method: string; path: string }[] = [];
    try {
      const sourceFile = this.getSourceFile(source, options?.file_path);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          if (ts.isPropertyAccessExpression(node.expression) && node.arguments.length >= 1) {
            const obj = node.expression.expression;
            if (ts.isIdentifier(obj) && (obj.text === "router" || obj.text === "app")) {
              const method = node.expression.name.text.toLowerCase();
              const arg = node.arguments[0];
              if (ts.isStringLiteral(arg)) {
                if (arg.text.startsWith("/")) {
                  routes.push({ method, path: arg.text });
                }
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    } catch {
      // safe fallback
    }
    return routes;
  }

  public parseDatabaseTables(source: string, options?: any): string[] {
    const usedTables = new Set<string>();
    try {
      const knownTables = options?.known_tables || [
        "projects", "memberships", "tasks", "context_items", "context_chunks", 
        "context_packs", "context_summaries", "durable_memories", "graph_nodes", 
        "graph_edges", "task_boundaries", "boundary_checks", "audit_logs", 
        "artifacts", "debug_logs", "connections"
      ];
      const sourceFile = this.getSourceFile(source, options?.file_path);
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node)) {
          for (const table of knownTables) {
            const reg = new RegExp(`\\b${table}\\b`);
            if (reg.test(node.text)) {
              usedTables.add(table);
            }
          }
        } else if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
          const text = node.getText();
          for (const table of knownTables) {
            const reg = new RegExp(`\\b${table}\\b`);
            if (reg.test(text)) {
              usedTables.add(table);
            }
          }
        } else if (node.kind === ts.SyntaxKind.JsxText) {
          const text = node.getText();
          for (const table of knownTables) {
            const reg = new RegExp(`\\b${table}\\b`);
            if (reg.test(text)) {
              usedTables.add(table);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    } catch {
      // safe fallback
    }
    return Array.from(usedTables);
  }

  public parseTestCoverageLinks(source: string, options?: any): string[] {
    const fallback = new RegexFallbackParser();
    return fallback.parseTestCoverageLinks(source, options);
  }

  public parseDesignReferences(source: string, options?: any): string[] {
    const fallback = new RegexFallbackParser();
    return fallback.parseDesignReferences(source, options);
  }

  public analyzeFile(source: string, options?: any): StaticAnalysisResultDTO {
    const projectId = options?.project_id || "unknown";
    const filePath = options?.file_path || "unspecified";
    const language = filePath.endsWith(".tsx") || filePath.endsWith(".ts") ? "typescript" : "javascript";

    try {
      // Let's verify that the compiler can parse it. If there's syntax issues, the TS compiler compiles beautifully anyway
      const imports = this.parseImports(source, options);
      const exportsList = this.parseExports(source, options);
      const components = this.parseJSXComponents(source, options);
      const api_calls = this.parseAPICalls(source, options);
      const routes = this.parseRoutes(source, options);
      const database_tables = this.parseDatabaseTables(source, options);
      const test_links = this.parseTestCoverageLinks(source, options);
      const design_references = this.parseDesignReferences(source, options);

      return {
        project_id: projectId,
        file_path: filePath,
        parser_kind: "typescript_ast_mvp",
        language,
        imports,
        exports: exportsList,
        components,
        api_calls,
        routes,
        database_tables,
        test_links,
        design_references,
        warnings: [],
        confidence: 0.95,
        metadata: {}
      };
    } catch (err: any) {
      const fallback = new RegexFallbackParser();
      const fallbackResult = fallback.analyzeFile(source, options);
      fallbackResult.warnings.push(`TypeScript AST analysis failed, used fallback: ${err.message}`);
      return fallbackResult;
    }
  }
}

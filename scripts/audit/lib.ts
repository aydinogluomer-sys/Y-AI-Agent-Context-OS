/**
 * P00 Truth Audit — shared helpers.
 *
 * Kanıt standardı (ADR-000): bir iddia ancak (a) dosya:satır referansı,
 * (b) çalıştırılmış komut çıktısı veya (c) şema-kod karşılaştırmasıyla
 * desteklenirse rapora girer.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");
export const AUDIT_DIR = path.join(REPO_ROOT, "docs", "audit", "2026-08-13-truth-audit");

export interface SourceLine {
  file: string;
  line: number;
  text: string;
}

const DEFAULT_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "playwright-report",
  "test-results",
  ".next",
  "out",
  "coverage"
]);

export function walk(dir: string, exts: string[], skipDirs: Set<string> = DEFAULT_SKIP_DIRS): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      out.push(...walk(full, exts, skipDirs));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

export function rel(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join("/");
}

export function readLines(file: string): string[] {
  return fs.readFileSync(file, "utf-8").split(/\r?\n/);
}

/** Bir dizin ağacında regex eşleşen satırları dosya:satır ile döndürür. */
export function grepLines(files: string[], pattern: RegExp): SourceLine[] {
  const hits: SourceLine[] = [];
  for (const file of files) {
    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      // Her satır için lastIndex sıfırlanmalı (global regex güvenliği)
      pattern.lastIndex = 0;
      if (pattern.test(lines[i])) {
        hits.push({ file: rel(file), line: i + 1, text: lines[i].trim() });
      }
    }
  }
  return hits;
}

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function writeCsv(fileName: string, headers: string[], rows: unknown[][]): string {
  const target = path.join(AUDIT_DIR, fileName);
  const body = [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  fs.writeFileSync(target, body + "\n", "utf-8");
  return target;
}

export function writeDoc(fileName: string, content: string): string {
  const target = path.join(AUDIT_DIR, fileName);
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
  return target;
}

export function readCsv(fileName: string): string[][] {
  const target = path.join(AUDIT_DIR, fileName);
  const text = fs.readFileSync(target, "utf-8").trimEnd();
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

/** ESM'de "bu dosya doğrudan mı çalıştırıldı?" kontrolü (require.main === module karşılığı). */
export function isMain(importMetaUrl: string): boolean {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return path.resolve(fileURLToPath(importMetaUrl)) === path.resolve(invoked);
}

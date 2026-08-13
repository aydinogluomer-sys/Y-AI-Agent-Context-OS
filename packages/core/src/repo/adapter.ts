/**
 * P03 / Y-P03-001 — RepositoryAdapter sözleşmesi.
 *
 * P00 Truth Audit:
 *   - `LocalFilesystemRepoAdapter` gerçekti ve path güvenliği iyiydi.
 *   - `ReadOnlyGitHubRepoAdapter` **saf stub**tu: her metot `ok:false`
 *     döndürüyordu; `readFile` şu literal'i üretiyordu:
 *     "E_コネクター未設定: GitHub Remote Connector requires authentication..."
 *   - `RepoAdapterService`, `repo_sources` satırı yoksa
 *     `new LocalFilesystemRepoAdapter(".")` üretiyordu — yani **sunucunun
 *     kendi çalışma dizini** repository sayılıyordu (P0-9).
 *
 * Bu sözleşme üç adapter'ı (local / github / gitlab) aynı contract test
 * suite'ine tabi tutar. Yeni bir adapter eklemek, o suite'i geçmekten ibarettir.
 */

import type { PathCheck } from "@y/security";

export type RepositoryKind = "local" | "github" | "gitlab";

/** Adapter'ın hangi işlemleri gerçekten destekleyip desteklemediği. */
export interface AdapterCapabilities {
  readonly kind: RepositoryKind;
  /** Yazma yeteneği. Read-only adapter'lar için `false`. */
  readonly writable: boolean;
  /** Git geçmişine erişebiliyor mu (log, diff, changedFiles)? */
  readonly hasHistory: boolean;
  /** Uzak sunucudan güncelleme çekebiliyor mu? */
  readonly canFetch: boolean;
  /** Tek dosya okuma maliyeti — planlama için. */
  readonly readCost: "local" | "network";
}

export interface RepositoryMetadata {
  readonly kind: RepositoryKind;
  readonly defaultBranch: string | null;
  readonly currentBranch: string | null;
  readonly currentCommit: string | null;
  readonly remoteUrl: string | null;
}

export interface FileEntry {
  readonly path: string;
  readonly sizeBytes: number;
  readonly contentHash: string;
  readonly isBinary: boolean;
  readonly isGenerated: boolean;
  readonly isMinified: boolean;
}

export interface FileContent {
  readonly path: string;
  readonly content: string;
  readonly contentHash: string;
  readonly sizeBytes: number;
  /** Sır redaksiyonu uygulandıysa `true`. Manifest'e taşınır (P09). */
  readonly redacted: boolean;
}

export type AdapterErrorCode =
  | "NOT_CONNECTED"
  | "PATH_REJECTED"
  | "NOT_FOUND"
  | "TOO_LARGE"
  | "BINARY"
  | "UNSUPPORTED"
  | "REMOTE_ERROR"
  | "RATE_LIMITED"
  | "AUTH_FAILED";

export class AdapterError extends Error {
  constructor(
    readonly code: AdapterErrorCode,
    message: string,
    readonly detail?: string
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

export interface ListFilesOptions {
  /** Sonuç sayısı üst sınırı — DoS koruması (T-06). */
  readonly maxFiles?: number;
  /** Dizin derinliği üst sınırı. */
  readonly maxDepth?: number;
}

/**
 * Repository erişim sözleşmesi.
 *
 * Tasarım kuralları:
 *   1. Hiçbir metot `{ ok: false }` gibi sessiz bir başarısızlık dönmez —
 *      hata `AdapterError` olarak FIRLATILIR. Eski stub'ın en büyük sorunu
 *      çağıranın hatayı fark etmemesiydi.
 *   2. `listFiles` bir `AsyncIterable`'dır: 100K dosyalık repo'da tüm listeyi
 *      belleğe almak kabul edilemez (eski `listFiles` her çağrıda <1MB tüm
 *      dosyaları senkron SHA-256'lıyordu).
 *   3. Yazma yeteneği ayrı bir arayüzdür; read-only adapter'lar onu
 *      implemente etmez — "desteklenmiyor" hatası yerine TİP hatası alınır.
 */
export interface RepositoryAdapter {
  readonly capabilities: AdapterCapabilities;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  metadata(): Promise<RepositoryMetadata>;
  currentCommit(): Promise<string>;
  branch(): Promise<string | null>;

  listFiles(options?: ListFilesOptions): AsyncIterable<FileEntry>;
  readFile(relativePath: string): Promise<FileContent>;

  /** Git geçmişi olmayan adapter'lar `UNSUPPORTED` fırlatır. */
  changedFiles(fromRef: string, toRef?: string): Promise<string[]>;
  diff(fromRef: string, toRef?: string, filePath?: string): Promise<string>;

  fetch(): Promise<void>;
  checkout(ref: string): Promise<void>;
}

/** Yazma yetenekli adapter'lar için ek sözleşme. */
export interface WritableRepositoryAdapter extends RepositoryAdapter {
  /**
   * Atomik yazım.
   *
   * `expectedHashBefore` verilirse, dosyanın mevcut hash'i buna uymuyorsa
   * yazım REDDEDİLİR (optimistic concurrency, T-20). P10 Change Firewall
   * bu alanı zorunlu kılar.
   */
  writeFile(params: {
    relativePath: string;
    content: string;
    expectedHashBefore: string | null;
  }): Promise<{ hashBefore: string | null; hashAfter: string }>;
}

export function isWritable(adapter: RepositoryAdapter): adapter is WritableRepositoryAdapter {
  return adapter.capabilities.writable && typeof (adapter as WritableRepositoryAdapter).writeFile === "function";
}

/** Üretilmiş / minified dosya sınıflandırması (P07 girdisi). */
export function classifyFileShape(relativePath: string, sample: string): {
  isGenerated: boolean;
  isMinified: boolean;
} {
  const lower = relativePath.toLowerCase();

  const generatedByPath =
    /\.(min|bundle|chunk)\.(js|css)$/.test(lower) ||
    /(^|\/)(dist|build|out|coverage|__generated__|\.next)\//.test(lower) ||
    /\.(pb|generated|g)\.(ts|js|go|py)$/.test(lower) ||
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Cargo\.lock)$/.test(lower);

  const header = sample.slice(0, 2048);
  const generatedByHeader =
    /@generated\b/.test(header) ||
    /DO NOT EDIT/i.test(header) ||
    /Code generated by .* DO NOT EDIT/i.test(header) ||
    /This file (is|was) auto-?generated/i.test(header);

  // Minified: cok az satir, cok uzun satirlar.
  const lines = sample.split("\n");
  const avgLineLength = sample.length / Math.max(lines.length, 1);
  const isMinified = sample.length > 500 && avgLineLength > 200;

  return { isGenerated: generatedByPath || generatedByHeader, isMinified };
}

export type { PathCheck };

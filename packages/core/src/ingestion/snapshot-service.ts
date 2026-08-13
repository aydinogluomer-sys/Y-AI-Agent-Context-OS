/**
 * P03 / Y-P03-008 — Snapshot ingestion.
 *
 * P00 Truth Audit: `workers/index-worker.ts` "index job" olarak dosyaları
 * yalnızca SAYIYORDU (`processedFiles` = dosya sayısı), sonra `/complete`
 * çağırıp başarı raporluyordu. Hiçbir şey chunk'lanmıyor, parse edilmiyor,
 * hiçbir yere yazılmıyordu.
 *
 * Bu servis gerçek işi yapar: repository'yi bir commit'te sabitler,
 * dosya envanterini çıkarır ve `files` tablosuna yazar.
 *
 * ADR-019: HTTP request içinde çalışmaz; ingestion worker çağırır.
 */

import { newId } from "@y/shared";
import { containsSecret } from "@y/security";
import type { RepositoryAdapter, FileEntry } from "../repo/adapter";
import { AdapterError } from "../repo/adapter";

export interface SnapshotDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export type SnapshotStatus = "pending" | "ingesting" | "ready" | "failed";

export interface SnapshotResult {
  readonly snapshotId: string;
  readonly commitSha: string;
  readonly status: SnapshotStatus;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly skipped: { binary: number; generated: number; withSecrets: number };
}

export interface IngestOptions {
  readonly organizationId: string;
  readonly repositoryId: string;
  /** Üst sınırlar — T-06 (malicious repository). */
  readonly maxFiles?: number;
  readonly maxDepth?: number;
  /** İçeriği sır taramasından geçir. Büyük repo'larda maliyetli olabilir. */
  readonly scanSecrets?: boolean;
}

const DEFAULT_MAX_FILES = 200_000;

export class SnapshotService {
  constructor(private readonly db: SnapshotDb) {}

  /**
   * Repository'yi mevcut commit'te sabitler ve dosya envanterini yazar.
   *
   * Akış: snapshot kaydı (`ingesting`) → dosya yazımı → `ready`.
   * Hata durumunda snapshot `failed` olarak işaretlenir ve sebebi
   * KAYDEDİLİR — sessizce yarım kalmaz.
   */
  async ingest(adapter: RepositoryAdapter, options: IngestOptions): Promise<SnapshotResult> {
    const commitSha = await this.resolveCommit(adapter);
    const branch = await adapter.branch();

    // Ayni commit zaten islenmisse yeniden isleme (idempotency).
    const existing = await this.findReadySnapshot(options.repositoryId, commitSha);
    if (existing) return existing;

    const snapshotId = newId("snap");
    await this.db.query(
      `INSERT INTO repository_snapshots
         (id, organization_id, repository_id, commit_sha, branch, status)
       VALUES ($1, $2, $3, $4, $5, 'ingesting')
       ON CONFLICT (repository_id, commit_sha) DO NOTHING;`,
      [snapshotId, options.organizationId, options.repositoryId, commitSha, branch]
    );

    const skipped = { binary: 0, generated: 0, withSecrets: 0 };
    let fileCount = 0;
    let totalBytes = 0;

    try {
      const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;

      for await (const entry of adapter.listFiles({ maxFiles, maxDepth: options.maxDepth })) {
        if (fileCount >= maxFiles) {
          throw new AdapterError(
            "TOO_LARGE",
            `Repository dosya sinirini asti: ${maxFiles}`,
            options.repositoryId
          );
        }

        const record = await this.buildFileRecord(adapter, entry, options, skipped);
        await this.writeFile(snapshotId, options.organizationId, record);

        fileCount++;
        totalBytes += entry.sizeBytes;
      }

      await this.db.query(
        `UPDATE repository_snapshots
            SET status = 'ready', file_count = $2, total_bytes = $3, failure_reason = NULL
          WHERE id = $1;`,
        [snapshotId, fileCount, totalBytes]
      );

      return { snapshotId, commitSha, status: "ready", fileCount, totalBytes, skipped };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.db.query(
        `UPDATE repository_snapshots SET status = 'failed', failure_reason = $2 WHERE id = $1;`,
        [snapshotId, reason]
      );
      // Hata YUTULMAZ. Cagiran (worker) job'i basarisiz isaretlemeli.
      throw error;
    }
  }

  private async resolveCommit(adapter: RepositoryAdapter): Promise<string> {
    if (!adapter.capabilities.hasHistory) {
      throw new AdapterError(
        "UNSUPPORTED",
        "Snapshot icin git gecmisi gerekli. Manifest determinizmi (P09) " +
          "icerigin hangi commit'ten geldigini bilmeyi zorunlu kilar."
      );
    }
    return adapter.currentCommit();
  }

  private async findReadySnapshot(
    repositoryId: string,
    commitSha: string
  ): Promise<SnapshotResult | null> {
    const res = await this.db.query(
      `SELECT id, commit_sha, status, file_count, total_bytes
         FROM repository_snapshots
        WHERE repository_id = $1 AND commit_sha = $2 AND status = 'ready'
        LIMIT 1;`,
      [repositoryId, commitSha]
    );
    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    return {
      snapshotId: row.id,
      commitSha: row.commit_sha,
      status: "ready",
      fileCount: row.file_count,
      totalBytes: Number(row.total_bytes),
      skipped: { binary: 0, generated: 0, withSecrets: 0 }
    };
  }

  private async buildFileRecord(
    adapter: RepositoryAdapter,
    entry: FileEntry,
    options: IngestOptions,
    skipped: { binary: number; generated: number; withSecrets: number }
  ): Promise<FileRecord> {
    if (entry.isBinary) skipped.binary++;
    if (entry.isGenerated) skipped.generated++;

    let secretFound = false;
    let parseStatus: string = "pending";

    if (entry.isBinary) parseStatus = "skipped_binary";

    // Sir taramasi yalniz metin dosyalarinda anlamli.
    if (options.scanSecrets && !entry.isBinary) {
      try {
        const content = await adapter.readFile(entry.path);
        secretFound = containsSecret(content.content);
        if (secretFound) skipped.withSecrets++;
      } catch (error) {
        // Okunamayan dosya ingestion'i dusurmemeli; durumu kaydedip devam.
        if (error instanceof AdapterError && error.code === "TOO_LARGE") {
          parseStatus = "skipped_size";
        }
      }
    }

    return {
      path: entry.path,
      contentHash: entry.contentHash,
      language: detectLanguage(entry.path),
      sizeBytes: entry.sizeBytes,
      isBinary: entry.isBinary,
      isGenerated: entry.isGenerated,
      isMinified: entry.isMinified,
      containsSecret: secretFound,
      parseStatus
    };
  }

  private async writeFile(snapshotId: string, orgId: string, record: FileRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO files
         (id, organization_id, snapshot_id, path, content_hash, language, size_bytes,
          is_binary, is_generated, is_minified, contains_secret, parse_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (snapshot_id, path) DO UPDATE SET
         content_hash = EXCLUDED.content_hash,
         size_bytes = EXCLUDED.size_bytes,
         contains_secret = EXCLUDED.contains_secret;`,
      [
        newId("file"),
        orgId,
        snapshotId,
        record.path,
        record.contentHash,
        record.language,
        record.sizeBytes,
        record.isBinary,
        record.isGenerated,
        record.isMinified,
        record.containsSecret,
        record.parseStatus
      ]
    );
  }
}

interface FileRecord {
  path: string;
  contentHash: string;
  language: string | null;
  sizeBytes: number;
  isBinary: boolean;
  isGenerated: boolean;
  isMinified: boolean;
  containsSecret: boolean;
  parseStatus: string;
}

/**
 * Uzantıdan dil tespiti.
 *
 * P00 bulgusu: `static-analysis.ts` dili `typescript`/`javascript` olarak
 * HARD-CODE ediyordu; bir `.py` dosyası "javascript" etiketiyle regex
 * parser'a gidiyordu. P04 tree-sitter'ı bağladığında bu tablo genişler.
 */
const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".pyi": "python",
  ".sql": "sql",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".json": "json",
  ".jsonc": "json",
  ".md": "markdown",
  ".mdx": "markdown",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".rb": "ruby",
  ".php": "php",
  ".cs": "csharp",
  ".sh": "shell",
  ".bash": "shell",
  ".css": "css",
  ".scss": "scss",
  ".html": "html",
  ".toml": "toml"
};

export function detectLanguage(filePath: string): string | null {
  const lower = filePath.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1) return null;
  return EXTENSION_LANGUAGE[lower.slice(dot)] ?? null;
}

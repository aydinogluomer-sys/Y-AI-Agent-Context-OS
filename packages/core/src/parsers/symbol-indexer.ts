/**
 * P04 / Y-P04-007 + Y-P04-009 — Symbol indexer.
 *
 * P00 Truth Audit'in en somut bulgularından biri buydu:
 *
 *   `workers/index-worker.ts:55-72` "index job" olarak dosyaları yalnızca
 *   LİSTELİYOR ya da OKUYOR, `processedFiles` olarak dosya sayısını
 *   raporluyordu. Hiçbir şey chunk'lanmıyor, parse edilmiyor, hiçbir yere
 *   yazılmıyordu. Ardından `/complete` çağrılıp iş "başarıyla tamamlandı"
 *   sayılıyordu.
 *
 * Bu servis gerçek işi yapar: dosyayı ayrıştırır, sembolleri ve chunk'ları
 * kalıcı hale getirir.
 */

import { createHash } from "crypto";
import { newId } from "@y/shared";
import type { RepositoryAdapter } from "../repo/adapter";
import { AdapterError } from "../repo/adapter";
import { ParserRegistry } from "./registry";
import { chunkBySymbols, type ChunkOptions } from "./symbol-chunker";
import { ParserTimeoutError, type ParseResult } from "./types";

export interface IndexerDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface IndexOptions {
  readonly organizationId: string;
  readonly repositoryId: string;
  readonly snapshotId: string;
  readonly commitSha: string;
  readonly chunking?: ChunkOptions;
  readonly parseTimeoutMs?: number;
}

export interface IndexResult {
  readonly filesProcessed: number;
  readonly filesSkipped: number;
  readonly symbolsWritten: number;
  readonly chunksWritten: number;
  readonly failures: { path: string; reason: string }[];
  readonly averageConfidence: number;
}

export interface FileToIndex {
  readonly fileId: string;
  readonly path: string;
  readonly language: string | null;
  readonly isBinary: boolean;
  readonly sizeBytes: number;
}

export class SymbolIndexer {
  constructor(
    private readonly db: IndexerDb,
    private readonly registry: ParserRegistry
  ) {}

  /**
   * Snapshot'taki dosyaları ayrıştırıp sembol ve chunk yazar.
   *
   * Bir dosyanın hatası TÜM işi düşürmez — dosya bazlı izolasyon vardır.
   * Ama hata SESSİZCE yutulmaz: `failures` listesine yazılır ve dosyanın
   * `parse_status`'ü `error` olur.
   */
  async indexSnapshot(
    adapter: RepositoryAdapter,
    files: readonly FileToIndex[],
    options: IndexOptions
  ): Promise<IndexResult> {
    await this.registry.initialize();
    await this.recordParserVersions(options.snapshotId);

    let filesProcessed = 0;
    let filesSkipped = 0;
    let symbolsWritten = 0;
    let chunksWritten = 0;
    let confidenceSum = 0;
    const failures: { path: string; reason: string }[] = [];

    for (const file of files) {
      if (file.isBinary) {
        filesSkipped++;
        await this.setParseStatus(file.fileId, "skipped_binary", null, 0);
        continue;
      }

      try {
        const content = await adapter.readFile(file.path);
        const parsed = await this.registry.parse(content.content, {
          filePath: file.path,
          timeoutMs: options.parseTimeoutMs
        });

        const written = await this.persist(file, parsed, content.content, options);
        symbolsWritten += written.symbols;
        chunksWritten += written.chunks;
        confidenceSum += parsed.confidence;
        filesProcessed++;

        await this.setParseStatus(file.fileId, "parsed", parsed.confidence, written.symbols);
      } catch (error) {
        const reason = describeFailure(error);
        failures.push({ path: file.path, reason });

        // Okunamayan/parse edilemeyen dosya isi dusurmez ama IZ BIRAKIR.
        const status = error instanceof AdapterError && error.code === "TOO_LARGE" ? "skipped_size" : "error";
        await this.setParseStatus(file.fileId, status, null, 0);
        filesSkipped++;
      }
    }

    return {
      filesProcessed,
      filesSkipped,
      symbolsWritten,
      chunksWritten,
      failures,
      averageConfidence: filesProcessed > 0 ? confidenceSum / filesProcessed : 0
    };
  }

  /** Parser sürümleri — manifest determinizmi girdisi (P09). */
  private async recordParserVersions(snapshotId: string): Promise<void> {
    for (const [parserId, version] of Object.entries(this.registry.versions())) {
      await this.db.query(
        `INSERT INTO parser_versions (id, snapshot_id, parser_id, version)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (snapshot_id, parser_id) DO UPDATE SET version = EXCLUDED.version;`,
        [newId("pv"), snapshotId, parserId, version]
      );
    }
  }

  private async persist(
    file: FileToIndex,
    parsed: ParseResult,
    source: string,
    options: IndexOptions
  ): Promise<{ symbols: number; chunks: number }> {
    // Yeniden index'lemede eski kayitlar temizlenir; aksi halde silinmis
    // semboller hayalet olarak kalir ve retrieval onlari dondurur.
    await this.db.query(`DELETE FROM chunks WHERE snapshot_id = $1 AND path = $2;`, [
      options.snapshotId,
      file.path
    ]);
    await this.db.query(`DELETE FROM symbols WHERE snapshot_id = $1 AND path = $2;`, [
      options.snapshotId,
      file.path
    ]);

    const symbolIdByPosition = new Map<number, string>();

    for (const symbol of parsed.symbols) {
      const symbolId = newId("sym");
      symbolIdByPosition.set(symbol.startByte, symbolId);

      await this.db.query(
        `INSERT INTO symbols (
           symbol_id, repository_id, commit_sha, path, language, symbol_type, symbol_name,
           start_line, end_line, start_byte, end_byte, content_hash, parent_symbol,
           exports, imports, organization_id, snapshot_id, file_id, is_exported
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (snapshot_id, path, start_byte) DO NOTHING;`,
        [
          symbolId,
          options.repositoryId,
          options.commitSha,
          file.path,
          parsed.language,
          symbol.symbolType,
          symbol.symbolName,
          symbol.startLine,
          symbol.endLine,
          symbol.startByte,
          symbol.endByte,
          sha256(symbol.text),
          symbol.parentSymbol,
          symbol.exported ? [symbol.symbolName] : [],
          parsed.imports.map((i) => i.source),
          options.organizationId,
          options.snapshotId,
          file.fileId,
          symbol.exported
        ]
      );
    }

    const chunks = chunkBySymbols(source, parsed.symbols, options.chunking);

    for (const chunk of chunks) {
      // Chunk'i uretildigi sembole bagla (varsa).
      const symbolId =
        chunk.symbolName === null
          ? null
          : (symbolIdByPosition.get(
              parsed.symbols.find((s) => s.symbolName === chunk.symbolName)?.startByte ?? -1
            ) ?? null);

      await this.db.query(
        `INSERT INTO chunks (
           id, organization_id, snapshot_id, file_id, symbol_id, path, ordinal, content,
           content_hash, start_line, end_line, start_byte, end_byte,
           symbol_name, symbol_type, part_index, part_count, estimated_tokens
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (snapshot_id, path, ordinal) DO UPDATE SET
           content = EXCLUDED.content,
           content_hash = EXCLUDED.content_hash,
           estimated_tokens = EXCLUDED.estimated_tokens;`,
        [
          newId("chunk"),
          options.organizationId,
          options.snapshotId,
          file.fileId,
          symbolId,
          file.path,
          chunk.ordinal,
          chunk.content,
          sha256(chunk.content),
          chunk.startLine,
          chunk.endLine,
          chunk.startByte,
          chunk.endByte,
          chunk.symbolName,
          chunk.symbolType,
          chunk.partIndex,
          chunk.partCount,
          chunk.estimatedTokens
        ]
      );
    }

    return { symbols: parsed.symbols.length, chunks: chunks.length };
  }

  private async setParseStatus(
    fileId: string,
    status: string,
    confidence: number | null,
    symbolCount: number
  ): Promise<void> {
    await this.db.query(
      `UPDATE files SET parse_status = $2, parse_confidence = $3, symbol_count = $4 WHERE id = $1;`,
      [fileId, status, confidence, symbolCount]
    );
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof ParserTimeoutError) return `parse zaman asimi (${error.timeoutMs}ms)`;
  if (error instanceof AdapterError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

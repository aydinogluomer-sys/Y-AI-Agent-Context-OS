/**
 * P04 / Y-P04-007 — Symbol okuma katmanı.
 *
 * P00 Truth Audit: statik analiz sonucu HİÇBİR YERE yazılmıyordu; sonuç
 * yalnız HTTP yanıtında dönüyor ve kayboluyordu. Artık `symbols` tablosu
 * var ve okunabiliyor. Bu dosya o okumanın TEK yeridir.
 *
 * TENANT İZOLASYONU (T-02)
 *   Her sorgu `organization_id` VE proje sahipliği üzerinden filtrelenir.
 *   `repository_id` istemciden gelse bile, o repository'nin scope'taki
 *   projeye ait olduğu SQL'de doğrulanır. Yalnız `repository_id` ile
 *   sorgulamak, tahmin edilebilir bir kimliğe sahip başka bir tenant'ın
 *   sembollerini okumaya izin verirdi (T-01 IDOR).
 *
 * ADR-017: burada yetki kontrolü YOK. Yetki `requireProjectScope`'ta
 * verilir; bu katman yalnızca verilen scope'un sınırları içinde okur.
 */

export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface SymbolQuery {
  readonly organizationId: string;
  readonly projectId: string;
  /** Belirtilmezse projenin en yeni ready snapshot'ı kullanılır. */
  readonly repositoryId?: string;
  readonly path?: string;
  readonly name?: string;
  readonly symbolType?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface SymbolDTO {
  readonly symbolId: string;
  readonly path: string;
  readonly language: string | null;
  readonly symbolType: string;
  readonly symbolName: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly startByte: number;
  readonly endByte: number;
  readonly contentHash: string;
  readonly parentSymbol: string | null;
  readonly isExported: boolean;
  readonly exports: string[];
  readonly imports: string[];
  readonly commitSha: string;
  readonly snapshotId: string;
  /**
   * Bu sembolün dosyasında sır bulgusu var mı. Sembol adı sır değildir ama
   * çağıran (P07 Context Firewall) bu bayrağı DENY girdisi olarak kullanır.
   */
  readonly fileContainsSecret: boolean;
}

export interface IndexStatusDTO {
  readonly repositoryId: string;
  readonly snapshotId: string | null;
  readonly commitSha: string | null;
  readonly snapshotStatus: string | null;
  readonly fileCounts: Record<string, number>;
  readonly filesTotal: number;
  readonly symbolsTotal: number;
  readonly chunksTotal: number;
  readonly averageParseConfidence: number | null;
  readonly languages: { language: string | null; symbols: number }[];
  readonly parserVersions: { parserId: string; version: string }[];
  readonly lastJob: {
    id: string;
    status: string;
    phase: string;
    attempts: number;
    lastError: string | null;
    updatedAt: string | null;
    evidence: Record<string, unknown>;
  } | null;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export class SymbolRepository {
  constructor(private readonly db: Db) {}

  /**
   * Projenin en yeni ready snapshot'ını bulur.
   * Repository verilmişse, o repository'nin projeye ait olduğu da doğrulanır.
   */
  async latestSnapshot(
    organizationId: string,
    projectId: string,
    repositoryId?: string
  ): Promise<{ id: string; repositoryId: string; commitSha: string; status: string } | null> {
    const result = await this.db.query(
      `SELECT s.id, s.repository_id, s.commit_sha, s.status
         FROM repository_snapshots s
         JOIN repositories r ON r.id = s.repository_id
        WHERE s.organization_id = $1
          AND r.project_id = $2
          AND ($3::text IS NULL OR s.repository_id = $3)
          AND s.status = 'ready'
        ORDER BY s.created_at DESC
        LIMIT 1;`,
      [organizationId, projectId, repositoryId ?? null]
    );
    const row = result.rows[0];
    return row
      ? { id: row.id, repositoryId: row.repository_id, commitSha: row.commit_sha, status: row.status }
      : null;
  }

  async listSymbols(query: SymbolQuery): Promise<{ symbols: SymbolDTO[]; snapshotId: string | null }> {
    const snapshot = await this.latestSnapshot(query.organizationId, query.projectId, query.repositoryId);
    if (!snapshot) return { symbols: [], snapshotId: null };

    const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const offset = Math.max(0, query.offset ?? 0);

    const result = await this.db.query(
      `SELECT sym.symbol_id, sym.path, sym.language, sym.symbol_type, sym.symbol_name,
              sym.start_line, sym.end_line, sym.start_byte, sym.end_byte, sym.content_hash,
              sym.parent_symbol, sym.is_exported, sym.exports, sym.imports, sym.commit_sha,
              sym.snapshot_id, COALESCE(f.contains_secret, FALSE) AS contains_secret
         FROM symbols sym
         LEFT JOIN files f ON f.id = sym.file_id
        WHERE sym.snapshot_id = $1
          AND sym.organization_id = $2
          AND ($3::text IS NULL OR sym.path = $3)
          AND ($4::text IS NULL OR sym.symbol_name ILIKE '%' || $4 || '%')
          AND ($5::text IS NULL OR sym.symbol_type = $5)
        ORDER BY sym.path, sym.start_byte
        LIMIT $6 OFFSET $7;`,
      [
        snapshot.id,
        query.organizationId,
        query.path ?? null,
        query.name ?? null,
        query.symbolType ?? null,
        limit,
        offset
      ]
    );

    return {
      snapshotId: snapshot.id,
      symbols: result.rows.map(toSymbolDto)
    };
  }

  /**
   * Index durumu — ÖLÇÜLEN değerler.
   *
   * Eski `index-jobs` yanıtı `resultCount` döndürüyordu ve bu sayı işlenen
   * dosya sayısıydı; hiçbir yazımı temsil etmiyordu. Buradaki her sayı
   * gerçek satır sayımıdır.
   */
  async indexStatus(
    organizationId: string,
    projectId: string,
    repositoryId: string
  ): Promise<IndexStatusDTO> {
    const snapshot = await this.latestSnapshot(organizationId, projectId, repositoryId);

    if (!snapshot) {
      return {
        repositoryId,
        snapshotId: null,
        commitSha: null,
        snapshotStatus: null,
        fileCounts: {},
        filesTotal: 0,
        symbolsTotal: 0,
        chunksTotal: 0,
        averageParseConfidence: null,
        languages: [],
        parserVersions: [],
        lastJob: await this.lastJob(organizationId, projectId)
      };
    }

    const files = await this.db.query(
      `SELECT parse_status, COUNT(*)::int AS count, AVG(parse_confidence) AS avg_confidence
         FROM files WHERE snapshot_id = $1 GROUP BY parse_status;`,
      [snapshot.id]
    );

    const fileCounts: Record<string, number> = {};
    let filesTotal = 0;
    let confidenceWeighted = 0;
    let confidenceWeight = 0;
    for (const row of files.rows) {
      const count = Number(row.count ?? 0);
      fileCounts[row.parse_status] = count;
      filesTotal += count;
      if (row.avg_confidence !== null && row.avg_confidence !== undefined) {
        confidenceWeighted += Number(row.avg_confidence) * count;
        confidenceWeight += count;
      }
    }

    const symbols = await this.db.query(
      `SELECT language, COUNT(*)::int AS count FROM symbols WHERE snapshot_id = $1 GROUP BY language ORDER BY 2 DESC;`,
      [snapshot.id]
    );
    const languages = symbols.rows.map((row) => ({
      language: row.language ?? null,
      symbols: Number(row.count ?? 0)
    }));
    const symbolsTotal = languages.reduce((sum, l) => sum + l.symbols, 0);

    const chunks = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM chunks WHERE snapshot_id = $1;`,
      [snapshot.id]
    );

    const parsers = await this.db.query(
      `SELECT parser_id, version FROM parser_versions WHERE snapshot_id = $1 ORDER BY parser_id;`,
      [snapshot.id]
    );

    return {
      repositoryId: snapshot.repositoryId,
      snapshotId: snapshot.id,
      commitSha: snapshot.commitSha,
      snapshotStatus: snapshot.status,
      fileCounts,
      filesTotal,
      symbolsTotal,
      chunksTotal: Number(chunks.rows[0]?.count ?? 0),
      averageParseConfidence: confidenceWeight > 0 ? confidenceWeighted / confidenceWeight : null,
      languages,
      parserVersions: parsers.rows.map((r) => ({ parserId: r.parser_id, version: r.version })),
      lastJob: await this.lastJob(organizationId, projectId)
    };
  }

  private async lastJob(organizationId: string, projectId: string): Promise<IndexStatusDTO["lastJob"]> {
    const result = await this.db.query(
      `SELECT id, status, job_phase, attempts, last_error, updated_at, metadata_json
         FROM index_jobs
        WHERE organization_id = $1 AND project_id = $2
        ORDER BY updated_at DESC
        LIMIT 1;`,
      [organizationId, projectId]
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      status: row.status,
      phase: row.job_phase,
      attempts: Number(row.attempts ?? 0),
      lastError: row.last_error ?? null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      evidence: typeof row.metadata_json === "object" && row.metadata_json !== null ? row.metadata_json : {}
    };
  }
}

function toSymbolDto(row: any): SymbolDTO {
  return {
    symbolId: row.symbol_id,
    path: row.path,
    language: row.language ?? null,
    symbolType: row.symbol_type,
    symbolName: row.symbol_name,
    startLine: Number(row.start_line),
    endLine: Number(row.end_line),
    startByte: Number(row.start_byte),
    endByte: Number(row.end_byte),
    contentHash: row.content_hash,
    parentSymbol: row.parent_symbol ?? null,
    isExported: Boolean(row.is_exported),
    exports: Array.isArray(row.exports) ? row.exports : [],
    imports: Array.isArray(row.imports) ? row.imports : [],
    commitSha: row.commit_sha,
    snapshotId: row.snapshot_id,
    fileContainsSecret: Boolean(row.contains_secret)
  };
}

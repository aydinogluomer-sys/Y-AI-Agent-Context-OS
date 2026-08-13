/**
 * P04 / Y-P04-010 — Incremental index (symbol invalidation).
 *
 * PROBLEM
 *   Her yeni commit'te tüm repo'yu yeniden ayrıştırmak, 10.000 dosyalık bir
 *   repo'da tek satırlık bir değişiklik için dakikalar süren iş demektir.
 *   Bu, index'in commit'in gerisinde kalmasına ve context'in bayat kalmasına
 *   yol açar — yani ürünün temel iddiasının çürümesine.
 *
 * ÇÖZÜM
 *   `git diff a..b` ile değişen dosyalar bulunur; yalnızca onlar ve onları
 *   import eden dosyalar yeniden ayrıştırılır. Değişmeyen dosyaların
 *   sembolleri önceki snapshot'tan KOPYALANIR (parse edilmez).
 *
 * NEDEN "import edenler" de yeniden ayrıştırılır:
 *   `a.ts` içindeki bir fonksiyonun imzası değişirse, onu import eden
 *   `b.ts`'nin sembolleri aynı kalır ama `imports` alanı üzerinden kurulan
 *   ilişki bayatlayabilir (P05 knowledge graph bu alandan beslenir).
 *   Bir seviye komşuluk, doğruluk ile maliyet arasındaki dengedir; derinlik
 *   `maxDependencyDepth` ile ayarlanır.
 *
 * NE ZAMAN TAM RE-INDEX (fail-safe):
 *   - Önceki ready snapshot yok (ilk index).
 *   - Adapter'ın git geçmişi yok — diff alınamaz.
 *   - Parser sürümleri değişti: grammar değişirse SEMBOLLER değişir,
 *     semboller değişirse chunk'lar değişir. Eski satırları kopyalamak
 *     sessizce yanlış sonuç üretirdi.
 *   - Değişen dosya oranı eşiği aştı — artımlı yol artık ucuz değil.
 *   - `changedFiles` hata verdi.
 *
 *   Bu kararların HEPSİ `reason` alanına yazılır. "Neden tam re-index
 *   yapıldı?" sorusu her zaman yanıtlanabilir olmalıdır; sessizce tam
 *   re-index'e düşmek, artımlı yolun hiç çalışmadığını gizleyebilir.
 */

import { newId } from "@y/shared";
import type { RepositoryAdapter } from "../repo/adapter";

export interface InvalidationDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export type InvalidationReason = "changed" | "added" | "deleted" | "dependent" | "full_reindex";

export interface InvalidationRecord {
  readonly path: string;
  readonly reason: InvalidationReason;
  readonly triggeredBy: string | null;
  readonly depth: number;
}

export interface IncrementalPlan {
  readonly mode: "full" | "incremental";
  /** Tam re-index'e neden düşüldüğü ya da artımlı yolun neden seçildiği. */
  readonly reason: string;
  /** Yeniden ayrıştırılacak dosyalar. */
  readonly filesToParse: readonly string[];
  /** Önceki snapshot'tan kopyalanacak dosyalar (parse edilmez). */
  readonly filesToCarryOver: readonly string[];
  /** Önceki snapshot'ta olup artık olmayan dosyalar. */
  readonly deletedPaths: readonly string[];
  readonly invalidations: readonly InvalidationRecord[];
  readonly totalFiles: number;
  /**
   * Tam re-index'e kıyasla yapılan parse işinin oranı.
   * P04 kabul kriteri: tek dosya değişiminde < 0.01.
   */
  readonly workRatio: number;
}

export interface PlanParams {
  readonly organizationId: string;
  readonly repositoryId: string;
  readonly toSnapshotId: string;
  readonly toCommitSha: string;
  /** Yeni snapshot'taki tüm dosya yolları. */
  readonly currentPaths: readonly string[];
  /** Şu anki parser sürümleri — önceki snapshot'unkiyle karşılaştırılır. */
  readonly parserVersions: Readonly<Record<string, string>>;
}

export interface PlannerOptions {
  /** Değişen dosya oranı bunu aşarsa tam re-index daha ucuzdur. */
  readonly fullReindexThreshold?: number;
  /** Import grafiğinde kaç halka geriye gidilecek. */
  readonly maxDependencyDepth?: number;
}

const DEFAULT_FULL_REINDEX_THRESHOLD = 0.3;
const DEFAULT_MAX_DEPENDENCY_DEPTH = 1;

interface PreviousSnapshot {
  readonly id: string;
  readonly commitSha: string;
}

export class IncrementalIndexPlanner {
  private readonly fullReindexThreshold: number;
  private readonly maxDependencyDepth: number;

  constructor(
    private readonly db: InvalidationDb,
    options: PlannerOptions = {}
  ) {
    this.fullReindexThreshold = options.fullReindexThreshold ?? DEFAULT_FULL_REINDEX_THRESHOLD;
    this.maxDependencyDepth = options.maxDependencyDepth ?? DEFAULT_MAX_DEPENDENCY_DEPTH;
  }

  async plan(adapter: RepositoryAdapter, params: PlanParams): Promise<IncrementalPlan> {
    const total = params.currentPaths.length;
    const previous = await this.findPreviousSnapshot(params.repositoryId, params.toSnapshotId);

    if (!previous) {
      return fullPlan(params.currentPaths, "onceki ready snapshot yok (ilk index)");
    }
    if (!adapter.capabilities.hasHistory) {
      return fullPlan(params.currentPaths, "adapter git gecmisi tasimiyor; diff alinamaz");
    }
    if (previous.commitSha === params.toCommitSha) {
      return fullPlan(params.currentPaths, "commit degismemis; artimli yolun anlami yok");
    }

    const versionDrift = await this.parserVersionDrift(previous.id, params.parserVersions);
    if (versionDrift) {
      return fullPlan(params.currentPaths, `parser surumu degisti: ${versionDrift}`);
    }

    let changed: string[];
    try {
      changed = await adapter.changedFiles(previous.commitSha, params.toCommitSha);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Fail-safe: diff alinamiyorsa TAM re-index. Sonuc dogru olur, is
      // pahali olur. Sessizce artimli devam etmek bayat sembol birakirdi.
      return fullPlan(params.currentPaths, `diff alinamadi, guvenli tarafa dusuldu: ${message}`);
    }

    const currentSet = new Set(params.currentPaths);
    const previousPaths = await this.previousPaths(previous.id);
    const previousSet = new Set(previousPaths);

    const changedRatio = total > 0 ? changed.length / total : 1;
    if (changedRatio > this.fullReindexThreshold) {
      return fullPlan(
        params.currentPaths,
        `degisen dosya orani %${(changedRatio * 100).toFixed(1)} > esik %${(
          this.fullReindexThreshold * 100
        ).toFixed(1)}`
      );
    }

    const invalidations = new Map<string, InvalidationRecord>();

    for (const path of changed) {
      if (!currentSet.has(path)) continue; // silinenler asagida ele alinir
      invalidations.set(path, {
        path,
        reason: previousSet.has(path) ? "changed" : "added",
        triggeredBy: null,
        depth: 0
      });
    }

    const deletedPaths = changed.filter((p) => !currentSet.has(p) && previousSet.has(p));

    // Import grafigi ONCEKI snapshot'tan kurulur: degisen dosyayi kimin
    // import ettigini bilmek icin degisiklik oncesi duruma bakmak gerekir.
    const importers = await this.buildImporterGraph(previous.id);
    const seeds = [...invalidations.keys(), ...deletedPaths];
    this.expandDependents(importers, seeds, currentSet, invalidations);

    const parseSet = new Set(invalidations.keys());

    // Onceki snapshot'ta bulunmayan ve diff'te de gorunmeyen dosyalar
    // parse EDILMELIDIR — kopyalanacak bir kaynak satiri yok.
    for (const path of params.currentPaths) {
      if (!parseSet.has(path) && !previousSet.has(path)) {
        invalidations.set(path, { path, reason: "added", triggeredBy: null, depth: 0 });
        parseSet.add(path);
      }
    }

    const filesToCarryOver = params.currentPaths.filter((p) => !parseSet.has(p) && previousSet.has(p));

    for (const path of deletedPaths) {
      invalidations.set(path, { path, reason: "deleted", triggeredBy: null, depth: 0 });
    }

    const parseCount = parseSet.size;

    return {
      mode: "incremental",
      reason: `${changed.length} dosya degisti, ${parseCount} dosya yeniden ayristirilacak`,
      filesToParse: [...parseSet],
      filesToCarryOver,
      deletedPaths,
      invalidations: [...invalidations.values()],
      totalFiles: total,
      workRatio: total > 0 ? parseCount / total : 0
    };
  }

  /**
   * Değişmeyen dosyaların sembol ve chunk'larını önceki snapshot'tan kopyalar.
   *
   * Kimlikler İSTEMCİDE üretilir (ADR-013): `gen_random_uuid()` ya da
   * `random()` gibi SQL kaynakları kriptografik değildir ve primary key
   * üretiminde kullanılmaları, P00'da kapatılan `Math.random()` kalıbının
   * SQL'e taşınması olurdu. Bunun yerine eski kimlikler tek sorguda okunur,
   * her biri için `newId()` ile yeni kimlik üretilir ve kopyalama TEK bir
   * küme tabanlı INSERT ile yapılır — satır satır döngü değil.
   */
  async carryOver(
    plan: IncrementalPlan,
    params: {
      fromSnapshotId?: string;
      toSnapshotId: string;
      toCommitSha: string;
      repositoryId: string;
    }
  ): Promise<{ symbols: number; chunks: number }> {
    if (plan.mode === "full" || plan.filesToCarryOver.length === 0) {
      return { symbols: 0, chunks: 0 };
    }

    const fromSnapshotId =
      params.fromSnapshotId ??
      (await this.findPreviousSnapshot(params.repositoryId, params.toSnapshotId))?.id;
    if (!fromSnapshotId) return { symbols: 0, chunks: 0 };

    const paths = [...plan.filesToCarryOver];

    const symbolIds = await this.db.query(
      `SELECT symbol_id FROM symbols WHERE snapshot_id = $1 AND path = ANY($2::text[]) ORDER BY symbol_id;`,
      [fromSnapshotId, paths]
    );
    const oldSymbolIds: string[] = symbolIds.rows.map((r) => r.symbol_id);
    const newSymbolIds = oldSymbolIds.map(() => newId("sym"));

    if (oldSymbolIds.length > 0) {
      await this.db.query(
        `INSERT INTO symbols (
           symbol_id, repository_id, commit_sha, path, language, symbol_type, symbol_name,
           start_line, end_line, start_byte, end_byte, content_hash, parent_symbol,
           exports, imports, organization_id, snapshot_id, file_id, is_exported
         )
         SELECT m.new_id, s.repository_id, $3, s.path, s.language, s.symbol_type, s.symbol_name,
                s.start_line, s.end_line, s.start_byte, s.end_byte, s.content_hash, s.parent_symbol,
                s.exports, s.imports, s.organization_id, $2, f.id, s.is_exported
           FROM symbols s
           JOIN unnest($4::text[], $5::text[]) AS m(old_id, new_id) ON m.old_id = s.symbol_id
           LEFT JOIN files f ON f.snapshot_id = $2 AND f.path = s.path
          WHERE s.snapshot_id = $1
         ON CONFLICT (snapshot_id, path, start_byte) DO NOTHING;`,
        [fromSnapshotId, params.toSnapshotId, params.toCommitSha, oldSymbolIds, newSymbolIds]
      );
    }

    const chunkIds = await this.db.query(
      `SELECT id FROM chunks WHERE snapshot_id = $1 AND path = ANY($2::text[]) ORDER BY id;`,
      [fromSnapshotId, paths]
    );
    const oldChunkIds: string[] = chunkIds.rows.map((r) => r.id);
    const newChunkIds = oldChunkIds.map(() => newId("chunk"));

    if (oldChunkIds.length > 0) {
      await this.db.query(
        `INSERT INTO chunks (
           id, organization_id, snapshot_id, file_id, symbol_id, path, ordinal, content,
           content_hash, start_line, end_line, start_byte, end_byte,
           symbol_name, symbol_type, part_index, part_count, estimated_tokens
         )
         SELECT m.new_id, c.organization_id, $2, f.id, NULL, c.path, c.ordinal, c.content,
                c.content_hash, c.start_line, c.end_line, c.start_byte, c.end_byte,
                c.symbol_name, c.symbol_type, c.part_index, c.part_count, c.estimated_tokens
           FROM chunks c
           JOIN unnest($3::text[], $4::text[]) AS m(old_id, new_id) ON m.old_id = c.id
           LEFT JOIN files f ON f.snapshot_id = $2 AND f.path = c.path
          WHERE c.snapshot_id = $1
         ON CONFLICT (snapshot_id, path, ordinal) DO NOTHING;`,
        [fromSnapshotId, params.toSnapshotId, oldChunkIds, newChunkIds]
      );

      // Kopyalanan chunk'lari YENI snapshot'in sembollerine baglar.
      // symbol_id eski snapshot'in satirina isaret edemez; once NULL yazip
      // burada duzeltmek, yanlis snapshot'a FK vermekten guvenlidir.
      await this.db.query(
        `UPDATE chunks c
            SET symbol_id = s.symbol_id
           FROM symbols s
          WHERE c.snapshot_id = $1
            AND s.snapshot_id = $1
            AND c.path = s.path
            AND c.symbol_name IS NOT NULL
            AND c.symbol_name = s.symbol_name
            AND c.start_byte >= s.start_byte
            AND c.symbol_id IS NULL
            AND c.path = ANY($2::text[]);`,
        [params.toSnapshotId, paths]
      );
    }

    // Dosya duzeyi parse durumu da tasinir; aksi halde kopyalanan dosyalar
    // "pending" gorunur ve bir sonraki calistirmada gereksizce ayristirilir.
    await this.db.query(
      `UPDATE files nf
          SET parse_status = pf.parse_status,
              parse_confidence = pf.parse_confidence,
              symbol_count = pf.symbol_count
         FROM files pf
        WHERE nf.snapshot_id = $2
          AND pf.snapshot_id = $1
          AND nf.path = pf.path
          AND nf.path = ANY($3::text[]);`,
      [fromSnapshotId, params.toSnapshotId, paths]
    );

    return { symbols: oldSymbolIds.length, chunks: oldChunkIds.length };
  }

  /** Invalidation izlerini kalıcılaştırır — kabul kriteri buradan ölçülür. */
  async record(
    plan: IncrementalPlan,
    params: PlanParams & { fromSnapshotId?: string | null }
  ): Promise<number> {
    let written = 0;
    for (const inv of plan.invalidations) {
      await this.db.query(
        `INSERT INTO symbol_invalidations
           (id, organization_id, repository_id, from_snapshot_id, to_snapshot_id, path, reason, triggered_by, depth)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (to_snapshot_id, path) DO NOTHING;`,
        [
          newId("inv"),
          params.organizationId,
          params.repositoryId,
          params.fromSnapshotId ?? null,
          params.toSnapshotId,
          inv.path,
          inv.reason,
          inv.triggeredBy,
          inv.depth
        ]
      );
      written++;
    }
    return written;
  }

  async findPrevious(repositoryId: string, excludeSnapshotId: string): Promise<PreviousSnapshot | null> {
    return this.findPreviousSnapshot(repositoryId, excludeSnapshotId);
  }

  private async findPreviousSnapshot(
    repositoryId: string,
    excludeSnapshotId: string
  ): Promise<PreviousSnapshot | null> {
    const result = await this.db.query(
      `SELECT id, commit_sha
         FROM repository_snapshots
        WHERE repository_id = $1 AND status = 'ready' AND id <> $2
        ORDER BY created_at DESC
        LIMIT 1;`,
      [repositoryId, excludeSnapshotId]
    );
    const row = result.rows[0];
    return row ? { id: row.id, commitSha: row.commit_sha } : null;
  }

  private async previousPaths(snapshotId: string): Promise<string[]> {
    const result = await this.db.query(`SELECT path FROM files WHERE snapshot_id = $1;`, [snapshotId]);
    return result.rows.map((r) => r.path);
  }

  /**
   * Parser sürümü değişikliği tespiti.
   * Fark varsa artımlı yol GEÇERSİZDİR: eski satırlar eski grammar'ın
   * ürünüdür ve yeni grammar farklı semboller üretebilir.
   */
  private async parserVersionDrift(
    snapshotId: string,
    current: Readonly<Record<string, string>>
  ): Promise<string | null> {
    const result = await this.db.query(
      `SELECT parser_id, version FROM parser_versions WHERE snapshot_id = $1;`,
      [snapshotId]
    );
    if (result.rows.length === 0) return "onceki snapshot'ta parser surumu kaydi yok";

    const recorded = new Map<string, string>(result.rows.map((r) => [r.parser_id, r.version]));
    for (const [parserId, version] of Object.entries(current)) {
      const previous = recorded.get(parserId);
      if (previous === undefined) return `${parserId} yeni eklendi`;
      if (previous !== version) return `${parserId} ${previous} -> ${version}`;
    }
    for (const parserId of recorded.keys()) {
      if (!(parserId in current)) return `${parserId} kaldirildi`;
    }
    return null;
  }

  /** path -> onu import eden dosyalar. */
  private async buildImporterGraph(snapshotId: string): Promise<Map<string, Set<string>>> {
    const result = await this.db.query(
      `SELECT DISTINCT path, imports FROM symbols WHERE snapshot_id = $1 AND cardinality(imports) > 0;`,
      [snapshotId]
    );

    const importers = new Map<string, Set<string>>();
    for (const row of result.rows) {
      const from: string = row.path;
      const specifiers: string[] = row.imports ?? [];
      for (const specifier of specifiers) {
        for (const target of resolveImportCandidates(from, specifier)) {
          let set = importers.get(target);
          if (!set) {
            set = new Set<string>();
            importers.set(target, set);
          }
          set.add(from);
        }
      }
    }
    return importers;
  }

  private expandDependents(
    importers: Map<string, Set<string>>,
    seeds: readonly string[],
    currentSet: ReadonlySet<string>,
    into: Map<string, InvalidationRecord>
  ): void {
    let frontier = [...seeds];
    for (let depth = 1; depth <= this.maxDependencyDepth; depth++) {
      const next: string[] = [];
      for (const target of frontier) {
        for (const importer of importers.get(target) ?? []) {
          if (into.has(importer) || !currentSet.has(importer)) continue;
          into.set(importer, { path: importer, reason: "dependent", triggeredBy: target, depth });
          next.push(importer);
        }
      }
      if (next.length === 0) break;
      frontier = next;
    }
  }
}

function fullPlan(currentPaths: readonly string[], reason: string): IncrementalPlan {
  return {
    mode: "full",
    reason,
    filesToParse: [...currentPaths],
    filesToCarryOver: [],
    deletedPaths: [],
    invalidations: currentPaths.map((path) => ({
      path,
      reason: "full_reindex" as const,
      triggeredBy: null,
      depth: 0
    })),
    totalFiles: currentPaths.length,
    workRatio: currentPaths.length > 0 ? 1 : 0
  };
}

/** Uzantısız import'lar için denenecek son ekler. */
const EXTENSION_CANDIDATES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".php",
  ".cs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
  "/__init__.py",
  "/mod.rs"
];

/**
 * Bir import specifier'ının işaret edebileceği repo içi yolları üretir.
 *
 * Yalnızca GÖRECELİ specifier'lar çözülür. Paket adları (`react`,
 * `@y/shared`) repo dosyalarına karşılık gelmez; monorepo alias'ları
 * (`@y/*` → `packages/*`) tsconfig okumayı gerektirir ve bu fazın kapsamı
 * dışındadır. Sonuç: alias'lı bir bağımlılık artımlı yolda kaçırılabilir.
 * Bu, periyodik tam re-index ve `content_hash` doğrulamasıyla telafi edilir
 * (P04 Failure Modes) — sessiz bir varsayım değil, bilinen bir sınır.
 */
export function resolveImportCandidates(fromPath: string, specifier: string): string[] {
  if (!specifier.startsWith(".")) return [];

  const fromDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const joined = normalizePath(fromDir === "" ? specifier : `${fromDir}/${specifier}`);
  if (joined === null) return [];

  const base = joined.replace(/\/+$/, "");
  const candidates = new Set<string>();
  for (const ext of EXTENSION_CANDIDATES) {
    candidates.add(`${base}${ext}`);
  }
  return [...candidates];
}

/** `a/./b`, `a/../b` gibi parçaları sadeleştirir. Repo kökünün dışına çıkarsa null. */
function normalizePath(input: string): string | null {
  const parts = input.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

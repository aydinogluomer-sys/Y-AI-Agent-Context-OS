/**
 * P06 / Y-P06-006 — Sembol eşleşmeli retrieval.
 *
 * NEDEN AYRI BİR KANAL
 *   Bir görev metni çoğu zaman kodun kendi adlarını içerir:
 *   "refactor `AuthService.login` to use the new token store".
 *   Bu, retrieval için en güçlü sinyallerden biridir ve ne lexical ne de
 *   semantic kanal onu tam olarak yakalar:
 *     - Lexical: `authservice` bir token olarak geçer ama dosya
 *       içeriğinde geçen HER yer eşit ağırlıkta sayılır; SEMBOL TANIMI
 *       ile kullanım yeri ayrılmaz.
 *     - Semantic: gömme uzayında yakın ama tam ad eşleşmesi kesinliğini
 *       kaybeder.
 *
 *   Bu kanal `symbols` tablosuna vurur ve TANIMI bulur.
 *
 * TAM VE KISMİ EŞLEŞME AYRILIR
 *   `AuthService` tam eşleşmesi ile `authServiceHelper` kısmi eşleşmesi
 *   aynı güveni taşımaz. Skor bu ayrımı korur; ad çakışmalarında
 *   (aynı adın birden çok dosyada tanımlanması) skor DÜŞER çünkü
 *   hangisinin kastedildiği belirsizdir.
 */

import type { Candidate, RetrievalSpec } from "./types";

export interface SymbolDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

const DEFAULT_LIMIT = 100;

export class SymbolRetriever {
  constructor(private readonly db: SymbolDb) {}

  async search(spec: RetrievalSpec): Promise<Candidate[]> {
    const identifiers = extractIdentifiers(spec.query);
    if (identifiers.length === 0) return [];

    const limit = Math.min(Math.max(1, spec.perChannelLimit ?? DEFAULT_LIMIT), 1_000);

    const result = await this.db.query(
      `WITH matched AS (
         SELECT s.symbol_name, s.path, s.symbol_type,
                -- Tam eslesme mi kismi mi: guveni belirler.
                bool_or(lower(s.symbol_name) = ANY($3::text[])) AS exact,
                COUNT(DISTINCT s.path) OVER (PARTITION BY lower(s.symbol_name)) AS name_collisions
           FROM symbols s
          WHERE s.snapshot_id = $1
            AND s.organization_id = $2
            AND (lower(s.symbol_name) = ANY($3::text[])
                 OR lower(s.symbol_name) LIKE ANY($4::text[]))
          GROUP BY s.symbol_name, s.path, s.symbol_type
       )
       SELECT c.id, c.path, c.symbol_name, c.symbol_type, c.content,
              c.start_line, c.end_line, c.estimated_tokens,
              COALESCE(f.contains_secret, FALSE) AS contains_secret,
              m.exact, m.name_collisions
         FROM matched m
         JOIN chunks c
           ON c.snapshot_id = $1 AND c.path = m.path AND c.symbol_name = m.symbol_name
         LEFT JOIN files f ON f.id = c.file_id
        WHERE c.organization_id = $2
          AND ($5::text[] IS NULL OR NOT (c.path LIKE ANY($5::text[])))
          AND ($6::boolean IS NOT TRUE OR COALESCE(f.contains_secret, FALSE) = FALSE)
        ORDER BY m.exact DESC, m.name_collisions ASC, c.id
        LIMIT $7;`,
      [
        spec.snapshotId,
        spec.organizationId,
        identifiers,
        identifiers.map((i) => `%${i}%`),
        toLikePatterns(spec.deniedPathPrefixes),
        spec.excludeSecrets ?? false,
        limit
      ]
    );

    return result.rows.map((row) => ({
      chunkId: row.id,
      path: row.path,
      symbolName: row.symbol_name ?? null,
      symbolType: row.symbol_type ?? null,
      content: row.content ?? "",
      startLine: Number(row.start_line ?? 0),
      endLine: Number(row.end_line ?? 0),
      estimatedTokens: Number(row.estimated_tokens ?? 0),
      containsSecret: Boolean(row.contains_secret),
      channels: ["symbol" as const],
      rawScores: {
        symbol: symbolMatchScore(Boolean(row.exact), Number(row.name_collisions ?? 1))
      }
    }));
  }
}

/**
 * Sembol eşleşme güveni.
 *
 * Tam eşleşme 1'den başlar, kısmi 0,5'ten. Ad çakışması güveni böler:
 * `handle` adı 12 dosyada tanımlıysa hangisinin kastedildiği belirsizdir
 * ve bu belirsizlik skora YANSIMALIDIR. Sabit bir skor vermek, belirsiz
 * bir eşleşmeyi kesin bir eşleşme gibi gösterirdi.
 */
export function symbolMatchScore(exact: boolean, nameCollisions: number): number {
  const base = exact ? 1 : 0.5;
  const collisions = Math.max(1, nameCollisions);
  return Number(Math.max(0, Math.min(1, base / Math.sqrt(collisions))).toFixed(6));
}

/**
 * Görev metninden kod tanımlayıcılarını çıkarır.
 *
 * Aranan: `camelCase`, `PascalCase`, `snake_case`, `dotted.path` ve
 * backtick içindeki her şey. Sıradan İngilizce/Türkçe kelimeler
 * ELENİR — aksi halde "the", "update", "user" gibi kelimeler sembol
 * araması yapıp gürültü üretirdi.
 */
export function extractIdentifiers(query: string): string[] {
  const found = new Set<string>();

  // Backtick icindekiler acik bir isarettir: yazan kod adi kastediyor.
  for (const match of query.matchAll(/`([^`]+)`/g)) {
    for (const part of match[1].split(/[^A-Za-z0-9_$.]+/)) {
      if (part.length >= 2) addIdentifier(found, part);
    }
  }

  // Bicimden anlasilan tanimlayicilar.
  for (const match of query.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\b/g)) {
    const token = match[1];
    if (looksLikeIdentifier(token)) addIdentifier(found, token);
  }

  return [...found];
}

function addIdentifier(into: Set<string>, token: string): void {
  // `AuthService.login` -> hem tam hali hem parcalar aday.
  for (const part of token.split(".")) {
    if (part.length >= 2) into.add(part.toLowerCase());
  }
  if (token.includes(".")) into.add(token.toLowerCase());
}

/**
 * Bir token'ın kod tanımlayıcısı GİBİ görünüp görünmediği.
 *
 * Tek başına küçük harfli sıradan kelimeler ELENİR: bunlar cümle
 * kelimeleridir ve sembol araması gürültü üretir. Ayırt edici işaretler:
 * büyük harf içermek (camelCase/PascalCase), alt çizgi, `$`, ya da nokta.
 */
export function looksLikeIdentifier(token: string): boolean {
  if (token.length < 3) return false;
  if (token.includes(".") || token.includes("_") || token.includes("$")) return true;
  // camelCase / PascalCase: ilk harften sonra buyuk harf var.
  return /[a-z][A-Z]/.test(token) || /^[A-Z][a-z]+[A-Z]/.test(token);
}

function toLikePatterns(prefixes: readonly string[] | undefined): string[] | null {
  if (!prefixes || prefixes.length === 0) return null;
  return prefixes.map((p) => `${p.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
}

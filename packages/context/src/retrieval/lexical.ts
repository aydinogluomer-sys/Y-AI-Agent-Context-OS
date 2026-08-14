/**
 * P06 / Y-P06-004 — Gerçek lexical retrieval (ADR-025).
 *
 * ESKİ HALİ (P00 Truth Audit, `retrieval-ranking-service.ts:137-160`):
 *
 *     score = matches / queryWords.length * 40 + (path iceriyorsa 15)
 *
 * Buna "BM25" deniyordu. BM25'in üç bileşeninin hiçbiri yoktu:
 *   - IDF yok: nadir bir terim ile `the` aynı ağırlıktaydı.
 *   - Term frequency yok: terimin kaç kez geçtiği önemsizdi.
 *   - Uzunluk normalizasyonu yok: uzun dosyalar avantajlıydı.
 *
 * YENİ HALİ — Postgres full-text (`ts_rank_cd`)
 *   IDF ve TF Postgres tarafından hesaplanır; `tsv` kolonu 0064'te
 *   GENERATED olarak tanımlıdır ve GIN ile indekslenmiştir.
 *
 * `ts_rank_cd` BM25 DEĞİLDİR — ve öyle sunulmuyor
 *   Cover density ölçer: sorgu terimlerinin dokümanda ne kadar yakın
 *   kümelendiğini. BM25'in k1/b parametreleri yoktur. Kod aramasında
 *   pratikte benzer sıralama üretir ama AYNI DEĞİLDİR. Bu fark P16
 *   benchmark'ında ölçülecek; burada iddia edilmiyor.
 *
 * NORMALİZASYON
 *   `ts_rank_cd` sınırsızdır. Sıralama sinyali 0..1 aralığında olmalı
 *   (ranker öyle bekliyor), bu yüzden sonuç kümesinin EN YÜKSEK skoruna
 *   göre normalize edilir. Mutlak bir eşik kullanmak, sorgudan sorguya
 *   anlamı değişen bir sayı üretirdi.
 */

import type { Candidate, RetrievalSpec } from "./types";
import { compilePredicate } from "@y/security/context-firewall/universe";


export interface LexicalDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

const DEFAULT_LIMIT = 100;

export class LexicalRetriever {
  constructor(private readonly db: LexicalDb) {}

  async search(spec: RetrievalSpec): Promise<Candidate[]> {
    const terms = toTsQuery(spec.query);
    if (terms === null) return [];

    const limit = Math.min(Math.max(1, spec.perChannelLimit ?? DEFAULT_LIMIT), 1_000);

    // Firewall on filtresi (ADR-027, ADR-028): universe SQL predicate'ine
    // derlenir ve sorguya GOMULUR. Aday listesi bellege geldikten sonra
    // filtrelemek, DENY icerigini zaten okumus olmak demektir.
    const firewall = compilePredicate(spec.universe, "c.path", 4);

    const result = await this.db.query(
      `SELECT c.id, c.path, c.symbol_name, c.symbol_type, c.content,
              c.start_line, c.end_line, c.estimated_tokens,
              COALESCE(f.contains_secret, FALSE) AS contains_secret,
              ts_rank_cd(c.tsv, query, 32) AS rank
         FROM chunks c
         LEFT JOIN files f ON f.id = c.file_id,
              to_tsquery('simple', $3) AS query
        WHERE c.snapshot_id = $1
          AND c.organization_id = $2
          AND c.tsv @@ query
          AND ${firewall.sql}
          AND ($7::boolean IS NOT TRUE OR COALESCE(f.contains_secret, FALSE) = FALSE)
        ORDER BY rank DESC, c.id
        LIMIT $8;`,
      [
        spec.snapshotId,
        spec.organizationId,
        terms,
        ...firewall.params,
        spec.excludeSecrets ?? false,
        limit
      ]
    );

    return normalizeToCandidate(result.rows);
  }
}

/**
 * Sorgu metnini `to_tsquery` girdisine çevirir.
 *
 * Kullanıcı metni DOĞRUDAN `to_tsquery`'ye verilemez: `&`, `|`, `!`, `:`
 * ve parantezler operatördür ve geçersiz sözdizimi SQL hatası fırlatır.
 * `plainto_tsquery` bu sorunu çözerdi ama terimleri hep `&` ile bağlar;
 * kod aramasında tüm terimlerin geçmesini şart koşmak sonuçları aşırı
 * daraltır. Bu yüzden tokenize edip `|` ile bağlıyoruz ve her terime
 * prefix eşleşmesi (`:*`) veriyoruz — `authServ` yazan `authService`i
 * bulsun.
 *
 * @returns `null` sorguda kullanılabilir terim yoksa.
 */
export function toTsQuery(query: string): string | null {
  const tokens = tokenize(query);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}:*`).join(" | ");
}

/**
 * Sorgu metnini terimlere ayırır.
 *
 * camelCase ve snake_case tanımlayıcılar PARÇALARINA DA ayrılır:
 * `getUserById` araması `user` geçen bir fragment'ı bulabilmeli.
 * Orijinal token da korunur — tam eşleşme daha güçlü bir sinyaldir.
 */
export function tokenize(query: string): string[] {
  // BUYUK/KUCUK HARF SONA BIRAKILIR: once kucuk harfe cevirmek camelCase
  // sinirini yok eder ve `getUserById` bir daha parcalanamaz.
  const raw = query.split(/[^A-Za-z0-9_]+/).filter((t) => t.length >= 2);

  const out = new Set<string>();
  for (const token of raw) {
    out.add(token.toLowerCase());
    for (const part of splitIdentifier(token)) {
      if (part.length >= 3) out.add(part);
    }
  }
  return [...out];
}

function splitIdentifier(token: string): string[] {
  return token
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[_\-\s]+/)
    .map((p) => p.toLowerCase())
    .filter(Boolean);
}

/** DENY önekleri SQL `LIKE` kalıbına çevrilir. */
export function toLikePatterns(prefixes: readonly string[] | undefined): string[] | null {
  if (!prefixes || prefixes.length === 0) return null;
  // `%` ve `_` kullanicidan geliyorsa kalibi bozar; kacisla korunur.
  return prefixes.map((p) => `${p.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
}

/**
 * Ham satırları aday nesnelerine çevirir ve skorları 0..1'e normalize eder.
 *
 * Normalizasyon SONUÇ KÜMESİNE görelidir: en yüksek skor 1 olur. Bu,
 * kanallar arası karşılaştırmayı mümkün kılar — `ts_rank_cd` ile kosinüs
 * benzerliği aynı ölçekte değildir ve ham hâlleriyle toplanamazlar.
 */
export function normalizeToCandidate(rows: readonly any[]): Candidate[] {
  if (rows.length === 0) return [];

  const maxRank = rows.reduce((max, row) => Math.max(max, Number(row.rank ?? 0)), 0);

  return rows.map((row) => ({
    chunkId: row.id,
    path: row.path,
    symbolName: row.symbol_name ?? null,
    symbolType: row.symbol_type ?? null,
    content: row.content ?? "",
    startLine: Number(row.start_line ?? 0),
    endLine: Number(row.end_line ?? 0),
    estimatedTokens: Number(row.estimated_tokens ?? 0),
    containsSecret: Boolean(row.contains_secret),
    channels: ["lexical" as const],
    rawScores: { lexical: maxRank > 0 ? Number(row.rank ?? 0) / maxRank : 0 }
  }));
}

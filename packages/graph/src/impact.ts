/**
 * P05 / Y-P05-007 — Impact analizi (kanonik).
 *
 * P00 Truth Audit: impact analizi GERÇEK ve kalıcı (`impact_reports`) ama
 * güven skorları SABİT atanıyordu:
 *
 *     confidence = 0.9;                              // L1348
 *     confidence = 0.7;                              // L1359
 *     confidence: 0.85  // Path/import level         // L1616
 *     confidence: ... === "imported_by" ? 0.9 : 0.7  // L2541
 *
 * Bu sayıların neye dayandığı hiçbir yerde yazılı değildi. "0.9 güvenle
 * etkilenir" cümlesi, ölçülmüş bir olasılık değil, kodun içine yazılmış
 * bir tercihti — ve okuyan onu ölçüm sanıyordu.
 *
 * BURADA GÜVEN NEYE DAYANIR
 *   1. YOL UZUNLUĞU. Doğrudan bağımlılık, üç adım ötedekinden daha
 *      kesindir; her adımda belirsizlik birikir.
 *   2. KENAR GÜVENİ. Yol üzerindeki en zayıf kenar zinciri belirler:
 *      konvansiyona dayanan tek bir halka, tüm yolu şüpheli yapar.
 *   3. GRAF BÜTÜNLÜĞÜ. Çözülemeyen import oranı yüksekse graf eksiktir;
 *      eksik bir graf üzerinden yapılan "etkilenmez" çıkarımı zayıftır.
 *   4. KESİLME. Traversal bütçeye takıldıysa sonuç EKSİKTİR ve bu
 *      gizlenmez.
 *
 * Sonuç bir sayı değil, sayının GEREKÇESİDİR: `confidenceBasis` her girdiyi
 * taşır ve `impact_reports.confidence_basis` kolonuna yazılır. Böylece
 * "bu skor neden 0,62?" sorusu yanıtlanabilir.
 */

import type { TraversalResult } from "@y/shared";

export interface ImpactConfidenceBasis {
  /** Etkilenen node'lara ulaşılan azami derinlik. */
  readonly maxDepth: number;
  /** Yol üzerindeki en zayıf kenarın güveni. */
  readonly weakestEdgeConfidence: number;
  /** Yollardaki kenar güvenlerinin ortalaması. */
  readonly meanEdgeConfidence: number;
  /** Graf build'inde çözülemeyen import oranı. */
  readonly unresolvedImportRatio: number;
  /** Traversal bütçeye takıldı mı. */
  readonly truncated: boolean;
  /** Değişen dosyalardan kaçı graf'ta bulunabildi. */
  readonly seedsResolved: number;
  readonly seedsRequested: number;
}

export interface ImpactAnalysis {
  readonly affectedNodes: readonly string[];
  readonly affectedPaths: readonly string[];
  readonly affectedTests: readonly string[];
  readonly affectedDocs: readonly string[];
  readonly confidence: number;
  readonly confidenceBasis: ImpactConfidenceBasis;
  readonly truncated: boolean;
  /**
   * Analizin EKSİK olduğu durumlar. Boş liste "sorun yok" demektir;
   * dolu liste, skora bakmadan önce okunması gerekeni söyler.
   */
  readonly caveats: readonly string[];
}

export interface AnalyzeParams {
  /** Değişen dosya yolları (seed olarak kullanılır). */
  readonly changedPaths: readonly string[];
  readonly traversal: TraversalResult;
  readonly unresolvedImportRatio: number;
}

/**
 * Etki analizini traversal sonucundan üretir.
 *
 * Saf fonksiyon: DB'ye dokunmaz, zaman okumaz. Aynı girdi her zaman aynı
 * çıktıyı verir — P09 determinizminin girdilerinden biridir.
 */
export function analyzeImpact(params: AnalyzeParams): ImpactAnalysis {
  const { traversal } = params;

  // Seed'in kendisi "etkilenen" degildir: zaten degisen dosyadir.
  const seedSet = new Set(traversal.nodes.filter((n) => n.depth === 0).map((n) => n.nodeIdentifier));
  const affected = traversal.nodes.filter((n) => n.depth > 0);

  const affectedNodes = affected.map((n) => n.nodeIdentifier);
  const affectedPaths = unique(affected.map((n) => n.path).filter((p): p is string => p !== null));
  const affectedTests = unique(
    affected.filter((n) => n.nodeKind === "test").map((n) => n.path ?? n.nodeIdentifier)
  );
  const affectedDocs = unique(
    affected
      .filter((n) => n.nodeKind === "documentation" || n.nodeKind === "adr")
      .map((n) => n.path ?? n.nodeIdentifier)
  );

  const confidences = traversal.edges.map((e) => e.confidence);
  const weakest = confidences.length > 0 ? Math.min(...confidences) : 1;
  const mean =
    confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 1;
  const maxDepth = affected.reduce((max, n) => Math.max(max, n.depth), 0);

  const basis: ImpactConfidenceBasis = {
    maxDepth,
    weakestEdgeConfidence: weakest,
    meanEdgeConfidence: mean,
    unresolvedImportRatio: params.unresolvedImportRatio,
    truncated: traversal.truncated,
    seedsResolved: seedSet.size,
    seedsRequested: params.changedPaths.length
  };

  return {
    affectedNodes,
    affectedPaths,
    affectedTests,
    affectedDocs,
    confidence: computeImpactConfidence(basis),
    confidenceBasis: basis,
    truncated: traversal.truncated,
    caveats: collectCaveats(basis)
  };
}

/**
 * Ölçülen güven.
 *
 * Ceza tabanlı: 1'den başlanır ve her belirsizlik kaynağı düşürür.
 * Toplama değil çarpma kullanılır — belirsizlikler BAĞIMSIZ değildir ve
 * toplama, iki zayıf sinyalin birleşiminde negatif skor üretebilirdi.
 */
export function computeImpactConfidence(basis: ImpactConfidenceBasis): number {
  let score = 1;

  // Her adim belirsizlik biriktirir. Dogrudan komsu (derinlik 1) ceza
  // almaz; her ek adim %15 kaybettirir.
  if (basis.maxDepth > 1) {
    score *= Math.pow(0.85, basis.maxDepth - 1);
  }

  // Zincirin gucu en zayif halkasi kadardir.
  score *= basis.weakestEdgeConfidence;

  // Eksik graf, "etkilenmez" cikarimini zayiflatir.
  score *= 1 - basis.unresolvedImportRatio * 0.5;

  // Kesilmis traversal EKSIK sonuc demektir; skoru sert dusurur cunku
  // gorulmeyen etkiler var.
  if (basis.truncated) score *= 0.5;

  // Degisen dosyalarin bir kismi graf'ta bulunamadiysa analiz eksiktir.
  if (basis.seedsRequested > 0) {
    score *= basis.seedsResolved / basis.seedsRequested;
  }

  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

/**
 * Skorun tek başına anlatamadıkları.
 *
 * Düşük bir skorun NEDEN düşük olduğunu okuyucunun tahmin etmesini
 * beklemek, skoru kullanılamaz kılar.
 */
function collectCaveats(basis: ImpactConfidenceBasis): string[] {
  const caveats: string[] = [];

  if (basis.truncated) {
    caveats.push(
      "Traversal butceye takildi: bu liste EKSIK. Gorunmeyen etkilenen dosyalar olabilir."
    );
  }
  if (basis.seedsRequested > basis.seedsResolved) {
    const missing = basis.seedsRequested - basis.seedsResolved;
    caveats.push(
      `${missing} degisen dosya graf'ta bulunamadi (yeni eklenmis ya da index'lenmemis olabilir).`
    );
  }
  if (basis.unresolvedImportRatio > 0.2) {
    caveats.push(
      `Graf'taki import'larin %${(basis.unresolvedImportRatio * 100).toFixed(0)}'i cozulemedi; ` +
        `bagimlilik iliskileri eksik olabilir.`
    );
  }
  if (basis.weakestEdgeConfidence < 0.7) {
    caveats.push(
      "Yol uzerinde konvansiyona dayanan zayif bir bag var; iliski kanitlanmis degil, tahmin edilmis."
    );
  }
  if (basis.maxDepth >= 4) {
    caveats.push(`Etki ${basis.maxDepth} adim uzaga kadar izlendi; uzak baglar zayiftir.`);
  }

  return caveats;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

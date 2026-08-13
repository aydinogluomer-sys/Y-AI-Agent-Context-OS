/**
 * P06 / Y-P06-007, Y-P06-008, Y-P06-009 — 14 sinyalin hesaplanması.
 *
 * TASARIM: SAF FONKSİYONLAR
 *   Sinyaller DB'ye dokunmaz; girdileri çağıran toplar. Sebep: bir skorun
 *   neden o değer olduğu, sorgu zamanlamasından ya da bağlantı
 *   durumundan bağımsız olarak yeniden üretilebilmelidir. P09'un
 *   determinizm iddiası buna dayanır.
 *
 * `null` DÖNMEK MEŞRU BİR SONUÇTUR
 *   Bir sinyal hesaplanamıyorsa (kanal kapalı, git geçmişi yok, graf
 *   üretilmemiş) `null` döner. `0` DÖNMEZ. İkisi farklı şeydir:
 *     - `0`: hesaplandı, ilgisiz çıktı.
 *     - `null`: hesaplanamadı, bu konuda bilgi yok.
 *   Ranker `null` sinyalin ağırlığını diğerlerine dağıtır; `0` olsaydı
 *   adayı haksızca cezalandırırdı.
 */

import { emptySignals, type Candidate, type RankingSignals } from "../retrieval/types";

export interface GraphContext {
  /** Değişen/hedef dosyalardan bu yola olan en kısa bağımlılık mesafesi. */
  readonly dependencyDistanceByPath: ReadonlyMap<string, number>;
  /** Bu yolu import eden dosya sayısı (ters bağımlılık yoğunluğu). */
  readonly reverseDependentCountByPath: ReadonlyMap<string, number>;
  /** Traversal'da bulunan test dosyası yolları. */
  readonly relatedTestPaths: ReadonlySet<string>;
  /** Traversal'da bulunan doküman/ADR yolları. */
  readonly relatedDocPaths: ReadonlySet<string>;
  /** Graf üretilmediyse `false` — graf kaynaklı tüm sinyaller null olur. */
  readonly available: boolean;
}

export interface GitContext {
  /** Yol başına son değişiklikten bu yana geçen gün. */
  readonly daysSinceLastChangeByPath: ReadonlyMap<string, number>;
  /** Yol başına son 90 gündeki commit sayısı. */
  readonly commitCountByPath: ReadonlyMap<string, number>;
  readonly available: boolean;
}

export interface TaskContext {
  /** Görev metninden çıkarılan tanımlayıcılar (küçük harf). */
  readonly identifiers: ReadonlySet<string>;
  /** Görevin dokunmayı planladığı yollar (varsa). */
  readonly targetPaths: ReadonlySet<string>;
  /** Geçmiş görevlerde bu yolun kaç kez context'e girdiği. */
  readonly historicalHitsByPath: ReadonlyMap<string, number>;
  readonly historyAvailable: boolean;
}

export interface PolicyContext {
  /** Politikanın öne almak istediği yol önekleri. */
  readonly preferredPathPrefixes: readonly string[];
  /** Politikanın geri plana atmak istediği yol önekleri. */
  readonly deprioritizedPathPrefixes: readonly string[];
}

export interface SignalInputs {
  readonly graph: GraphContext;
  readonly git: GitContext;
  readonly task: TaskContext;
  readonly policy: PolicyContext;
  /** Semantic kanal kullanılabilir mi. */
  readonly semanticAvailable: boolean;
}

/** Yol türünden "otorite" ağırlığı. */
const AUTHORITY_BY_KIND: Record<string, number> = {
  adr: 1,
  documentation: 0.7,
  migration: 0.6,
  configuration: 0.4,
  test: 0.3
};

export function computeSignals(candidate: Candidate, inputs: SignalInputs): RankingSignals {
  const signals = emptySignals();

  // --- Kanal kaynakli sinyaller -------------------------------------------

  signals.lexicalSimilarity = candidate.rawScores.lexical ?? null;
  signals.symbolMatch = candidate.rawScores.symbol ?? null;

  // Semantic kanal kapaliysa null; keyword ortusmesi "semantic" diye
  // sunulmaz (P00'un en buyuk bulgusu).
  signals.semanticSimilarity = inputs.semanticAvailable
    ? (candidate.rawScores.semantic ?? 0)
    : null;

  // --- Graf kaynakli sinyaller --------------------------------------------

  if (inputs.graph.available) {
    const distance = inputs.graph.dependencyDistanceByPath.get(candidate.path);
    signals.dependencyDistance = distance === undefined ? 0 : distanceToScore(distance);

    const dependents = inputs.graph.reverseDependentCountByPath.get(candidate.path) ?? 0;
    signals.reverseDependency = dependentCountToScore(dependents);

    signals.testRelationship = inputs.graph.relatedTestPaths.has(candidate.path) ? 1 : 0;
    signals.documentRelationship = inputs.graph.relatedDocPaths.has(candidate.path) ? 1 : 0;
    signals.architectureRelationship = architectureScore(candidate.path);
  }

  // --- Git kaynakli sinyaller ---------------------------------------------

  if (inputs.git.available) {
    const days = inputs.git.daysSinceLastChangeByPath.get(candidate.path);
    signals.gitRecency = days === undefined ? 0 : recencyScore(days);

    const commits = inputs.git.commitCountByPath.get(candidate.path) ?? 0;
    signals.changeFrequency = frequencyScore(commits);
  }

  // --- Gorev ve politika ---------------------------------------------------

  signals.authority = authorityScore(candidate.path);
  signals.taskIntent = taskIntentScore(candidate, inputs.task);
  signals.policyAlignment = policyScore(candidate.path, inputs.policy);

  if (inputs.task.historyAvailable) {
    const hits = inputs.task.historicalHitsByPath.get(candidate.path) ?? 0;
    signals.historicalRelevance = frequencyScore(hits);
  }

  return signals;
}

/**
 * Bağımlılık mesafesi → skor.
 *
 * Doğrudan komşu (1) tam puan; her adım yarıya iner. Mesafe 0 "seed'in
 * kendisi" demektir ve tam puan alır. Ulaşılamayan (`undefined`) yol,
 * graf çalıştığı hâlde bağlantı bulunamadığı için 0 alır — bu `null`
 * DEĞİLDİR, hesaplanmış bir sonuçtur.
 */
export function distanceToScore(distance: number): number {
  if (distance <= 0) return 1;
  return Number((1 / Math.pow(2, distance - 1)).toFixed(6));
}

/**
 * Ters bağımlılık yoğunluğu → skor.
 *
 * Çok sayıda dosya tarafından import edilen bir modül, değişikliğin
 * etkisi açısından daha önemlidir. Logaritmik: 1 ile 2 arasındaki fark,
 * 50 ile 51 arasındakinden büyüktür.
 */
export function dependentCountToScore(count: number): number {
  if (count <= 0) return 0;
  return Number(Math.min(1, Math.log10(count + 1) / 2).toFixed(6));
}

/**
 * Git yakınlığı → skor.
 *
 * P00'daki recency kovaları (+20/15/10/5) yerine sürekli bir fonksiyon.
 * Kovalar, 29 gün ile 31 gün arasında yapay bir uçurum yaratıyordu.
 * Yarılanma süresi 30 gün.
 */
export function recencyScore(daysSinceChange: number): number {
  if (daysSinceChange < 0) return 1;
  return Number(Math.pow(0.5, daysSinceChange / 30).toFixed(6));
}

/** Değişim sıklığı → skor. Logaritmik doygunluk. */
export function frequencyScore(count: number): number {
  if (count <= 0) return 0;
  return Number(Math.min(1, Math.log10(count + 1) / 1.5).toFixed(6));
}

/**
 * Otorite.
 *
 * P00'da `AUTHORITY_WEIGHTS` sıralamayı domine ediyordu. Burada da bir
 * otorite kavramı var ama ağırlığı küçük (varsayılan %5) ve yalnızca
 * dosya TÜRÜNDEN türetiliyor — elle atanan bir liste değil.
 */
export function authorityScore(path: string): number {
  const kind = classifyPath(path);
  return AUTHORITY_BY_KIND[kind] ?? 0.1;
}

/** Mimari ilişki: mimari belgeler ve şema dosyaları. */
export function architectureScore(path: string): number {
  const kind = classifyPath(path);
  if (kind === "adr") return 1;
  if (kind === "migration") return 0.8;
  if (kind === "documentation") return 0.5;
  return 0;
}

/**
 * Görev niyetiyle örtüşme.
 *
 * Üç kanıt: (a) görev bu yolu doğrudan hedefliyor, (b) adayın sembol adı
 * görev metnindeki bir tanımlayıcıyla eşleşiyor, (c) yol parçalarından
 * biri görevin tanımlayıcılarında geçiyor. En güçlü kanıt kazanır.
 */
export function taskIntentScore(candidate: Candidate, task: TaskContext): number {
  if (task.targetPaths.has(candidate.path)) return 1;

  if (candidate.symbolName && task.identifiers.has(candidate.symbolName.toLowerCase())) {
    return 0.9;
  }

  const segments = candidate.path.toLowerCase().split(/[/\\.]+/).filter((s) => s.length >= 3);
  for (const segment of segments) {
    if (task.identifiers.has(segment)) return 0.6;
  }

  return 0;
}

/**
 * Politika hizalaması.
 *
 * DİKKAT: bu bir ERİŞİM KARARI DEĞİLDİR. Erişim, aday üretiminden önce
 * filtre olarak uygulanır (ADR-027). Buradaki skor yalnızca politika
 * TERCİHLERİNİ taşır ("test dosyalarını öne al" gibi). Erişimi skora
 * çevirmek, yeterince az aday olduğunda yasak içeriğin yine de
 * seçilmesi demek olurdu.
 */
export function policyScore(path: string, policy: PolicyContext): number {
  for (const prefix of policy.preferredPathPrefixes) {
    if (path.startsWith(prefix)) return 1;
  }
  for (const prefix of policy.deprioritizedPathPrefixes) {
    if (path.startsWith(prefix)) return 0;
  }
  return 0.5;
}

function classifyPath(path: string): string {
  const lower = path.toLowerCase();
  if (/(^|\/)docs?\/adr[s]?\//.test(lower) || /\/adr-\d+/.test(lower)) return "adr";
  if (/\.mdx?$/.test(lower)) return "documentation";
  if (/(^|\/)migrations\//.test(lower) || /\.sql$/.test(lower)) return "migration";
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(lower) || /(^|\/)tests?\//.test(lower)) return "test";
  if (/\.(json|ya?ml|toml|ini)$/.test(lower)) return "configuration";
  return "code";
}

/** Sinyal girdisi yokken kullanılan boş bağlam. */
export function emptyInputs(): SignalInputs {
  return {
    graph: {
      dependencyDistanceByPath: new Map(),
      reverseDependentCountByPath: new Map(),
      relatedTestPaths: new Set(),
      relatedDocPaths: new Set(),
      available: false
    },
    git: {
      daysSinceLastChangeByPath: new Map(),
      commitCountByPath: new Map(),
      available: false
    },
    task: {
      identifiers: new Set(),
      targetPaths: new Set(),
      historicalHitsByPath: new Map(),
      historyAvailable: false
    },
    policy: { preferredPathPrefixes: [], deprioritizedPathPrefixes: [] },
    semanticAvailable: false
  };
}

/**
 * P05 — Kanonik graph yuzeyi (barrel).
 *
 * `packages/graph/src/index.ts` 3.037 satirlik legacy dosyadir ve
 * `context_items` kaynakli eski grafi uretir. Onu tek seferde bolmek
 * yerine kanonik modulleri ayri bir barrel'da topluyoruz: legacy yuzey
 * P06 cutover'ina kadar calisir durumda kalir, yeni kod yalniz buradan
 * import eder.
 */

export {
  GraphBuilder,
  classifyFileNode,
  resolveImportTargets,
  testTargetOf,
  type GraphDb,
  type BuildOptions,
  type BuildResult
} from "./builder";

export {
  GraphTraversal,
  TraversalError,
  buildTraversalSql,
  type TraversalDb
} from "./traversal";

export {
  GraphInvalidator,
  type GraphInvalidationPlan,
  type InvalidationDb,
  type PlanParams
} from "./graph-invalidation";

export {
  analyzeImpact,
  computeImpactConfidence,
  type ImpactAnalysis,
  type ImpactConfidenceBasis,
  type AnalyzeParams
} from "./impact";

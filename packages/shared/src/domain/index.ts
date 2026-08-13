/**
 * P01 / Y-P01-001 — Kanonik domain sözleşmeleri.
 *
 * Bu modüller, P02–P20 fazlarının üzerine yazacağı tipleri tanımlar.
 * P01'den sonra yalnız ADDITIVE değişebilirler; breaking değişiklik
 * yeni bir ADR gerektirir (master plan §6.1).
 */

export * from "./identity";
export * from "./provenance";
export * from "./run";
export * from "./context";
export * from "./change";

// P05'te eklendi. `GraphNode` adı legacy tarafta zaten kullanıldığı için
// kanonik tipler `GraphNodeRecord`/`GraphEdgeRecord` adlarını taşır;
// `export *` çakışma üretmez.
export * from "./graph";

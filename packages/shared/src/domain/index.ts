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

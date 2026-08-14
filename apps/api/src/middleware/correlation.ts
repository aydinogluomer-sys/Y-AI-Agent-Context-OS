/**
 * P01 / Y-P01-003 — Correlation ID middleware.
 *
 * P00 audit'i, sistemde hiçbir korelasyon anahtarı olmadığını tespit etti:
 * loglar bir isteği veya run'ı uçtan uca izlemeye elverişli değildi.
 *
 * ADR-067 (P18) `run_id`'yi birinci sınıf korelasyon anahtarı yapar; bu
 * middleware onun HTTP ayağını kurar.
 */

import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { runWithContext } from "@y/observability";

export const CORRELATION_HEADER = "x-correlation-id";

/** İstemciden gelen korelasyon id'sini kabul etmeden önce doğrula. */
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export interface CorrelatedRequest extends Request {
  correlationId: string;
}

export function correlationId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.headers[CORRELATION_HEADER];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;

    // Log injection ve aşırı uzun header'lara karşı: doğrulanmayan değeri kullanma.
    const id = candidate && SAFE_ID.test(candidate) ? candidate : randomUUID();

    (req as CorrelatedRequest).correlationId = id;
    res.setHeader(CORRELATION_HEADER, id);

    /*
     * [P18 / Y-P18-002] Bagilami AsyncLocalStorage'a KUR.
     *
     * Onceki hali korelasyon id'sini yalniz `req` uzerine yaziyordu; log
     * yazan kod `req`'e erisemedigi icin HICBIR satir korelasyon
     * tasimiyordu.
     *
     * `next()` bagLam icinde cagriliyor: bu istegin tum alt cagri agaci
     * — middleware'ler, handler, async devamlar — ayni bagLami gorur.
     * Korelasyonu her fonksiyon imzasindan gecirmek alternatifti;
     * reddedildi cunku BIR imzayi unutmak sessizce korelasyonsuz log
     * uretirdi.
     */
    runWithContext({ correlationId: id }, () => next());
  };
}

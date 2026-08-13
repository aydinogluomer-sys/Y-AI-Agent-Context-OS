/**
 * P01 / ADR-013 — Kanonik kimlik üretimi.
 *
 * Neden: P00 Truth Audit, primary key üretiminde 60 çağrı noktasında
 * `Math.random().toString(36).substring(2, 11)` kalıbını tespit etti
 * (`index-job-service.ts`, `apps/api/src/index.ts`, `audit.ts`,
 * `WorkerRuntimeService.ts`, `packages/graph/src/index.ts`, ...).
 *
 * Bu kalıp ~44 bit tahmin edilebilir entropi taşır ve kriptografik değildir.
 * Audit / evidence / event kayıtlarında bu bir bütünlük riskidir: bir aktör
 * gelecekteki bir kimliği tahmin edip önceden kayıt oluşturabilir.
 *
 * Kural: uygulama kodunda `Math.random()` ile kimlik üretilmez.
 * `scripts/audit/scan-false-green.ts` bunu `random-primary-key` kuralıyla
 * denetler; P17'de CI gate'i olur.
 */

/**
 * Web Crypto API kullanılır — Node 19+ ve tarayıcıda aynı yüzey.
 *
 * `node:crypto`'dan import etmek bu modülü sunucuya hapsederdi:
 * `packages/shared` hem `apps/api` hem `apps/web` tarafından tüketiliyor ve
 * Rollup tarayıcı bundle'ında `crypto` modülünü çözemez (P01 build hatası).
 */
const webcrypto: Crypto = globalThis.crypto;

if (!webcrypto || typeof webcrypto.getRandomValues !== "function") {
  throw new Error(
    "Web Crypto API bulunamadi. Kimlik uretimi kriptografik bir kaynak gerektirir " +
      "(Node 19+ veya guvenli baglam icinde tarayici). Math.random() fallback'i YASAKTIR (ADR-013)."
  );
}

/** Prefix'te izin verilen karakterler — id'nin ayrıştırılabilir kalması için. */
const PREFIX_RE = /^[a-z][a-z0-9_]{0,23}$/;

function randomUUID(): string {
  if (typeof webcrypto.randomUUID === "function") {
    return webcrypto.randomUUID();
  }
  // randomUUID yoksa (eski tarayıcı) RFC 4122 v4'ü getRandomValues ile kur.
  const bytes = new Uint8Array(16);
  webcrypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex
    .slice(8, 10)
    .join("")}-${hex.slice(10, 16).join("")}`;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  webcrypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Kriptografik olarak güvenli kimlik üretir.
 *
 * @param prefix Opsiyonel, okunabilirlik için tip öneki (`run`, `evt`, `job`).
 *               Küçük harf, rakam ve `_` kabul edilir; en fazla 24 karakter.
 * @returns `prefix_<uuid>` veya prefix verilmezse düz UUID v4.
 *
 * @example
 *   newId()          // "3f1a...-...."
 *   newId("run")     // "run_3f1a...-...."
 */
export function newId(prefix?: string): string {
  const uuid = randomUUID();
  if (prefix === undefined) return uuid;

  if (!PREFIX_RE.test(prefix)) {
    throw new TypeError(
      `newId: gecersiz prefix ${JSON.stringify(prefix)}. ` +
        "Kucuk harfle baslamali, yalnizca [a-z0-9_] icermeli, en fazla 24 karakter olmali."
    );
  }
  return `${prefix}_${uuid}`;
}

/**
 * Sıralanabilir kimlik (ULID benzeri): 48-bit zaman damgası + 80-bit rastgelelik,
 * Crockford base32. Aynı milisaniyede üretilen id'ler için sıra garanti edilmez,
 * ama zaman içinde monoton artar — event/log tablolarında index lokalitesi sağlar.
 */
export function newSortableId(prefix?: string): string {
  const time = Date.now();
  const timeChars = encodeBase32(time, 10);
  const randomChars = encodeRandomBase32(16);
  const id = `${timeChars}${randomChars}`;
  if (prefix === undefined) return id;
  if (!PREFIX_RE.test(prefix)) {
    throw new TypeError(`newSortableId: gecersiz prefix ${JSON.stringify(prefix)}.`);
  }
  return `${prefix}_${id}`;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeBase32(value: number, length: number): string {
  let out = "";
  let remaining = value;
  for (let i = length - 1; i >= 0; i--) {
    out = CROCKFORD[remaining % 32] + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

function encodeRandomBase32(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CROCKFORD[bytes[i] % 32];
  }
  return out;
}

/** Bir değerin bu modülün ürettiği biçimde olup olmadığını doğrular. */
export function isValidId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const body = value.includes("_") ? value.slice(value.indexOf("_") + 1) : value;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body);
  const isSortable = /^[0-9A-HJKMNP-TV-Z]{26}$/.test(body);
  return isUuid || isSortable;
}

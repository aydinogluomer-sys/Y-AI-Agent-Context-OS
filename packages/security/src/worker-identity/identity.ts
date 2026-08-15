/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P17 / T-15 — WORKER KİMLİĞİ İMZALIDIR; İMZASIZ = DENY.
 *
 * Spec §54 release kapısı, maddeler arasında şunu sayıyor:
 *
 *     unsigned worker identity = denied
 *
 * P00 denetiminde bunun karşılığı **sıfır koddu**: `workerIdentity`,
 * `signedWorker`, `worker.signature` için tek eşleşme yoktu. Kuyruk
 * `claim(workerId: string, ...)` imzasıyla **herhangi bir dizeyi** worker
 * kimliği olarak kabul ediyordu.
 *
 * Tehdit (T-15, job hijack): veritabanına erişebilen ya da kuyruk API'sine
 * ulaşan biri, kendini var olan bir worker gibi tanıtıp bekleyen işleri
 * üzerine alabilir. Bu yalnız işleri çalmak değildir — çalınan iş bir agent
 * run'ıdır, yani manifest'e, boundary'ye ve yazma yetkisine erişimdir.
 *
 * ## Neden HMAC, neden asimetrik değil
 *
 * Worker'lar **birinci taraftır**: Y'nin kendi dağıtımının parçası ve aynı
 * secret'a erişebiliyorlar. Asimetrik imza, anahtar dağıtımı ve rotasyon
 * karmaşıklığı ekler ama burada kapatacağı bir tehdit yoktur — imzalayan
 * ile doğrulayan aynı güven alanında.
 *
 * Worker'lar bir gün üçüncü taraf olursa (müşteri altyapısında çalışan
 * worker), bu karar yeniden verilmelidir; o zaman asimetrik imza gerekli
 * hâle gelir.
 *
 * ## Neden süre sınırı ZORUNLU
 *
 * Süresiz bir worker token'ı **kalıcı bir kimlik bilgisidir**: bir kez
 * sızdığında iptal edilene kadar geçerli kalır ve iptal mekanizması
 * yoktur. Kısa ömür, sızıntının etki penceresini kendiliğinden kapatır.
 */

import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import type { NonceStore } from "./nonce-store";

export interface WorkerIdentity {
  readonly workerId: string;
  /** Bu worker'ın alabileceği iş türleri. Boş dizi = hiçbir şey. */
  readonly jobTypes: readonly string[];
  /** ISO 8601. */
  readonly issuedAt: string;
  /** ISO 8601. Zorunlu — süresiz kimlik yoktur. */
  readonly expiresAt: string;
  /** Tekrar saldırısına karşı benzersizlik (T-14). */
  readonly nonce: string;
}

export type WorkerIdentityRejection =
  | "MISSING_CREDENTIAL"
  | "MALFORMED"
  | "BAD_SIGNATURE"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "JOB_TYPE_NOT_GRANTED";

export class WorkerIdentityError extends Error {
  constructor(readonly reason: WorkerIdentityRejection, detail?: string) {
    super(`Worker kimligi reddedildi: ${reason}${detail ? ` (${detail})` : ""}`);
    this.name = "WorkerIdentityError";
  }
}

export class MissingSigningKeyError extends Error {
  readonly code = "MISSING_WORKER_SIGNING_KEY";
  constructor() {
    super(
      "Worker imzalama anahtari yok. Imzasiz worker kimligi KABUL EDILMEZ " +
        "(spec §54). WORKER_SIGNING_KEY ayarlanmadan kuyruk calistirilamaz."
    );
    this.name = "MissingSigningKeyError";
  }
}

/** İmzalı kimlik bilgisi: `<base64url(json)>.<hex(hmac)>` */
export type WorkerCredential = string & { readonly __brand: "WorkerCredential" };

const MIN_KEY_LENGTH = 32;

function assertKey(key: string): void {
  // FAIL CLOSED: anahtar yoksa ya da zayifsa imzalama/dogrulama YAPILMAZ.
  // "Anahtar yoksa dogrulamayi atla" davranisi, korumanin kendisini
  // opsiyonel yapardi — T-15'i kapatmis gorunup acik birakirdi.
  if (!key || key.length < MIN_KEY_LENGTH) {
    throw new MissingSigningKeyError();
  }
}

function b64url(input: string): string {
  return Buffer.from(input, "utf-8").toString("base64url");
}

function unb64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf-8");
}

function hmac(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload, "utf-8").digest("hex");
}

export interface IssueOptions {
  readonly workerId: string;
  readonly jobTypes: readonly string[];
  readonly ttlSeconds: number;
  readonly now?: Date;
}

/** Süre sınırı üst sınırı: 1 saat. Daha uzunu kalıcı kimliğe yaklaşır. */
export const MAX_TTL_SECONDS = 3600;

export function issueWorkerCredential(
  options: IssueOptions,
  signingKey: string
): WorkerCredential {
  assertKey(signingKey);

  if (options.ttlSeconds <= 0 || options.ttlSeconds > MAX_TTL_SECONDS) {
    throw new RangeError(
      `ttlSeconds 1..${MAX_TTL_SECONDS} araliginda olmalidir; verilen: ${options.ttlSeconds}`
    );
  }

  const now = options.now ?? new Date();
  const identity: WorkerIdentity = {
    workerId: options.workerId,
    jobTypes: [...options.jobTypes],
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + options.ttlSeconds * 1000).toISOString(),
    nonce: randomUUID()
  };

  const payload = b64url(JSON.stringify(identity));
  return `${payload}.${hmac(payload, signingKey)}` as WorkerCredential;
}

export interface VerifyOptions {
  /** Bu iş türünü almaya yetkili mi? Verilmezse tür kontrolü yapılmaz. */
  readonly requiredJobType?: string;
  readonly now?: Date;
  /** Saat kayması toleransı. Varsayılan 30 sn. */
  readonly clockSkewSeconds?: number;
  /**
   * [P19/T7] Kullanılmış nonce deposu (T-14).
   *
   * Verilmezse tekrar koruması UYGULANMAZ ve sonuç `replayChecked: false`
   * taşır. Zorunlu yapmak, deposu olmayan her çağrı yerini (birim
   * testleri, süreç içi doğrulama) veritabanına bağlardı; ama opsiyonel
   * olmasının sessiz bir zaafa dönüşmemesi için çağıran korumanın
   * uygulanıp uygulanmadığını **bilebilir**.
   */
  readonly nonceStore?: NonceStore;
}

/** Doğrulama sonucu — tekrar korumasının uygulanıp uygulanmadığıyla. */
export interface VerifiedWorker {
  readonly identity: WorkerIdentity;
  /** Nonce deposu verildi ve nonce tüketildi mi? */
  readonly replayChecked: boolean;
}

/**
 * Kimlik bilgisini doğrular.
 *
 * Doğrulama **claim noktasında** yapılmalıdır, worker başlangıcında değil.
 * Başlangıçta doğrulanan bir kimlik, süresi dolduktan sonra da iş almaya
 * devam eder — ADR-039'un "enforcement mutation noktasında" ilkesinin
 * kuyruk yüzeyindeki karşılığı.
 */
export function verifyWorkerCredential(
  credential: string | undefined | null,
  signingKey: string,
  options: VerifyOptions = {}
): WorkerIdentity {
  assertKey(signingKey);

  if (!credential) {
    throw new WorkerIdentityError("MISSING_CREDENTIAL");
  }

  const parts = credential.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new WorkerIdentityError("MALFORMED", "beklenen bicim <payload>.<imza>");
  }

  const [payload, signature] = parts;
  const expected = hmac(payload, signingKey);

  // Sabit zamanli karsilastirma: uzunluk farkliysa timingSafeEqual
  // firlatir, o yuzden once uzunluk esitlenir.
  const a = Buffer.from(signature, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new WorkerIdentityError("BAD_SIGNATURE");
  }

  let identity: WorkerIdentity;
  try {
    identity = JSON.parse(unb64url(payload)) as WorkerIdentity;
  } catch {
    throw new WorkerIdentityError("MALFORMED", "payload cozulemedi");
  }

  if (!identity.workerId || !identity.expiresAt || !identity.issuedAt) {
    throw new WorkerIdentityError("MALFORMED", "zorunlu alan eksik");
  }

  const now = (options.now ?? new Date()).getTime();
  const skew = (options.clockSkewSeconds ?? 30) * 1000;

  if (now > Date.parse(identity.expiresAt) + skew) {
    throw new WorkerIdentityError("EXPIRED", identity.expiresAt);
  }
  if (now + skew < Date.parse(identity.issuedAt)) {
    throw new WorkerIdentityError("NOT_YET_VALID", identity.issuedAt);
  }

  if (options.requiredJobType && !identity.jobTypes.includes(options.requiredJobType)) {
    // Gecerli bir kimlik, HER ISI alma yetkisi demek degildir. Index
    // worker'inin agent run'i almasi, kimlik dogru olsa bile yetki asimidir.
    throw new WorkerIdentityError("JOB_TYPE_NOT_GRANTED", options.requiredJobType);
  }

  return identity;
}

/**
 * [P19/T7] Tekrar korumalı doğrulama (T-14).
 *
 * İmza, süre ve yetki kontrolleri senkron sürümle **aynıdır**; tek fark
 * nonce'un tüketilmesi. Ayrı bir fonksiyon olmasının sebebi, depo
 * erişiminin asenkron olması: senkron sürümü async yapmak 20+ çağrı
 * yerini değiştirirdi.
 *
 * Nonce **en son** tüketilir. Önce tüketip sonra süre kontrolü yapmak,
 * süresi dolmuş bir token'ın nonce'unu boş yere harcardı — ve daha
 * kötüsü, saldırgan geçersiz token'larla depoyu şişirebilirdi.
 */
export async function verifyWorkerCredentialWithReplayCheck(
  credential: string | undefined | null,
  signingKey: string,
  options: VerifyOptions = {}
): Promise<VerifiedWorker> {
  const identity = verifyWorkerCredential(credential, signingKey, options);

  if (!options.nonceStore) {
    return { identity, replayChecked: false };
  }

  await options.nonceStore.consume({
    nonce: identity.nonce,
    workerId: identity.workerId,
    expiresAt: new Date(identity.expiresAt)
  });

  return { identity, replayChecked: true };
}

import { describe, it, expect } from "vitest";
import {
  issueWorkerCredential,
  verifyWorkerCredential,
  WorkerIdentityError,
  MissingSigningKeyError,
  MAX_TTL_SECONDS,
  verifyWorkerCredentialWithReplayCheck
} from "./identity";
import { InMemoryNonceStore, NonceReplayError } from "./nonce-store";

const KEY = "unit-test-signing-key-at-least-32-chars!!";
const OTHER_KEY = "a-different-signing-key-also-32-chars-ok!";

function credential(overrides: Partial<Parameters<typeof issueWorkerCredential>[0]> = {}) {
  return issueWorkerCredential(
    { workerId: "worker_1", jobTypes: ["index", "embed"], ttlSeconds: 300, ...overrides },
    KEY
  );
}

/**
 * P17 / T-15 — spec §54: "unsigned worker identity = denied".
 *
 * Tehdit (job hijack): kuyruk API'sine ulaşan biri kendini var olan bir
 * worker gibi tanıtıp bekleyen işleri üzerine alır. Çalınan iş bir agent
 * run'ıdır — manifest'e, boundary'ye ve yazma yetkisine erişim demektir.
 */
describe("worker kimliği — imzasız = DENY", () => {
  it("geçerli kimlik doğrulanır", () => {
    const identity = verifyWorkerCredential(credential(), KEY);
    expect(identity.workerId).toBe("worker_1");
    expect(identity.jobTypes).toEqual(["index", "embed"]);
  });

  it("kimlik bilgisi YOKSA reddedilir", () => {
    for (const missing of [undefined, null, ""]) {
      expect(() => verifyWorkerCredential(missing, KEY)).toThrow(WorkerIdentityError);
    }
    try {
      verifyWorkerCredential(undefined, KEY);
    } catch (e) {
      expect((e as WorkerIdentityError).reason).toBe("MISSING_CREDENTIAL");
    }
  });

  it("BAŞKA anahtarla imzalanmış kimlik reddedilir", () => {
    const forged = issueWorkerCredential(
      { workerId: "worker_1", jobTypes: ["index"], ttlSeconds: 300 },
      OTHER_KEY
    );
    try {
      verifyWorkerCredential(forged, KEY);
      throw new Error("reddedilmeliydi");
    } catch (e) {
      expect((e as WorkerIdentityError).reason).toBe("BAD_SIGNATURE");
    }
  });

  it("payload OYNANIRSA imza tutmaz", () => {
    const token = credential();
    const [payload, signature] = token.split(".");
    const tampered = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    tampered.workerId = "attacker";
    const forged =
      Buffer.from(JSON.stringify(tampered), "utf-8").toString("base64url") + "." + signature;

    try {
      verifyWorkerCredential(forged, KEY);
      throw new Error("reddedilmeliydi");
    } catch (e) {
      expect((e as WorkerIdentityError).reason).toBe("BAD_SIGNATURE");
    }
  });

  it("bozuk biçim reddedilir", () => {
    for (const bad of ["", "abc", "a.b.c", ".sig", "payload."]) {
      expect(() => verifyWorkerCredential(bad, KEY)).toThrow(WorkerIdentityError);
    }
  });
});

describe("süre sınırı ZORUNLU", () => {
  it("süresi dolmuş kimlik reddedilir", () => {
    const issuedAt = new Date("2026-01-01T00:00:00.000Z");
    const token = credential({ ttlSeconds: 60, now: issuedAt });
    const wayLater = new Date(issuedAt.getTime() + 10 * 60 * 1000);

    try {
      verifyWorkerCredential(token, KEY, { now: wayLater });
      throw new Error("reddedilmeliydi");
    } catch (e) {
      expect((e as WorkerIdentityError).reason).toBe("EXPIRED");
    }
  });

  it("saat kayması toleransı dar bir pencerede kabul eder", () => {
    const issuedAt = new Date("2026-01-01T00:00:00.000Z");
    const token = credential({ ttlSeconds: 60, now: issuedAt });
    // Suresi 10 sn once doldu ama tolerans 30 sn.
    const justAfter = new Date(issuedAt.getTime() + 70 * 1000);
    expect(() =>
      verifyWorkerCredential(token, KEY, { now: justAfter, clockSkewSeconds: 30 })
    ).not.toThrow();
  });

  it("TTL üst sınırı zorlanır — süresiz kimlik yok", () => {
    // Suresiz bir token KALICI bir kimlik bilgisidir: bir kez sizdiginda
    // iptal edilene kadar gecerli kalir ve iptal mekanizmasi yoktur.
    expect(() => credential({ ttlSeconds: MAX_TTL_SECONDS + 1 })).toThrow(RangeError);
    expect(() => credential({ ttlSeconds: 0 })).toThrow(RangeError);
    expect(() => credential({ ttlSeconds: -1 })).toThrow(RangeError);
  });
});

describe("FAIL CLOSED — anahtar yoksa doğrulama yapılmaz", () => {
  it("anahtarsız imzalama HATA verir", () => {
    expect(() =>
      issueWorkerCredential({ workerId: "w", jobTypes: [], ttlSeconds: 60 }, "")
    ).toThrow(MissingSigningKeyError);
  });

  it("anahtarsız doğrulama HATA verir — 'atla' davranışı YOK", () => {
    // "Anahtar yoksa dogrulamayi atla" davranisi, korumanin kendisini
    // opsiyonel yapardi: T-15 kapatilmis gorunur, acik kalirdi.
    expect(() => verifyWorkerCredential(credential(), "")).toThrow(MissingSigningKeyError);
  });

  it("kısa anahtar reddedilir", () => {
    expect(() => verifyWorkerCredential(credential(), "kisa")).toThrow(MissingSigningKeyError);
  });
});

describe("yetki kapsamı — geçerli kimlik HER işi almaz", () => {
  it("verilmeyen iş türü reddedilir", () => {
    const token = credential({ jobTypes: ["index"] });
    try {
      verifyWorkerCredential(token, KEY, { requiredJobType: "run-execute" });
      throw new Error("reddedilmeliydi");
    } catch (e) {
      expect((e as WorkerIdentityError).reason).toBe("JOB_TYPE_NOT_GRANTED");
    }
  });

  it("verilen iş türü kabul edilir", () => {
    const token = credential({ jobTypes: ["index"] });
    expect(() =>
      verifyWorkerCredential(token, KEY, { requiredJobType: "index" })
    ).not.toThrow();
  });

  it("boş jobTypes HİÇBİR işi almaz", () => {
    const token = credential({ jobTypes: [] });
    expect(() =>
      verifyWorkerCredential(token, KEY, { requiredJobType: "index" })
    ).toThrow(WorkerIdentityError);
  });
});

describe("tekrar saldırısı yüzeyi (T-14)", () => {
  it("her kimlik benzersiz nonce taşır", () => {
    const a = verifyWorkerCredential(credential(), KEY);
    const b = verifyWorkerCredential(credential(), KEY);
    expect(a.nonce).not.toBe(b.nonce);
  });

  it("SENKRON dogrulama tekrari engellemez — bu BILINCLI", () => {
    /*
     * [P19/T7] T-14 KAPANDI ama BU fonksiyonda degil.
     *
     * `verifyWorkerCredential` senkron kalir ve nonce'u TUKETMEZ. Tekrar
     * korumasi `verifyWorkerCredentialWithReplayCheck` icinde ve bir
     * depo gerektirir (canli Postgres).
     *
     * Ayrimin sebebi: depo erisimi asenkron. Senkron surumu async yapmak
     * 20+ cagri yerini degistirirdi ve cogu (birim testleri, surec ici
     * dogrulama) depo tasimiyor.
     *
     * Bu test o ayrimi KAYIT ALTINA ALIR: senkron surumun tekrari
     * engellememesi bir kusur degil, sinirin kendisi.
     */
    const token = credential();
    expect(() => verifyWorkerCredential(token, KEY)).not.toThrow();
    expect(() => verifyWorkerCredential(token, KEY)).not.toThrow();
  });

  it("depoyla dogrulama tekrari ENGELLER", async () => {
    // Gercek koruma. Canli Postgres surumu:
    // tests/security/replay.spec.ts
    const store = new InMemoryNonceStore();
    const token = credential();

    const first = await verifyWorkerCredentialWithReplayCheck(token, KEY, {
      nonceStore: store
    });
    expect(first.replayChecked).toBe(true);

    await expect(
      verifyWorkerCredentialWithReplayCheck(token, KEY, { nonceStore: store })
    ).rejects.toThrow(NonceReplayError);
  });

  it("bellek ici depo TEK SURECTE calisir — sinir adinda yazili", async () => {
    // Y birden cok API ornegi ve worker calistirdiginda, bir ornekte
    // kullanilmis nonce digerinde hala gecerli gorunur. Uretimde
    // PostgresNonceStore kullanilir.
    const store = new InMemoryNonceStore();
    await store.consume({
      nonce: "n1",
      workerId: "w",
      expiresAt: new Date(Date.now() + 60_000)
    });
    expect(store.size()).toBe(1);

    // Ikinci bir "surec" (ayri ornek) ayni nonce'u kabul eder.
    const otherProcess = new InMemoryNonceStore();
    await expect(
      otherProcess.consume({
        nonce: "n1",
        workerId: "w",
        expiresAt: new Date(Date.now() + 60_000)
      })
    ).resolves.toBeUndefined();
  });
});

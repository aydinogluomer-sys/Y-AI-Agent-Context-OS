import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createIntegrationDb, type IntegrationDb } from "../integration/setup";
import {
  issueWorkerCredential,
  verifyWorkerCredentialWithReplayCheck,
  PostgresNonceStore,
  NonceReplayError,
  MAX_TTL_SECONDS
} from "@y/security";

/**
 * P19 / T7 — T-14 TEKRAR SALDIRISI.
 *
 * P17'de worker kimliği imzalandı (T-15) ve benzersiz `nonce` taşımaya
 * başladı — ama nonce **saklanmıyordu**. `identity.test.ts` bu sınırı
 * açıkça kayıt altına almıştı:
 *
 *     it("KAYIT: nonce tek başına tekrarı ENGELLEMEZ", ...)
 *
 * Bu dosya o kaydı **canlı veritabanına karşı** kapatır. Bellek içi bir
 * kümeyle göstermek yetmezdi: koruma ancak birden çok süreç aynı depoyu
 * paylaşırsa gerçektir.
 */

const KEY = "replay-integration-signing-key-32-chars";

describe("T-14 — aynı kimlik İKİ KEZ kullanılamaz", () => {
  let db: IntegrationDb;
  let store: PostgresNonceStore;

  beforeAll(async () => {
    db = await createIntegrationDb("replay.spec.ts");
    await db.migrate();
    store = new PostgresNonceStore({
      query: (sql: string, params?: unknown[]) => db.query(sql, params)
    });
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await db.query("DELETE FROM used_worker_nonces;");
  });

  const credential = (workerId = "worker_1") =>
    issueWorkerCredential({ workerId, jobTypes: ["index"], ttlSeconds: 300 }, KEY);

  it("POZİTİF KONTROL: ilk kullanım kabul edilir", async () => {
    const result = await verifyWorkerCredentialWithReplayCheck(credential(), KEY, {
      nonceStore: store
    });
    expect(result.identity.workerId).toBe("worker_1");
    expect(result.replayChecked).toBe(true);
  });

  it("İKİNCİ kullanım REDDEDİLİR", async () => {
    const token = credential();

    await verifyWorkerCredentialWithReplayCheck(token, KEY, { nonceStore: store });

    await expect(
      verifyWorkerCredentialWithReplayCheck(token, KEY, { nonceStore: store })
    ).rejects.toThrow(NonceReplayError);
  });

  it("FARKLI kimlikler birbirini engellemez", async () => {
    // Her `issueWorkerCredential` yeni bir nonce uretir.
    for (let i = 0; i < 5; i++) {
      await expect(
        verifyWorkerCredentialWithReplayCheck(credential(`worker_${i}`), KEY, {
          nonceStore: store
        })
      ).resolves.toBeDefined();
    }

    const { rows } = await db.query("SELECT COUNT(*)::int AS c FROM used_worker_nonces;");
    expect(rows[0].c).toBe(5);
  });

  it("EŞZAMANLI iki kullanımdan yalnız BİRİ geçer (TOCTOU yok)", async () => {
    /*
     * Bu, deponun en onemli ozelligi.
     *
     * "Once SELECT et, yoksa INSERT et" yaklasimi burada COKERDI: iki
     * esszamanli istek de "kullanilmamis" gorur, ikisi de yazar, ikisi de
     * kabul edilir — tam olarak engellemesi gereken durum.
     *
     * Nonce birincil anahtar oldugu icin yaris VERITABANINDA, tek bir
     * atomik islemde cozulur.
     */
    const token = credential();

    const results = await Promise.allSettled([
      verifyWorkerCredentialWithReplayCheck(token, KEY, { nonceStore: store }),
      verifyWorkerCredentialWithReplayCheck(token, KEY, { nonceStore: store }),
      verifyWorkerCredentialWithReplayCheck(token, KEY, { nonceStore: store })
    ]);

    const accepted = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(2);
  });

  it("depo VERİLMEZSE koruma uygulanmaz ve BU BİLDİRİLİR", async () => {
    // Opsiyonel olmasi sessiz bir zaafa donusmesin: cagiran korumanin
    // uygulanip uygulanmadigini BILEBILIR.
    const token = credential();
    const first = await verifyWorkerCredentialWithReplayCheck(token, KEY);
    const second = await verifyWorkerCredentialWithReplayCheck(token, KEY);

    expect(first.replayChecked).toBe(false);
    expect(second.replayChecked).toBe(false);
  });

  it("GEÇERSİZ token nonce HARCAMAZ", async () => {
    /*
     * Nonce EN SON tuketilir.
     *
     * Once tuketip sonra imza/sure kontrolu yapmak, gecersiz bir token'in
     * nonce'unu bosa harcardi — ve daha kotusu, saldirgan gecersiz
     * token'larla depoyu SISIREBILIRDI.
     */
    const forged = issueWorkerCredential(
      { workerId: "attacker", jobTypes: ["index"], ttlSeconds: 300 },
      "farkli-bir-imzalama-anahtari-32-karakter"
    );

    await expect(
      verifyWorkerCredentialWithReplayCheck(forged, KEY, { nonceStore: store })
    ).rejects.toThrow(/BAD_SIGNATURE/);

    const { rows } = await db.query("SELECT COUNT(*)::int AS c FROM used_worker_nonces;");
    expect(rows[0].c).toBe(0);
  });

  it("SÜRESİ DOLMUŞ token nonce HARCAMAZ", async () => {
    const issuedAt = new Date("2026-01-01T00:00:00.000Z");
    const stale = issueWorkerCredential(
      { workerId: "w", jobTypes: ["index"], ttlSeconds: 60, now: issuedAt },
      KEY
    );

    await expect(
      verifyWorkerCredentialWithReplayCheck(stale, KEY, { nonceStore: store })
    ).rejects.toThrow(/EXPIRED/);

    const { rows } = await db.query("SELECT COUNT(*)::int AS c FROM used_worker_nonces;");
    expect(rows[0].c).toBe(0);
  });
});

describe("T-14 — depo sınırsız BÜYÜMEZ", () => {
  let db: IntegrationDb;
  let store: PostgresNonceStore;

  beforeAll(async () => {
    db = await createIntegrationDb("replay-purge.spec.ts");
    await db.migrate();
    store = new PostgresNonceStore({
      query: (sql: string, params?: unknown[]) => db.query(sql, params)
    });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("süresi dolmuş kayıtlar temizlenir, dolmamışlar KALIR", async () => {
    // Bir nonce'un yararli omru, tasidigi token'in son kullanma zamanina
    // kadardir; sonrasinda token zaten EXPIRED ile reddedilir.
    const now = new Date("2026-06-01T12:00:00.000Z");
    const past = new Date(now.getTime() - 60_000);
    const future = new Date(now.getTime() + 60_000);

    await store.consume({ nonce: "eski-1", workerId: "w", expiresAt: past });
    await store.consume({ nonce: "eski-2", workerId: "w", expiresAt: past });
    await store.consume({ nonce: "yeni-1", workerId: "w", expiresAt: future });

    const removed = await store.purgeExpired(now);
    expect(removed).toBe(2);

    const { rows } = await db.query("SELECT nonce FROM used_worker_nonces;");
    expect(rows.map((r: { nonce: string }) => r.nonce)).toEqual(["yeni-1"]);
  });

  it("temizlik sonrası aynı nonce YENİDEN kullanılabilir — ve bu doğrudur", async () => {
    /*
     * Ilk bakista zaaf gorunur ama degil: temizlenen nonce'un token'i
     * ZATEN suresi dolmus durumda ve imza dogrulamasindan sonra EXPIRED
     * ile reddedilir. Nonce kaydini tutmaya devam etmek, depoyu sinirsiz
     * buyutmekten baska bir sey yapmazdi.
     *
     * Kayit: bu davranis, TTL ust siniri (1 saat) ile birlikte
     * anlamlidir. TTL kaldirilsaydi bu varsayim COKERDI.
     */
    expect(MAX_TTL_SECONDS).toBe(3600);
  });
});

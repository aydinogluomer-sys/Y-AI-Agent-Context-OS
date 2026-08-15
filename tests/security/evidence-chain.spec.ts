import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createIntegrationDb, type IntegrationDb } from "../integration/setup";
import { seedTenant, type TenantFixture } from "../integration/seed";
import { prepareEntry, verifyChain, type EvidenceEntry } from "@y/security";

/**
 * P19 / T9 — T-18 EVENT FORGERY: KANIT ZİNCİRİ CANLI VERİTABANINDA.
 *
 * `chain.test.ts` doğrulama mantığını süreç içinde kanıtlıyor. Bu dosya
 * zincirin **veritabanından okunduğunda** da doğrulandığını gösterir —
 * ve geri yükleme sonrası kontrolün (T9) gerçekten çalıştığını.
 *
 * Aradaki fark önemsiz değil: `payload_json` JSONB olarak saklanıp geri
 * okunduğunda alan sırası değişebilir. Kanonik serileştirme bunu
 * karşılamazsa hash yeniden hesaplanamaz ve **sağlam bir zincir kırık
 * görünür**.
 */

const ORG = "org_chain";

async function insert(
  db: IntegrationDb,
  tenant: TenantFixture,
  entry: EvidenceEntry
): Promise<void> {
  await db.query(
    `INSERT INTO evidence_chain
       (id, organization_id, run_id, sequence, kind, payload_json,
        previous_hash, entry_hash, created_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9);`,
    [
      entry.id,
      tenant.organizationId,
      entry.runId,
      entry.sequence,
      entry.kind,
      JSON.stringify(entry.payload),
      entry.previousHash,
      entry.entryHash,
      entry.createdAt
    ]
  );
}

async function readChain(db: IntegrationDb): Promise<EvidenceEntry[]> {
  const { rows } = await db.query(
    `SELECT id, run_id, kind, payload_json, sequence, previous_hash, entry_hash, created_at
       FROM evidence_chain ORDER BY sequence;`
  );
  return rows.map((row: any) => ({
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    payload: row.payload_json ?? {},
    sequence: Number(row.sequence),
    previousHash: row.previous_hash,
    entryHash: row.entry_hash,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  }));
}

/** Üç kayıtlık sağlam bir zincir kurar. */
async function seedChain(db: IntegrationDb, tenant: TenantFixture): Promise<void> {
  let previousHash = "0".repeat(64);
  for (let i = 1; i <= 3; i++) {
    const entry = prepareEntry({
      id: `ev_${i}`,
      runId: null,
      kind: "context.compiled",
      // Ic ice ve karisik sirali alanlar: JSONB'den geri okundugunda
      // alan sirasi degisebilir ve kanonik serilestirme bunu
      // karsilamazsa hash yeniden hesaplanamaz.
      payload: { zeta: i, alpha: { nested: true, count: i }, beta: [3, 1, 2] },
      sequence: i,
      previousHash,
      createdAt: new Date(Date.UTC(2026, 5, 1, 12, 0, i)).toISOString()
    });
    await insert(db, tenant, entry);
    previousHash = entry.entryHash;
  }
}

describe("T-18 — zincir veritabanından okunduğunda da SAĞLAM", () => {
  let db: IntegrationDb;
  let tenant: TenantFixture;

  beforeAll(async () => {
    db = await createIntegrationDb("evidence-chain.spec.ts");
    await db.migrate();
    tenant = await seedTenant(db, ORG);
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    // Zincir append-only trigger'i UPDATE/DELETE'i engelliyor olabilir;
    // TRUNCATE trigger'a takilmaz ve testler arasi izolasyon saglar.
    await db.query("TRUNCATE evidence_chain;");
    await seedChain(db, tenant);
  });

  it("POZİTİF KONTROL: sağlam zincir SAĞLAM doğrulanır", async () => {
    // Bu kontrol olmadan asagidaki testler, dogrulama HER ZAMAN "kirik"
    // dese de gecerdi.
    const result = verifyChain(await readChain(db));
    expect(result.valid).toBe(true);
    expect(result.verifiedCount).toBe(3);
  });

  it("JSONB gidiş-dönüşü hash'i BOZMUYOR", async () => {
    /*
     * Kritik ayrinti: `payload_json` JSONB olarak saklaniyor ve JSONB
     * alan sirasini KORUMAZ. Kanonik serilestirme (ADR-035) alanlari
     * siraladigi icin hash yeniden hesaplanabiliyor.
     *
     * Bu olmasaydi SAGLAM bir zincir KIRIK gorunurdu - ve operatoru
     * olmayan bir saldiriyi aramaya gonderirdi.
     */
    const chain = await readChain(db);
    const stored = chain[0].payload as Record<string, unknown>;

    // Postgres alanlari kendi sirasiyla dondurebilir.
    expect(Object.keys(stored).sort()).toEqual(["alpha", "beta", "zeta"]);
    expect(verifyChain(chain).valid).toBe(true);
  });

  it("SİLİNEN kayıt yakalanır (sıra boşluğu)", async () => {
    const chain = await readChain(db);
    const withGap = [chain[0], chain[2]];

    const result = verifyChain(withGap);
    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe(3);
  });

  it("DEĞİŞTİRİLEN kayıt yakalanır (içerik hash'i)", async () => {
    const chain = await readChain(db);
    const tampered = chain.map((e, i) =>
      i === 1 ? { ...e, payload: { zeta: 999 } } : e
    );

    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe(2);
  });

  it("ARAYA EKLENEN kayıt yakalanır (bağ kopukluğu)", async () => {
    const chain = await readChain(db);
    const forged = prepareEntry({
      id: "ev_forged",
      runId: null,
      kind: "context.compiled",
      payload: { sahte: true },
      sequence: 2,
      // Saldirgan gecerli bir hash uretebilir ama ZINCIRIN BAGINI
      // kuramaz: sonraki kaydin previousHash'i eskisini gosteriyor.
      previousHash: chain[0].entryHash,
      createdAt: chain[1].createdAt
    });

    const result = verifyChain([chain[0], forged, chain[2]]);
    expect(result.valid).toBe(false);
  });

  it("KAYIT: zincirin TAMAMI yeniden yazılırsa doğrulama GEÇER", async () => {
    /*
     * Bilinen sinir. Saldirgan tum zinciri bastan tutarli sekilde
     * yeniden uretirse dogrulama bunu ayirt EDEMEZ.
     *
     * Kapatmak dis bir cipa gerektirir: imzali zaman damgasi ya da
     * harici depo. Bu test o sinirii KAYIT ALTINA ALIR ki "zincir
     * dogrulandi" ifadesinin neyi KAPSAMADIGI gorunur olsun.
     */
    await db.query("TRUNCATE evidence_chain;");

    let previousHash = "0".repeat(64);
    for (let i = 1; i <= 3; i++) {
      const entry = prepareEntry({
        id: `rewritten_${i}`,
        runId: null,
        kind: "context.compiled",
        payload: { tamamen: "farkli" },
        sequence: i,
        previousHash,
        createdAt: new Date(Date.UTC(2026, 5, 2, 12, 0, i)).toISOString()
      });
      await insert(db, tenant, entry);
      previousHash = entry.entryHash;
    }

    expect(verifyChain(await readChain(db)).valid).toBe(true);
  });
});

/*
 * APPEND-ONLY TRIGGER — ONLEME katmani.
 *
 * Yukaridaki testler TESPIT'i olcuyor: zincir bozulursa `verifyChain`
 * yakaliyor. Ama hepsi zinciri BELLEKTE bozuyor — veritabanina hic
 * UPDATE/DELETE denemiyor. Yani trigger'in kendisi hic sinanmamisti.
 *
 * Mutasyon bunu ortaya cikardi: 0082'deki `RAISE EXCEPTION` satirini
 * `RETURN COALESCE(NEW, OLD)` ile degistirdim — trigger izin verir hale
 * geldi ve hicbir test kirilmadi.
 *
 * Ustteki `beforeEach` yorumunda "trigger UPDATE/DELETE'i engelliyor
 * OLABILIR" yaziyordu. Dogrulanmamis bir varsayim, testin icine yazilmis.
 * Bu blok o "olabilir"i kaldirir.
 */
describe("T-18 — append-only trigger YAZMAYI ENGELLER", () => {
  let db: IntegrationDb;
  let tenant: TenantFixture;

  beforeAll(async () => {
    db = await createIntegrationDb("evidence-chain-trigger.spec.ts");
    await db.migrate();
    tenant = await seedTenant(db, ORG);
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await db.query("TRUNCATE evidence_chain;");
    await seedChain(db, tenant);
  });

  it("POZİTİF KONTROL: yeni kayıt EKLENEBİLİR", async () => {
    // Bu kontrol olmadan asagidaki iki test, tablo tamamen yazilamaz
    // olsa da gecerdi. Append-only "hic yazilamaz" DEGIL: ekleme
    // serbest, degistirme yasak.
    const before = (await readChain(db)).length;
    await insert(
      db,
      tenant,
      prepareEntry({
        id: "ev_appended",
        runId: null,
        kind: "context.compiled",
        payload: { eklendi: true },
        sequence: 4,
        previousHash: (await readChain(db))[2].entryHash,
        createdAt: new Date().toISOString()
      })
    );
    expect((await readChain(db)).length).toBe(before + 1);
  });

  it("UPDATE reddedilir ve veri DEĞİŞMEZ", async () => {
    const before = await readChain(db);
    const target = before[1];

    await expect(
      db.query("UPDATE evidence_chain SET kind = $1 WHERE id = $2;", [
        "tampered",
        target.id
      ])
    ).rejects.toThrow(/append-only/i);

    // Hata firlatmasi tek basina yetmez: UPDATE'in HICBIR SEYI
    // degistirmedigini de gostermek gerekir. Sifir satir eslesen bir
    // UPDATE de hata firlatmazdi — bu kontrol o karisikligi keser.
    const after = await readChain(db);
    expect(after.map((e) => e.kind)).toEqual(before.map((e) => e.kind));
  });

  it("DELETE reddedilir ve kayıt YERİNDE KALIR", async () => {
    const before = await readChain(db);

    await expect(
      db.query("DELETE FROM evidence_chain WHERE id = $1;", [before[1].id])
    ).rejects.toThrow(/append-only/i);

    const after = await readChain(db);
    expect(after.length).toBe(before.length);
    expect(after.map((e) => e.id)).toEqual(before.map((e) => e.id));
  });
});

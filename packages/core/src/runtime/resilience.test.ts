import { describe, it, expect } from "vitest";
import { JobQueue, JOB_TYPES, type QueueDb } from "./queue";
import { issueWorkerCredential } from "@y/security";

/**
 * P18 / Y-P18-006 — DAYANIKLILIK SUITE'İ.
 *
 * Faz dosyası on senaryo sayıyor:
 *
 *     worker crash · provider timeout · DB restart · duplicate event
 *     queue retry · network error · process restart · partial write
 *     stale lock · index interruption
 *
 * ## Bu suite'in KAPSAMI ve SINIRI
 *
 * Her senaryo için sorulan üç soru: *beklenen davranış nedir · veri kaybı
 * var mı · sahte başarı üretiliyor mu.*
 *
 * Senaryoların bir kısmı **süreç içinde** doğrulanabilir: sorgu şekli,
 * karar mantığı ve hata yayılımı. Bir kısmı **canlı altyapı** gerektirir:
 * DB'nin gerçekten yeniden başlaması, ağın gerçekten kopması.
 *
 * Bu ayrım her testte AÇIKÇA yazılır. Canlı altyapı gerektiren bir
 * senaryoyu sahte bir kurguyla "geçti" saymak, tam olarak bu projede
 * kapatılan kalıptır — bu yüzden o senaryolar için `it` yerine kayıt
 * testleri yazılmıştır: neyin doğrulanmadığını **görünür** kılarlar.
 */

const KEY = "resilience-test-signing-key-32-chars!!";
const credential = (workerId = "worker_1") =>
  issueWorkerCredential({ workerId, jobTypes: [...JOB_TYPES], ttlSeconds: 300 }, KEY);

interface Recorded {
  sql: string;
  params: unknown[];
}

function createDb(responses: Record<string, any[]> = {}): QueueDb & { calls: Recorded[] } {
  const calls: Recorded[] = [];
  return {
    calls,
    async query(sql: string, params: unknown[] = []) {
      const flat = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: flat, params });
      for (const [needle, rows] of Object.entries(responses)) {
        if (flat.includes(needle)) return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    }
  };
}

/** Belirli bir çağrıda patlayan DB — "restart" ve "network error" için. */
function failingDb(failOnCall: number, message: string): QueueDb & { attempts: number } {
  let attempts = 0;
  return {
    attempts: 0,
    async query() {
      attempts++;
      (this as { attempts: number }).attempts = attempts;
      if (attempts === failOnCall) throw new Error(message);
      return { rows: [], rowCount: 0 };
    }
  } as QueueDb & { attempts: number };
}

// ---------------------------------------------------------------------------
// SÜREÇ İÇİNDE DOĞRULANABİLENLER
// ---------------------------------------------------------------------------

describe("senaryo 1 — worker crash (lease süresi dolmuş iş geri alınır)", () => {
  it("claim sorgusu süresi dolmuş `running` işleri DE arar", async () => {
    // Bir worker lease'ini yenilemeden cokerse, is sonsuza kadar
    // `running` kalirdi. Kurtarma, claim sorgusunun kendi icinde.
    const db = createDb();
    const queue = new JobQueue(db, KEY);
    await queue.claim(credential(), ["index"]);

    const claimSql = db.calls.at(-1)!.sql;
    expect(claimSql).toContain("status = 'queued'");
    expect(claimSql).toContain("lease_expires_at < NOW()");
    // Ikisi OR ile baglanmali; yalniz 'queued' aramak kurtarma yapmaz.
    expect(claimSql).toMatch(/OR \(status = 'running'/);
  });

  it("VERİ KAYBI YOK: kurtarılan iş attempt sayacını artırır", async () => {
    const db = createDb();
    await new JobQueue(db, KEY).claim(credential(), ["index"]);
    // attempt artmasaydi cokup duran bir is SONSUZA KADAR yeniden
    // denenirdi (max_attempts hic dolmazdi).
    expect(db.calls.at(-1)!.sql).toContain("attempt = attempt + 1");
    expect(db.calls.at(-1)!.sql).toContain("attempt < max_attempts");
  });
});

describe("senaryo 2 — stale lock (lease TTL)", () => {
  it("claim lease son kullanma zamanı YAZAR", async () => {
    const db = createDb();
    await new JobQueue(db, KEY).claim(credential(), ["index"]);
    expect(db.calls.at(-1)!.sql).toContain("lease_expires_at = NOW() +");
  });

  it("lease yenileme KİMLİK ister — süresiz uzatma engellenir", async () => {
    // Dogrulanmazsa saldirgan baska bir worker'in lease'ini suresiz
    // uzatarak isi rehin alabilir (T-15).
    const queue = new JobQueue(createDb(), KEY);
    await expect(queue.renewLease("job_1", "sahte-kimlik")).rejects.toThrow();
  });
});

describe("senaryo 3 — queue retry", () => {
  it("başarısız iş DENEME HAKKI VARSA kuyruğa döner", async () => {
    const db = createDb({ "UPDATE jobs": [{ status: "queued" }] });
    const outcome = await new JobQueue(db, KEY).fail("job_1", "gecici hata");
    expect(outcome).toBe("retry");
  });

  it("deneme hakkı BİTTİYSE kalıcı başarısız — sessizce yeniden denemez", async () => {
    // Sonsuz retry, basarisiz bir isi sonsuza kadar kaynak tuketir hale
    // getirir ve hatayi GORUNMEZ kilar.
    const db = createDb({ "UPDATE jobs": [{ status: "failed" }] });
    expect(await new JobQueue(db, KEY).fail("job_1", "kalici hata")).toBe("failed");
  });
});

describe("senaryo 4 — duplicate event / idempotency", () => {
  it("aynı anahtarla ikinci enqueue YENİ iş üretmez", async () => {
    const db = createDb({ "INSERT INTO jobs": [] , "SELECT id FROM jobs": [{ id: "job_existing" }] });
    const result = await new JobQueue(db, KEY).enqueue({
      jobType: "index",
      organizationId: "org_1",
      projectId: "proj_1",
      runId: null,
      idempotencyKey: "ayni-anahtar",
      payload: {}
    });
    expect(result.created).toBe(false);
    expect(result.jobId).toBe("job_existing");
  });

  it("enqueue ON CONFLICT DO NOTHING kullanır", async () => {
    const db = createDb();
    await new JobQueue(db, KEY).enqueue({
      jobType: "index",
      organizationId: "org_1",
      projectId: "proj_1",
      runId: null,
      idempotencyKey: "k",
      payload: {}
    });
    expect(db.calls[0].sql).toContain("ON CONFLICT");
  });
});

describe("senaryo 5 — DB restart / network error", () => {
  it("DB hatası YUTULMAZ — çağırana yayılır", async () => {
    // Hatayi yutup `null` donmek, "is yok" ile "DB erisilemedi"yi ayni
    // gosterirdi; worker bos kuyruk sanip beklemeye gecerdi.
    const db = failingDb(1, "ECONNRESET");
    const queue = new JobQueue(db, KEY);
    await expect(queue.claim(credential(), ["index"])).rejects.toThrow("ECONNRESET");
  });

  it("hata SAHTE BAŞARI üretmez", async () => {
    const db = failingDb(1, "connection terminated");
    await expect(new JobQueue(db, KEY).complete("job_1", {})).rejects.toThrow();
  });
});

describe("senaryo 6 — partial write (yarım yazım)", () => {
  it("complete tek bir UPDATE — kısmi durum bırakmaz", async () => {
    // Iki ayri UPDATE, birincisi basarili ikincisi basarisiz oldugunda
    // isi YARIM tamamlanmis birakirdi.
    const db = createDb();
    await new JobQueue(db, KEY).complete("job_1", { ok: true });
    const updates = db.calls.filter((c) => c.sql.startsWith("UPDATE"));
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain("status = 'completed'");
  });
});

describe("senaryo 7 — eşzamanlı claim (aynı iş iki kez alınmaz)", () => {
  it("claim FOR UPDATE SKIP LOCKED kullanır", async () => {
    // SKIP LOCKED olmadan bekleyen worker'lar BLOKLANIR; FOR UPDATE
    // olmadan ayni is iki worker'a verilir.
    const db = createDb();
    await new JobQueue(db, KEY).claim(credential(), ["index"]);
    expect(db.calls.at(-1)!.sql).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("claim tek satır kilitler", async () => {
    const db = createDb();
    await new JobQueue(db, KEY).claim(credential(), ["index"]);
    expect(db.calls.at(-1)!.sql).toContain("LIMIT 1");
  });
});

describe("senaryo 8 — process restart (kimlik süresi)", () => {
  it("süresi dolmuş kimlikle claim REDDEDİLİR", async () => {
    // Surec yeniden baslatildiginda eski kimlik hala elde olabilir;
    // suresi dolmussa is ALMAMALIDIR.
    const issuedAt = new Date("2026-01-01T00:00:00.000Z");
    const stale = issueWorkerCredential(
      { workerId: "w", jobTypes: [...JOB_TYPES], ttlSeconds: 60, now: issuedAt },
      KEY
    );
    const queue = new JobQueue(createDb(), KEY);
    await expect(queue.claim(stale, ["index"])).rejects.toThrow(/EXPIRED|reddedildi/);
  });
});

// ---------------------------------------------------------------------------
// CANLI ALTYAPI GEREKTİRENLER — kayıt testleri
// ---------------------------------------------------------------------------

/**
 * Bu blok, doğrulanMAYAN senaryoları **görünür** kılar.
 *
 * Alternatif, onları sahte bir kurguyla "geçti" saymaktı. Bir DB
 * restart'ını mock ile simüle edip "dayanıklı" demek, dayanıklılığı değil
 * mock'un davranışını test etmek olurdu.
 */
describe("canlı altyapı bekleyen senaryolar (P19)", () => {
  const PENDING: ReadonlyArray<readonly [string, string]> = [
    ["DB restart", "Gercek baglanti havuzu yeniden kurulumu; pg gerekiyor"],
    ["provider timeout", "Gercek saglayici cagrisi; SDK ve ag gerekiyor (P11)"],
    ["network error", "Gercek ag kesintisi; entegrasyon ortami gerekiyor"],
    ["index interruption", "Yarida kesilen index isi; canli Postgres gerekiyor"],
    ["duplicate event (DB kisiti)", "UNIQUE kisitinin gercekten uygulanmasi; canli Postgres"]
  ];

  it("doğrulanmayan senaryolar KAYITLI ve sayısı biliniyor", () => {
    // Sayinin kendisi bir iddia degil; amac listenin sessizce
    // kucultulememesi ve neyin eksik oldugunun okunabilir kalmasi.
    expect(PENDING).toHaveLength(5);
    for (const [name, reason] of PENDING) {
      expect(name.length).toBeGreaterThan(3);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it("KAYIT: bu suite dayanıklılığı KANITLAMAZ, karar mantığını doğrular", () => {
    // Surec ici testler sorgu SEKLINI ve karar mantigini dogrular;
    // gercek dayaniklilik ancak canli ortamda olculur. Bu ayrim her DB
    // testinin basinda da yazilidir.
    expect(true).toBe(true);
  });
});

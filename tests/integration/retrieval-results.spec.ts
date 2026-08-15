import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createIntegrationDb, type IntegrationDb } from "./setup";
import { seedTenant, seedChunk, type TenantFixture } from "./seed";
import { LexicalRetriever } from "@y/context/retrieval/lexical";
import { SemanticRetriever, EMBEDDING_DIMENSIONS } from "@y/context/retrieval/semantic";
import type { AllowedContextUniverse } from "@y/shared";

/**
 * P19 / T5 — RETRIEVAL **SONUÇ** DOĞRULAMASI.
 *
 * `retrieval.test.ts` sorgunun **şeklini** doğruluyor: tenant predikatı
 * var mı, firewall ön-filtre olarak gömülmüş mü. Bu dosya sorgunun
 * **sonucunu** doğruluyor.
 *
 * Ayrımın bedeli traversal'da ölçüldü: orada sorgu şekli doğruydu ama
 * `varchar` uzunluk uyuşmazlığı yüzünden sorgu **hiç çalışmıyordu**.
 * Aynı sınıf hatanın burada da olması muhtemeldi.
 */

const ORG = "org_r";
const SNAP = "snap_r";

/**
 * Universe: `src/**` ALLOW, **`src/secrets/**` DENY**.
 *
 * DENY yolu ALLOW'un ICINDE ve bu KRITIK.
 *
 * Ilk yazimimda DENY `secrets/**` idi, ALLOW ise `src/**`. O kurulumda
 * DENY chunk'ini zaten ALLOW kurali disliyordu — DENY hic devreye
 * girmiyordu. Testi mutasyonla yokladim: DENY listesini TAMAMEN
 * bosalttim ve **hicbir test kirilmadi**. Yani test ALLOW'u dogruluyordu,
 * DENY'i degil.
 *
 * Derlenen predikatin uc yani var:
 *   path LIKE ANY(allow) AND path ~ ANY(allow) AND NOT (path ~ ANY(blocked))
 *
 * DENY'in ETKISINI olcmek icin ucuncu yanin TEK BASINA belirleyici oldugu
 * bir yol gerekir — yani ALLOW'u gecen ama DENY'a takilan bir yol.
 */
const UNIVERSE: AllowedContextUniverse = {
  allow: ["src/**"],
  approval: [],
  deny: ["src/secrets/**"],
  policyVersion: 1,
  // Universe hash'i determinizm girdisi (ADR-030) ve manifest'e yazilir.
  // Testte sabit: degeri onemli degil, VARLIGI zorunlu.
  universeHash: "a".repeat(64)
};

/**
 * Deterministik test embedding'i.
 *
 * Gerçek bir model çağrılmaz: model çıktısı sürüm sürüm değişir ve test
 * o zaman modeli ölçmeye başlar. Burada ölçülen şey **pgvector'ün
 * mesafe hesabı ve sıralaması**.
 */
function unitVector(seedIndex: number): number[] {
  const v = new Array(EMBEDDING_DIMENSIONS).fill(0);
  v[seedIndex] = 1;
  return v;
}

const stubEmbedder = (vector: number[]) => ({
  model: "test-embedder",
  dimensions: EMBEDDING_DIMENSIONS,
  async embed(): Promise<number[]> {
    return vector;
  }
});

describe("T5 — Postgres FTS gerçek sonuç üretiyor", () => {
  let db: IntegrationDb;
  let tenant: TenantFixture;
  let lexical: LexicalRetriever;

  beforeAll(async () => {
    db = await createIntegrationDb("retrieval-lexical.spec.ts");
    await db.migrate();
    tenant = await seedTenant(db, ORG, SNAP);

    await seedChunk(db, tenant, {
      id: "c_auth",
      path: "src/auth/service.ts",
      content: "export function getUserById(id) { return findUser(id); }"
    });
    await seedChunk(db, tenant, {
      id: "c_payment",
      path: "src/payments/retry.ts",
      content: "export function retryPayment(order) { return charge(order); }"
    });
    // ALLOW'u GECEN ama DENY'a takilan yol: `src/**` icinde,
    // `src/secrets/**` altinda.
    await seedChunk(db, tenant, {
      id: "c_secret",
      path: "src/secrets/prod.ts",
      content: "export const getUserById = 'leaked token here';",
      universeBucket: "deny"
    });

    // KONTROL GRUBU: ayni dizinin DISINDA, ALLOW icinde kalan bir chunk.
    // DENY testinin "her seyi disliyor" gibi bir hatayla gecmedigini
    // gosterir.
    await seedChunk(db, tenant, {
      id: "c_allowed_sibling",
      path: "src/secretsmith/ok.ts",
      content: "export const getUserById = 'temiz icerik';"
    });

    // SIR TASIYAN DOSYA — firewall'dan BAGIMSIZ ikinci savunma.
    //
    // Yol bilerek ALLOW icinde ve DENY disinda: `src/config/**`. Boylece
    // bu chunk'i firewall predikati DISLAMAZ ve geriye tek belirleyici
    // olarak `contains_secret` filtresi kalir. Aksi hâlde test, DENY
    // hatasinin aynisini tekrarlardi: iki savunmadan yalnizca birini
    // olcup otekini olctugunu sanmak.
    await seedChunk(db, tenant, {
      id: "c_apikeys",
      path: "src/config/apikeys.ts",
      content: "export function loadRotationKey() { return process.env.KEY; }",
      containsSecret: true
    });

    // SIRALAMA OLCUMU icin bilinen terim yogunlugu.
    //
    // KIMLIKLER BILEREK TERS YONDE: `a_sparse` alfabetik olarak ONCE
    // gelir ama skoru DUSUK. Ilk yazimda kimlikler `high`/`low` idi ve
    // alfabetik sira skor sirasiyla AYNI yone dusuyordu; `ORDER BY rank
    // DESC` kaldirildiginda test KIRILMADI cunku iki sira ayni sonucu
    // veriyordu. Iki siralama AYRISMAZSA siralama iddiasi hicbir sey
    // olcmez.
    //
    // `cascade` baska hicbir chunk'ta gecmez; boylece siralama testi
    // yalniz bu iki chunk uzerinden olculur ve baska seed'ler sonucu
    // kaydirmaz. Fark SAYIDA: bese karsi bir.
    await seedChunk(db, tenant, {
      id: "c_rank_z_dense",
      path: "src/rank/high.ts",
      content: "cascade cascade cascade cascade cascade"
    });
    await seedChunk(db, tenant, {
      id: "c_rank_a_sparse",
      path: "src/rank/low.ts",
      content: "cascade tek kez geciyor burada"
    });

    lexical = new LexicalRetriever({
      query: (sql: string, params?: unknown[]) => db.query(sql, params)
    });
  });

  afterAll(async () => {
    await db?.close();
  });

  const search = (query: string, extra: Record<string, unknown> = {}) =>
    lexical.search({
      query,
      snapshotId: SNAP,
      organizationId: ORG,
      universe: UNIVERSE,
      ...extra
    } as never);

  it("POZİTİF KONTROL: arama GERÇEKTEN sonuç döndürüyor", async () => {
    // Bu kontrol olmadan asagidaki testler, sorgu hic calismasa da
    // gecerdi: bos sonuc "sizinti yok" gibi gorunur.
    const hits = await search("getUserById");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("terimi içeren chunk bulunur, içermeyen bulunmaz", async () => {
    const hits = await search("retryPayment");
    const ids = hits.map((h) => h.chunkId);
    expect(ids).toContain("c_payment");
    expect(ids).not.toContain("c_auth");
  });

  it("`simple` konfigürasyonu KÖK BULMA yapmaz", async () => {
    /*
     * 0064'un gerekcesi: `english` kok bulma kod aramasinda ZARARLI
     * (getUser -> getus, `in`/`for`/`is` durdurma kelimesi sayilir).
     *
     * ILK YAZIMIM YANLISTI: "getus arayinca eslesmemeli" diye test
     * ettim ve test kirildi. Sebep kok bulma degil PREFIX ESLESMESI:
     * toTsQuery her terime `:*` ekliyor, yani `getus:*` zaten
     * `getuserbyid`i bulur. Iki farkli mekanizmayi karistirmisim.
     *
     * Dogru kontrol: SAKLANAN lexeme'lere bakmak. `simple` ile token
     * oldugu gibi (kucuk harfle) saklanir; `english` ile koke inerdi.
     */
    const { rows } = await db.query(
      "SELECT tsv::text AS tsv FROM chunks WHERE id = $1;",
      ["c_auth"]
    );
    const tsv = String(rows[0].tsv);

    // Token oldugu gibi saklanmis.
    expect(tsv).toContain("getuserbyid");

    // `english` durdurma kelimesi sayip ATARDI; `simple` saklar.
    expect(tsv).toContain("function");
    expect(tsv).toContain("return");
  });

  it("prefix eşleşmesi çalışıyor (`authServ` → `authService`)", async () => {
    // toTsQuery her terime `:*` ekliyor. Bu davranis yalniz gercek
    // to_tsquery ile dogrulanabilir.
    const hits = await search("retryPay");
    expect(hits.map((h) => h.chunkId)).toContain("c_payment");
  });

  it("FIREWALL ÖN-FİLTRE: DENY kapsamındaki chunk HİÇ dönmez", async () => {
    // `c_secret` aranan terimi ICERIYOR ama `secrets/**` DENY kapsaminda.
    // ADR-027: DENY icerigi hicbir asamada okunmaz.
    const hits = await search("getUserById");
    const ids = hits.map((h) => h.chunkId);

    expect(ids).not.toContain("c_secret");
    // Icerigi de donmemeli.
    expect(hits.map((h) => h.content).join(" ")).not.toContain("leaked token");

    // KONTROL GRUBU: `src/secretsmith/ok.ts` ALLOW icinde ve DENY disinda.
    // Donmezse test "her seyi disliyor" hatasiyla gecmis olurdu.
    expect(ids).toContain("c_allowed_sibling");
  });

  /*
   * `contains_secret` — firewall'dan AYRI bir savunma katmani.
   *
   * Firewall yola bakar (ADR-027). Sir tarayicisi ICERIGE bakar ve
   * sonucunu `files.contains_secret` olarak birakir (classify.ts). Bir
   * dosya ALLOW yolunda olup yine de sir tasiyabilir — `src/config/`
   * altindaki bir anahtar gibi. Iki katman da gerekli.
   *
   * Bu cift mutasyonla eklendi: lexical filtreyi kaldirdigimda hicbir
   * test kirilmadi.
   */
  it("excludeSecrets ile sır taşıyan dosyanın chunk'ı DÖNMEZ", async () => {
    const hits = await search("loadRotationKey", { excludeSecrets: true });

    expect(hits.map((h) => h.chunkId)).not.toContain("c_apikeys");
    expect(hits.map((h) => h.content).join(" ")).not.toContain("process.env.KEY");
  });

  it("KONTROL: excludeSecrets olmadan AYNI chunk bulunur", async () => {
    // Bu kontrol olmadan ustteki test, chunk hic indekslenmemis olsa da
    // gecerdi. Chunk'in GERCEKTEN aranabilir oldugunu ve onu disarida
    // birakanin FILTRE oldugunu kanitlar.
    const hits = await search("loadRotationKey");

    expect(hits.map((h) => h.chunkId)).toContain("c_apikeys");
  });

  it("başka tenant'ın chunk'ı dönmez", async () => {
    const other = await seedTenant(db, "org_other", "snap_other");
    await seedChunk(db, other, {
      id: "c_other",
      path: "src/other.ts",
      content: "export function retryPayment() {}"
    });

    const hits = await search("retryPayment");
    expect(hits.map((h) => h.chunkId)).not.toContain("c_other");
  });

  it("ts_rank_cd SIRALAMA üretiyor — hepsi aynı skor değil", async () => {
    /*
     * ILK YAZIMIM ZAYIFTI. Testin adi "hepsi ayni skor degil" diyordu
     * ama iddia soyleydi:
     *
     *     expect(Math.max(...ranks)).toBeGreaterThan(0);
     *
     * Bu, TUM skorlar birbirinin AYNI olsa da gecerdi. `ts_rank_cd` her
     * belgeye sabit 0.5 dondurse test yine yesildi. "Siralama uretiliyor"
     * demiyordu, "bir skor pozitif" diyordu.
     *
     * Siralama olmadan retrieval "ilk N"i doner ve alaka duzeyi
     * rastgeledir — sessizce ise yaramaz bir sistem.
     */
    const hits = await search("cascade");
    const byId = new Map(hits.map((h) => [h.chunkId, h.rawScores.lexical ?? 0]));

    // 1. Ikisi de bulunmali: biri eksikse asagidaki karsilastirma
    //    anlamsizlasir.
    expect(byId.has("c_rank_z_dense")).toBe(true);
    expect(byId.has("c_rank_a_sparse")).toBe(true);

    // 2. Skorlar FARKLI olmali — asil eksik olan iddia buydu.
    expect(byId.get("c_rank_z_dense")).not.toBe(byId.get("c_rank_a_sparse"));

    // 3. Yon DOGRU olmali: terimi bes kez gecen, bir kez gecenden
    //    yuksek. Ters isaretli bir formul "farkli skor" uretirdi ama
    //    siralamayi bozardi.
    expect(byId.get("c_rank_z_dense")!).toBeGreaterThan(byId.get("c_rank_a_sparse")!);

    // 4. Donen liste GERCEKTEN skora gore sirali olmali. Skor dogru
    //    hesaplanip ORDER BY unutulursa 1-3 gecer, bu kirilir.
    const ranks = hits.map((h) => h.rawScores.lexical ?? 0);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
  });

  it("kullanılabilir terim yoksa BOŞ döner, HATA vermez", async () => {
    // `to_tsquery`'ye ham metin vermek SQL hatasi firlatirdi.
    expect(await search("!!! &&& |||")).toEqual([]);
  });
});

describe("T5 — pgvector gerçek mesafe hesabı", () => {
  let db: IntegrationDb;
  let tenant: TenantFixture;

  beforeAll(async () => {
    db = await createIntegrationDb("retrieval-semantic.spec.ts");
    await db.migrate();
    tenant = await seedTenant(db, ORG, SNAP);

    // Uc chunk, uc farkli birim vektor. Sorgu vektoru c_near ile AYNI.
    await seedChunk(db, tenant, {
      id: "c_near",
      path: "src/near.ts",
      content: "yakin",
      embedding: unitVector(0)
    });
    await seedChunk(db, tenant, {
      id: "c_far",
      path: "src/far.ts",
      content: "uzak",
      embedding: unitVector(1)
    });
    // ALLOW'u gecen ama DENY'a takilan yol (bkz. UNIVERSE notu).
    await seedChunk(db, tenant, {
      id: "c_deny",
      path: "src/secrets/deny.ts",
      content: "gizli",
      universeBucket: "deny",
      embedding: unitVector(0)
    });
    // Embedding'i OLMAYAN chunk: sorgu onu atlamali.
    await seedChunk(db, tenant, {
      id: "c_noembed",
      path: "src/noembed.ts",
      content: "embeddingsiz"
    });
    // SIR TASIYAN chunk — yolu ALLOW icinde, DENY disinda; ayrica sorgu
    // vektorune YAKIN. Boylece firewall onu DISLAMAZ ve siralamada ust
    // sirada olurdu: geriye tek belirleyici olarak contains_secret kalir.
    await seedChunk(db, tenant, {
      id: "c_vec_secret",
      path: "src/config/vaultkeys.ts",
      content: "sirli",
      containsSecret: true,
      embedding: unitVector(0)
    });
  });

  afterAll(async () => {
    await db?.close();
  });

  const search = (queryVector: number[], extra: Record<string, unknown> = {}) =>
    new SemanticRetriever(
      { query: (sql: string, params?: unknown[]) => db.query(sql, params) },
      stubEmbedder(queryVector)
    ).search({
      query: "sorgu",
      snapshotId: SNAP,
      organizationId: ORG,
      universe: UNIVERSE,
      ...extra
    } as never);

  /*
   * Semantic kanalin contains_secret filtresi.
   *
   * Lexical kanalda bu filtreyi mutasyonla yokladim ve korumasiz cikti;
   * ayni predikat semantic'te de var. Bir kanali kapatip otekini acik
   * birakmak yaygin bir asimetri — ikisi de ayri ayri olculmeli.
   */
  it("excludeSecrets ile sır taşıyan chunk DÖNMEZ", async () => {
    const hits = await search(unitVector(0), { excludeSecrets: true });
    expect(hits.map((h) => h.chunkId)).not.toContain("c_vec_secret");
  });

  it("KONTROL: excludeSecrets olmadan AYNI chunk bulunur", async () => {
    // Chunk sorgu vektorune yakin oldugu icin normalde MUTLAKA doner.
    // Donmuyorsa ustteki test yanlis sebeple geciyor demektir.
    const hits = await search(unitVector(0));
    expect(hits.map((h) => h.chunkId)).toContain("c_vec_secret");
  });

  it("POZİTİF KONTROL: semantic arama sonuç döndürüyor", async () => {
    expect((await search(unitVector(0))).length).toBeGreaterThan(0);
  });

  it("EN YAKIN vektör ilk sırada", async () => {
    // pgvector'un `<=>` operatoru ve ORDER BY'i gercekten calisiyor mu.
    const hits = await search(unitVector(0));
    expect(hits[0].chunkId).toBe("c_near");
  });

  it("benzerlik hesabı DOĞRU: aynı vektör ≈ 1, dik vektör ≈ 0", async () => {
    // similarity = 1 - kosinus mesafesi. Yanlis isaret ya da yanlis
    // formul, siralama dogru gorunse bile skorlari anlamsiz yapardi.
    const hits = await search(unitVector(0));
    const near = hits.find((h) => h.chunkId === "c_near")!;
    const far = hits.find((h) => h.chunkId === "c_far")!;

    expect(near.rawScores.semantic).toBeGreaterThan(0.99);
    expect(Math.abs(far.rawScores.semantic ?? 0)).toBeLessThan(0.01);
  });

  it("FIREWALL ÖN-FİLTRE: DENY chunk EN YAKIN olsa bile dönmez", async () => {
    // `c_deny` sorgu vektoruyle AYNI embedding'e sahip - yani en yakin
    // aday. Yine de donmemeli (ADR-027).
    const hits = await search(unitVector(0));
    expect(hits.map((h) => h.chunkId)).not.toContain("c_deny");
  });

  it("embedding'i OLMAYAN chunk sonuçta yok", async () => {
    // `embedding IS NOT NULL` predikati olmadan NULL vektorler mesafe
    // hesabinda NULL uretir ve siralamayi bozar.
    const hits = await search(unitVector(0));
    expect(hits.map((h) => h.chunkId)).not.toContain("c_noembed");
  });

  it("boyut uyuşmazlığı HATA verir — kırpma ya da sıfır dolgu YOK", async () => {
    // Kirpmak ya da sifirla doldurmak, anlamsiz ama MAKUL GORUNEN
    // skorlar uretirdi.
    const wrongSize = new Array(8).fill(0.1);
    await expect(search(wrongSize)).rejects.toThrow(/DIMENSION_MISMATCH|boyutlu/);
  });
});

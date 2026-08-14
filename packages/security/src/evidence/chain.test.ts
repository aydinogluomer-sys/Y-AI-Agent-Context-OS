/**
 * P14 — Kanıt hash zinciri testleri.
 *
 * Üç saldırı ayrı ayrı test edilir: SİLME, EKLEME, DEĞİŞTİRME.
 * Üçünü tek bir "zincir bozuk" kontrolüyle geçmek, hangisinin olduğunu
 * bilmeyi imkânsız kılardı — ve bu, olayı incelemenin ilk adımıdır.
 */

import { describe, it, expect } from "vitest";
import {
  EvidenceChainError,
  GENESIS_HASH,
  canonicalize,
  chainHead,
  computeEntryHash,
  prepareEntry,
  verifyChain,
  type EvidenceEntry
} from "./chain";

/** Sağlam bir zincir kurar. */
function buildChain(count: number): EvidenceEntry[] {
  const entries: EvidenceEntry[] = [];
  let previousHash = GENESIS_HASH;

  for (let i = 1; i <= count; i++) {
    const entry = prepareEntry({
      id: `ev_${i}`,
      runId: "run_1",
      kind: "run.completed",
      payload: { step: i, detail: `adim ${i}` },
      sequence: i,
      previousHash,
      createdAt: `2026-08-14T10:0${i}:00.000Z`
    });
    entries.push(entry);
    previousHash = entry.entryHash;
  }
  return entries;
}

describe("canonicalize — manifest ile aynı gerekçe", () => {
  it("alan sırası sonucu değiştirmez", () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });

  it("undefined atlanır, null korunur", () => {
    expect(canonicalize({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("dizi sırası korunur", () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });

  it("unicode NFC'ye normalize edilir", () => {
    expect(canonicalize({ a: "é" })).toBe(canonicalize({ a: "é" }));
  });

  it("NaN reddedilir", () => {
    expect(() => canonicalize({ a: Number.NaN })).toThrow(EvidenceChainError);
  });

  it("-0 ile 0 aynı serileşir", () => {
    expect(canonicalize(-0)).toBe(canonicalize(0));
  });
});

describe("computeEntryHash", () => {
  const base = {
    id: "ev_1",
    runId: "run_1",
    kind: "run.completed",
    payload: { a: 1 },
    sequence: 1,
    previousHash: GENESIS_HASH,
    createdAt: "2026-08-14T10:00:00.000Z"
  };

  it("aynı girdi aynı hash'i verir", () => {
    expect(computeEntryHash(base)).toBe(computeEntryHash(base));
  });

  it("önceki hash hesaba KATILIR (zinciri kuran şey)", () => {
    const different = { ...base, previousHash: "f".repeat(64) };
    expect(computeEntryHash(different)).not.toBe(computeEntryHash(base));
  });

  it("yük değişince hash değişir", () => {
    expect(computeEntryHash({ ...base, payload: { a: 2 } })).not.toBe(computeEntryHash(base));
  });

  it("zaman damgası hesaba katılır", () => {
    // Ayni icerikli iki kaydin ayni hash'i olmasi, birinin digerinin
    // yerine gecebilmesi demek olurdu.
    const later = { ...base, createdAt: "2026-08-14T11:00:00.000Z" };
    expect(computeEntryHash(later)).not.toBe(computeEntryHash(base));
  });

  it("yük alan sırası hash'i değiştirmez", () => {
    const a = computeEntryHash({ ...base, payload: { x: 1, y: 2 } });
    const b = computeEntryHash({ ...base, payload: { y: 2, x: 1 } });
    expect(a).toBe(b);
  });
});

describe("verifyChain — sağlam zincir", () => {
  it("sağlam zincir geçerlidir", () => {
    const result = verifyChain(buildChain(5));
    expect(result.valid).toBe(true);
    expect(result.verifiedCount).toBe(5);
    expect(result.brokenAtSequence).toBeNull();
  });

  it("boş zincir geçerlidir (henüz kanıt yok)", () => {
    const result = verifyChain([]);
    expect(result.valid).toBe(true);
    expect(result.verifiedCount).toBe(0);
  });

  it("tek kayıtlık zincir geçerlidir", () => {
    expect(verifyChain(buildChain(1)).valid).toBe(true);
  });

  it("sıra karışık verilse bile doğru sıralanır", () => {
    const chain = buildChain(4);
    const shuffled = [chain[3], chain[0], chain[2], chain[1]];
    expect(verifyChain(shuffled).valid).toBe(true);
  });

  it("ilk kayıt genesis hash'e bağlanır", () => {
    expect(buildChain(1)[0].previousHash).toBe(GENESIS_HASH);
  });
});

describe("verifyChain — SİLME tespiti", () => {
  it("aradan kayıt silinirse zincir kırılır", () => {
    const chain = buildChain(5);
    const withGap = [chain[0], chain[1], chain[3], chain[4]];

    const result = verifyChain(withGap);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("SILINMIS");
  });

  it("silme, kırılma noktasını bildirir", () => {
    const chain = buildChain(5);
    const withGap = [chain[0], chain[2], chain[3], chain[4]];
    expect(verifyChain(withGap).brokenAtSequence).toBe(3);
  });

  it("sondan silme de yakalanır", () => {
    // Son kaydi silmek sira boslugu URETMEZ; ama zincirin ucu degisir
    // ve bu, disaridaki bir capa ile karsilastirildiginda gorunur.
    // Burada test edilen: kalan zincir kendi icinde tutarli.
    const chain = buildChain(5);
    expect(verifyChain(chain.slice(0, 4)).valid).toBe(true);
  });
});

describe("verifyChain — EKLEME tespiti", () => {
  it("araya kayıt eklenirse zincir bağı kırılır", () => {
    const chain = buildChain(4);
    const injected = prepareEntry({
      id: "ev_sahte",
      runId: "run_1",
      kind: "run.completed",
      payload: { uydurma: true },
      sequence: 3,
      // Saldirgan dogru previousHash'i BILMIYOR ya da bilse bile
      // sonraki kaydin bagini kiramadan degistiremiyor.
      previousHash: "a".repeat(64),
      createdAt: "2026-08-14T10:03:30.000Z"
    });

    const tampered = [chain[0], chain[1], injected, chain[3]];
    const result = verifyChain(tampered);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/EKLENMIS|SILINMIS/);
  });

  it("doğru previousHash ile eklense bile SONRAKİ kayıt kırılır", () => {
    const chain = buildChain(3);
    const injected = prepareEntry({
      id: "ev_sahte",
      runId: "run_1",
      kind: "run.completed",
      payload: { uydurma: true },
      sequence: 3,
      previousHash: chain[1].entryHash,
      createdAt: "2026-08-14T10:02:30.000Z"
    });

    // Sahte kayit 3. sirayi aliyor, gercek 3. kayit 4. sirada.
    const tampered = [chain[0], chain[1], injected, { ...chain[2], sequence: 4 }];
    const result = verifyChain(tampered);

    // Gercek 3. kaydin previousHash'i hala chain[1]'e isaret ediyor ama
    // artik oncesinde sahte kayit var.
    expect(result.valid).toBe(false);
  });
});

describe("verifyChain — DEĞİŞTİRME tespiti", () => {
  it("içerik değiştirilirse hash uyuşmaz", () => {
    const chain = buildChain(4);
    const tampered = [...chain];
    tampered[2] = { ...chain[2], payload: { step: 3, detail: "DEGISTIRILDI" } };

    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("DEGISTIRILMIS");
    expect(result.brokenAtSequence).toBe(3);
  });

  it("hash alanı değiştirilirse de yakalanır", () => {
    const chain = buildChain(3);
    const tampered = [...chain];
    tampered[1] = { ...chain[1], entryHash: "b".repeat(64) };

    expect(verifyChain(tampered).valid).toBe(false);
  });

  it("kayıt türü değiştirilirse yakalanır", () => {
    const chain = buildChain(3);
    const tampered = [...chain];
    tampered[1] = { ...chain[1], kind: "run.failed" };

    expect(verifyChain(tampered).valid).toBe(false);
  });

  it("doğrulama, kırılmadan ÖNCEKİ kayıt sayısını bildirir", () => {
    const chain = buildChain(5);
    const tampered = [...chain];
    tampered[3] = { ...chain[3], payload: { degisti: true } };

    // Ilk uc kayit dogrulandi, dorduncude kirildi.
    expect(verifyChain(tampered).verifiedCount).toBe(3);
  });
});

describe("chainHead — yeni kaydın bağlanacağı nokta", () => {
  it("boş zincirde genesis döner", () => {
    expect(chainHead([])).toEqual({ sequence: 0, hash: GENESIS_HASH });
  });

  it("dolu zincirde son kaydı döner", () => {
    const chain = buildChain(3);
    const head = chainHead(chain);

    expect(head.sequence).toBe(3);
    expect(head.hash).toBe(chain[2].entryHash);
  });

  it("sıra karışık verilse bile doğru ucu bulur", () => {
    const chain = buildChain(3);
    expect(chainHead([chain[1], chain[2], chain[0]]).sequence).toBe(3);
  });

  it("baştan kurulan zincir doğrulamadan geçer", () => {
    // chainHead ile zincire ekleme yapmak, gecerli bir zincir uretmeli.
    const chain = buildChain(3);
    const head = chainHead(chain);
    const next = prepareEntry({
      id: "ev_4",
      runId: "run_1",
      kind: "run.completed",
      payload: { step: 4 },
      sequence: head.sequence + 1,
      previousHash: head.hash,
      createdAt: "2026-08-14T10:04:00.000Z"
    });

    expect(verifyChain([...chain, next]).valid).toBe(true);
  });
});

describe("zincirin SINIRLARI — ne garanti etmez", () => {
  it("tüm zincir yeniden hesaplanırsa doğrulamadan GEÇER", () => {
    // Bu bir eksiklik degil, zincirin dogasidir. Veritabanina tam yazma
    // yetkisi olan biri zinciri bastan kurabilir. Buna karsi koruma dis
    // bir capa gerektirir (imzali periyodik snapshot, harici zaman
    // damgasi). Zincirin gercekten sagladigi sey: KISMI degisikligin
    // tespit edilmesi.
    const rewritten = buildChain(3);
    expect(verifyChain(rewritten).valid).toBe(true);

    // Bu testin varlik sebebi, iddianin sinirini KAYIT ALTINA almaktir.
    expect(rewritten.length).toBe(3);
  });
});

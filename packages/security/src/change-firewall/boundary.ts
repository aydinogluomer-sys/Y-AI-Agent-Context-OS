/**
 * P10 / Y-P10-001 — Task-derived change boundary (ADR-038).
 *
 * P00 Truth Audit: böyle bir kavram YOKTU. En yakın şeyler:
 *   - `task_boundaries` + `boundary_checks` tabloları vardı ama
 *     `boundary_checks` YALNIZ YAZILIYOR, HİÇ OKUNMUYORDU (1 insert,
 *     0 select) ve ilgili route'lar `/tasks/*` altında olduğu için
 *     P02'de 410 ile ölmüştü.
 *   - `LocalFilesystemRepoAdapter.writeFile` sır kontrolü yapıyordu ama
 *     task sınırı kavramı yoktu.
 *
 * Yani ürün tezinin CHANGE sütunu tamamen eksikti: agent (gerçek bir
 * runtime olsaydı) herhangi bir dosyayı değiştirebilirdi.
 *
 * ADR-038 — BOUNDARY TASK'TAN TÜRETİLİR, KULLANICIDAN ALINMAZ
 *   Kullanıcı boundary'yi GENİŞLETEMEZ, yalnız onay verebilir.
 *   Sebep basit: kullanıcının genişletebildiği bir sınır, sınır değildir.
 *   Bir agent "bu dosyayı da eklememe izin ver" diyebilseydi, sınırın
 *   tek işlevi bir tıklama eklemek olurdu.
 *
 * TÜRETME GİRDİLERİ
 *   1. Retrieval'ın bulduğu birincil semboller (manifest'teki fragment
 *      yolları) — agent'ın gördüğü şey.
 *   2. Graph'ta bu yolların doğrudan bağımlıları ve tersleri (P05).
 *   3. Test konvansiyonu: değişen kaynağın testi de yazılabilir olmalı.
 *   4. Policy sınıflandırması: `migrations/**`, `infra/**` onay ister;
 *      `secrets/**` yasak (P07 ile ortak).
 *
 *   Görev METNİ tek başına yeterli değildir — metin bir niyet beyanıdır,
 *   kod gerçeğinin kendisi değil.
 */

import { createHash } from "crypto";
import { globSpecificity, matchesGlob } from "./../context-firewall/glob";

export type BoundaryBand = "expected" | "allowed" | "approval" | "denied";

export interface ChangeBoundary {
  /** Görevin doğrudan hedefi. Agent'ın burada çalışması BEKLENİR. */
  readonly expected: readonly string[];
  /** Yan etki olarak dokunulabilir. */
  readonly allowed: readonly string[];
  /** Onay ister. */
  readonly approval: readonly string[];
  /** Yasak. */
  readonly denied: readonly string[];
  /** Türetmenin hangi kanıtlardan geldiği — kararın denetlenebilmesi için. */
  readonly derivedFrom: readonly BoundaryEvidence[];
  readonly boundaryHash: string;
}

export interface BoundaryEvidence {
  readonly glob: string;
  readonly band: BoundaryBand;
  readonly source:
    | "manifest_fragment"
    | "graph_dependency"
    | "graph_dependent"
    | "test_convention"
    | "policy_classification";
  readonly detail: string;
}

export interface DeriveBoundaryInput {
  /** Manifest'teki fragment yolları — agent'ın GÖRDÜĞÜ dosyalar. */
  readonly manifestPaths: readonly string[];
  /** Graph'ta bu yolların doğrudan bağımlıları. */
  readonly directDependencies?: readonly string[];
  /** Graph'ta bu yolları import edenler. */
  readonly directDependents?: readonly string[];
  /** Snapshot'taki tüm yollar — test eşleşmesi için. */
  readonly knownPaths?: readonly string[];
  /** P07 sınıflandırmasından gelen onay/red glob'ları. */
  readonly approvalGlobs?: readonly string[];
  readonly deniedGlobs?: readonly string[];
}

export class BoundaryError extends Error {
  constructor(
    readonly code: "EMPTY_BOUNDARY" | "NO_MANIFEST_PATHS",
    message: string
  ) {
    super(message);
    this.name = "BoundaryError";
  }
}

/**
 * Boundary'yi türetir.
 *
 * DENY her zaman kazanır; ardından APPROVAL. Bir yol hem `expected` hem
 * `denied` kümesine düşerse sonuç DENY'dir — "bu görev için gerekli"
 * olması, yasak olmasını değiştirmez.
 */
export function deriveBoundary(input: DeriveBoundaryInput): ChangeBoundary {
  if (input.manifestPaths.length === 0) {
    // Bos bir manifest'ten bos bir boundary turetmek, "her sey yasak"
    // ya da (daha kotusu) "her sey serbest" anlamina gelebilirdi.
    // Belirsizlik ACIKCA reddedilir.
    throw new BoundaryError(
      "NO_MANIFEST_PATHS",
      "Manifest'te hicbir fragment yok; boundary turetilemez. Agent'in gormedigi " +
        "bir kod tabaninda yazma sinirini tahmin etmek, sinir olmamasiyla aynidir."
    );
  }

  const evidence: BoundaryEvidence[] = [];
  const expected = new Set<string>();
  const allowed = new Set<string>();

  for (const path of input.manifestPaths) {
    const glob = toFileGlob(path);
    expected.add(glob);
    evidence.push({
      glob,
      band: "expected",
      source: "manifest_fragment",
      detail: `Manifest'te fragment olarak yer aliyor: ${path}`
    });

    // Degisen kaynagin TESTI de yazilabilir olmali; aksi halde agent
    // testi guncelleyemez ve degisikligi dogrulayamaz.
    for (const testPath of testPathsFor(path, input.knownPaths ?? [])) {
      const testGlob = toFileGlob(testPath);
      if (!expected.has(testGlob)) {
        expected.add(testGlob);
        evidence.push({
          glob: testGlob,
          band: "expected",
          source: "test_convention",
          detail: `${path} dosyasinin testi`
        });
      }
    }
  }

  for (const path of input.directDependencies ?? []) {
    const glob = toFileGlob(path);
    if (expected.has(glob)) continue;
    allowed.add(glob);
    evidence.push({
      glob,
      band: "allowed",
      source: "graph_dependency",
      detail: `Manifest dosyalarindan birinin dogrudan bagimliligi`
    });
  }

  for (const path of input.directDependents ?? []) {
    const glob = toFileGlob(path);
    if (expected.has(glob) || allowed.has(glob)) continue;
    allowed.add(glob);
    evidence.push({
      glob,
      band: "allowed",
      source: "graph_dependent",
      detail: `Manifest dosyalarindan birini import ediyor`
    });
  }

  const approval = new Set(input.approvalGlobs ?? []);
  const denied = new Set(input.deniedGlobs ?? []);

  for (const glob of approval) {
    evidence.push({
      glob,
      band: "approval",
      source: "policy_classification",
      detail: "Policy siniflandirmasi onay istiyor"
    });
  }
  for (const glob of denied) {
    evidence.push({
      glob,
      band: "denied",
      source: "policy_classification",
      detail: "Policy siniflandirmasi yasakliyor"
    });
  }

  const sorted = {
    expected: [...expected].sort(),
    allowed: [...allowed].sort(),
    approval: [...approval].sort(),
    denied: [...denied].sort()
  };

  return {
    ...sorted,
    derivedFrom: evidence.sort((a, b) => a.glob.localeCompare(b.glob)),
    boundaryHash: hashBoundary(sorted)
  };
}

/**
 * Bir yolun hangi banda düştüğü.
 *
 * Öncelik: `denied > approval > expected > allowed > (hiçbiri)`.
 * Hiçbir banda düşmeyen yol REDDEDİLİR — boundary dışı bir yazım,
 * boundary'nin var olma sebebidir.
 */
export function bandFor(boundary: ChangeBoundary, path: string): BoundaryBand | "outside" {
  if (bestMatch(boundary.denied, path) !== null) return "denied";
  if (bestMatch(boundary.approval, path) !== null) return "approval";
  if (bestMatch(boundary.expected, path) !== null) return "expected";
  if (bestMatch(boundary.allowed, path) !== null) return "allowed";
  return "outside";
}

function bestMatch(globs: readonly string[], path: string): string | null {
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const glob of globs) {
    if (!matchesGlob(path, glob)) continue;
    const score = globSpecificity(glob);
    if (score > bestScore) {
      best = glob;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Boundary kimliği.
 *
 * Aynı görev ve aynı manifest → aynı boundary hash'i. Bu, bir run'ın
 * hangi sınırla çalıştığının kanıtıdır ve `change_boundaries` tablosunda
 * immutable olarak saklanır.
 */
export function hashBoundary(bands: {
  expected: readonly string[];
  allowed: readonly string[];
  approval: readonly string[];
  denied: readonly string[];
}): string {
  const canonical = JSON.stringify({
    allowed: [...bands.allowed].sort(),
    approval: [...bands.approval].sort(),
    denied: [...bands.denied].sort(),
    expected: [...bands.expected].sort()
  });
  return createHash("sha256").update(canonical, "utf-8").digest("hex");
}

/**
 * Bir dosya yolunu glob'a çevirir.
 *
 * TEK DOSYA glob'u üretilir, dizin glob'u DEĞİL: `src/a.ts` gördüğü için
 * `src/**` yazma izni vermek, boundary'yi anlamsız derecede
 * genişletirdi.
 */
export function toFileGlob(path: string): string {
  return path;
}

/**
 * Bir kaynağın test dosyalarını konvansiyondan bulur.
 *
 * Yalnızca GERÇEKTEN VAR OLAN yollar döner: var olmayan bir test yoluna
 * yazma izni vermek, agent'ın oraya yeni dosya açabilmesi demektir ve bu
 * ayrı bir karardır.
 */
export function testPathsFor(path: string, knownPaths: readonly string[]): string[] {
  const match = path.match(/^(.*)\.([cm]?[jt]sx?)$/);
  if (!match) return [];

  const [, stem, ext] = match;
  const candidates = [`${stem}.test.${ext}`, `${stem}.spec.${ext}`];
  return candidates.filter((candidate) => knownPaths.includes(candidate));
}

/**
 * P07 / Y-P07-003, Y-P07-004 — Allowed Context Universe (ADR-029, ADR-030).
 *
 * KAVRAM
 *   Bir task için "agent'ın görebileceği her şeyin" kümesi. Retrieval bu
 *   kümenin dışına çıkamaz — çıkamamasının sebebi bir kontrol değil,
 *   sorgunun ŞEKLİDİR: universe bir SQL predicate'ine derlenir ve
 *   kanalların sorgularına gömülür.
 *
 * P00 Truth Audit: böyle bir kavram YOKTU.
 *   Erişim kontrolü dağınıktı: repository katmanında dosya bazlı bir
 *   denylist, permission kernel'de yalnız beş sabit dosya adı
 *   (`.env`, `secrets.json`, `credentials.json`, `*.pem`, `*.key`), ve
 *   retrieval'da HİÇBİR kontrol. Bir chunk bir kez index'lendiyse
 *   retrieval onu aday görebiliyordu.
 *
 * ADR-029 — DENY HER ZAMAN KAZANIR, APPROVAL DENY GİBİ DAVRANIR
 *   Onay bekleyen bir kaynak, onay verilene kadar context'e GİRMEZ.
 *   "Önce göster, sonra onayla" provenance'ı bozar: içerik zaten
 *   modele gitmişse onayın bir anlamı kalmaz. Onay verildiğinde YENİ bir
 *   compile tetiklenir ve o compile'ın kendi universe'ü olur.
 *
 * ADR-030 — UNIVERSE IMMUTABLE VE RUN'A BAĞLI
 *   Compile sırasında hesaplanır, hash'i manifest'e yazılır. Policy
 *   sonradan değişse bile o run'ın kanıtı değişmez. Aksi halde "bu
 *   context hangi kurallarla üretildi?" sorusu yanıtlanamazdı.
 */

import { createHash } from "crypto";
import {
  MAX_RULES_PER_EFFECT,
  assertSupportedGlob,
  globSpecificity,
  globToLikePattern,
  globToRegExpSource,
  matchesGlob
} from "./glob";

export type PolicyEffect = "allow" | "approval" | "deny";

export interface PolicyRule {
  readonly effect: PolicyEffect;
  readonly resourceGlob: string;
  /** Aynı özgüllükteki kurallarda sıralama; büyük olan önce. */
  readonly priority?: number;
}

export interface AllowedContextUniverse {
  readonly allow: readonly string[];
  readonly approval: readonly string[];
  readonly deny: readonly string[];
  readonly policyVersion: string;
  /** Determinizm girdisi (P09). Aynı girdi → aynı hash. */
  readonly universeHash: string;
}

export interface UniverseInputs {
  readonly organizationId: string;
  readonly projectId: string;
  readonly principalSub: string;
  readonly role: string;
  readonly policyVersion: string;
  readonly rules: readonly PolicyRule[];
  /**
   * Sınıflandırmadan gelen ek DENY'ler (ör. `secret` sınıfı dosyalar).
   * Policy kurallarıyla BİRLEŞTİRİLİR, onların yerine geçmez.
   */
  readonly classifiedDenyGlobs?: readonly string[];
  readonly classifiedApprovalGlobs?: readonly string[];
}

export class FirewallError extends Error {
  constructor(
    readonly code:
      | "POLICY_STORE_UNAVAILABLE"
      | "EMPTY_UNIVERSE"
      | "TOO_MANY_RULES"
      | "NO_ALLOW_RULES",
    message: string
  ) {
    super(message);
    this.name = "FirewallError";
  }
}

/**
 * Universe'ü hesaplar.
 *
 * DETERMINIZM: kurallar kanonik sıraya konur (etki, sonra glob metni).
 * Girdi sırası hash'i etkilemez — aksi halde aynı policy iki farklı
 * universe hash'i üretir ve manifest karşılaştırması anlamsızlaşırdı.
 */
export function computeUniverse(inputs: UniverseInputs): AllowedContextUniverse {
  const allow = new Set<string>();
  const approval = new Set<string>();
  const deny = new Set<string>();

  for (const rule of inputs.rules) {
    assertSupportedGlob(rule.resourceGlob);
    if (rule.effect === "allow") allow.add(rule.resourceGlob);
    else if (rule.effect === "approval") approval.add(rule.resourceGlob);
    else deny.add(rule.resourceGlob);
  }

  for (const glob of inputs.classifiedDenyGlobs ?? []) {
    assertSupportedGlob(glob);
    deny.add(glob);
  }
  for (const glob of inputs.classifiedApprovalGlobs ?? []) {
    assertSupportedGlob(glob);
    approval.add(glob);
  }

  for (const [effect, set] of [
    ["allow", allow],
    ["approval", approval],
    ["deny", deny]
  ] as const) {
    if (set.size > MAX_RULES_PER_EFFECT) {
      throw new FirewallError(
        "TOO_MANY_RULES",
        `${effect} icin ${set.size} kural var, ust sinir ${MAX_RULES_PER_EFFECT}. ` +
          `Predicate karmasikligi sorgu performansini dusurur.`
      );
    }
  }

  if (allow.size === 0) {
    // Bos bir ALLOW kumesi "her sey yasak" demektir ve bu MESRU bir
    // policy olabilir — ama sessizce bos context uretmek yerine ACIKCA
    // bildirilmelidir. Compile "insufficient context" ile durur.
    throw new FirewallError(
      "NO_ALLOW_RULES",
      "Policy hicbir ALLOW kurali icermiyor. Bos bir universe ile devam etmek, " +
        "bos context'i basarili bir compile gibi gostermek olurdu."
    );
  }

  const sorted = {
    allow: [...allow].sort(),
    approval: [...approval].sort(),
    deny: [...deny].sort()
  };

  return {
    ...sorted,
    policyVersion: inputs.policyVersion,
    universeHash: hashUniverse({
      ...sorted,
      policyVersion: inputs.policyVersion,
      organizationId: inputs.organizationId,
      projectId: inputs.projectId,
      role: inputs.role
    })
  };
}

/**
 * Universe kimliği.
 *
 * `principalSub` hash'e GİRMEZ: aynı roldeki iki kullanıcı aynı
 * universe'ü görmelidir ve aynı hash'i üretmelidir. Kullanıcı kimliğini
 * karıştırmak, aynı context'in her kullanıcı için farklı görünmesine ve
 * manifest karşılaştırmasının imkânsızlaşmasına yol açardı.
 */
function hashUniverse(payload: {
  allow: readonly string[];
  approval: readonly string[];
  deny: readonly string[];
  policyVersion: string;
  organizationId: string;
  projectId: string;
  role: string;
}): string {
  const canonical = JSON.stringify({
    allow: payload.allow,
    approval: payload.approval,
    deny: payload.deny,
    organizationId: payload.organizationId,
    policyVersion: payload.policyVersion,
    projectId: payload.projectId,
    role: payload.role
  });
  return createHash("sha256").update(canonical, "utf-8").digest("hex");
}

/**
 * Bir yolun universe'deki etkisi.
 *
 * Öncelik: `deny > approval > allow`. Aynı etki içinde en ÖZGÜL kural
 * kazanır. Hiçbir kurala uymayan yol REDDEDİLİR — varsayılan izin
 * vermek, yeni eklenen bir dizinin sessizce erişilebilir olması demek
 * olurdu.
 */
export function effectForPath(universe: AllowedContextUniverse, path: string): PolicyEffect {
  const denyMatch = bestMatch(universe.deny, path);
  const approvalMatch = bestMatch(universe.approval, path);
  const allowMatch = bestMatch(universe.allow, path);

  // DENY her zaman kazanir — daha ozgul bir ALLOW olsa bile.
  // "Bu dizinde her sey serbest AMA su dosya yasak" ifadesi ancak boyle
  // guvenli olur.
  if (denyMatch !== null) return "deny";
  if (approvalMatch !== null) return "approval";
  if (allowMatch !== null) return "allow";
  return "deny";
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
 * Retrieval'a gömülecek SQL predicate'i.
 *
 * ÜRETİLEN SQL PARAMETRELİDİR: kullanıcı girdisi (glob metni) doğrudan
 * SQL'e girmez, `$n` parametreleri olarak geçer. Glob'ları string
 * birleştirmeyle SQL'e gömmek, policy yazma yetkisi olan bir kullanıcıya
 * SQL enjeksiyonu vermek olurdu.
 *
 * Predicate iki katmanlıdır:
 *   1. `LIKE ANY(...)` — indeks kullanabilen kaba eleme.
 *   2. `~ ANY(...)` — kesin eşleşme (regex).
 * Yalnız regex kullanmak her satırı taramak, yalnız LIKE kullanmak
 * `*` ile `**` farkını kaybetmek demekti.
 */
export interface UniversePredicate {
  /** `AND` ile sorguya eklenecek SQL parçası. */
  readonly sql: string;
  /** Sıralı parametre değerleri. */
  readonly params: readonly unknown[];
  /** İlk parametrenin sorgudaki indeksi (1 tabanlı). */
  readonly firstParamIndex: number;
}

/**
 * Universe'ü SQL predicate'ine derler.
 *
 * @param pathColumn Yol kolonunun tam adı (ör. `c.path`).
 * @param firstParamIndex Sorguda kullanılacak ilk `$n` numarası.
 */
export function compilePredicate(
  universe: AllowedContextUniverse,
  pathColumn: string,
  firstParamIndex: number
): UniversePredicate {
  assertSafeIdentifier(pathColumn);

  const allowLike = universe.allow.map(globToLikePattern);
  const allowRegex = universe.allow.map((g) => `^${globToRegExpSource(g)}$`);
  // APPROVAL, retrieval'da DENY gibi davranir (ADR-029).
  const blockedRegex = [...universe.deny, ...universe.approval].map(
    (g) => `^${globToRegExpSource(g)}$`
  );

  const p = (offset: number) => `$${firstParamIndex + offset}`;

  const sql =
    `(${pathColumn} LIKE ANY(${p(0)}::text[]) ` +
    `AND ${pathColumn} ~ ANY(${p(1)}::text[]) ` +
    // Bloklanan kume BOS olabilir; `= ANY('{}')` her zaman false doner,
    // bu yuzden NOT ile sarmalamak guvenlidir.
    `AND NOT (${pathColumn} ~ ANY(${p(2)}::text[])))`;

  return {
    sql,
    params: [allowLike, allowRegex, blockedRegex],
    firstParamIndex
  };
}

/**
 * Kolon adı doğrulaması.
 *
 * Kolon adı string birleştirmeyle SQL'e giriyor (parametre olamaz).
 * Çağıran kod sabit bir değer veriyor ama bu varsayıma güvenmek yerine
 * doğrulanır: bir gün bu değer yapılandırmadan gelirse enjeksiyon
 * yüzeyi olurdu.
 */
function assertSafeIdentifier(identifier: string): void {
  if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(identifier)) {
    throw new FirewallError(
      "POLICY_STORE_UNAVAILABLE",
      `Guvenli olmayan kolon adi: '${identifier}'`
    );
  }
}

/**
 * Universe olmadan retrieval yapılamayacağının TİP seviyesinde garantisi.
 *
 * Bu marker tipi, retrieval kanallarının imzasında zorunlu parametre
 * olarak durur. Unutulması derleme hatasıdır — çalışma zamanı kontrolü
 * değil. Y-P07-004'ün kabul kriteri tam olarak budur.
 */
export interface FirewalledSpec {
  readonly universe: AllowedContextUniverse;
}

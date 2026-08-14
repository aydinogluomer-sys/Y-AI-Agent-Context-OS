/**
 * P07 / Y-P07-002 — Dosya sınıflandırıcı.
 *
 * P00 Truth Audit: `PermissionKernelService.validateResourceBoundary`
 * yalnız BEŞ sabit dosya adına bakıyordu — `.env`, `secrets.json`,
 * `credentials.json`, `*.pem`, `*.key`. Bir `terraform/prod.tfvars`,
 * bir `k8s/secrets.yaml`, bir `config/production.json` bu listede yoktu
 * ve serbestçe context'e girebiliyordu.
 *
 * DÜŞÜK GÜVEN → APPROVAL, DENY DEĞİL
 *   Sınıflandırma bir TAHMİNDİR. Yanlış DENY, meşru bir dosyayı
 *   erişilmez kılar ve kullanıcı sebebini anlamaz. Yanlış ALLOW ise sır
 *   sızdırır. İkisi arasında APPROVAL vardır: içerik gösterilmez ama
 *   insan karar verebilir. Güven eşiğin altındaysa buraya düşülür.
 *
 * SINIFLANDIRMA İÇERİĞE BAKMAZ
 *   Yalnızca yol, uzantı ve P03/P04'ün ürettiği bayraklar kullanılır.
 *   Sır tespiti için içeriği okumak, DENY olabilecek bir dosyayı okumak
 *   demektir; sır tarayıcısı bunu ingestion sırasında zaten yaptı ve
 *   sonucunu `files.contains_secret` olarak bıraktı.
 */

export const FILE_KINDS = [
  "source",
  "test",
  "doc",
  "adr",
  "config",
  "migration",
  "infra",
  "secret",
  "generated",
  "minified",
  "vendor"
] as const;

export type FileKind = (typeof FILE_KINDS)[number];

export interface ClassificationInput {
  readonly path: string;
  readonly language?: string | null;
  /** P03 ingestion'ın işaretleri. */
  readonly isGenerated?: boolean;
  readonly isMinified?: boolean;
  /** P04 sır tarayıcısının işareti. */
  readonly containsSecret?: boolean;
}

export interface FileClassification {
  readonly path: string;
  readonly kind: FileKind;
  /** 0..1. Eşiğin altı APPROVAL'a düşer. */
  readonly confidence: number;
  /** Hangi kanıta dayanıldığı — kararın denetlenebilmesi için. */
  readonly basis: string;
  /** Varsayılan şablonda önerilen etki. */
  readonly suggestedEffect: "allow" | "approval" | "deny";
}

/** Bu değerin altındaki güven APPROVAL'a düşer (DENY'e değil). */
export const CONFIDENCE_THRESHOLD = 0.7;

interface Rule {
  readonly kind: FileKind;
  readonly test: RegExp;
  readonly confidence: number;
  readonly basis: string;
}

/**
 * Sıra ÖNEMLİDİR: ilk eşleşen kazanır.
 * `secret` en başta, çünkü `infra/secrets.yaml` hem infra hem secret'tır
 * ve daha kısıtlayıcı olan kazanmalıdır.
 */
const RULES: readonly Rule[] = [
  {
    kind: "secret",
    test: /(^|\/)\.env($|\.|\/)|(^|\/)secrets?\/|(^|\/)credentials?\.|\.(pem|key|p12|pfx|keystore|jks)$|(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i,
    confidence: 0.98,
    basis: "sir dosyasi adlandirma kalibi"
  },
  {
    kind: "secret",
    test: /(^|\/)(production|prod)\/.*\.(env|tfvars|json|ya?ml)$|\.tfvars$/i,
    confidence: 0.85,
    basis: "uretim yapilandirma dosyasi"
  },
  {
    kind: "vendor",
    test: /(^|\/)(node_modules|vendor|third_party|bower_components)\//i,
    confidence: 0.99,
    basis: "bagimlilik dizini"
  },
  {
    kind: "infra",
    test: /(^|\/)(terraform|k8s|kubernetes|helm|infra|infrastructure|deploy|ansible)\//i,
    confidence: 0.9,
    basis: "altyapi dizini"
  },
  {
    kind: "infra",
    test: /(^|\/)(Dockerfile|docker-compose\.ya?ml|\.dockerignore)$/i,
    confidence: 0.85,
    basis: "konteyner tanimi"
  },
  {
    kind: "migration",
    test: /(^|\/)migrations?\/|\.sql$/i,
    confidence: 0.9,
    basis: "migration dizini ya da SQL uzantisi"
  },
  {
    kind: "adr",
    test: /(^|\/)docs?\/adrs?\/|\/adr-\d+|(^|\/)adr\//i,
    confidence: 0.9,
    basis: "ADR dizini"
  },
  {
    kind: "test",
    test: /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(tests?|__tests__|e2e)\//i,
    confidence: 0.9,
    basis: "test adlandirma kalibi"
  },
  {
    kind: "doc",
    test: /\.mdx?$|(^|\/)docs?\//i,
    confidence: 0.85,
    basis: "dokuman uzantisi ya da dizini"
  },
  {
    kind: "config",
    test: /\.(json|ya?ml|toml|ini|conf|cfg)$|(^|\/)\.[a-z]+rc$/i,
    confidence: 0.75,
    basis: "yapilandirma uzantisi"
  }
];

const EFFECT_BY_KIND: Record<FileKind, "allow" | "approval" | "deny"> = {
  secret: "deny",
  infra: "approval",
  migration: "approval",
  vendor: "deny",
  generated: "deny",
  minified: "deny",
  config: "approval",
  source: "allow",
  test: "allow",
  doc: "allow",
  adr: "allow"
};

export function classifyFile(input: ClassificationInput): FileClassification {
  // P04 sir tarayicisi zaten bulduysa tartisma yok: en yuksek guven.
  if (input.containsSecret) {
    return {
      path: input.path,
      kind: "secret",
      confidence: 1,
      basis: "sir tarayicisi bu dosyada bulgu uretti (P04)",
      suggestedEffect: "deny"
    };
  }

  if (input.isMinified) {
    return {
      path: input.path,
      kind: "minified",
      confidence: 0.95,
      basis: "ingestion minified olarak isaretledi (P03)",
      suggestedEffect: "deny"
    };
  }

  if (input.isGenerated) {
    return {
      path: input.path,
      kind: "generated",
      confidence: 0.9,
      basis: "ingestion uretilmis olarak isaretledi (P03)",
      suggestedEffect: "deny"
    };
  }

  for (const rule of RULES) {
    if (!rule.test.test(input.path)) continue;
    return {
      path: input.path,
      kind: rule.kind,
      confidence: rule.confidence,
      basis: rule.basis,
      // Guven esigin altindaysa DENY yerine APPROVAL: yanlis DENY
      // mesru bir dosyayi sebebi anlasilmadan erisilmez kilar.
      suggestedEffect: downgradeIfUncertain(EFFECT_BY_KIND[rule.kind], rule.confidence)
    };
  }

  return {
    path: input.path,
    kind: "source",
    confidence: 0.6,
    basis: "eslesen kural yok; varsayilan kaynak dosya",
    suggestedEffect: "allow"
  };
}

/**
 * Belirsizlik DENY'i APPROVAL'a düşürür — ama ALLOW'u YÜKSELTMEZ.
 *
 * Asimetrik olmasının sebebi: yanlış bir DENY'in bedeli gecikmedir,
 * yanlış bir ALLOW'un bedeli sızıntıdır. Belirsizken izin vermeye değil,
 * insana sormaya düşülür.
 */
function downgradeIfUncertain(
  effect: "allow" | "approval" | "deny",
  confidence: number
): "allow" | "approval" | "deny" {
  if (effect === "deny" && confidence < CONFIDENCE_THRESHOLD) return "approval";
  return effect;
}

/**
 * Sınıflandırmalardan universe glob'ları üretir.
 *
 * Tek tek dosya yolları DEĞİL, mümkün olduğunca DİZİN glob'ları
 * döndürülür: 10.000 dosyalık bir repo'da her dosya için ayrı bir kural,
 * predicate'i kullanılamaz hâle getirirdi.
 */
export function toUniverseGlobs(
  classifications: readonly FileClassification[]
): { deny: string[]; approval: string[] } {
  const deny = new Set<string>();
  const approval = new Set<string>();

  for (const classification of classifications) {
    const target = classification.suggestedEffect;
    if (target === "allow") continue;

    const glob = generalizeToGlob(classification.path);
    if (target === "deny") deny.add(glob);
    else approval.add(glob);
  }

  return { deny: [...deny].sort(), approval: [...approval].sort() };
}

/**
 * Bir yolu dizin glob'una genelleştirir.
 *
 * `secrets/prod/db.env` → `secrets/**`. Genelleştirme İLK anlamlı
 * dizinde durur: daha derine inmek kural sayısını patlatır, daha yukarı
 * çıkmak beklenenden geniş bir kural üretir.
 */
export function generalizeToGlob(path: string): string {
  const segments = path.split("/");
  if (segments.length === 1) return path;
  return `${segments[0]}/**`;
}

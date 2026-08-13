/**
 * P03 / Y-P03-010 — Secret scanner (P0-11 kapanışı).
 *
 * P00 Truth Audit bulgusu:
 *   `packages/security/src/index.ts:40-41` GERÇEK bir veritabanı parolasını
 *   iki string parçasına bölüp runtime'da `join("")` ile birleştiriyor ve
 *   ondan bir regex kuruyordu. Ayrıca belirli bir Supabase project host'u
 *   hard-code'luydu.
 *
 *   (Kod alıntısı bilerek verilmiyor: sırrı bir yorum satırında tekrarlamak
 *    onu kaynakta tutmaya devam etmek olurdu. Ayrıntı için
 *    `docs/audit/2026-08-13-truth-audit/06-security-findings.md` P0-11.)
 *
 * Bu neden kabul edilemez:
 *   1. Sır git geçmişinde, önemsiz şekilde geri çevrilebilir halde.
 *   2. Yalnız O parolayı korur; başka bir sır sızsa yakalanmaz.
 *   3. Parola rotate edildiğinde koruma sessizce işlevsizleşir.
 *
 * Yerine: kalıp + entropi tabanlı tespit. Hiçbir gerçek sır kaynakta
 * bulunmaz. Rotasyon P17'de (Y-P17-003) operatör görevi olarak yürütülür.
 */

export type SecretKind =
  | "connection_string"
  | "bearer_token"
  | "aws_key"
  | "github_token"
  | "gitlab_token"
  | "slack_token"
  | "google_api_key"
  | "openai_key"
  | "anthropic_key"
  | "private_key_block"
  | "jwt"
  | "assignment"
  | "high_entropy";

export interface SecretFinding {
  readonly kind: SecretKind;
  readonly line: number;
  readonly column: number;
  /** Ham sır ASLA taşınmaz — yalnız uzunluk ve maskelenmiş önizleme. */
  readonly length: number;
  readonly preview: string;
}

interface Rule {
  readonly kind: SecretKind;
  readonly pattern: RegExp;
  /** Yakalanan grubun indeksi; 0 tüm eşleşme. */
  readonly group: number;
  readonly replacement: (match: string, ...groups: string[]) => string;
}

/**
 * Kalıp kuralları.
 *
 * Sıra önemlidir: daha spesifik kalıplar önce gelir, aksi halde genel
 * yüksek-entropi kuralı onları yutar ve tür bilgisi kaybolur.
 */
const RULES: Rule[] = [
  {
    // PEM blokları — çok satırlı.
    kind: "private_key_block",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    group: 0,
    replacement: () => "[REDACTED_PRIVATE_KEY]"
  },
  {
    // Sema://kullanici:parola@host/db bicimindeki baglanti dizeleri
    // (postgres, mysql, mongodb, redis, amqp). Ornek YAZILMIYOR: kendi
    // kuralimiza takilan bir yorum satiri, tarayiciyi kendi kaynaginda
    // bulgu uretmeye zorlar.
    kind: "connection_string",
    pattern: /\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|rediss):\/\/)([^:@\s/]+):([^@\s/]+)@/gi,
    group: 3,
    replacement: (_m, scheme, user) => `${scheme}${user}:[REDACTED_PASSWORD]@`
  },
  {
    kind: "aws_key",
    pattern: /\b((?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16})\b/g,
    group: 1,
    replacement: () => "[REDACTED_AWS_KEY]"
  },
  {
    kind: "github_token",
    pattern: /\b(gh[pousr]_[A-Za-z0-9]{16,255})\b/g,
    group: 1,
    replacement: () => "[REDACTED_GITHUB_TOKEN]"
  },
  {
    kind: "gitlab_token",
    pattern: /\b(glpat-[A-Za-z0-9_-]{20,})\b/g,
    group: 1,
    replacement: () => "[REDACTED_GITLAB_TOKEN]"
  },
  {
    kind: "slack_token",
    pattern: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
    group: 1,
    replacement: () => "[REDACTED_SLACK_TOKEN]"
  },
  {
    kind: "google_api_key",
    pattern: /\b(AIza[0-9A-Za-z_-]{35})\b/g,
    group: 1,
    replacement: () => "[REDACTED_GOOGLE_API_KEY]"
  },
  {
    kind: "openai_key",
    pattern: /\b(sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b/g,
    group: 1,
    replacement: () => "[REDACTED_OPENAI_KEY]"
  },
  {
    kind: "anthropic_key",
    pattern: /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/g,
    group: 1,
    replacement: () => "[REDACTED_ANTHROPIC_KEY]"
  },
  {
    kind: "jwt",
    pattern: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
    group: 1,
    replacement: () => "[REDACTED_JWT]"
  },
  {
    kind: "bearer_token",
    pattern: /\b(?:Bearer|Basic)\s+([A-Za-z0-9\-._~+/]{16,}=*)/gi,
    group: 1,
    replacement: (m) => `${m.split(/\s+/)[0]} [REDACTED_TOKEN]`
  },
  {
    // KEY = "değer"  /  "password": "değer"  /  TOKEN: değer
    kind: "assignment",
    // Deger yakalamasi backtick'te de durur: markdown/kod yorumlarinda
    // `password = NEW.password` gibi ifadeler kapanis backtick'ini
    // degerin parcasi sanip eslesmeyi bozuyordu.
    pattern:
      /\b((?:[A-Za-z0-9_-]*(?:API[_-]?KEY|SECRET|PASSWORD|PASSWD|PASSCODE|TOKEN|CREDENTIAL|PRIVATE[_-]?KEY)))\b(\s*["'`]?\s*[:=]\s*["'`]?)([^\s"'`,;)]{6,})/gi,
    group: 3,
    replacement: (_m, key, sep) => `${key}${sep}[REDACTED_SECRET]`
  }
];

/**
 * Bir atama değerinin GERÇEKTEN sır olup olmadığını belirler.
 *
 * `assignment` kuralı tek başına çok gürültülüdür: ilk çalıştırmada
 * 919 bulgu üretti ve neredeyse tamamı kod referansıydı
 * (`TOKEN: process.env.INDEX_WORKER_TOKEN`), tip tanımıydı
 * (`password: string`) veya test fixture'ıydı.
 *
 * Gürültülü bir tarayıcı, kapatılan bir tarayıcıdır — eski script'in
 * `validate-*` muafiyeti tam olarak böyle doğmuştu. O yüzden muafiyet
 * eklemek yerine kuralı KESKİNLEŞTİRİYORUZ.
 */
export function looksLikeRealSecretValue(value: string): boolean {
  if (isRedactionMarker(value)) return false;

  // Kod referansi: process.env.X, config.foo, this.bar, fn(), ${...}
  // Kod referansi. Liste, `token = req.cookies[...]` gibi gercek kod
  // satirlarindan buyudu: bir ozelligin BASKA bir nesneden okunmasi deger
  // tasimaz, YOL tasir. Gomulu bir sir ise her zaman literaldir.
  if (
    /^(?:process\.env|import\.meta|globalThis|window|self|config|options|params|opts|this|req|request|res|response|ctx|headers|body|query|row|record|input|payload|env)\b/.test(
      value
    )
  ) {
    return false;
  }
  if (/^\$\{/.test(value) || /\(\)$/.test(value)) return false;

  // Fonksiyon cagrisi. Cagri bir IFADEDIR, degismez bir deger degil —
  // gomulu sir her zaman literaldir. Bu kural olmadan bir DTO
  // donusturucusunde bir bayrak alanini bool'a ceviren satir sir
  // sayiliyordu (P05'te gate'in kendi kodumda yakaladigi false positive).
  //
  // Kapanis parantezi ISTEGE BAGLI: yukaridaki `assignment` kurali deger
  // yakalamasini `)` karakterinde durdurdugu icin buraya gelen metin
  // cogu zaman parantezsiz biter.
  //
  // Tirnak iceren cagrilar HARIC TUTULMAZ: `decrypt("...")` bicimindeki
  // bir literal gercek bir gomulu sir olabilir ve yakalanmalidir.
  if (/^[A-Za-z_$][\w$.]*\s*\([^"'`]*\)?$/.test(value)) return false;

  // SQL kolon referansi: `contains_secret = EXCLUDED.contains_secret`,
  // `password = NEW.password`, `token = t.token`. Bir kolonun BASKA BIR
  // KOLONA atanmasi sir degildir — deger tasimaz, ad tasir.
  if (/^(?:EXCLUDED|NEW|OLD|[A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return false;

  // SQL parametre yer tutucusu: $1, $12
  if (/^\$\d+$/.test(value)) return false;

  // Tip anotasyonu: `password: string`
  if (/^(?:string|number|boolean|any|unknown|null|undefined|true|false)$/i.test(value)) return false;

  // Sade tanimlayici (degisken adi): tek kelime, ozel karakter yok, dusuk entropi
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value) && shannonEntropy(value) < 3.2) return false;

  // Bilinen yer tutucular ve test degerleri.
  // Coklu kelimeli olanlar da yakalanmali: "your-token-here", "my_api_key_here".
  if (/^(?:x{3,}|<[^>]+>)$/i.test(value)) return false;
  if (/\b(?:placeholder|dummy|sample|changeme|redacted|example|fake|your|my)[_-]/i.test(value)) return false;
  if (/[_-](?:here|goes[_-]here|placeholder|example)$/i.test(value)) return false;
  if (/(?:REDACTED|PLACEHOLDER|EXAMPLE|SAMPLE|DUMMY|FAKE)/i.test(value)) return false;

  // Cok kisa degerler pratikte sir degildir
  if (value.length < 12) return false;

  // Gercek bir sir, uzunluguna gore makul entropi tasir
  return shannonEntropy(value) >= 3.0;
}

/** Shannon entropisi (bit/karakter). */
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);

  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Yüksek entropili dizi tespiti.
 *
 * Eski tarayıcıdaki `/([A-Za-z0-9+/]{40,})/g` kuralı her uzun dizeyi
 * sır sayıyordu: SHA-256 hash'leri, base64 gömülü içerik, hatta uzun
 * tanımlayıcılar. Bu, kanıt kayıtlarındaki meşru hash'leri de bozuyordu.
 *
 * Entropi eşiği ile ayrım yapılır: hex hash'ler düşük entropilidir
 * (~4 bit/karakter), rastgele token'lar yüksektir (>4.5).
 */
const HIGH_ENTROPY_CANDIDATE = /\b([A-Za-z0-9+/_-]{32,})\b/g;
const ENTROPY_THRESHOLD = 4.5;

/**
 * Maskeleme etiketi.
 *
 * Kurallar bu etiketleri YENİDEN EŞLEŞTİRMEMELİ. Aksi halde
 * `containsSecret(redactSecrets(x))` her zaman `true` döner ve
 * "maskeleme sonrası sır kalmadı" doğrulaması imkânsız hale gelir.
 */
const REDACTION_MARKER = /^\[REDACTED[A-Z_]*\]$/;

export function isRedactionMarker(value: string): boolean {
  return REDACTION_MARKER.test(value);
}

/** Sır olmadığı bilinen biçimler — yanlış pozitifi azaltır. */
function isKnownNonSecret(value: string): boolean {
  // Zaten maskelenmis deger
  if (isRedactionMarker(value)) return true;
  // Saf hex (git SHA, content hash, checksum)
  if (/^[0-9a-f]+$/i.test(value)) return true;
  // UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return true;
  // Tek karakter tekrarı veya çok az çeşitlilik
  if (new Set(value).size <= 4) return true;
  return false;
}

function maskPreview(value: string): string {
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 3)}${"*".repeat(Math.min(value.length - 6, 12))}${value.slice(-3)}`;
}

/**
 * Metni tarar ve bulguları döndürür. **Ham sır döndürmez.**
 */
export function scanForSecrets(text: string): SecretFinding[] {
  if (!text) return [];

  const findings: SecretFinding[] = [];
  const lines = text.split("\n");

  const record = (kind: SecretKind, value: string, absoluteIndex: number): void => {
    let consumed = 0;
    for (let i = 0; i < lines.length; i++) {
      const end = consumed + lines[i].length + 1;
      if (absoluteIndex < end) {
        findings.push({
          kind,
          line: i + 1,
          column: absoluteIndex - consumed + 1,
          length: value.length,
          preview: maskPreview(value)
        });
        return;
      }
      consumed = end;
    }
  };

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      const captured = m[rule.group] ?? m[0];
      // Zaten maskelenmis degerler yeniden bulgu uretmez.
      if (isRedactionMarker(captured)) {
        if (m[0].length === 0) rule.pattern.lastIndex++;
        continue;
      }
      // `assignment` kurali cok genis; degerin gercekten sir olup
      // olmadigini ayrica dogrula (aksi halde her `process.env.X`
      // referansi bulgu uretir).
      if (rule.kind === "assignment" && !looksLikeRealSecretValue(captured)) {
        if (m[0].length === 0) rule.pattern.lastIndex++;
        continue;
      }
      record(rule.kind, captured, m.index);
      if (m[0].length === 0) rule.pattern.lastIndex++;
    }
  }

  HIGH_ENTROPY_CANDIDATE.lastIndex = 0;
  let em: RegExpExecArray | null;
  while ((em = HIGH_ENTROPY_CANDIDATE.exec(text)) !== null) {
    const candidate = em[1];
    if (isKnownNonSecret(candidate)) continue;
    if (shannonEntropy(candidate) < ENTROPY_THRESHOLD) continue;
    record("high_entropy", candidate, em.index);
  }

  return findings;
}

/**
 * Sırları maskeler.
 *
 * `redactSecretLeaks` API'si korunur — ~20 çağrı noktası var — ama
 * implementasyon tamamen değişti: hiçbir gerçek sır kaynakta bulunmuyor.
 */
export function redactSecrets(text: string): string {
  if (!text) return "";

  let redacted = text;

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    redacted = redacted.replace(rule.pattern, (...args) => {
      const full = args[0] as string;
      const groups = args.slice(1, -2) as string[];
      const captured = groups[rule.group - 1] ?? full;

      if (isRedactionMarker(captured)) return full;
      if (rule.kind === "assignment" && !looksLikeRealSecretValue(captured)) return full;

      return rule.replacement(full, ...groups);
    });
  }

  // Yuksek entropili kalintilar
  HIGH_ENTROPY_CANDIDATE.lastIndex = 0;
  redacted = redacted.replace(HIGH_ENTROPY_CANDIDATE, (match, candidate: string) => {
    if (isKnownNonSecret(candidate)) return match;
    if (shannonEntropy(candidate) < ENTROPY_THRESHOLD) return match;
    return "[REDACTED_HIGH_ENTROPY]";
  });

  return redacted;
}

/** Metinde sır var mı? (dosya sınıflandırması için — P07 girdisi) */
export function containsSecret(text: string): boolean {
  return scanForSecrets(text).length > 0;
}

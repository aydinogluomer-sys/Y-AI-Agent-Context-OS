/**
 * P07 / Y-P07-001 — Glob dili ve SQL predicate derleyicisi (ADR-028).
 *
 * NEDEN GLOB'LAR SQL'E DERLENİYOR
 *   Üç seçenek vardı:
 *     (a) Aday listesini bellekte filtrelemek. KABUL EDİLEMEZ: DENY
 *         içeriğini zaten belleğe getirmiş olurdunuz. "Agent denied
 *         context'in içeriğini hiçbir aşamada almamalıdır" garantisi,
 *         içeriğin okunmasıyla birlikte kaybolur.
 *     (b) Her chunk için kernel çağrısı. N+1 ve yavaş; ayrıca aday
 *         listesinin kendisi zaten bir sızıntıdır (hangi dosyaların var
 *         olduğunu söyler).
 *     (c) Glob'ları SQL predicate'ine derleyip sorguya gömmek. SEÇİLEN.
 *
 *   Bedeli: glob dilinin ifade gücü, derlenebilir bir alt kümeyle
 *   sınırlıdır. `**`, `*`, `?` ve karakter sınıfları desteklenir; geri
 *   referans, alternasyon ve negatif lookahead DESTEKLENMEZ. Bu sınır
 *   bilinçlidir ve `assertSupportedGlob` tarafından zorlanır — sessizce
 *   yanlış eşleşen bir kural, olmayan bir kuraldan tehlikelidir.
 *
 * BÜYÜK/KÜÇÜK HARF: HER ZAMAN DUYARLI
 *   Platform bağımsızlığı için. Windows'ta `SECRETS/` ile `secrets/`
 *   aynı dizindir ama Linux'ta değildir. Duyarsız eşleşme, bir
 *   platformda çalışan bir DENY kuralının diğerinde çalışmaması demek
 *   olurdu; duyarlı eşleşme ise her yerde aynı davranır ve kural yazan
 *   kişi ne yazdığını bilir.
 */

export class GlobError extends Error {
  constructor(
    readonly code: "UNSUPPORTED_SYNTAX" | "EMPTY_PATTERN" | "TOO_COMPLEX",
    message: string
  ) {
    super(message);
    this.name = "GlobError";
  }
}

/** Bir glob'da izin verilen azami segment sayısı. DoS koruması. */
const MAX_SEGMENTS = 32;
/** Azami kural sayısı — predicate karmaşıklık sınırı. */
export const MAX_RULES_PER_EFFECT = 200;

/**
 * Desteklenmeyen sözdizimini reddeder.
 *
 * SESSİZCE YOK SAYMAK YERİNE HATA: `!(foo|bar)` gibi bir kalıp
 * derlenemez. Onu kısmen eşleştirmek, kural yazan kişinin yazdığını
 * sandığı kuraldan farklı bir kural uygulamak demektir.
 */
export function assertSupportedGlob(pattern: string): void {
  if (pattern.trim().length === 0) {
    throw new GlobError("EMPTY_PATTERN", "Bos glob kalibi gecersiz.");
  }
  if (/[{}()|!+@]/.test(pattern)) {
    throw new GlobError(
      "UNSUPPORTED_SYNTAX",
      `Desteklenmeyen glob sozdizimi: '${pattern}'. ` +
        `Alternasyon, negasyon ve extglob DESTEKLENMEZ (ADR-028): bu kaliplar ` +
        `SQL predicate'ine derlenemez ve kismi eslesme yanlis kural uygular.`
    );
  }
  if (pattern.split("/").length > MAX_SEGMENTS) {
    throw new GlobError("TOO_COMPLEX", `Glob ${MAX_SEGMENTS} segmentten uzun olamaz.`);
  }
}

/**
 * Glob → regex.
 *
 * `**` çoklu segment (dizin sınırı geçer), `*` tek segment (geçmez).
 * Bu ayrım kritik: `src/*` ile `src/**` farklı kurallardır ve karışırsa
 * bir DENY beklenenden dar ya da geniş olur.
 */
export function globToRegExp(pattern: string): RegExp {
  assertSupportedGlob(pattern);
  return new RegExp(`^${globToRegExpSource(pattern)}$`);
}

export function globToRegExpSource(pattern: string): string {
  let out = "";
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === "*") {
      const isDouble = pattern[i + 1] === "*";
      if (isDouble) {
        // `src/**/x` -> `src/(?:.*/)?x`: sifir veya daha cok segment.
        // `src/**` -> `src/.*`
        if (pattern[i + 2] === "/") {
          out += "(?:[^/]*/)*";
          i += 3;
          continue;
        }
        out += ".*";
        i += 2;
        continue;
      }
      // Tek yildiz dizin sinirini GECMEZ.
      out += "[^/]*";
      i += 1;
      continue;
    }

    if (char === "?") {
      out += "[^/]";
      i += 1;
      continue;
    }

    if (char === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close === -1) {
        // Kapanmamis karakter sinifi: literal koseli parantez.
        out += "\\[";
        i += 1;
        continue;
      }
      const body = pattern.slice(i + 1, close);
      // `!` negasyonu regex'te `^` olur ama `/` disarida kalmali.
      const negated = body.startsWith("!") || body.startsWith("^");
      const inner = negated ? body.slice(1) : body;
      out += `[${negated ? "^/" : ""}${inner.replace(/\\/g, "\\\\")}]`;
      i = close + 1;
      continue;
    }

    out += escapeRegExp(char);
    i += 1;
  }

  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Glob → SQL `LIKE` kalıbı.
 *
 * `LIKE` glob'un tamamını ifade edemez (tek segment `*` ile çoklu segment
 * `**` arasındaki farkı taşıyamaz). Bu yüzden `LIKE` yalnız KABA BİR
 * ÖN ELEME'dir; kesin eşleşme `~` (POSIX regex) ile yapılır.
 *
 * Neden ikisi birden: `LIKE` prefix'i indeks kullanabilir ve satırların
 * çoğunu ucuza eler; regex ise doğru sonucu garanti eder. Yalnız regex
 * kullanmak her satırı taramak demek olurdu.
 */
export function globToLikePattern(pattern: string): string {
  assertSupportedGlob(pattern);

  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      out += "%";
      // `**` tek bir `%` olur; ust uste `%%` gereksiz.
      if (pattern[i + 1] === "*") i++;
      continue;
    }
    if (char === "?") {
      out += "_";
      continue;
    }
    // LIKE ozel karakterleri kacirilir; aksi halde kullanicinin yazdigi
    // `%` bir joker olur ve kural beklenenden genis calisir.
    if (char === "%" || char === "_" || char === "\\") {
      out += `\\${char}`;
      continue;
    }
    out += char;
  }
  return out;
}

/** Tek bir yolun glob'a uyup uymadığı (bellek içi kontrol). */
export function matchesGlob(path: string, pattern: string): boolean {
  return globToRegExp(pattern).test(path);
}

/**
 * Bir glob'un "özgüllüğü" — çakışan kurallarda hangisinin kazanacağını
 * belirler.
 *
 * En uzun/en belirli eşleşme kazanır: `src/auth/**` kuralı `src/**`
 * kuralından daha özgüldür. Ölçüt segment sayısı ve joker olmayan
 * karakter sayısıdır. İki kural aynı özgüllükteyse etki önceliği
 * (`deny > approval > allow`) karar verir.
 */
export function globSpecificity(pattern: string): number {
  const segments = pattern.split("/").length;
  const literals = pattern.replace(/[*?[\]]/g, "").length;
  const doubleStars = (pattern.match(/\*\*/g) ?? []).length;
  // `**` ozgullugu DUSURUR: ne kadar cok varsa kural o kadar genistir.
  return segments * 10 + literals - doubleStars * 15;
}

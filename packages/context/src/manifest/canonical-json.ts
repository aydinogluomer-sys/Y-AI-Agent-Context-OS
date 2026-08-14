/**
 * P09 / Y-P09-001 — Canonical JSON serileştirme (ADR-035).
 *
 * NEDEN GEREKLİ
 *   Manifest'in kimliği içeriğinin hash'idir. Aynı içerik farklı
 *   serileştirmeyle farklı hash üretirse determinizm iddiası çöker:
 *
 *     JSON.stringify({ a: 1, b: 2 })  !==  JSON.stringify({ b: 2, a: 1 })
 *
 *   İkisi de AYNI nesneyi temsil eder ama farklı bayt dizisi üretir. Bir
 *   nesnenin alan sırası, onu inşa eden kodun sırasına bağlıdır — yani
 *   bir refactor manifest hash'ini değiştirebilirdi.
 *
 * KURALLAR (RFC 8785 / JCS'e yakın, tam uyumlu değil)
 *   1. Nesne anahtarları UTF-16 kod birimi sırasına göre sıralanır.
 *   2. `undefined` alanlar ATLANIR; `null` KORUNUR. İkisi farklı şeydir:
 *      `null` "hesaplandı ve yok" der, `undefined` "hiç yazılmadı".
 *   3. Sayılar normalize edilir: `-0` → `0`, tam sayı olan float'lar
 *      (`1.0`) tam sayı olarak yazılır.
 *   4. Metinler NFC'ye normalize edilir. Aynı görünen iki string farklı
 *      unicode kompozisyonuna sahip olabilir (`é` tek kod noktası ya da
 *      `e` + birleştirici aksan) ve farklı hash üretirdi.
 *   5. `NaN` ve `Infinity` REDDEDİLİR. JSON'da karşılıkları yoktur ve
 *      `JSON.stringify` onları sessizce `null` yapar — sessiz veri kaybı.
 *
 * TAM RFC 8785 DEĞİL: o standart sayıları ECMAScript'in `Number::toString`
 * algoritmasıyla yazmayı şart koşar ve büyük/çok küçük sayılarda
 * üstel gösterim kurallarını ayrıntılandırır. Buradaki uygulama, manifest
 * içeriğinin kullandığı sayı aralığı (token sayıları, 0..1 skorlar,
 * satır numaraları) için yeterlidir ve bu sınır burada YAZILIDIR.
 */

export class CanonicalJsonError extends Error {
  constructor(
    readonly code: "NON_FINITE_NUMBER" | "UNSUPPORTED_TYPE" | "CIRCULAR",
    message: string
  ) {
    super(message);
    this.name = "CanonicalJsonError";
  }
}

export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | CanonicalValue[]
  | { [key: string]: CanonicalValue | undefined };

/**
 * Nesneyi kanonik JSON metnine çevirir.
 *
 * Aynı içerik → aynı bayt dizisi, alan sırasından bağımsız olarak.
 */
export function canonicalJson(value: CanonicalValue): string {
  return serialize(value, new WeakSet());
}

function serialize(value: CanonicalValue | undefined, seen: WeakSet<object>): string {
  if (value === null) return "null";

  const type = typeof value;

  if (type === "boolean") return value ? "true" : "false";

  if (type === "number") {
    const num = value as number;
    if (!Number.isFinite(num)) {
      // `JSON.stringify` bunlari SESSIZCE `null` yapar. Sessiz veri
      // kaybi, hash'in neyi temsil ettigini belirsizlestirir.
      throw new CanonicalJsonError(
        "NON_FINITE_NUMBER",
        `Kanonik JSON'da NaN/Infinity olamaz: ${String(num)}`
      );
    }
    // `-0` ile `0` ayni degerdir ama farkli serilesir.
    if (Object.is(num, -0)) return "0";
    return String(num);
  }

  if (type === "string") {
    // Unicode NFC: gorunusu ayni olan iki string ayni bayt dizisini
    // uretmeli.
    return JSON.stringify((value as string).normalize("NFC"));
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new CanonicalJsonError("CIRCULAR", "Dairesel referans serilestirilemez.");
    }
    seen.add(value);
    // Dizide `undefined` `null` olur: dizi UZUNLUGU anlamlidir ve
    // eleman atlamak indeksleri kaydirirdi.
    const items = value.map((item) => serialize(item === undefined ? null : item, seen));
    seen.delete(value);
    return `[${items.join(",")}]`;
  }

  if (type === "object") {
    const obj = value as Record<string, CanonicalValue | undefined>;
    if (seen.has(obj)) {
      throw new CanonicalJsonError("CIRCULAR", "Dairesel referans serilestirilemez.");
    }
    seen.add(obj);

    const parts: string[] = [];
    // Anahtar sirasi UTF-16 kod birimi sirasina gore SABIT.
    for (const key of Object.keys(obj).sort()) {
      const child = obj[key];
      // `undefined` ATLANIR, `null` KORUNUR: ikisi farkli seydir.
      if (child === undefined) continue;
      parts.push(`${JSON.stringify(key.normalize("NFC"))}:${serialize(child, seen)}`);
    }

    seen.delete(obj);
    return `{${parts.join(",")}}`;
  }

  throw new CanonicalJsonError(
    "UNSUPPORTED_TYPE",
    `Kanonik JSON'da desteklenmeyen tur: ${type}. Fonksiyon, Symbol ve BigInt ` +
      `serilestirilemez; bunlarin JSON karsiligi yoktur.`
  );
}

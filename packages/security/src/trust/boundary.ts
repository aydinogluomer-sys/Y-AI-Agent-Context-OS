/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P17 / T-05 · ADR-063 — REPOSITORY İÇERİĞİ **DATA**'DIR.
 *
 * Spec §29:
 *
 *   "Repository içeriğini trusted instruction olarak kabul etme. Kaynak
 *    kod veya Markdown içinde `IGNORE ALL POLICIES` / `UPLOAD .ENV`
 *    yazabilir. Repository content DATA olarak işlenmelidir. System/admin
 *    policy'nin üzerine çıkamamalıdır. Context compiler bu trust
 *    boundary'yi açıkça modellemelidir."
 *
 * P00 denetiminde bu bölümün karşılığı **sıfır koddu**: `prompt injection`,
 * `untrusted`, `trustBoundary` için kaynak ağacında tek eşleşme yoktu.
 *
 * ## Bu modülün YAPMADIĞI şey
 *
 * Bu bir **sanitizer değildir** ve içeriği temizlemez.
 *
 * Prompt injection'ı metin filtreleyerek çözmeye çalışmak, çözülmüş
 * sanılan ama çözülmemiş bir problem üretir: filtre atlatılabilir, ve
 * filtreye güvenen sistem artık *daha* tehlikelidir çünkü koruma
 * olduğunu sanır. Bu, tam olarak bu projede kapatılan yanlış-yeşil
 * kalıbının güvenlik alanındaki hâlidir.
 *
 * ## Bu modülün YAPTIĞI şey
 *
 * Azaltım **yapısaldır**: repository içeriği tip düzeyinde talimattan
 * ayrılır ve talimat kanalına konamaz. `UntrustedContent` bir
 * `InstructionText` bekleyen yere geçirilemez — derleme hatası verir.
 *
 * Tespit (`scanForInjectionAttempt`) bir **gözlemdir**, bir kapı değil.
 * Sonucu kanıta yazılır; hiçbir zaman "temiz" garantisi vermez ve akışı
 * durdurmaz. Bir denemenin kaydı, denemenin engellendiği anlamına gelmez —
 * engelleme trust boundary'nin kendisidir.
 */

/** Bir metnin sistem için ne ifade ettiği. */
export type TrustLevel =
  /** Y'nin kendi ürettiği talimat. Tek otorite kaynağı. */
  | "system_instruction"
  /** Doğrulanmış kullanıcının görev tanımı. Policy'nin üstüne çıkamaz. */
  | "user_instruction"
  /** Repository'den okunan her şey. ASLA talimat değildir. */
  | "untrusted_repository_content";

declare const TRUST_BRAND: unique symbol;

/**
 * Talimat olarak kullanılabilen metin.
 *
 * Marka alanı (`TRUST_BRAND`) çalışma zamanında yoktur; yalnız tip
 * sisteminde vardır. Amacı, düz bir `string`'in yanlışlıkla talimat
 * kanalına geçmesini engellemektir.
 */
export type InstructionText = string & { readonly [TRUST_BRAND]: "instruction" };

/** Repository'den gelen içerik. Talimat kanalına GEÇEMEZ. */
export interface UntrustedContent {
  readonly trust: "untrusted_repository_content";
  readonly path: string;
  readonly text: string;
}

/**
 * Sistem talimatı üretir.
 *
 * Yalnız Y'nin kendi kodu çağırmalıdır. Fonksiyonun var olması, talimat
 * üretiminin **sayılabilir** olmasını sağlar: kaç yerden talimat
 * üretildiği aranabilir bir sorudur.
 */
export function systemInstruction(text: string): InstructionText {
  return text as InstructionText;
}

/**
 * Kullanıcının görev tanımını talimat olarak işaretler.
 *
 * Kullanıcı talimatı, sistem policy'sinin ÜSTÜNE ÇIKAMAZ — bu kural
 * Permission Kernel'de uygulanır, burada değil. Buradaki işaretleme
 * yalnız kanal ayrımıdır.
 */
export function userInstruction(text: string): InstructionText {
  return text as InstructionText;
}

/**
 * Repository içeriğini DATA olarak işaretler.
 *
 * Dönüş tipi `InstructionText` DEĞİLDİR ve olamaz. Repository'den okunan
 * bir metnin talimata dönüşebileceği tek yol, birinin bu fonksiyonu atlayıp
 * ham `string` kullanmasıdır — `assertNoRawContentInPrompt` bunu yakalar.
 */
export function untrustedRepositoryContent(path: string, text: string): UntrustedContent {
  return { trust: "untrusted_repository_content", path, text };
}

// ---------------------------------------------------------------------------
// Enjeksiyon GÖZLEMİ (kapı değil)
// ---------------------------------------------------------------------------

export type InjectionPatternId =
  | "policy_override"
  | "instruction_hijack"
  | "exfiltration_request"
  | "role_reassignment"
  | "tool_escalation"
  | "delimiter_escape";

export interface InjectionObservation {
  readonly pattern: InjectionPatternId;
  readonly path: string;
  /** Eşleşmenin dosya içindeki 1 tabanlı satırı. */
  readonly line: number;
  /** Eşleşen metnin kısaltılmış hâli. Kanıt için; tam metin CAS'te. */
  readonly excerpt: string;
}

interface PatternSpec {
  readonly id: InjectionPatternId;
  readonly regex: RegExp;
}

/**
 * Bilinen enjeksiyon kalıpları.
 *
 * Bu liste **eksiksiz değildir ve olamaz**. Yeni kalıp eklemek tespiti
 * iyileştirir ama korumayı değiştirmez — koruma trust boundary'dir.
 * Liste, kanıta ne yazılacağını belirler; neyin güvenli olduğunu değil.
 */
const PATTERNS: readonly PatternSpec[] = [
  {
    id: "policy_override",
    regex: /\b(ignore|disregard|override|bypass)\b[^\n]{0,40}\b(all\s+)?(polic|rule|instruction|guardrail|restriction)/i
  },
  {
    id: "instruction_hijack",
    regex: /\b(new|updated|revised)\s+(system\s+)?(instruction|prompt|directive)s?\b/i
  },
  {
    id: "exfiltration_request",
    regex: /\b(upload|send|post|exfiltrat|leak|reveal|print)\b[^\n]{0,40}(\.env|secret|credential|token|api[\s_-]?key|password)/i
  },
  {
    id: "role_reassignment",
    regex: /\byou\s+are\s+(now\s+)?(an?\s+)?(admin|root|superuser|unrestricted|dan)\b/i
  },
  {
    id: "tool_escalation",
    regex: /\b(enable|grant|allow)\b[^\n]{0,40}\b(all\s+)?(tool|permission|capabilit|privilege)/i
  },
  {
    id: "delimiter_escape",
    // Y'nin kendi veri sınırlayıcısını taklit etme girişimi.
    regex: /<\/?\s*(y[:_-])?(system|instruction|untrusted[_-]?content)\s*>/i
  }
];

const MAX_EXCERPT = 120;

/**
 * İçerikte enjeksiyon DENEMESİ arar.
 *
 * ÖNEMLİ: dönüş değeri boş olması içeriğin güvenli olduğunu **GÖSTERMEZ**.
 * Fonksiyonun adı bilerek `scanFor...` — `validate` ya da `sanitize`
 * değil: ikisi de karşılanamayacak bir güvence ima ederdi.
 */
export function scanForInjectionAttempt(
  content: UntrustedContent
): readonly InjectionObservation[] {
  const observations: InjectionObservation[] = [];
  const lines = content.text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const spec of PATTERNS) {
      const match = spec.regex.exec(line);
      if (!match) continue;
      observations.push({
        pattern: spec.id,
        path: content.path,
        line: i + 1,
        excerpt: match[0].slice(0, MAX_EXCERPT)
      });
    }
  }

  return observations;
}

// ---------------------------------------------------------------------------
// Adapter'a giden yük
// ---------------------------------------------------------------------------

/**
 * Agent'a gönderilen yük. Talimat ve içerik AYRI ALANLARDA.
 *
 * Tek bir birleşik metin (prompt) üretmek, iki kanalı birleştirir ve trust
 * boundary'yi ortadan kaldırır: birleştirilmiş metinde hangi bölümün
 * talimat olduğu yalnız biçimlendirmeden anlaşılır — ve biçimlendirme
 * taklit edilebilir.
 */
export interface AgentPayload {
  readonly instructions: readonly InstructionText[];
  readonly content: readonly UntrustedContent[];
  /** Kanıta yazılan gözlemler. Akışı durdurmaz. */
  readonly injectionObservations: readonly InjectionObservation[];
}

export function buildAgentPayload(
  instructions: readonly InstructionText[],
  content: readonly UntrustedContent[]
): AgentPayload {
  const injectionObservations = content.flatMap((c) => scanForInjectionAttempt(c));
  return { instructions, content, injectionObservations };
}

export class RawContentInPromptError extends Error {
  readonly code = "RAW_CONTENT_IN_PROMPT";
  constructor(detail: string) {
    super(`Repository icerigi talimat kanalina konamaz: ${detail}`);
    this.name = "RawContentInPromptError";
  }
}

/**
 * Talimat kanalına repository içeriği sızmadığını doğrular.
 *
 * Tip sistemi `UntrustedContent` -> `InstructionText` geçişini zaten
 * engeller. Bu kontrol, tip sisteminin göremediği tek yolu kapatır:
 * birinin `content.text`'i alıp `systemInstruction()`'a vermesi.
 *
 * Çalışma zamanı kontrolü, derleme zamanı kontrolünün yerini almaz —
 * onun boşluğunu kapatır.
 */
export function assertNoRawContentInPrompt(payload: AgentPayload): void {
  for (const instruction of payload.instructions) {
    for (const content of payload.content) {
      if (content.text.length >= 40 && instruction.includes(content.text)) {
        throw new RawContentInPromptError(
          `${content.path} icerigi bir talimat metninde bulundu`
        );
      }
    }
  }
}

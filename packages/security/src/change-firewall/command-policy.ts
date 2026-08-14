/**
 * P10 / Y-P10-004 — Komut politikası (T-22: command injection).
 *
 * NEDEN AYRI BİR POLİTİKA
 *   Change Firewall dosya yazımını kontrol eder. Ama bir agent dosya
 *   yazmadan da zarar verebilir: `rm -rf`, `git push --force`,
 *   `curl | sh`. Bu komutlar dosya sistemine yazmaz ama sonuçları
 *   dosya yazmaktan ağırdır.
 *
 * ALLOWLIST, DENYLIST DEĞİL
 *   Yasaklı komut listesi tutmak, bilinen kötüleri sayıp geri kalanı
 *   serbest bırakmaktır — ve yeni bir kötü her zaman vardır. İzin
 *   verilen komutları saymak, bilinmeyeni varsayılan olarak reddeder.
 *
 *   Bedeli: meşru ama listede olmayan bir komut engellenir. Bu bedel
 *   kabul edilebilir çünkü çözümü bellidir (listeye ekle) ve karar
 *   insana ait.
 *
 * KABUK YORUMLAMASI ENGELLENİR
 *   `git log; rm -rf /` tek bir "komut" gibi görünür ama iki komuttur.
 *   Argümanlarda kabuk metakarakteri bulunması REDDEDİLİR — komutlar
 *   `execFile` ile, kabuk olmadan çalıştırılmalıdır (P03'te git için
 *   alınan kararın aynısı).
 */

export type CommandDecision = "ALLOW" | "DENY";

export interface CommandPolicy {
  /** İzin verilen komut adları (argüman değil, yalnız program adı). */
  readonly allowedCommands: readonly string[];
  /** Argümanlarda aranmayacak kalıplar — allowlist'e ek savunma. */
  readonly deniedArgumentPatterns: readonly string[];
}

export interface CommandRequest {
  readonly command: string;
  readonly args: readonly string[];
}

export interface CommandDecisionResult {
  readonly decision: CommandDecision;
  readonly reason: string;
  readonly ruleMatched: string;
}

/**
 * Varsayılan politika.
 *
 * Yalnızca okuma ve yerel doğrulama komutları. `git push`, `npm publish`,
 * `docker` ve `kubectl` BİLEREK yok: bunlar dış dünyaya etki eder ve bir
 * agent'ın onaysız erişmemesi gereken sınırdır.
 */
export const DEFAULT_COMMAND_POLICY: CommandPolicy = {
  allowedCommands: ["git", "node", "npm", "npx", "pnpm", "yarn", "tsc", "vitest", "jest", "eslint", "prettier"],
  deniedArgumentPatterns: [
    // Kabuk metakarakterleri: komut zincirleme.
    "[;&|`$()]",
    // Yikici git islemleri.
    "^--force$",
    "^--hard$",
    "^push$",
    // Uzaktan kod calistirma.
    "^https?://",
    // Kok dizin islemleri.
    "^/$",
    "^-rf?$"
  ]
};

export function decideCommand(
  policy: CommandPolicy,
  request: CommandRequest
): CommandDecisionResult {
  const command = request.command.trim();

  if (command.length === 0) {
    return { decision: "DENY", reason: "Bos komut.", ruleMatched: "empty_command" };
  }

  // Komut adinda yol ayraci olmasi, allowlist'i baypas etme girisimidir:
  // `/usr/bin/git` ile `git` ayni sey degildir ve `./git` hic degildir.
  if (/[/\\]/.test(command)) {
    return {
      decision: "DENY",
      reason:
        "Komut adinda yol ayraci var. Yol vererek allowlist baypas edilebilirdi " +
        "(`./git` calistirmak `git` calistirmak degildir).",
      ruleMatched: "path_in_command_name"
    };
  }

  if (!policy.allowedCommands.includes(command)) {
    return {
      decision: "DENY",
      reason:
        `'${command}' izin verilen komut listesinde yok. Liste ALLOWLIST'tir: ` +
        `bilinmeyen komut varsayilan olarak reddedilir.`,
      ruleMatched: "not_in_allowlist"
    };
  }

  for (const arg of request.args) {
    for (const pattern of policy.deniedArgumentPatterns) {
      if (new RegExp(pattern).test(arg)) {
        return {
          decision: "DENY",
          reason: `Argumanda yasakli kalip: '${arg}' (kural: ${pattern}).`,
          ruleMatched: `denied_argument:${pattern}`
        };
      }
    }
  }

  return {
    decision: "ALLOW",
    reason: `'${command}' izin verilen komut; argumanlarda yasakli kalip yok.`,
    ruleMatched: "allowlist_match"
  };
}

/**
 * Komutun kabuk olmadan çalıştırılabilir olduğunu doğrular.
 *
 * `execFile` kullanımı zorunludur; `exec` kabuk açar ve argümanlardaki
 * metakarakterler yorumlanır. Bu fonksiyon çağıran tarafın hangi API'yi
 * kullandığını bilemez — ama argümanların kabuk gerektirmediğini
 * doğrulayabilir.
 */
export function assertNoShellNeeded(request: CommandRequest): void {
  for (const arg of request.args) {
    if (/[;&|`$()<>]/.test(arg)) {
      throw new Error(
        `Arguman kabuk metakarakteri iceriyor: '${arg}'. Komutlar execFile ile, ` +
          `kabuk OLMADAN calistirilmalidir (T-22).`
      );
    }
  }
}

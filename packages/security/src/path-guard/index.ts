/**
 * P03 / Y-P03-002 — PathGuard.
 *
 * `packages/core/src/repo-adapter.ts:112-158` içindeki path güvenliği
 * mantığı buraya ayrıştırıldı. Mantık P00 audit'inde **REAL** verdict'i
 * almıştı (realpath containment + symlink escape + denylist + boyut limiti);
 * amaç davranışı değiştirmek değil, tek bir yerde toplayıp test kapsamını
 * genişletmek.
 *
 * Neden ayrı paket: bu koruma yalnız repo adapter'ında değil, Context
 * Firewall (P07), Change Firewall (P10) ve quality gate sandbox'ında (P14)
 * da gerekli. Kopyalanan güvenlik kodu, sapan güvenlik kodudur.
 *
 * Kapsanan tehditler: T-03 (path traversal), T-04 (symlink escape).
 */

import * as fs from "fs";
import * as path from "path";

/** Hiçbir koşulda okunmayacak dosya adları. */
export const DENIED_BASENAMES: readonly string[] = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.example",
  "secrets.json",
  "credentials.json",
  "id_rsa",
  "id_ed25519",
  ".npmrc",
  ".netrc",
  ".pgpass"
];

/** Hiçbir koşulda okunmayacak uzantılar. */
export const DENIED_EXTENSIONS: readonly string[] = [".pem", ".key", ".pfx", ".p12", ".keystore", ".jks"];

/** İçeriği ürün açısından anlamsız olan dizinler. */
export const DENIED_DIRECTORIES: readonly string[] = [
  "node_modules",
  "dist",
  "build",
  ".next",
  "out",
  "target",
  ".git",
  "vendor",
  "__pycache__",
  ".venv"
];

export type PathRejectionReason =
  | "ABSOLUTE_PATH"
  | "TRAVERSAL"
  | "ESCAPES_ROOT"
  | "DENIED_BASENAME"
  | "DENIED_EXTENSION"
  | "DENIED_DIRECTORY"
  | "SYMLINK_ESCAPE"
  | "ROOT_UNRESOLVABLE";

export type PathCheck =
  | { readonly ok: true; readonly absolutePath: string; readonly relativePath: string }
  | { readonly ok: false; readonly reason: PathRejectionReason; readonly detail: string };

export function isPathAllowed(check: PathCheck): check is Extract<PathCheck, { ok: true }> {
  return check.ok === true;
}

export interface PathGuardOptions {
  /** Ek olarak reddedilecek basename'ler. */
  readonly extraDeniedBasenames?: readonly string[];
  /** Denylist'i devre dışı bırakma seçeneği YOKTUR — bilinçli. */
  readonly allowDotGit?: never;
}

/**
 * Bir göreli yolu, verilen kök altında güvenli mutlak yola çözer.
 *
 * Sıra önemlidir:
 *   1. Ucuz sözdizimsel kontroller (mutlak yol, `..`, denylist),
 *   2. Kökün realpath'i,
 *   3. Hedefin realpath'i (var olan en yakın atadan yukarı doğru),
 *   4. Containment kontrolü.
 *
 * (3) olmadan symlink kaçışı yakalanmaz: `repo/link -> /etc` yolunda
 * `path.resolve` hâlâ kök altında görünür.
 */
export class PathGuard {
  private readonly deniedBasenames: Set<string>;

  constructor(
    private readonly root: string,
    options: PathGuardOptions = {}
  ) {
    this.deniedBasenames = new Set([
      ...DENIED_BASENAMES.map((b) => b.toLowerCase()),
      ...(options.extraDeniedBasenames ?? []).map((b) => b.toLowerCase())
    ]);
  }

  check(relativePath: string): PathCheck {
    if (typeof relativePath !== "string" || relativePath.length === 0) {
      return { ok: false, reason: "TRAVERSAL", detail: "Bos yol." };
    }

    // Windows ve POSIX ayraclarini normalize et.
    const normalizedInput = relativePath.replace(/\\/g, "/");

    if (path.isAbsolute(normalizedInput) || /^[A-Za-z]:/.test(normalizedInput)) {
      return { ok: false, reason: "ABSOLUTE_PATH", detail: relativePath };
    }

    // `..` segmenti — normalize etmeden ONCE reddet. Normalize edip sonra
    // kontrol etmek, kodlanmis varyantlari kacirabilir.
    const segments = normalizedInput.split("/").filter((s) => s.length > 0 && s !== ".");
    if (segments.includes("..")) {
      return { ok: false, reason: "TRAVERSAL", detail: relativePath };
    }

    const basename = segments[segments.length - 1] ?? "";
    if (this.deniedBasenames.has(basename.toLowerCase())) {
      return { ok: false, reason: "DENIED_BASENAME", detail: basename };
    }

    const ext = path.extname(basename).toLowerCase();
    if (ext && DENIED_EXTENSIONS.includes(ext)) {
      return { ok: false, reason: "DENIED_EXTENSION", detail: ext };
    }

    for (const segment of segments.slice(0, -1)) {
      if (DENIED_DIRECTORIES.includes(segment)) {
        return { ok: false, reason: "DENIED_DIRECTORY", detail: segment };
      }
    }

    // --- Gerçek dosya sistemi kontrolleri ---

    let realRoot: string;
    try {
      realRoot = fs.realpathSync(this.root);
    } catch (err) {
      return {
        ok: false,
        reason: "ROOT_UNRESOLVABLE",
        detail: err instanceof Error ? err.message : String(err)
      };
    }

    const candidate = path.resolve(realRoot, ...segments);

    // Hedef henüz yoksa (yazma senaryosu) var olan en yakın atayı çöz.
    const realCandidate = this.resolveNearestReal(candidate);
    if (realCandidate === null) {
      return { ok: false, reason: "ESCAPES_ROOT", detail: candidate };
    }

    const relative = path.relative(realRoot, realCandidate);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      // Buraya duşmenin tipik sebebi symlink kacisidir.
      return {
        ok: false,
        reason: realCandidate === candidate ? "ESCAPES_ROOT" : "SYMLINK_ESCAPE",
        detail: realCandidate
      };
    }

    return {
      ok: true,
      absolutePath: candidate,
      relativePath: segments.join("/")
    };
  }

  /**
   * `candidate` var ise realpath'ini, yoksa var olan en yakın atasının
   * realpath'ine kalan parçayı ekleyerek döndürür.
   */
  private resolveNearestReal(candidate: string): string | null {
    let current = candidate;
    const trailing: string[] = [];

    for (let depth = 0; depth < 64; depth++) {
      try {
        const real = fs.realpathSync(current);
        return trailing.length > 0 ? path.join(real, ...trailing.reverse()) : real;
      } catch {
        const parent = path.dirname(current);
        if (parent === current) return null;
        trailing.push(path.basename(current));
        current = parent;
      }
    }
    return null;
  }
}

/** Bir dosyanın binary olup olmadığını ilk baytlara bakarak belirler. */
export function isBinaryBuffer(buffer: Buffer, sampleSize = 512): boolean {
  const limit = Math.min(buffer.length, sampleSize);
  for (let i = 0; i < limit; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

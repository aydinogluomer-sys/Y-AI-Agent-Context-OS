/**
 * P03 / Y-P03-004 — Git repository işlemleri.
 *
 * `git-cli.ts` üzerindeki ince, tip güvenli katman. Buradaki her fonksiyon
 * P00'da **ABSENT** verdict'i almış bir yeteneği karşılar:
 *
 *   currentCommit()  <- `getChangedFiles()` E_UNSUPPORTED donuyordu
 *   diff()           <- iki string'i satir satir karsilastiriyordu
 *   changedFiles()   <- hic yoktu
 *   log()            <- hic yoktu (P08'in `recent_diffs` alani UYDURMAYDI)
 */

import * as path from "path";
import { runGit, assertValidRef, assertSafeRemoteUrl, GitCommandError, type GitRunOptions } from "./git-cli";

export interface CommitInfo {
  readonly sha: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly committedAt: string;
  readonly subject: string;
}

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "copied" | "type_changed" | "unknown";

export interface ChangedFile {
  readonly path: string;
  readonly status: ChangeStatus;
  readonly previousPath: string | null;
  readonly insertions: number;
  readonly deletions: number;
}

const STATUS_MAP: Record<string, ChangeStatus> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type_changed"
};

/** Kayıt ayracı olarak NUL kullanılır: dosya adlarında yeni satır olabilir. */
const RECORD_SEP = "\0";

export class GitRepository {
  constructor(private readonly workdir: string) {}

  private opts(extra?: Partial<GitRunOptions>): GitRunOptions {
    return { cwd: this.workdir, ...extra };
  }

  /** Bu dizin bir git çalışma ağacı mı? */
  async isRepository(): Promise<boolean> {
    try {
      const { stdout } = await runGit("rev-parse", ["--is-inside-work-tree"], this.opts());
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  }

  async currentCommit(): Promise<string> {
    const { stdout } = await runGit("rev-parse", ["HEAD"], this.opts());
    return stdout.trim();
  }

  async currentBranch(): Promise<string | null> {
    try {
      const { stdout } = await runGit("symbolic-ref", ["--short", "HEAD"], this.opts());
      return stdout.trim() || null;
    } catch {
      // Detached HEAD durumunda symbolic-ref basarisiz olur — hata degil.
      return null;
    }
  }

  /** Çalışma ağacındaki değişiklikler (porcelain v1, NUL ayraçlı). */
  async status(): Promise<{ path: string; index: string; worktree: string }[]> {
    const { stdout } = await runGit("status", ["--porcelain=v1", "-z"], this.opts());
    const out: { path: string; index: string; worktree: string }[] = [];

    for (const entry of stdout.split(RECORD_SEP)) {
      if (entry.length < 4) continue;
      out.push({
        index: entry[0],
        worktree: entry[1],
        path: entry.slice(3)
      });
    }
    return out;
  }

  /**
   * İki ref arasında değişen dosyalar — satır sayılarıyla.
   *
   * P08'in `recent_diffs` alanı bu veriden üretilecek. Önceki hali
   * `{ author: "User-Aydinoglu", line_changes: "+45 -12" }` biçiminde
   * UYDURMAYDI ve git'e hiç bakmıyordu (ADR-032).
   */
  async changedFiles(fromRef: string, toRef = "HEAD"): Promise<ChangedFile[]> {
    assertValidRef(fromRef, "fromRef");
    assertValidRef(toRef, "toRef");

    const { stdout: nameStatus } = await runGit(
      "diff",
      ["--name-status", "-z", "--find-renames", `${fromRef}`, `${toRef}`],
      this.opts()
    );

    const statuses = parseNameStatusZ(nameStatus);

    const { stdout: numstat } = await runGit(
      "diff",
      ["--numstat", "-z", "--find-renames", `${fromRef}`, `${toRef}`],
      this.opts()
    );
    const counts = parseNumstatZ(numstat);

    return statuses.map((s) => {
      const c = counts.get(s.path) ?? { insertions: 0, deletions: 0 };
      return { ...s, insertions: c.insertions, deletions: c.deletions };
    });
  }

  /** Ham unified diff. */
  async diff(fromRef: string, toRef = "HEAD", filePath?: string): Promise<string> {
    assertValidRef(fromRef, "fromRef");
    assertValidRef(toRef, "toRef");

    const args = ["--no-color", fromRef, toRef];
    if (filePath !== undefined) {
      // `--` ayraci: bundan sonrasi kesin olarak yol, flag degil.
      args.push("--", filePath);
    }
    const { stdout } = await runGit("diff", args, this.opts());
    return stdout;
  }

  /** Commit geçmişi. */
  async log(options: { maxCount?: number; filePath?: string; since?: string } = {}): Promise<CommitInfo[]> {
    const format = ["%H", "%an", "%ae", "%aI", "%s"].join("%x1f");
    const args = [`--format=${format}`, "-z"];

    if (options.maxCount !== undefined) {
      if (!Number.isInteger(options.maxCount) || options.maxCount <= 0 || options.maxCount > 10_000) {
        throw new RangeError("maxCount 1..10000 araliginda tam sayi olmali.");
      }
      args.push(`--max-count=${options.maxCount}`);
    }
    if (options.since !== undefined) {
      // Serbest metin tarih ifadesi git'e gider ama flag olamaz.
      if (options.since.startsWith("-")) throw new RangeError("since '-' ile baslayamaz.");
      args.push(`--since=${options.since}`);
    }
    if (options.filePath !== undefined) {
      args.push("--", options.filePath);
    }

    const { stdout } = await runGit("log", args, this.opts());
    return stdout
      .split(RECORD_SEP)
      .filter((r) => r.trim().length > 0)
      .map((record) => {
        const [sha, authorName, authorEmail, committedAt, subject] = record.split("\x1f");
        return {
          sha: (sha ?? "").trim(),
          authorName: authorName ?? "",
          authorEmail: authorEmail ?? "",
          committedAt: committedAt ?? "",
          subject: subject ?? ""
        };
      })
      .filter((c) => c.sha.length > 0);
  }

  /** İzlenen dosyaların listesi. */
  async listFiles(): Promise<string[]> {
    const { stdout } = await runGit("ls-files", ["-z"], this.opts());
    return stdout.split(RECORD_SEP).filter((p) => p.length > 0);
  }

  /** Belirli bir commit'teki dosya içeriği. */
  async readFileAtRef(ref: string, filePath: string): Promise<string> {
    assertValidRef(ref, "ref");
    if (filePath.startsWith("-")) throw new RangeError("filePath '-' ile baslayamaz.");
    const { stdout } = await runGit("cat-file", ["-p", `${ref}:${filePath}`], this.opts());
    return stdout;
  }

  async fetch(remote = "origin"): Promise<void> {
    assertValidRef(remote, "remote");
    await runGit("fetch", ["--prune", "--no-tags", remote], this.opts({ timeoutMs: 300_000 }));
  }

  async checkout(ref: string): Promise<void> {
    assertValidRef(ref, "ref");
    await runGit("checkout", ["--detach", ref], this.opts());
  }
}

/**
 * Uzak repository'yi klonlar.
 *
 * ADR-019: bu işlem HTTP request içinde çalışmaz; ingestion worker'ı çağırır.
 */
export async function cloneRepository(params: {
  url: string;
  targetDir: string;
  branch?: string;
  depth?: number;
  allowedHosts?: readonly string[];
  timeoutMs?: number;
}): Promise<GitRepository> {
  const parsed = assertSafeRemoteUrl(params.url, params.allowedHosts);

  const args = ["--no-tags"];
  if (params.depth !== undefined) {
    if (!Number.isInteger(params.depth) || params.depth <= 0) {
      throw new RangeError("depth pozitif tam sayi olmali.");
    }
    args.push(`--depth=${params.depth}`);
  }
  if (params.branch !== undefined) {
    assertValidRef(params.branch, "branch");
    args.push("--branch", params.branch, "--single-branch");
  }

  // `--` ayraci: URL ve hedef dizin kesin olarak konumsal argumandir.
  args.push("--", parsed.toString(), params.targetDir);

  await runGit("clone", args, {
    cwd: path.dirname(params.targetDir),
    timeoutMs: params.timeoutMs ?? 600_000
  });

  return new GitRepository(params.targetDir);
}

// --- Ayrıştırıcılar ---------------------------------------------------------

export function parseNameStatusZ(raw: string): Omit<ChangedFile, "insertions" | "deletions">[] {
  const tokens = raw.split(RECORD_SEP).filter((t) => t.length > 0);
  const out: Omit<ChangedFile, "insertions" | "deletions">[] = [];

  for (let i = 0; i < tokens.length; ) {
    const code = tokens[i];
    const letter = code[0];
    const status = STATUS_MAP[letter] ?? "unknown";

    // Rename/copy kayitlari UC token tasir: kod, eski yol, yeni yol.
    if (letter === "R" || letter === "C") {
      const previousPath = tokens[i + 1];
      const newPath = tokens[i + 2];
      if (previousPath === undefined || newPath === undefined) break;
      out.push({ path: newPath, status, previousPath });
      i += 3;
    } else {
      const filePath = tokens[i + 1];
      if (filePath === undefined) break;
      out.push({ path: filePath, status, previousPath: null });
      i += 2;
    }
  }
  return out;
}

export function parseNumstatZ(raw: string): Map<string, { insertions: number; deletions: number }> {
  const map = new Map<string, { insertions: number; deletions: number }>();
  const tokens = raw.split(RECORD_SEP).filter((t) => t.length > 0);

  for (let i = 0; i < tokens.length; ) {
    const line = tokens[i];
    const m = /^(\d+|-)\t(\d+|-)\t?(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }

    // Binary dosyalar icin git "-" yazar; sayilamaz.
    const insertions = m[1] === "-" ? 0 : Number(m[1]);
    const deletions = m[2] === "-" ? 0 : Number(m[2]);

    if (m[3].length > 0) {
      map.set(m[3], { insertions, deletions });
      i++;
    } else {
      // Rename durumunda yol iki ek token olarak gelir.
      const newPath = tokens[i + 2];
      if (newPath !== undefined) map.set(newPath, { insertions, deletions });
      i += 3;
    }
  }
  return map;
}

export { GitCommandError };

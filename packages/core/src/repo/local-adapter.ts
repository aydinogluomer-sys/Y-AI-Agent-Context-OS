/**
 * P03 / Y-P03-005 — Local repository adapter.
 *
 * `LocalFilesystemRepoAdapter`'ın yerini alır. Eski hali P00'da **REAL**
 * verdict'i almıştı ve path güvenliği iyiydi; korunan da o mantıktır
 * (artık `@y/security` PathGuard üzerinden).
 *
 * Değişenler:
 *   - Kök artık WorkspaceManager tarafından hesaplanır, kullanıcıdan
 *     alınmaz (ADR-018, P0-9).
 *   - Git işlemleri GERÇEKTİR: `changedFiles`/`diff` artık gerçek
 *     `git diff` çağırır. Eski hali `E_UNSUPPORTED` dönüyor ya da iki
 *     string'i satır satır karşılaştırıyordu.
 *   - `listFiles` streaming: tüm dosyaları belleğe alıp hepsini senkron
 *     hash'lemek yerine tek tek üretir.
 *   - Hatalar `{ok:false}` yerine `AdapterError` olarak fırlatılır.
 */

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { PathGuard, isPathAllowed, isBinaryBuffer, redactSecretLeaks } from "@y/security";
import { GitRepository } from "../git/repository";
import {
  AdapterError,
  classifyFileShape,
  type AdapterCapabilities,
  type FileContent,
  type FileEntry,
  type ListFilesOptions,
  type RepositoryAdapter,
  type RepositoryMetadata,
  type WritableRepositoryAdapter
} from "./adapter";

export interface LocalAdapterOptions {
  /** Azami okunabilir dosya boyutu. Üstündekiler `TOO_LARGE` fırlatır. */
  readonly maxFileBytes?: number;
  /** `listFiles` varsayılan üst sınırı. */
  readonly defaultMaxFiles?: number;
  readonly defaultMaxDepth?: number;
}

const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 100_000;
const DEFAULT_MAX_DEPTH = 32;

export class LocalRepositoryAdapter implements WritableRepositoryAdapter {
  readonly capabilities: AdapterCapabilities;

  private readonly guard: PathGuard;
  private readonly git: GitRepository;
  private readonly maxFileBytes: number;
  private readonly defaultMaxFiles: number;
  private readonly defaultMaxDepth: number;
  private connected = false;
  private hasGit = false;

  /**
   * @param root Repository kökü. **WorkspaceManager tarafından hesaplanmış
   *             olmalıdır** — kullanıcı girdisi kabul edilmez (ADR-018).
   */
  constructor(
    private readonly root: string,
    options: LocalAdapterOptions = {}
  ) {
    if (!path.isAbsolute(root)) {
      throw new AdapterError("PATH_REJECTED", "Repository koku mutlak yol olmali.", root);
    }
    this.guard = new PathGuard(root);
    this.git = new GitRepository(root);
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    this.defaultMaxFiles = options.defaultMaxFiles ?? DEFAULT_MAX_FILES;
    this.defaultMaxDepth = options.defaultMaxDepth ?? DEFAULT_MAX_DEPTH;

    this.capabilities = {
      kind: "local",
      writable: true,
      hasHistory: false, // connect() sonrasi guncellenir
      canFetch: false,
      readCost: "local"
    };
  }

  async connect(): Promise<void> {
    if (!fsSync.existsSync(this.root)) {
      throw new AdapterError("NOT_CONNECTED", "Repository dizini yok.", this.root);
    }
    this.hasGit = await this.git.isRepository();
    // capabilities readonly oldugu icin yeni nesne yerine alan guncellemesi
    // yapmiyoruz; `hasHistory` sorgusu `hasGit` uzerinden yanitlanir.
    (this as { capabilities: AdapterCapabilities }).capabilities = {
      ...this.capabilities,
      hasHistory: this.hasGit,
      canFetch: this.hasGit
    };
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new AdapterError("NOT_CONNECTED", "Adapter connect() cagrilmadan kullanilamaz.");
    }
  }

  private assertGit(operation: string): void {
    if (!this.hasGit) {
      throw new AdapterError(
        "UNSUPPORTED",
        `${operation} icin git gecmisi gerekli; bu dizin bir git deposu degil.`,
        this.root
      );
    }
  }

  async metadata(): Promise<RepositoryMetadata> {
    this.assertConnected();
    return {
      kind: "local",
      defaultBranch: null,
      currentBranch: this.hasGit ? await this.git.currentBranch() : null,
      currentCommit: this.hasGit ? await this.git.currentCommit() : null,
      remoteUrl: null
    };
  }

  async currentCommit(): Promise<string> {
    this.assertConnected();
    this.assertGit("currentCommit");
    return this.git.currentCommit();
  }

  async branch(): Promise<string | null> {
    this.assertConnected();
    return this.hasGit ? this.git.currentBranch() : null;
  }

  /**
   * Dosyaları tek tek üretir.
   *
   * Symlink'ler ATLANIR — takip edilmez (T-04). Denylist dizinleri
   * PathGuard tarafından zaten reddedilir, ama gezinme sırasında da
   * atlanır ki `node_modules` altına hiç girilmesin (performans).
   */
  async *listFiles(options: ListFilesOptions = {}): AsyncIterable<FileEntry> {
    this.assertConnected();

    const maxFiles = options.maxFiles ?? this.defaultMaxFiles;
    const maxDepth = options.maxDepth ?? this.defaultMaxDepth;
    let emitted = 0;

    const walk = async function* (
      this: LocalRepositoryAdapter,
      dir: string,
      relativeDir: string,
      depth: number
    ): AsyncGenerator<FileEntry> {
      if (depth > maxDepth || emitted >= maxFiles) return;

      let entries: fsSync.Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (emitted >= maxFiles) return;

        // Symlink'leri hic takip etme.
        if (entry.isSymbolicLink()) continue;

        const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          // PathGuard denylist'i zaten reddeder; burada erken atlayarak
          // devasa agaclara hic girmiyoruz.
          const probe = this.guard.check(`${relative}/.probe`);
          if (!isPathAllowed(probe)) continue;
          yield* walk.call(this, path.join(dir, entry.name), relative, depth + 1);
          continue;
        }

        if (!entry.isFile()) continue;

        const check = this.guard.check(relative);
        if (!isPathAllowed(check)) continue;

        let stat: fsSync.Stats;
        try {
          stat = await fs.stat(check.absolutePath);
        } catch {
          continue;
        }

        let buffer: Buffer;
        try {
          buffer = await fs.readFile(check.absolutePath);
        } catch {
          continue;
        }

        const isBinary = isBinaryBuffer(buffer);
        const sample = isBinary ? "" : buffer.subarray(0, 4096).toString("utf-8");
        const shape = classifyFileShape(relative, sample);

        emitted++;
        yield {
          path: check.relativePath,
          sizeBytes: stat.size,
          contentHash: sha256(buffer),
          isBinary,
          isGenerated: shape.isGenerated,
          isMinified: shape.isMinified
        };
      }
    };

    yield* walk.call(this, this.root, "", 0);
  }

  async readFile(relativePath: string): Promise<FileContent> {
    this.assertConnected();

    const check = this.guard.check(relativePath);
    if (!isPathAllowed(check)) {
      throw new AdapterError("PATH_REJECTED", `Yol reddedildi: ${check.reason}`, check.detail);
    }

    let stat: fsSync.Stats;
    try {
      stat = await fs.stat(check.absolutePath);
    } catch {
      throw new AdapterError("NOT_FOUND", "Dosya bulunamadi.", relativePath);
    }

    if (stat.size > this.maxFileBytes) {
      throw new AdapterError(
        "TOO_LARGE",
        `Dosya boyut sinirini asiyor: ${stat.size} > ${this.maxFileBytes}`,
        relativePath
      );
    }

    const buffer = await fs.readFile(check.absolutePath);
    if (isBinaryBuffer(buffer)) {
      throw new AdapterError("BINARY", "Binary dosya icerigi dondurulmez.", relativePath);
    }

    const raw = buffer.toString("utf-8");
    const redactedContent = redactSecretLeaks(raw);

    return {
      path: check.relativePath,
      content: redactedContent,
      contentHash: sha256(buffer),
      sizeBytes: stat.size,
      redacted: redactedContent !== raw
    };
  }

  async changedFiles(fromRef: string, toRef = "HEAD"): Promise<string[]> {
    this.assertConnected();
    this.assertGit("changedFiles");
    const changes = await this.git.changedFiles(fromRef, toRef);
    // Denylist'teki dosyalar sonucta gorunmez.
    return changes.map((c) => c.path).filter((p) => isPathAllowed(this.guard.check(p)));
  }

  async diff(fromRef: string, toRef = "HEAD", filePath?: string): Promise<string> {
    this.assertConnected();
    this.assertGit("diff");

    if (filePath !== undefined) {
      const check = this.guard.check(filePath);
      if (!isPathAllowed(check)) {
        throw new AdapterError("PATH_REJECTED", `Yol reddedildi: ${check.reason}`, check.detail);
      }
    }

    const raw = await this.git.diff(fromRef, toRef, filePath);
    // Diff icerigi de redaksiyondan gecer: silinen bir satirdaki sir,
    // diff uzerinden hala sizabilir.
    return redactSecretLeaks(raw);
  }

  async fetch(): Promise<void> {
    this.assertConnected();
    this.assertGit("fetch");
    await this.git.fetch();
  }

  async checkout(ref: string): Promise<void> {
    this.assertConnected();
    this.assertGit("checkout");
    await this.git.checkout(ref);
  }

  /**
   * Atomik yazım + optimistic concurrency (T-20).
   *
   * `expectedHashBefore` verilmişse ve dosyanın mevcut hash'i uymuyorsa
   * yazım reddedilir. P10 Change Firewall bu alanı zorunlu kılacak.
   */
  async writeFile(params: {
    relativePath: string;
    content: string;
    expectedHashBefore: string | null;
  }): Promise<{ hashBefore: string | null; hashAfter: string }> {
    this.assertConnected();

    const check = this.guard.check(params.relativePath);
    if (!isPathAllowed(check)) {
      throw new AdapterError("PATH_REJECTED", `Yol reddedildi: ${check.reason}`, check.detail);
    }

    let hashBefore: string | null = null;
    try {
      hashBefore = sha256(await fs.readFile(check.absolutePath));
    } catch {
      hashBefore = null; // dosya henuz yok
    }

    if (params.expectedHashBefore !== null && params.expectedHashBefore !== hashBefore) {
      throw new AdapterError(
        "PATH_REJECTED",
        "Dosya beklenenden farkli (es zamanli degisiklik).",
        `beklenen=${params.expectedHashBefore} gercek=${hashBefore}`
      );
    }

    const buffer = Buffer.from(params.content, "utf-8");

    // Atomik yazim: once gecici dosya, sonra rename.
    await fs.mkdir(path.dirname(check.absolutePath), { recursive: true });
    const tmp = `${check.absolutePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, buffer);
    await fs.rename(tmp, check.absolutePath);

    return { hashBefore, hashAfter: sha256(buffer) };
  }
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export type { RepositoryAdapter };

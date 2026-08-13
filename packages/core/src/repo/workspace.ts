/**
 * P03 / Y-P03-003 — Yönetilen workspace (ADR-018).
 *
 * P00 Truth Audit bulgusu P0-9:
 *   `POST /projects/:id/repo/configure-local` KEYFİ bir mutlak `root_path`
 *   kabul ediyor, `RepoAdapterService` bunu doğrudan
 *   `LocalFilesystemRepoAdapter`'a veriyordu. Yapılandırılmamışsa varsayılan
 *   kök `"."` — yani sunucunun kendi çalışma dizini — repository sayılıyordu.
 *   API böylece keyfi bir dizin okuyucusuna dönüşüyordu.
 *
 * ADR-018: repository kökünü KULLANICI SEÇMEZ. Her repository, Y'nin
 * yönettiği şu deterministik yolda yaşar:
 *
 *     WORKSPACE_ROOT/<org>/<project>/<repository>
 *
 * "Yerel klasörü bağla" akışı, klasörün bu workspace'e klonlanmasıyla çalışır.
 */

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";

export class WorkspaceError extends Error {
  constructor(
    readonly code: "INVALID_SEGMENT" | "ROOT_MISSING" | "QUOTA_EXCEEDED" | "ESCAPES_WORKSPACE",
    message: string
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

/**
 * Path segmenti doğrulaması.
 *
 * Kimlikler `newId()`'den gelir (UUID/ULID) ama savunma derinliği için
 * yine de doğrulanır: bir gün başka bir kaynaktan gelirlerse.
 */
const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function assertSafeSegment(value: string, label: string): void {
  if (!SEGMENT_RE.test(value)) {
    throw new WorkspaceError(
      "INVALID_SEGMENT",
      `Gecersiz ${label}: ${JSON.stringify(value)}. Beklenen: [A-Za-z0-9][A-Za-z0-9_-]{0,127}`
    );
  }
}

export interface WorkspaceQuota {
  /** Repository başına azami boyut. */
  readonly maxRepositoryBytes: number;
  /** Repository başına azami dosya sayısı. */
  readonly maxFileCount: number;
}

export const DEFAULT_QUOTA: WorkspaceQuota = {
  maxRepositoryBytes: 2 * 1024 * 1024 * 1024, // 2 GiB
  maxFileCount: 200_000
};

export interface RepositoryLocation {
  readonly orgId: string;
  readonly projectId: string;
  readonly repositoryId: string;
  /** Mutlak yol. Yalnız Y tarafından belirlenir. */
  readonly absolutePath: string;
}

export class WorkspaceManager {
  private readonly root: string;

  constructor(
    workspaceRoot: string,
    private readonly quota: WorkspaceQuota = DEFAULT_QUOTA
  ) {
    if (!path.isAbsolute(workspaceRoot)) {
      throw new WorkspaceError("ROOT_MISSING", `WORKSPACE_ROOT mutlak yol olmali: ${workspaceRoot}`);
    }
    this.root = path.resolve(workspaceRoot);
  }

  /**
   * Repository'nin yolunu HESAPLAR — kullanıcıdan almaz.
   *
   * Sonuç her zaman workspace kökünün altındadır; bu, segment doğrulaması
   * ile garanti edilir ve ayrıca containment kontrolüyle doğrulanır.
   */
  locate(orgId: string, projectId: string, repositoryId: string): RepositoryLocation {
    assertSafeSegment(orgId, "orgId");
    assertSafeSegment(projectId, "projectId");
    assertSafeSegment(repositoryId, "repositoryId");

    const absolutePath = path.join(this.root, orgId, projectId, repositoryId);

    // Savunma derinligi: segment dogrulamasi zaten kacisi engelliyor ama
    // sonucu yine de dogruluyoruz.
    const relative = path.relative(this.root, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new WorkspaceError("ESCAPES_WORKSPACE", `Hesaplanan yol workspace disinda: ${absolutePath}`);
    }

    return { orgId, projectId, repositoryId, absolutePath };
  }

  async ensureDirectory(location: RepositoryLocation): Promise<void> {
    await fs.mkdir(path.dirname(location.absolutePath), { recursive: true });
  }

  exists(location: RepositoryLocation): boolean {
    return fsSync.existsSync(location.absolutePath);
  }

  /** Repository'yi tamamen kaldırır (disconnect akışı). */
  async remove(location: RepositoryLocation): Promise<void> {
    await fs.rm(location.absolutePath, { recursive: true, force: true });
  }

  /**
   * Kota kontrolü.
   *
   * T-06 (malicious repository): devasa veya çok dosyalı bir repo, klonlama
   * sırasında diski doldurabilir. Kontrol klonlama SONRASI da yapılır çünkü
   * uzak repo boyutu her zaman önceden bilinemez.
   */
  async measure(location: RepositoryLocation): Promise<{ bytes: number; files: number }> {
    let bytes = 0;
    let files = 0;

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 64) return; // patolojik derinlik korumasi
      let entries: fsSync.Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (files > this.quota.maxFileCount) return;
        const full = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) continue; // symlink'i takip etme (T-04)
        if (entry.isDirectory()) {
          await walk(full, depth + 1);
        } else if (entry.isFile()) {
          files++;
          try {
            bytes += (await fs.stat(full)).size;
          } catch {
            /* yaris kosulunda dosya silinmis olabilir */
          }
        }
      }
    };

    await walk(location.absolutePath, 0);
    return { bytes, files };
  }

  async assertWithinQuota(location: RepositoryLocation): Promise<void> {
    const { bytes, files } = await this.measure(location);

    if (bytes > this.quota.maxRepositoryBytes) {
      throw new WorkspaceError(
        "QUOTA_EXCEEDED",
        `Repository boyutu kotayi asti: ${bytes} > ${this.quota.maxRepositoryBytes} bayt`
      );
    }
    if (files > this.quota.maxFileCount) {
      throw new WorkspaceError(
        "QUOTA_EXCEEDED",
        `Repository dosya sayisi kotayi asti: ${files} > ${this.quota.maxFileCount}`
      );
    }
  }

  get workspaceRoot(): string {
    return this.root;
  }
}

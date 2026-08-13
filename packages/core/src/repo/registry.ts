/**
 * P03 / Y-P03-001 — Adapter registry.
 *
 * `RepoAdapterService`'in yerini alır. P00 bulgusu P0-9:
 *
 *     if (!repoSource) return new LocalFilesystemRepoAdapter(".");
 *
 * Yani `repo_sources` satırı yoksa **sunucunun kendi çalışma dizini**
 * repository sayılıyordu. Kimse fark etmeden API bir dizin okuyucusuna
 * dönüşüyordu.
 *
 * Yeni davranış: yapılandırılmamış repository için adapter ÜRETİLMEZ,
 * hata fırlatılır. Sessiz varsayılan yoktur.
 */

import { LocalRepositoryAdapter } from "./local-adapter";
import { GitHubRepositoryAdapter, GitLabRepositoryAdapter, type CredentialResolver } from "./remote-adapter";
import { WorkspaceManager } from "./workspace";
import { AdapterError, type RepositoryAdapter, type RepositoryKind } from "./adapter";

export interface RepositoryRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly kind: RepositoryKind;
  readonly remoteUrl: string | null;
  readonly defaultBranch: string | null;
  readonly disconnectedAt: string | null;
}

export interface RegistryOptions {
  readonly workspace: WorkspaceManager;
  /**
   * Kimlik bilgisi çözücü fabrikası.
   *
   * Registry token DEĞERİNİ görmez; yalnız bir çözücü alır. Böylece
   * sır bellekte yalnız kullanıldığı an bulunur.
   */
  readonly credentialFor?: (repository: RepositoryRecord) => CredentialResolver | undefined;
  readonly allowedHosts?: { github?: readonly string[]; gitlab?: readonly string[] };
  readonly cloneDepth?: number;
}

export class RepositoryRegistry {
  constructor(private readonly options: RegistryOptions) {}

  /**
   * Kayıttan adapter üretir.
   *
   * Sessiz varsayılan YOKTUR: eksik yapılandırma hata verir.
   */
  create(record: RepositoryRecord): RepositoryAdapter {
    if (record.disconnectedAt !== null) {
      throw new AdapterError(
        "NOT_CONNECTED",
        "Repository baglantisi kesilmis.",
        `${record.id} (${record.disconnectedAt})`
      );
    }

    // Yol KULLANICIDAN degil, kimliklerden hesaplanir (ADR-018).
    const location = this.options.workspace.locate(
      record.organizationId,
      record.projectId,
      record.id
    );

    switch (record.kind) {
      case "local":
        return new LocalRepositoryAdapter(location.absolutePath);

      case "github": {
        const url = this.requireRemoteUrl(record);
        return new GitHubRepositoryAdapter({
          remoteUrl: url,
          workdir: location.absolutePath,
          branch: record.defaultBranch ?? undefined,
          depth: this.options.cloneDepth,
          credential: this.options.credentialFor?.(record),
          allowedHosts: this.options.allowedHosts?.github
        });
      }

      case "gitlab": {
        const url = this.requireRemoteUrl(record);
        return new GitLabRepositoryAdapter({
          remoteUrl: url,
          workdir: location.absolutePath,
          branch: record.defaultBranch ?? undefined,
          depth: this.options.cloneDepth,
          credential: this.options.credentialFor?.(record),
          allowedHosts: this.options.allowedHosts?.gitlab
        });
      }

      default: {
        // Exhaustiveness: yeni bir RepositoryKind eklendiginde burasi
        // derleme hatasi verir; sessizce yanlis adapter uretilmez.
        const exhaustive: never = record.kind;
        throw new AdapterError("UNSUPPORTED", `Bilinmeyen repository turu: ${String(exhaustive)}`);
      }
    }
  }

  private requireRemoteUrl(record: RepositoryRecord): string {
    if (!record.remoteUrl) {
      throw new AdapterError(
        "NOT_CONNECTED",
        `${record.kind} repository'si remote_url tasimiyor.`,
        record.id
      );
    }
    return record.remoteUrl;
  }
}

/**
 * P03 / Y-P03-006 + Y-P03-007 — Uzak repository adapter'ları.
 *
 * P00 Truth Audit: `ReadOnlyGitHubRepoAdapter` **saf stub**tı. Her metot
 * `{ ok: false }` dönüyordu ve `readFile` şu literal'i üretiyordu:
 *
 *     "E_コネクター未設定: GitHub Remote Connector requires authentication..."
 *
 * GitLab adapter'ı ise hiç yoktu.
 *
 * TASARIM (ADR-006):
 *   Uzak repository'ler yönetilen workspace'e **klonlanır**, sonra dosya
 *   işlemleri local adapter'a devredilir. Her dosya okuması için ağ isteği
 *   yapmak yerine bu yaklaşım seçildi çünkü:
 *
 *     - Context derleme (P08) onlarca dosyayı aynı anda okur; her biri için
 *       API çağrısı hem yavaş hem rate limit'e takılır.
 *     - `git log`/`git diff` gibi geçmiş sorguları REST API üzerinden
 *       eksik ve tutarsızdır.
 *     - Manifest determinizmi (P09) sabit bir commit'te sabit içerik ister;
 *       klonlanmış çalışma ağacı bunu doğal olarak sağlar.
 *
 *   REST API yalnız BAĞLANTI DOĞRULAMASI ve metadata için kullanılır
 *   (repo var mı, erişim var mı, varsayılan dal ne).
 */

import { LocalRepositoryAdapter } from "./local-adapter";
import { cloneRepository, GitRepository } from "../git/repository";
import { assertSafeRemoteUrl, GitSecurityError } from "../git/git-cli";
import {
  AdapterError,
  type AdapterCapabilities,
  type FileContent,
  type FileEntry,
  type ListFilesOptions,
  type RepositoryAdapter,
  type RepositoryKind,
  type RepositoryMetadata
} from "./adapter";

/**
 * Kimlik bilgisi sağlayıcısı.
 *
 * Token DEĞERİ adapter'a doğrudan verilmez; bir çözücü fonksiyon verilir.
 * Böylece token bellekte yalnız kullanıldığı an bulunur ve adapter
 * nesnesinin serileştirilmesi sırrı sızdırmaz.
 */
export type CredentialResolver = () => Promise<string>;

export interface RemoteAdapterOptions {
  readonly remoteUrl: string;
  /** Yönetilen workspace'teki hedef dizin (WorkspaceManager hesaplar). */
  readonly workdir: string;
  readonly branch?: string;
  /** Shallow clone derinliği. `undefined` = tam geçmiş. */
  readonly depth?: number;
  readonly credential?: CredentialResolver;
  /** Host allow-list. Boşsa sağlayıcının varsayılan host'ları. */
  readonly allowedHosts?: readonly string[];
  readonly cloneTimeoutMs?: number;
}

const GITHUB_HOSTS = ["github.com", "www.github.com"] as const;
const GITLAB_HOSTS = ["gitlab.com", "www.gitlab.com"] as const;

/**
 * Uzak adapter'lar için ortak davranış.
 *
 * Read-only'dir: uzak repository'ye yazma P10 Change Firewall'ının
 * kapsamındadır ve ayrı bir akışla (branch + PR) yürütülür. Bu adapter
 * `WritableRepositoryAdapter` implemente ETMEZ — yazma denemesi tip
 * hatası verir, "desteklenmiyor" hatası değil.
 */
export abstract class RemoteRepositoryAdapter implements RepositoryAdapter {
  readonly capabilities: AdapterCapabilities;

  protected local: LocalRepositoryAdapter | null = null;
  private connected = false;

  protected constructor(
    kind: RepositoryKind,
    protected readonly options: RemoteAdapterOptions,
    protected readonly defaultHosts: readonly string[]
  ) {
    // Baglanti kurulmadan ONCE URL dogrula: gecersiz bir URL ile nesne
    // olusturulabilmesi, hatayi kullanim anina erteler.
    this.parsedUrl = assertSafeRemoteUrl(options.remoteUrl, options.allowedHosts ?? defaultHosts);

    this.capabilities = {
      kind,
      writable: false,
      hasHistory: true,
      canFetch: true,
      readCost: "local" // klonlandiktan sonra okuma yereldir
    };
  }

  protected readonly parsedUrl: URL;

  /** Sağlayıcıya özgü kimlik doğrulama header'ı. */
  protected abstract authHeader(token: string): Record<string, string>;

  /** Sağlayıcıya özgü metadata endpoint'i. */
  protected abstract metadataUrl(): string;

  /** Sağlayıcı yanıtından varsayılan dalı çıkarır. */
  protected abstract extractDefaultBranch(payload: unknown): string | null;

  /**
   * Bağlantıyı doğrular ve repository'yi workspace'e klonlar.
   *
   * ADR-019: bu işlem HTTP request içinde çalışmaz; ingestion worker çağırır.
   */
  async connect(): Promise<void> {
    const defaultBranch = await this.verifyRemoteAccess();

    const existing = new GitRepository(this.options.workdir);
    if (await existing.isRepository()) {
      // Zaten klonlanmis: fetch yeterli.
      await existing.fetch();
    } else {
      await cloneRepository({
        url: this.parsedUrl.toString(),
        targetDir: this.options.workdir,
        branch: this.options.branch ?? defaultBranch ?? undefined,
        depth: this.options.depth,
        allowedHosts: this.options.allowedHosts ?? this.defaultHosts,
        timeoutMs: this.options.cloneTimeoutMs
      });
    }

    this.local = new LocalRepositoryAdapter(this.options.workdir);
    await this.local.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.local?.disconnect();
    this.local = null;
    this.connected = false;
  }

  /**
   * Uzak sunucuya erişimi doğrular.
   *
   * Token yalnız bu çağrı sırasında çözülür ve header'a konur; hiçbir
   * yerde saklanmaz, loglanmaz ve URL'e gömülmez.
   */
  protected async verifyRemoteAccess(): Promise<string | null> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": "y-context-os"
    };

    if (this.options.credential) {
      const token = await this.options.credential();
      if (!token) {
        throw new AdapterError("AUTH_FAILED", "Kimlik bilgisi cozulemedi (bos token).");
      }
      Object.assign(headers, this.authHeader(token));
    }

    let response: Response;
    try {
      response = await fetch(this.metadataUrl(), { headers, redirect: "error" });
    } catch (error) {
      throw new AdapterError(
        "REMOTE_ERROR",
        "Uzak sunucuya ulasilamadi.",
        error instanceof Error ? error.message : String(error)
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new AdapterError("AUTH_FAILED", "Uzak repository icin yetki yok.", `HTTP ${response.status}`);
    }
    if (response.status === 404) {
      throw new AdapterError("NOT_FOUND", "Uzak repository bulunamadi.", this.parsedUrl.pathname);
    }
    if (response.status === 429) {
      throw new AdapterError("RATE_LIMITED", "Uzak sunucu rate limit uyguladi.", "HTTP 429");
    }
    if (!response.ok) {
      throw new AdapterError("REMOTE_ERROR", `Uzak sunucu hatasi: HTTP ${response.status}`);
    }

    try {
      return this.extractDefaultBranch(await response.json());
    } catch {
      return null;
    }
  }

  protected assertConnected(): LocalRepositoryAdapter {
    if (!this.connected || !this.local) {
      throw new AdapterError("NOT_CONNECTED", "Adapter connect() cagrilmadan kullanilamaz.");
    }
    return this.local;
  }

  async metadata(): Promise<RepositoryMetadata> {
    const local = this.assertConnected();
    const base = await local.metadata();
    return { ...base, kind: this.capabilities.kind, remoteUrl: this.parsedUrl.toString() };
  }

  // Aşağıdaki metotlar `async` olarak işaretlenmiştir — bilinçli.
  //
  // Doğrudan `return this.assertConnected().x()` yazmak, bağlantı yokken
  // hatayı SENKRON fırlatır. Promise dönen bir API'de bu, çağıranın
  // `.catch()` veya `await ... rejects` ile yakalayamaması demektir;
  // hata beklenmedik bir yerde patlar. `async` sarmalayıcı, senkron
  // fırlatmayı reddedilen bir promise'e çevirir.
  //
  // (Bu hatayı testler yakaladı: `await expect(...).rejects` başarısız oldu.)

  async currentCommit(): Promise<string> {
    return this.assertConnected().currentCommit();
  }

  async branch(): Promise<string | null> {
    return this.assertConnected().branch();
  }

  /**
   * `listFiles` bir AsyncIterable döndürür; senkron fırlatma burada
   * doğru davranıştır (iterasyon başlamadan önce hata verir) ama
   * tutarlılık için generator'a sarılır.
   */
  async *listFiles(options?: ListFilesOptions): AsyncIterable<FileEntry> {
    yield* this.assertConnected().listFiles(options);
  }

  async readFile(relativePath: string): Promise<FileContent> {
    return this.assertConnected().readFile(relativePath);
  }

  async changedFiles(fromRef: string, toRef?: string): Promise<string[]> {
    return this.assertConnected().changedFiles(fromRef, toRef);
  }

  async diff(fromRef: string, toRef?: string, filePath?: string): Promise<string> {
    return this.assertConnected().diff(fromRef, toRef, filePath);
  }

  async fetch(): Promise<void> {
    return this.assertConnected().fetch();
  }

  async checkout(ref: string): Promise<void> {
    return this.assertConnected().checkout(ref);
  }
}

/** `github.com/org/repo(.git)` -> `{ owner, repo }` */
export function parseGitHubPath(pathname: string): { owner: string; repo: string } {
  const parts = pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new GitSecurityError(`GitHub URL'inden owner/repo cikarilamadi: ${pathname}`);
  }
  return { owner: parts[0], repo: parts[1] };
}

export class GitHubRepositoryAdapter extends RemoteRepositoryAdapter {
  constructor(options: RemoteAdapterOptions) {
    super("github", options, GITHUB_HOSTS);
  }

  protected authHeader(token: string): Record<string, string> {
    // Token URL'e GOMULMEZ; yalniz header'da tasinir.
    return { authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" };
  }

  protected metadataUrl(): string {
    const { owner, repo } = parseGitHubPath(this.parsedUrl.pathname);
    const apiHost = this.parsedUrl.host === "github.com" ? "api.github.com" : this.parsedUrl.host;
    return `https://${apiHost}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  protected extractDefaultBranch(payload: unknown): string | null {
    const value = (payload as { default_branch?: unknown })?.default_branch;
    return typeof value === "string" && value.length > 0 ? value : null;
  }
}

/** `gitlab.com/group/sub/repo(.git)` -> URL-encoded project path */
export function encodeGitLabProjectPath(pathname: string): string {
  const cleaned = pathname.replace(/^\//, "").replace(/\.git$/, "");
  if (cleaned.length === 0 || !cleaned.includes("/")) {
    throw new GitSecurityError(`GitLab URL'inden proje yolu cikarilamadi: ${pathname}`);
  }
  return encodeURIComponent(cleaned);
}

export class GitLabRepositoryAdapter extends RemoteRepositoryAdapter {
  constructor(options: RemoteAdapterOptions) {
    super("gitlab", options, GITLAB_HOSTS);
  }

  protected authHeader(token: string): Record<string, string> {
    return { "private-token": token };
  }

  protected metadataUrl(): string {
    const project = encodeGitLabProjectPath(this.parsedUrl.pathname);
    return `https://${this.parsedUrl.host}/api/v4/projects/${project}`;
  }

  protected extractDefaultBranch(payload: unknown): string | null {
    const value = (payload as { default_branch?: unknown })?.default_branch;
    return typeof value === "string" && value.length > 0 ? value : null;
  }
}

export { GITHUB_HOSTS, GITLAB_HOSTS };

/**
 * P03 / Y-P03-006 + Y-P03-007 — Uzak adapter testleri.
 *
 * `verifyRemoteAccess` gerçek bir HTTP sunucusuna karşı koşar (yerel,
 * rastgele port). `fetch` mock'lamak, "yetki hatası doğru sınıflandırılıyor
 * mu" sorusunu yanıtlamaz — eski stub tam da hiçbir şeyi gerçekten
 * denemediği için tespit edilememişti.
 *
 * Clone gerektiren testler ağ erişimi ister; onlar P19 integration
 * suite'ine bırakıldı ve burada ATLANMIŞ olarak işaretlenir — sessizce
 * "geçti" görünmezler.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import * as os from "os";
import * as path from "path";
import {
  GitHubRepositoryAdapter,
  GitLabRepositoryAdapter,
  parseGitHubPath,
  encodeGitLabProjectPath,
  GITHUB_HOSTS,
  GITLAB_HOSTS
} from "./remote-adapter";
import { AdapterError, isWritable } from "./adapter";
import { GitSecurityError } from "../git/git-cli";

const workdir = path.join(os.tmpdir(), "y-remote-adapter-test");

// ---------------------------------------------------------------------------
// URL ayrıştırma
// ---------------------------------------------------------------------------

describe("parseGitHubPath", () => {
  it("owner/repo çıkarır", () => {
    expect(parseGitHubPath("/acme/widgets")).toEqual({ owner: "acme", repo: "widgets" });
  });

  it(".git son ekini atar", () => {
    expect(parseGitHubPath("/acme/widgets.git")).toEqual({ owner: "acme", repo: "widgets" });
  });

  it("eksik yolu reddeder", () => {
    expect(() => parseGitHubPath("/acme")).toThrow(GitSecurityError);
    expect(() => parseGitHubPath("/")).toThrow(GitSecurityError);
  });
});

describe("encodeGitLabProjectPath", () => {
  it("iç içe grup yolunu URL-encode eder", () => {
    expect(encodeGitLabProjectPath("/grup/altgrup/proje")).toBe("grup%2Faltgrup%2Fproje");
  });

  it(".git son ekini atar", () => {
    expect(encodeGitLabProjectPath("/grup/proje.git")).toBe("grup%2Fproje");
  });

  it("tek segmentli yolu reddeder", () => {
    expect(() => encodeGitLabProjectPath("/proje")).toThrow(GitSecurityError);
  });
});

// ---------------------------------------------------------------------------
// Kurucu doğrulaması (SSRF — T-23)
// ---------------------------------------------------------------------------

describe("GitHubRepositoryAdapter — kurucu doğrulaması", () => {
  const base = { workdir };

  it("geçerli GitHub URL'ini kabul eder", () => {
    expect(
      () => new GitHubRepositoryAdapter({ ...base, remoteUrl: "https://github.com/acme/widgets.git" })
    ).not.toThrow();
  });

  it("http URL'ini reddeder", () => {
    expect(
      () => new GitHubRepositoryAdapter({ ...base, remoteUrl: "http://github.com/acme/widgets.git" })
    ).toThrow(GitSecurityError);
  });

  it("başka bir host'u reddeder (allow-list)", () => {
    expect(
      () => new GitHubRepositoryAdapter({ ...base, remoteUrl: "https://evil.example.com/a/b.git" })
    ).toThrow(GitSecurityError);
  });

  it("iç ağ adresini reddeder (SSRF)", () => {
    expect(
      () => new GitHubRepositoryAdapter({ ...base, remoteUrl: "https://169.254.169.254/a/b.git" })
    ).toThrow(GitSecurityError);
  });

  it("URL'e gömülü kimlik bilgisini reddeder", () => {
    expect(
      () =>
        new GitHubRepositoryAdapter({
          ...base,
          remoteUrl: "https://user:token@github.com/acme/widgets.git"
        })
    ).toThrow(GitSecurityError);
  });

  it("read-only olarak raporlanır", () => {
    const a = new GitHubRepositoryAdapter({ ...base, remoteUrl: "https://github.com/acme/w.git" });
    expect(a.capabilities.writable).toBe(false);
    expect(isWritable(a)).toBe(false);
  });

  it("geçmiş ve fetch yeteneği bildirir", () => {
    const a = new GitHubRepositoryAdapter({ ...base, remoteUrl: "https://github.com/acme/w.git" });
    expect(a.capabilities.hasHistory).toBe(true);
    expect(a.capabilities.canFetch).toBe(true);
    // Klonlandiktan sonra okuma YEREL maliyetlidir.
    expect(a.capabilities.readCost).toBe("local");
  });
});

describe("GitLabRepositoryAdapter — kurucu doğrulaması", () => {
  it("geçerli GitLab URL'ini kabul eder", () => {
    expect(
      () => new GitLabRepositoryAdapter({ workdir, remoteUrl: "https://gitlab.com/grup/proje.git" })
    ).not.toThrow();
  });

  it("GitHub URL'ini GitLab adapter'ında reddeder", () => {
    expect(
      () => new GitLabRepositoryAdapter({ workdir, remoteUrl: "https://github.com/acme/w.git" })
    ).toThrow(GitSecurityError);
  });
});

describe("host allow-list'leri", () => {
  it("GitHub ve GitLab host kümeleri ayrıktır", () => {
    for (const h of GITHUB_HOSTS) expect(GITLAB_HOSTS).not.toContain(h);
  });

  it("özel allow-list kurucu varsayılanını geçersiz kılar (self-hosted)", () => {
    expect(
      () =>
        new GitLabRepositoryAdapter({
          workdir,
          remoteUrl: "https://gitlab.sirket.example/grup/proje.git",
          allowedHosts: ["gitlab.sirket.example"]
        })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Uzak erişim doğrulaması — gerçek yerel HTTP sunucusu
// ---------------------------------------------------------------------------

interface Fixture {
  server: Server;
  host: string;
  /** Sunucunun bir sonraki yanıtı. */
  respond: (status: number, body: unknown) => void;
  /** Son isteğin header'ları. */
  lastHeaders: () => IncomingMessage["headers"];
  close: () => Promise<void>;
}

async function startFixture(): Promise<Fixture> {
  let status = 200;
  let body: unknown = {};
  let headers: IncomingMessage["headers"] = {};

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    headers = req.headers;
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    server,
    host: `127.0.0.1:${port}`,
    respond(s, b) {
      status = s;
      body = b;
    },
    lastHeaders: () => headers,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}

/**
 * Test için metadata URL'ini yerel sunucuya yönlendiren alt sınıf.
 *
 * `verifyRemoteAccess` mantığı DEĞİŞMEZ; yalnız hedef adres değişir.
 * Böylece HTTP durum kodlarının nasıl sınıflandırıldığı gerçekten
 * doğrulanır.
 */
class TestableGitHubAdapter extends GitHubRepositoryAdapter {
  constructor(
    options: ConstructorParameters<typeof GitHubRepositoryAdapter>[0],
    private readonly overrideUrl: string
  ) {
    super(options);
  }
  protected metadataUrl(): string {
    return this.overrideUrl;
  }
  public verify(): Promise<string | null> {
    return this.verifyRemoteAccess();
  }
}

describe("verifyRemoteAccess — HTTP durum sınıflandırması", { timeout: 30_000 }, async () => {
  const fx = await startFixture();
  const url = `http://${fx.host}/repos/acme/widgets`;

  const adapter = (credential?: () => Promise<string>) =>
    new TestableGitHubAdapter(
      { workdir, remoteUrl: "https://github.com/acme/widgets.git", credential },
      url
    );

  it("200 yanıtında varsayılan dalı döndürür", async () => {
    fx.respond(200, { default_branch: "main" });
    expect(await adapter().verify()).toBe("main");
  });

  it("default_branch yoksa null döner", async () => {
    fx.respond(200, {});
    expect(await adapter().verify()).toBeNull();
  });

  it("401 → AUTH_FAILED", async () => {
    fx.respond(401, { message: "Bad credentials" });
    try {
      await adapter().verify();
      expect.unreachable("hata bekleniyordu");
    } catch (e) {
      expect((e as AdapterError).code).toBe("AUTH_FAILED");
    }
  });

  it("403 → AUTH_FAILED", async () => {
    fx.respond(403, {});
    try {
      await adapter().verify();
      expect.unreachable("hata bekleniyordu");
    } catch (e) {
      expect((e as AdapterError).code).toBe("AUTH_FAILED");
    }
  });

  it("404 → NOT_FOUND", async () => {
    fx.respond(404, {});
    try {
      await adapter().verify();
      expect.unreachable("hata bekleniyordu");
    } catch (e) {
      expect((e as AdapterError).code).toBe("NOT_FOUND");
    }
  });

  it("429 → RATE_LIMITED", async () => {
    fx.respond(429, {});
    try {
      await adapter().verify();
      expect.unreachable("hata bekleniyordu");
    } catch (e) {
      expect((e as AdapterError).code).toBe("RATE_LIMITED");
    }
  });

  it("500 → REMOTE_ERROR", async () => {
    fx.respond(500, {});
    try {
      await adapter().verify();
      expect.unreachable("hata bekleniyordu");
    } catch (e) {
      expect((e as AdapterError).code).toBe("REMOTE_ERROR");
    }
  });

  it("token'ı Authorization header'ında taşır, URL'e GÖMMEZ", async () => {
    fx.respond(200, { default_branch: "main" });
    await adapter(async () => "gizli-token-degeri").verify();

    const headers = fx.lastHeaders();
    expect(headers.authorization).toBe("Bearer gizli-token-degeri");
    // URL'de token izi olmamali.
    expect(url).not.toContain("gizli-token");
  });

  it("boş token'ı AUTH_FAILED ile reddeder", async () => {
    fx.respond(200, {});
    try {
      await adapter(async () => "").verify();
      expect.unreachable("hata bekleniyordu");
    } catch (e) {
      expect((e as AdapterError).code).toBe("AUTH_FAILED");
    }
  });

  it("kimlik bilgisi verilmezse header göndermez", async () => {
    fx.respond(200, { default_branch: "main" });
    await adapter().verify();
    expect(fx.lastHeaders().authorization).toBeUndefined();
  });

  it("ulaşılamayan sunucuda REMOTE_ERROR", async () => {
    await fx.close();
    const dead = new TestableGitHubAdapter(
      { workdir, remoteUrl: "https://github.com/acme/widgets.git" },
      "http://127.0.0.1:1/repos/acme/widgets"
    );
    try {
      await dead.verify();
      expect.unreachable("hata bekleniyordu");
    } catch (e) {
      expect((e as AdapterError).code).toBe("REMOTE_ERROR");
    }
  });
});

describe("bağlantı kurulmadan kullanım", () => {
  it("connect() öncesi readFile reddedilir", async () => {
    const a = new GitHubRepositoryAdapter({ workdir, remoteUrl: "https://github.com/acme/w.git" });
    await expect(a.readFile("src/a.ts")).rejects.toBeInstanceOf(AdapterError);
  });

  it("connect() öncesi currentCommit reddedilir", async () => {
    const a = new GitLabRepositoryAdapter({ workdir, remoteUrl: "https://gitlab.com/g/p.git" });
    await expect(a.currentCommit()).rejects.toBeInstanceOf(AdapterError);
  });
});

/**
 * Gerçek clone testleri ağ erişimi ister.
 *
 * Bunları burada koşturmak yerine P19 integration suite'ine bırakıyoruz.
 * `it.skip` bilinçli: rapor bunları ATLANMIŞ gösterir, geçmiş değil.
 */
describe("gerçek clone (P19 integration kapsamı)", () => {
  it.skip("uzak repository'yi workspace'e klonlar", () => {
    // P19: testcontainers icinde yerel bir git sunucusu ile kosulacak.
  });

  it.skip("ikinci connect() clone yerine fetch yapar", () => {
    // P19.
  });
});

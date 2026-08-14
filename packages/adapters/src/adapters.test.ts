/**
 * P11 — Agent adapter testleri.
 *
 * En kritik iddia: bir sağlık probe'u ağa çıkmadıysa BUNU SÖYLER.
 * P00'daki `/api/providers/health` yalnız `process.env` varlığına bakıp
 * kendini "Live LLM Provider Connectivity Probes" diye tanıtıyordu.
 */

import { describe, it, expect } from "vitest";
import {
  AdapterError,
  AdapterRegistry,
  ClaudeCodeAdapter,
  CodexAdapter,
  UnconfiguredAdapter,
  assertStartInput,
  claudeCodeConfigFromEnv,
  codexConfigFromEnv,
  type AgentStartInput
} from "./index";

const START_INPUT: AgentStartInput = {
  manifest: { manifestHash: "m".repeat(64), items: [{ path: "src/a.ts" }] },
  boundary: { boundaryHash: "b".repeat(64), expected: ["src/a.ts"], allowed: [] },
  task: { taskId: "task_1", title: "Duzelt", description: "aciklama", acceptanceCriteria: [] },
  workspace: { absolutePath: "/repo", repositoryId: "repo_1", commitSha: "c".repeat(40) },
  runId: "run_1"
};

describe("assertStartInput — manifest ve boundary ZORUNLU", () => {
  it("geçerli girdi kabul edilir", () => {
    expect(() => assertStartInput(START_INPUT)).not.toThrow();
  });

  it("manifest olmadan agent başlatılamaz (ADR-043)", () => {
    const noManifest = { ...START_INPUT, manifest: { manifestHash: "", items: [] } };
    expect(() => assertStartInput(noManifest)).toThrow(/MANIFEST|manifest/i);
  });

  it("boundary olmadan agent başlatılamaz (P10)", () => {
    const noBoundary = { ...START_INPUT, boundary: { boundaryHash: "", expected: [], allowed: [] } };
    expect(() => assertStartInput(noBoundary)).toThrow(/boundary/i);
  });

  it("hata mesajı NEDEN zorunlu olduğunu açıklar", () => {
    try {
      assertStartInput({ ...START_INPUT, manifest: { manifestHash: "", items: [] } });
      expect.unreachable("hata bekleniyordu");
    } catch (error) {
      expect((error as Error).message).toContain("PROOF");
    }
  });
});

describe("ClaudeCodeAdapter — sağlık probe'u DÜRÜST", () => {
  it("yapılandırılmamışsa ağa çıkmadığını SÖYLER", async () => {
    const adapter = new ClaudeCodeAdapter(claudeCodeConfigFromEnv({}));
    const health = await adapter.health();

    expect(health.status).toBe("not_configured");
    expect(health.probedNetwork).toBe(false);
  });

  it("anahtar VAR ama probe YOKSA 'ready' DEMEZ", async () => {
    // P00'daki hata tam olarak buydu: env degiskenine bakip
    // "Live Connectivity Probe" demek.
    const adapter = new ClaudeCodeAdapter({
      apiKey: "sk-test",
      model: "claude-opus-5",
      contextLimit: 200_000,
      maxOutputTokens: 64_000
    });

    const health = await adapter.health();
    expect(health.status).not.toBe("ready");
    expect(health.probedNetwork).toBe(false);
    expect(health.message).toContain("KANITI DEGILDIR");
  });

  it("gerçek probe başarılıysa ready ve probedNetwork true", async () => {
    const adapter = new ClaudeCodeAdapter({
      apiKey: "sk-test",
      model: "claude-opus-5",
      contextLimit: 200_000,
      maxOutputTokens: 64_000,
      probe: async () => ({ ok: true, latencyMs: 42, message: "ok" })
    });

    const health = await adapter.health();
    expect(health.status).toBe("ready");
    expect(health.probedNetwork).toBe(true);
    expect(health.latencyMs).toBe(42);
  });

  it("probe başarısızsa unreachable ama probedNetwork TRUE", async () => {
    // Aga cikildi ve basarisiz oldu — bu, hic cikilmamasindan FARKLI
    // bir durumdur.
    const adapter = new ClaudeCodeAdapter({
      apiKey: "sk-test",
      model: "claude-opus-5",
      contextLimit: 200_000,
      maxOutputTokens: 64_000,
      probe: async () => ({ ok: false, latencyMs: 5_000, message: "zaman asimi" })
    });

    const health = await adapter.health();
    expect(health.status).toBe("unreachable");
    expect(health.probedNetwork).toBe(true);
  });

  it("probe hata fırlatırsa yakalanır ve bildirilir", async () => {
    const adapter = new ClaudeCodeAdapter({
      apiKey: "sk-test",
      model: "claude-opus-5",
      contextLimit: 200_000,
      maxOutputTokens: 64_000,
      probe: async () => {
        throw new Error("DNS cozulemedi");
      }
    });

    const health = await adapter.health();
    expect(health.status).toBe("unreachable");
    expect(health.message).toContain("DNS");
  });
});

describe("ClaudeCodeAdapter — capability negotiation (ADR-045)", () => {
  const configured = new ClaudeCodeAdapter({
    apiKey: "sk-test",
    model: "claude-opus-5",
    contextLimit: 200_000,
    maxOutputTokens: 64_000
  });

  it("yapılandırılmamışsa yetenek TAHMİN ETMEZ", async () => {
    const adapter = new ClaudeCodeAdapter(claudeCodeConfigFromEnv({}));
    await expect(adapter.negotiate()).rejects.toThrow(/TAHMIN EDILMEZ/);
  });

  it("context limitini bildirir (bütçe motorunun girdisi)", async () => {
    const capabilities = await configured.negotiate();
    expect(capabilities.contextLimit).toBe(200_000);
  });

  it("yeteneklerin KAYNAĞINI bildirir", async () => {
    // Anthropic API'si context limitini programatik bildirmiyor;
    // deger dokumantasyondan geliyor ve bu SOYLENIYOR.
    expect((await configured.negotiate()).source).toBe("configured");
  });

  it("rate limit bilinmiyorsa TAHMİN ETMEZ", async () => {
    const capabilities = await configured.negotiate();
    expect(capabilities.rateLimit.requestsPerMinute).toBeNull();
    expect(capabilities.rateLimit.declaredBy).toBe("unknown");
  });

  it("araçları mutasyon yapıp yapmadığına göre işaretler", async () => {
    const capabilities = await configured.negotiate();
    const write = capabilities.toolSupport.find((t) => t.name === "Write");
    const read = capabilities.toolSupport.find((t) => t.name === "Read");

    // Change Firewall'in (P10) ilgilendigi ayrim.
    expect(write?.mutates).toBe(true);
    expect(read?.mutates).toBe(false);
  });

  it("ortam değişkeniyle model değiştirilebilir", () => {
    const config = claudeCodeConfigFromEnv({ CLAUDE_CODE_MODEL: "claude-sonnet-5" });
    expect(config.model).toBe("claude-sonnet-5");
  });
});

describe("ClaudeCodeAdapter — start SAHTE OTURUM DÖNDÜRMEZ", () => {
  const adapter = new ClaudeCodeAdapter({
    apiKey: "sk-test",
    model: "claude-opus-5",
    contextLimit: 200_000,
    maxOutputTokens: 64_000
  });

  it("başlatma AÇIKÇA hata verir", async () => {
    await expect(adapter.start(START_INPUT)).rejects.toBeInstanceOf(AdapterError);
    await expect(adapter.start(START_INPUT)).rejects.toThrow(/henuz baglanmadi/);
  });

  it("hata mesajı NEDEN bağlanmadığını açıklar", async () => {
    await expect(adapter.start(START_INPUT)).rejects.toThrow(/DOGRULANAMAZ/);
  });

  it("girdi doğrulaması start'tan ÖNCE çalışır", async () => {
    // Manifest eksikse `NOT_IMPLEMENTED` degil `MANIFEST_REQUIRED`.
    const invalid = { ...START_INPUT, manifest: { manifestHash: "", items: [] } };
    await expect(adapter.start(invalid)).rejects.toThrow(/manifest/i);
  });

  it("olay akışı boştur (uydurma olay yok)", async () => {
    const events = [];
    for await (const event of adapter.events("session_1")) events.push(event);
    expect(events).toEqual([]);
  });
});

describe("CodexAdapter — vendor farkları YETENEKLERDE, yapıda değil", () => {
  const codex = new CodexAdapter({
    apiKey: "sk-test",
    model: "gpt-5-codex",
    contextLimit: 128_000,
    maxOutputTokens: 32_000
  });

  it("MCP desteği Claude Code'dan FARKLI", async () => {
    const claude = new ClaudeCodeAdapter({
      apiKey: "sk-test",
      model: "claude-opus-5",
      contextLimit: 200_000,
      maxOutputTokens: 64_000
    });

    expect((await claude.negotiate()).mcpSupport).toBe(true);
    expect((await codex.negotiate()).mcpSupport).toBe(false);
  });

  it("araç kümesi farklı", async () => {
    const tools = (await codex.negotiate()).toolSupport.map((t) => t.name);
    expect(tools).toContain("apply_patch");
    expect(tools).not.toContain("Edit");
  });

  it("aynı sözleşmeyi uygular", async () => {
    const health = await codex.health();
    expect(health.adapterId).toBe("codex");
    expect(typeof health.probedNetwork).toBe("boolean");
  });

  it("ortam değişkeninden yapılandırılır", () => {
    expect(codexConfigFromEnv({ OPENAI_API_KEY: "x" }).apiKey).toBe("x");
    expect(codexConfigFromEnv({}).apiKey).toBeNull();
  });
});

describe("AdapterRegistry", () => {
  it("adapter kaydeder ve çözer", () => {
    const registry = new AdapterRegistry().register(
      new UnconfiguredAdapter("claude-code", "ANTHROPIC_API_KEY yok")
    );
    expect(registry.resolve("claude-code")).not.toBeNull();
  });

  it("bilinmeyen adapter için null döner", () => {
    expect(new AdapterRegistry().resolve("codex")).toBeNull();
  });

  it("tüm adapter'ların sağlığını toplar", async () => {
    const registry = new AdapterRegistry()
      .register(new UnconfiguredAdapter("claude-code", "anahtar yok"))
      .register(new UnconfiguredAdapter("codex", "anahtar yok"));

    const health = await registry.health();
    expect(health.length).toBe(2);
    expect(health.every((h) => h.probedNetwork === false)).toBe(true);
  });

  it("bir adapter'ın probe hatası diğerlerini DÜŞÜRMEZ", async () => {
    const failing = {
      id: "codex" as const,
      async negotiate(): Promise<never> {
        throw new Error("x");
      },
      async health(): Promise<never> {
        throw new Error("probe cokti");
      },
      async start(): Promise<never> {
        throw new Error("x");
      },
      async cancel() {},
      async *events() {}
    };

    const registry = new AdapterRegistry()
      .register(new UnconfiguredAdapter("claude-code", "anahtar yok"))
      .register(failing);

    const health = await registry.health();
    expect(health.length).toBe(2);
    // Hata SESSIZCE yutulmaz.
    expect(health.some((h) => h.message.includes("probe cokti"))).toBe(true);
  });
});

describe("UnconfiguredAdapter — sahte oturum döndürmez", () => {
  const adapter = new UnconfiguredAdapter("claude-code", "ANTHROPIC_API_KEY yok");

  it("adapter GÖRÜNÜR ama durumu not_configured", async () => {
    const health = await adapter.health();
    expect(health.status).toBe("not_configured");
    expect(health.message).toContain("ANTHROPIC_API_KEY");
  });

  it("negotiate hata verir", async () => {
    await expect(adapter.negotiate()).rejects.toThrow(/TAHMIN EDILMEZ/);
  });

  it("start hata verir ve NEDEN'i açıklar", async () => {
    await expect(adapter.start()).rejects.toThrow(/Sahte bir oturum/);
  });

  it("cancel hata VERMEZ (başlatılamayan oturum iptal edilebilir)", async () => {
    await expect(adapter.cancel()).resolves.toBeUndefined();
  });
});

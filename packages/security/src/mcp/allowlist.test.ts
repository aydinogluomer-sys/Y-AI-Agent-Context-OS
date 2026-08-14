import { describe, it, expect } from "vitest";
import {
  decideMcpToolCall,
  filterMcpTools,
  assertValidMcpPolicy,
  McpPolicyError,
  EMPTY_MCP_POLICY,
  type McpPolicy
} from "./allowlist";

const POLICY: McpPolicy = {
  grants: [
    { serverId: "github", tools: ["search_issues", "get_pull_request"] },
    { serverId: "postgres", tools: ["describe_table"] }
  ]
};

/**
 * P17 / T-09 — MCP escalation.
 *
 * MCP, agent'a ÇALIŞMA ZAMANINDA yeni araçlar kazandırır: yetenek kümesi
 * Y'nin bilgisi dışında genişler. Bu, Change Firewall'ın (ADR-039) ve
 * komut allow-list'inin etrafından dolaşmanın en temiz yolu — çünkü ikisi
 * de Y'nin BİLDİĞİ yolları korur.
 */
describe("MCP allow-list — DENY BY DEFAULT", () => {
  it("boş policy hiçbir aracı kabul etmez", () => {
    const d = decideMcpToolCall(EMPTY_MCP_POLICY, "github", "search_issues");
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("SERVER_NOT_ALLOWED");
  });

  it("izinli sunucu + izinli araç kabul edilir", () => {
    expect(decideMcpToolCall(POLICY, "github", "search_issues").allowed).toBe(true);
  });

  it("izinsiz sunucu reddedilir", () => {
    const d = decideMcpToolCall(POLICY, "evil-server", "anything");
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("SERVER_NOT_ALLOWED");
  });

  it("İZİNLİ sunucunun İZİNSİZ aracı reddedilir", () => {
    // Ikinci katmanin butun degeri bu: bir MCP sunucusunun arac kumesi
    // SURUM SURUM DEGISIR. Sunucuya guvenmek, gelecekte ekleyecegi her
    // araca pesin guvenmek olurdu.
    const d = decideMcpToolCall(POLICY, "github", "create_repository");
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("TOOL_NOT_ALLOWED");
    expect(d.detail).toContain("her aracina guvenmek degildir");
  });

  it("bir sunucunun izni diğerine geçmez", () => {
    expect(decideMcpToolCall(POLICY, "postgres", "search_issues").allowed).toBe(false);
  });
});

describe("joker YOK", () => {
  it("joker içeren policy REDDEDİLİR", () => {
    // Sessiz daraltma, operatorun verdigini sandigi izinle gercek iznin
    // ayrismasina yol acar. Yapilandirma hatasi ACIKCA soylenir.
    const bad: McpPolicy = { grants: [{ serverId: "github", tools: ["*"] }] };
    expect(() => assertValidMcpPolicy(bad)).toThrow(McpPolicyError);
    try {
      assertValidMcpPolicy(bad);
    } catch (e) {
      expect((e as McpPolicyError).reason).toBe("WILDCARD_NOT_SUPPORTED");
    }
  });

  it("kısmi joker de reddedilir", () => {
    const bad: McpPolicy = { grants: [{ serverId: "github", tools: ["get_*"] }] };
    expect(() => assertValidMcpPolicy(bad)).toThrow(McpPolicyError);
  });

  it("geçerli policy hata VERMEZ", () => {
    expect(() => assertValidMcpPolicy(POLICY)).not.toThrow();
    expect(() => assertValidMcpPolicy(EMPTY_MCP_POLICY)).not.toThrow();
  });
});

describe("negotiation süzmesi", () => {
  const ADVERTISED = [
    { serverId: "github", toolName: "search_issues" },
    { serverId: "github", toolName: "delete_repository" },
    { serverId: "shell", toolName: "run" },
    { serverId: "postgres", toolName: "describe_table" }
  ];

  it("yalnız izinli araçlar geçer", () => {
    const { allowed } = filterMcpTools(POLICY, ADVERTISED);
    expect(allowed).toEqual([
      { serverId: "github", toolName: "search_issues" },
      { serverId: "postgres", toolName: "describe_table" }
    ]);
  });

  it("reddedilenler SESSİZCE atılmaz — gerekçeleriyle döner", () => {
    // ADR-036 ile ayni disiplin: dislanan her sey SEBEBIYLE kaydedilir.
    const { rejected } = filterMcpTools(POLICY, ADVERTISED);
    expect(rejected).toHaveLength(2);
    expect(rejected.map((r) => r.reason).sort()).toEqual([
      "SERVER_NOT_ALLOWED",
      "TOOL_NOT_ALLOWED"
    ]);
    for (const r of rejected) {
      expect(r.detail.length).toBeGreaterThan(20);
    }
  });

  it("boş policy her şeyi reddeder", () => {
    const { allowed, rejected } = filterMcpTools(EMPTY_MCP_POLICY, ADVERTISED);
    expect(allowed).toEqual([]);
    expect(rejected).toHaveLength(ADVERTISED.length);
  });

  it("süzme çağrı anı kontrolünün YERİNE GEÇMEZ", () => {
    // Adapter'in listeye uyacagina guvenmek, guvenligi adapter'a
    // devretmektir. Suzulmus bir arac listesi ELDE OLSA BILE, cagri
    // aninda karar yeniden verilir.
    const { allowed } = filterMcpTools(POLICY, ADVERTISED);
    for (const tool of allowed) {
      expect(decideMcpToolCall(POLICY, tool.serverId, tool.toolName).allowed).toBe(true);
    }
    // Suzmede olmayan bir arac, cagri aninda da reddedilir.
    expect(decideMcpToolCall(POLICY, "shell", "run").allowed).toBe(false);
  });
});

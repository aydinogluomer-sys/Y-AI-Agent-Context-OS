/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P17 / T-09 — MCP ESCALATION: SUNUCU ALLOW-LIST + TOOL FİLTRESİ.
 *
 * Master plan tehdit tablosu:
 *
 *   | T-09 | MCP escalation | MCP üzerinden ek yetenek | Yetki aşımı |
 *   | MCP sunucu allow-list + tool filtresi |
 *
 * P17 denetiminde karşılığı **sıfır koddu**: `mcpAllow`, `mcp_allow`,
 * `mcpServer` için kaynak ağacında tek eşleşme yoktu. `AgentCapabilities`
 * yalnız `mcpSupport: boolean` taşıyordu — yani "MCP var mı" sorusu
 * cevaplanıyor, "hangi MCP" sorusu hiç sorulmuyordu.
 *
 * ## Tehdit
 *
 * MCP, agent'a **çalışma zamanında yeni araçlar** kazandırır. Bir MCP
 * sunucusu bağlandığında agent'ın yetenek kümesi Y'nin bilgisi dışında
 * genişler: dosya yazan, ağa çıkan, komut çalıştıran araçlar gelebilir.
 *
 * Bu, Change Firewall'ın (ADR-039) ve komut allow-list'inin etrafından
 * dolaşmanın en temiz yoludur — çünkü ikisi de Y'nin **bildiği** yolları
 * korur. Bilinmeyen bir araç, korunmayan bir yoldur.
 *
 * ## Karar: DENY-BY-DEFAULT, iki katman
 *
 * 1. **Sunucu katmanı**: yalnız açıkça izin verilen MCP sunucuları.
 * 2. **Araç katmanı**: izin verilen sunucunun de her aracı değil, yalnız
 *    açıkça listelenen araçları.
 *
 * İkinci katman gereklidir çünkü bir MCP sunucusunun araç kümesi
 * **sürüm sürüm değişir**. Sunucuya güvenmek, o sunucunun gelecekte
 * ekleyeceği her araca peşin güvenmek demektir.
 */

/** Bir MCP sunucusuna verilen izin. */
export interface McpServerGrant {
  /** Sunucu kimliği — adapter'ın bildirdiği ad. */
  readonly serverId: string;
  /**
   * İzin verilen araç adları.
   *
   * Joker YOKTUR. `"*"` desteklemek, ikinci katmanı anlamsız kılardı:
   * bir kez `"*"` yazan, sunucunun gelecekte ekleyeceği her araca da
   * izin vermiş olur.
   */
  readonly tools: readonly string[];
}

export interface McpPolicy {
  readonly grants: readonly McpServerGrant[];
}

export type McpRejectionReason =
  | "SERVER_NOT_ALLOWED"
  | "TOOL_NOT_ALLOWED"
  | "WILDCARD_NOT_SUPPORTED";

export interface McpDecision {
  readonly allowed: boolean;
  readonly serverId: string;
  readonly toolName: string;
  readonly reason: McpRejectionReason | null;
  /** Kanıta yazılacak insan-okunur gerekçe. */
  readonly detail: string;
}

export class McpPolicyError extends Error {
  constructor(readonly reason: McpRejectionReason, detail: string) {
    super(detail);
    this.name = "McpPolicyError";
  }
}

/**
 * Policy'yi doğrular.
 *
 * Joker içeren bir grant **yapılandırma hatasıdır** ve çalışma zamanında
 * sessizce dar yorumlanmaz — açıkça reddedilir. Sessiz daraltma, operatörün
 * verdiğini sandığı izinle gerçek iznin ayrışmasına yol açar.
 */
export function assertValidMcpPolicy(policy: McpPolicy): void {
  for (const grant of policy.grants) {
    for (const tool of grant.tools) {
      if (tool.includes("*")) {
        throw new McpPolicyError(
          "WILDCARD_NOT_SUPPORTED",
          `MCP grant'inda joker yok: ${grant.serverId}/${tool}. ` +
            "Joker, sunucunun gelecekte ekleyecegi her araca pesin izin verir."
        );
      }
    }
  }
}

/**
 * Bir araç çağrısına izin verilip verilmediğini söyler.
 *
 * FAIL CLOSED: listede olmayan her şey reddedilir. Boş bir policy,
 * hiçbir MCP aracının çalışmaması demektir — ve bu doğru varsayılandır.
 */
export function decideMcpToolCall(
  policy: McpPolicy,
  serverId: string,
  toolName: string
): McpDecision {
  const grant = policy.grants.find((g) => g.serverId === serverId);

  if (!grant) {
    return {
      allowed: false,
      serverId,
      toolName,
      reason: "SERVER_NOT_ALLOWED",
      detail:
        `MCP sunucusu izinli degil: ${serverId}. ` +
        "Bilinmeyen bir sunucu, Y'nin korumadigi bir yoldur."
    };
  }

  if (!grant.tools.includes(toolName)) {
    return {
      allowed: false,
      serverId,
      toolName,
      reason: "TOOL_NOT_ALLOWED",
      detail:
        `Arac izinli degil: ${serverId}/${toolName}. ` +
        "Sunucuya guvenmek, o sunucunun her aracina guvenmek degildir."
    };
  }

  return {
    allowed: true,
    serverId,
    toolName,
    reason: null,
    detail: `${serverId}/${toolName} izinli.`
  };
}

/**
 * Adapter'ın bildirdiği MCP araç kümesini policy'ye göre süzer.
 *
 * Süzme **negotiation sırasında** yapılır (ADR-045): agent'a hiç
 * verilmeyen bir araç, çağrılamayacağı için ayrıca engellenmesine gerek
 * kalmaz. Yine de `decideMcpToolCall` çağrı anında da uygulanır —
 * adapter'ın listeye uyacağına güvenmek, güvenliği adapter'a devretmektir.
 */
export function filterMcpTools(
  policy: McpPolicy,
  advertised: readonly { serverId: string; toolName: string }[]
): {
  readonly allowed: readonly { serverId: string; toolName: string }[];
  readonly rejected: readonly McpDecision[];
} {
  const allowed: { serverId: string; toolName: string }[] = [];
  const rejected: McpDecision[] = [];

  for (const tool of advertised) {
    const decision = decideMcpToolCall(policy, tool.serverId, tool.toolName);
    if (decision.allowed) {
      allowed.push(tool);
    } else {
      // Reddedilenler SESSIZCE atilmaz: hangi aracin neden dislandigi
      // kanita yazilir (ADR-036 ile ayni disiplin).
      rejected.push(decision);
    }
  }

  return { allowed, rejected };
}

/** Hiçbir MCP aracına izin vermeyen policy. Güvenli varsayılan. */
export const EMPTY_MCP_POLICY: McpPolicy = { grants: [] };

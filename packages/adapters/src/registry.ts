/**
 * P11 — Adapter registry ve yapılandırılmamış adapter.
 *
 * `UnconfiguredAdapter` NEDEN VAR
 *   Bir adapter'ın kimliği bilinir ama kimlik bilgisi yapılandırılmamış
 *   olabilir. Bu durumda iki yanlış seçenek vardır:
 *     (a) Adapter'ı listeden gizlemek — kullanıcı neyin eksik olduğunu
 *         göremez.
 *     (b) "ready" demek — P00'daki sahte health probe'un aynısı.
 *
 *   Doğrusu: adapter GÖRÜNÜR, durumu `not_configured` ve `start()`
 *   çağrısı AÇIKÇA hata verir.
 */

import {
  AdapterError,
  type AgentAdapter,
  type AgentAdapterId,
  type AgentCapabilities,
  type AgentEvent,
  type AgentSession,
  type HealthResult
} from "./types";

export class AdapterRegistry {
  private readonly adapters = new Map<AgentAdapterId, AgentAdapter>();

  register(adapter: AgentAdapter): this {
    this.adapters.set(adapter.id, adapter);
    return this;
  }

  resolve(id: AgentAdapterId): AgentAdapter | null {
    return this.adapters.get(id) ?? null;
  }

  list(): AgentAdapterId[] {
    return [...this.adapters.keys()].sort();
  }

  /**
   * Tüm adapter'ların sağlığı.
   *
   * Bir adapter'ın probe'u başarısız olursa DİĞERLERİ etkilenmez ama
   * hata SESSİZCE YUTULMAZ: sonuç `unreachable` olarak döner ve sebebi
   * mesajda taşınır.
   */
  async health(): Promise<HealthResult[]> {
    return Promise.all(
      [...this.adapters.values()].map(async (adapter) => {
        try {
          return await adapter.health();
        } catch (error) {
          return {
            adapterId: adapter.id,
            status: "unreachable" as const,
            probedNetwork: false,
            latencyMs: null,
            checkedAt: new Date().toISOString(),
            message: `Probe hata verdi: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      })
    );
  }
}

/**
 * Kimlik bilgisi yapılandırılmamış adapter.
 *
 * Sözleşmeyi tam olarak uygular ama hiçbir şey yapmaz ve YAPMADIĞINI
 * söyler. Sahte bir oturum döndürmek, run'ın "çalıştı" görünmesine ve
 * hiçbir şey üretmemesine yol açardı — P00'daki agent runtime'ın tam
 * olarak yaptığı şey.
 */
export class UnconfiguredAdapter implements AgentAdapter {
  constructor(
    readonly id: AgentAdapterId,
    private readonly missingConfiguration: string
  ) {}

  async negotiate(): Promise<AgentCapabilities> {
    throw new AdapterError(
      "NOT_CONFIGURED",
      `${this.id} yapilandirilmamis (${this.missingConfiguration}). Yetenekler ` +
        `TAHMIN EDILMEZ: varsayilan bir context limiti uydurmak, butce motorunu ` +
        `yanlis bir sayiyla besler.`
    );
  }

  async health(): Promise<HealthResult> {
    return {
      adapterId: this.id,
      status: "not_configured",
      // AGA CIKILMADI ve bu acikca bildiriliyor. P00'daki probe
      // `process.env` bakip "Live Connectivity Probe" diyordu.
      probedNetwork: false,
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      message: `${this.id} yapilandirilmamis: ${this.missingConfiguration}`
    };
  }

  async start(): Promise<AgentSession> {
    throw new AdapterError(
      "NOT_CONFIGURED",
      `${this.id} yapilandirilmamis; oturum baslatilamaz. Sahte bir oturum ` +
        `dondurmek, run'in "calisti" gorunmesine ve hicbir sey uretmemesine ` +
        `yol acardi (P00 agent runtime bulgusunun aynisi).`
    );
  }

  async cancel(): Promise<void> {
    // Baslatilamayan bir oturumu iptal etmek bir hata degildir.
  }

  async *events(sessionId: string): AsyncIterable<AgentEvent> {
    // Olay yok. Bos bir akis, uydurma olaylardan durusttur.
    void sessionId;
  }
}

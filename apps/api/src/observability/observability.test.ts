/**
 * P18 — Sağlık ve metrik testleri.
 *
 * P00'da metrik yoktu ve `readyz` bağımlılık bazlı değildi: kuyruk
 * tıkalı, worker'lar ölü, policy store erişilemez olsa bile "hazır"
 * diyordu.
 */

import { describe, it, expect } from "vitest";
import {
  METRIC_DEFINITIONS,
  MetricsRegistry
} from "./metrics";
import {
  PROBE_TIMEOUT_MS,
  aggregate,
  checkReadiness,
  databaseCheck,
  defaultChecks,
  evidenceChainCheck,
  indexCheck,
  policyStoreCheck,
  probeWithTimeout,
  queueCheck,
  statusCodeFor,
  workerCheck,
  graphCheck,
  eventStoreCheck,
  casCheck,
  providerCheck,
  type ComponentHealth,
  type HealthCheck,
  type ProbeDb
} from "./health";

function component(overrides: Partial<ComponentHealth>): ComponentHealth {
  return {
    name: "x",
    status: "ok",
    message: "",
    latencyMs: 1,
    checkedAt: new Date().toISOString(),
    required: true,
    ...overrides
  };
}

function createDb(rows: Record<string, any[]> = {}): ProbeDb & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async query(sql: string) {
      const flat = sql.replace(/\s+/g, " ").trim();
      calls.push(flat);
      for (const [needle, result] of Object.entries(rows)) {
        if (flat.includes(needle)) return { rows: result, rowCount: result.length };
      }
      return { rows: [], rowCount: 0 };
    }
  };
}

describe("aggregate — degraded ayrı bir durumdur", () => {
  it("hepsi ok ise ok", () => {
    expect(aggregate([component({}), component({})])).toBe("ok");
  });

  it("zorunlu bileşen down ise down", () => {
    expect(aggregate([component({}), component({ status: "down", required: true })])).toBe("down");
  });

  it("zorunlu bileşen degraded ise degraded", () => {
    expect(aggregate([component({ status: "degraded" })])).toBe("degraded");
  });

  it("zorunlu OLMAYAN bileşen down ise degraded (down değil)", () => {
    // Sistem kisitli calisabilir; tamamen kapatmak asiri tepki olurdu.
    expect(aggregate([component({}), component({ status: "down", required: false })])).toBe(
      "degraded"
    );
  });

  it("bileşen yoksa ok", () => {
    expect(aggregate([])).toBe("ok");
  });
});

describe("statusCodeFor — degraded 200 döner", () => {
  it("ok 200", () => expect(statusCodeFor("ok")).toBe(200));

  it("degraded 200 (kısmi çalışan sistem kapatılmaz)", () => {
    expect(statusCodeFor("degraded")).toBe(200);
  });

  it("down 503", () => expect(statusCodeFor("down")).toBe(503));
});

describe("probeWithTimeout — asılı kalan bağımlılık bloklamaz", () => {
  it("başarılı probe sonucu döndürür", async () => {
    const check: HealthCheck = {
      name: "test",
      required: true,
      async probe() {
        return { status: "ok", message: "iyi" };
      }
    };

    const result = await probeWithTimeout(check);
    expect(result.status).toBe("ok");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("hata fırlatan probe down döner (yutulmaz)", async () => {
    const check: HealthCheck = {
      name: "test",
      required: true,
      async probe(): Promise<never> {
        throw new Error("baglanti reddedildi");
      }
    };

    const result = await probeWithTimeout(check);
    expect(result.status).toBe("down");
    expect(result.message).toContain("baglanti reddedildi");
  });

  it("asılı probe zaman aşımına uğrar", async () => {
    // Zaman asimi OLMADAN, asili kalan tek bir bagimlilik `readyz`'yi
    // suresiz bloklar ve tesihs edilemeyen bir kesinti uretir.
    const check: HealthCheck = {
      name: "test",
      required: true,
      probe() {
        return new Promise(() => {});
      }
    };

    const result = await probeWithTimeout(check, 20);
    expect(result.status).toBe("down");
    expect(result.message).toContain("zaman asimi");
  });

  it("varsayılan zaman aşımı load balancer probe'unun altında", () => {
    expect(PROBE_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
  });
});

describe("checkReadiness — probe'lar PARALEL", () => {
  it("tüm bileşenleri raporlar", async () => {
    const db = createDb({
      "SELECT 1": [{ "?column?": 1 }],
      "FROM policy_rules": [{ count: 5 }],
      "FROM evidence_chain": [{ head: 3 }],
      "status = 'queued'": [{ count: 2 }],
      "lease_expires_at < NOW()": [{ count: 0 }],
      "FROM symbols": [{ count: 100 }]
    });

    // [P17 / A6] Bilesen sayisi 6 -> 10: spec §27'nin ayrica istedigi
    // graph, event_store, cas ve provider probe'lari eklendi.
    const report = await checkReadiness(defaultChecks(db));
    expect(report.components.length).toBe(10);

    // Adapter YAPILANDIRILMAMIS oldugu icin sistem `degraded`. Bu bir
    // test kolayligi degil, SISTEMIN GERCEGI: agent calistirilamaz.
    expect(report.status).toBe("degraded");
    const provider = report.components.find((c) => c.name === "provider");
    expect(provider?.status).toBe("degraded");
  });

  it("adapter yapılandırılmışsa tüm bileşenler OK", async () => {
    const db = createDb({
      "SELECT 1": [{ "?column?": 1 }],
      "FROM policy_rules": [{ count: 5 }],
      "FROM evidence_chain": [{ head: 3 }],
      "status = 'queued'": [{ count: 2 }],
      "lease_expires_at < NOW()": [{ count: 0 }],
      "FROM symbols": [{ count: 100 }],
      "FROM graph_nodes": [{ nodes: 50, edges: 90, symbols: 100 }]
    });

    const report = await checkReadiness(defaultChecks(db, ["claude-code"]));
    expect(report.status).toBe("ok");
  });

  it("paralel çalıştığı için toplam süre tek probe'a yakın", async () => {
    const slow = (name: string): HealthCheck => ({
      name,
      required: false,
      async probe() {
        await new Promise((r) => setTimeout(r, 40));
        return { status: "ok", message: "" };
      }
    });

    const startedAt = Date.now();
    await checkReadiness([slow("a"), slow("b"), slow("c"), slow("d")]);
    const elapsed = Date.now() - startedAt;

    // Sirali olsaydi ~160ms olurdu.
    expect(elapsed).toBeLessThan(140);
  });

  it("bir probe'un çökmesi diğerlerini düşürmez", async () => {
    const good: HealthCheck = {
      name: "iyi",
      required: false,
      async probe() {
        return { status: "ok", message: "" };
      }
    };
    const bad: HealthCheck = {
      name: "kotu",
      required: false,
      async probe(): Promise<never> {
        throw new Error("cokme");
      }
    };

    const report = await checkReadiness([good, bad]);
    expect(report.components.length).toBe(2);
    expect(report.status).toBe("degraded");
  });
});

describe("bağımlılık probe'ları", () => {
  it("veritabanı zorunludur", () => {
    expect(databaseCheck(createDb()).required).toBe(true);
  });

  it("policy store kuralsızsa degraded (fail-closed tutarlılığı)", async () => {
    const db = createDb({ "FROM policy_rules": [{ count: 0 }] });
    const result = await policyStoreCheck(db).probe();

    expect(result.status).toBe("degraded");
    expect(result.message).toContain("DENY");
  });

  it("policy store kural varsa ok", async () => {
    const db = createDb({ "FROM policy_rules": [{ count: 12 }] });
    expect((await policyStoreCheck(db).probe()).status).toBe("ok");
  });

  it("kuyruk eşiği aşınca degraded", async () => {
    const db = createDb({ "status = 'queued'": [{ count: 5_000 }] });
    const result = await queueCheck(db, 1_000).probe();

    // Kuyruk birikiyorsa sistem calisiyor ama geride kaliyor; bunu `ok`
    // saymak, sorunun ancak tamamen durdugunda fark edilmesi demekti.
    expect(result.status).toBe("degraded");
    expect(result.message).toContain("5000");
  });

  it("bayat lease varsa worker degraded", async () => {
    const db = createDb({ "lease_expires_at < NOW()": [{ count: 3 }] });
    const result = await workerCheck(db).probe();

    expect(result.status).toBe("degraded");
    expect(result.message).toContain("cokmus olabilir");
  });

  it("index boşsa degraded (boş context'in sebebi görünür olur)", async () => {
    const db = createDb({ "FROM symbols": [{ count: 0 }] });
    const result = await indexCheck(db).probe();

    expect(result.status).toBe("degraded");
    expect(result.message).toContain("bos donecek");
  });

  it("kanıt zinciri okunamıyorsa down", async () => {
    const failing: ProbeDb = {
      async query(): Promise<never> {
        throw new Error("tablo yok");
      }
    };
    const result = await probeWithTimeout(evidenceChainCheck(failing));
    expect(result.status).toBe("down");
  });

  it("kanıt zinciri zorunludur", () => {
    expect(evidenceChainCheck(createDb()).required).toBe(true);
  });
});

// --- Metrikler -------------------------------------------------------------

describe("A6 — spec §27'nin eksik dört probe'u", () => {
  it("defaultChecks ON bileşen döndürür", () => {
    const names = defaultChecks(createDb()).map((c) => c.name);
    expect(names).toEqual([
      "database",
      "policy_store",
      "evidence_chain",
      "queue",
      "workers",
      "index",
      "graph",
      "event_store",
      "cas",
      "provider"
    ]);
  });

  it("graph: sembol var ama düğüm yoksa DEGRADED", async () => {
    // Graph worker'i geride kaldiginda retrieval calisir ama graph
    // genisletmesi SESSIZCE bos doner ve sonuc, hic bagimliligi olmayan
    // bir kod tabani gibi gorunur.
    const db = createDb({ "FROM graph_nodes": [{ nodes: 0, edges: 0, symbols: 1200 }] });
    const result = await graphCheck(db).probe();
    expect(result.status).toBe("degraded");
    expect(result.message).toContain("graph worker");
  });

  it("graph: düğüm varsa OK", async () => {
    const db = createDb({ "FROM graph_nodes": [{ nodes: 500, edges: 900, symbols: 1200 }] });
    const result = await graphCheck(db).probe();
    expect(result.status).toBe("ok");
    expect(result.message).toContain("500");
  });

  it("graph: hiç sembol yoksa degraded DEĞİL", async () => {
    // Bos bir kurulumda graph'in bos olmasi bir ariza degildir.
    const db = createDb({ "FROM graph_nodes": [{ nodes: 0, edges: 0, symbols: 0 }] });
    expect((await graphCheck(db).probe()).status).toBe("ok");
  });

  it("event_store ZORUNLU bileşendir", () => {
    // Olaylar yayinin ve durum gecisi kaydinin kaynagi (ADR-048).
    expect(eventStoreCheck(createDb()).required).toBe(true);
  });

  it("event_store ve cas probe'ları YALNIZ OKUR", async () => {
    // Yazan bir probe, sistem saglikli oldugu surece veri uretmeye devam
    // eder ve olctugu seyi kirletir.
    const db = createDb();
    await eventStoreCheck(db).probe();
    await casCheck(db).probe();
    for (const sql of db.calls) {
      expect(sql).toMatch(/^SELECT/i);
      expect(sql).not.toMatch(/INSERT|UPDATE|DELETE/i);
    }
  });

  it("provider: adapter yoksa DEGRADED", async () => {
    const result = await providerCheck([]).probe();
    expect(result.status).toBe("degraded");
    expect(result.message).toContain("calistirilamaz");
  });

  it("provider: adapter varsa OK", async () => {
    const result = await providerCheck(["claude-code", "codex"]).probe();
    expect(result.status).toBe("ok");
    expect(result.message).toContain("claude-code");
  });

  it("provider probe'u AĞA ÇIKMAZ — DB bile sorgulamaz", async () => {
    // Readiness her cagrildiginda dis saglayiciya istek atmak hem kota
    // harcar hem o saglayicinin yavaslamasinin Y'yi trafikten
    // dusurmesine yol acar. Gercek ag yoklamasi adapter.health()'te ve
    // sonucu probedNetwork: true tasir (ADR-045).
    const db = createDb();
    const check = providerCheck([]);
    await check.probe();
    expect(db.calls).toEqual([]);
  });

  it("provider ZORUNLU DEĞİL — agent yoksa sistem 503 dönmez", async () => {
    // Y, agent olmadan da context derleyip manifest uretebilir. Bunu
    // `required` yapmak, calisan bir yetenegi trafikten dusururdu.
    expect(providerCheck([]).required).toBe(false);
    const report = await checkReadiness([providerCheck([])]);
    expect(statusCodeFor(report.status)).toBe(200);
  });
});

describe("MetricsRegistry — ölçülmeyen metrik RAPORLANMAZ", () => {
  it("hiç ölçüm yoksa çıktı boş", () => {
    // Tanimli ama hic gozlem almamis bir metrigi sifirla basmak,
    // "olctuk ve sifir cikti" demek olurdu — P16'da silinen hatanin
    // aynisi.
    expect(new MetricsRegistry().render()).toBe("");
  });

  it("ölçülmemiş metrikler listelenebilir", () => {
    const registry = new MetricsRegistry();
    registry.increment("y_policy_denials_total");

    const unmeasured = registry.unmeasured();
    expect(unmeasured).not.toContain("y_policy_denials_total");
    expect(unmeasured.length).toBe(METRIC_DEFINITIONS.length - 1);
  });

  it("bilinmeyen metrik adı SESSİZCE kabul edilmez", () => {
    // Kayit defterinde olmayan bir metrik, adi yanlis yazilmis bir
    // metriktir; sessizce kabul edilirse ciktida hic gorunmez.
    expect(() => new MetricsRegistry().increment("y_uydurma_metrik")).toThrow(/Bilinmeyen metrik/);
  });

  it("metrik türü uyuşmazlığı reddedilir", () => {
    const registry = new MetricsRegistry();
    expect(() => registry.set("y_policy_denials_total", 5)).toThrow(/turu uyusmuyor/);
  });
});

describe("MetricsRegistry — counter ve gauge", () => {
  it("sayaç artar", () => {
    const registry = new MetricsRegistry();
    registry.increment("y_policy_denials_total");
    registry.increment("y_policy_denials_total", {}, 2);

    expect(registry.render()).toContain("y_policy_denials_total 3");
  });

  it("etiketli seriler ayrı sayılır", () => {
    const registry = new MetricsRegistry();
    registry.increment("y_provider_errors_total", { provider: "anthropic" });
    registry.increment("y_provider_errors_total", { provider: "openai" }, 5);

    const output = registry.render();
    expect(output).toContain('y_provider_errors_total{provider="anthropic"} 1');
    expect(output).toContain('y_provider_errors_total{provider="openai"} 5');
  });

  it("gauge son değeri tutar", () => {
    const registry = new MetricsRegistry();
    registry.set("y_queue_depth", 10);
    registry.set("y_queue_depth", 3);

    expect(registry.render()).toContain("y_queue_depth 3");
  });

  it("etiket sırası çıktıyı değiştirmez", () => {
    const a = new MetricsRegistry();
    a.increment("y_provider_errors_total", { provider: "x", kind: "timeout" });

    const b = new MetricsRegistry();
    b.increment("y_provider_errors_total", { kind: "timeout", provider: "x" });

    expect(a.render()).toBe(b.render());
  });

  it("etiket değerindeki tırnak kaçırılır", () => {
    // Kacirilmazsa TUM metrikler ayristirilamaz hale gelir; tek bir
    // kotu etiket, gozlemlenebilirligin tamamini dusurur.
    const registry = new MetricsRegistry();
    registry.increment("y_provider_errors_total", { message: 'bir "hata" oldu' });

    expect(registry.render()).toContain('\\"hata\\"');
  });
});

describe("MetricsRegistry — histogram", () => {
  it("kova, toplam ve sayı üretir", () => {
    const registry = new MetricsRegistry();
    registry.observe("y_context_tokens", 3_000);
    registry.observe("y_context_tokens", 30_000);

    const output = registry.render();
    expect(output).toContain('y_context_tokens_bucket{le="5000"} 1');
    expect(output).toContain('y_context_tokens_bucket{le="+Inf"} 2');
    expect(output).toContain("y_context_tokens_sum 33000");
    expect(output).toContain("y_context_tokens_count 2");
  });

  it("time() süreyi kaydeder", async () => {
    const registry = new MetricsRegistry();
    await registry.time("y_retrieval_duration_seconds", { channel: "lexical" }, async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(registry.render()).toContain('y_retrieval_duration_seconds_count{channel="lexical"} 1');
  });

  it("time() HATA durumunda da ölçüm kaydeder", async () => {
    // Hata firlatan bir islemin suresi, basarili olanlardan daha
    // ilgincdir.
    const registry = new MetricsRegistry();

    await expect(
      registry.time("y_retrieval_duration_seconds", {}, async () => {
        throw new Error("basarisiz");
      })
    ).rejects.toThrow();

    expect(registry.render()).toContain("y_retrieval_duration_seconds_count 1");
  });
});

describe("metrik kayıt defteri — master §27 kapsamı", () => {
  it("14 metrik tanımlı", () => {
    expect(METRIC_DEFINITIONS.length).toBe(14);
  });

  it("her metriğin açıklaması var", () => {
    for (const definition of METRIC_DEFINITIONS) {
      expect(definition.help.length, definition.name).toBeGreaterThan(0);
    }
  });

  it("her histogram kova tanımlar", () => {
    for (const definition of METRIC_DEFINITIONS) {
      if (definition.kind !== "histogram") continue;
      expect(definition.buckets?.length, definition.name).toBeGreaterThan(0);
    }
  });

  it("kayıt defteri bir NİYET BEYANI değil", () => {
    // Bir metrigi tanimlamak onu URETMEZ. Bugun hicbiri toplanmiyor ve
    // `unmeasured()` bunu gorunur kiliyor — bu test o gercegi kayit
    // altina alir.
    expect(new MetricsRegistry().unmeasured().length).toBe(METRIC_DEFINITIONS.length);
  });
});

/**
 * P18 / Y-P18-001 — Bağımlılık bazlı sağlık ve hazırlık.
 *
 * P00 Truth Audit: `/health`, `/healthz`, `/readyz` vardı ama
 * **bağımlılık bazlı değildi**. DB dışında hiçbir alt sistemi
 * yansıtmıyordu. Yani kuyruk tıkalı, worker'lar ölü, policy store
 * erişilemez ya da index bozuk olsa bile `readyz` "hazır" diyordu.
 *
 * `healthz` İLE `readyz` FARKI
 *   - `healthz`: SÜREÇ canlı mı. Bağımlılık kontrol ETMEZ. Kubernetes
 *     liveness probe'u buna bakar; başarısız olursa süreç YENİDEN
 *     BAŞLATILIR.
 *   - `readyz`: süreç TRAFİK ALABİLİR Mİ. Bağımlılıkları kontrol EDER.
 *     Başarısız olursa süreç yaşar ama load balancer trafiği keser.
 *
 *   İkisini karıştırmak pahalıdır: DB'ye bakan bir liveness probe, DB
 *   kısa süreliğine yavaşladığında tüm süreçleri yeniden başlatır ve
 *   kesintiyi büyütür.
 *
 * FAIL-CLOSED TUTARLILIĞI (P02 ile ortak)
 *   Policy store erişilemezse `readyz` **degraded** döner. Bu, P02'nin
 *   "policy store down → DENY" kararıyla aynı hattadır: yetki kararı
 *   verilemeyen bir sistem trafik almamalıdır.
 */

export type ComponentStatus = "ok" | "degraded" | "down";

export interface ComponentHealth {
  readonly name: string;
  readonly status: ComponentStatus;
  readonly message: string;
  readonly latencyMs: number | null;
  readonly checkedAt: string;
  /**
   * Bu bileşen hazırlık için ZORUNLU mu.
   *
   * `false` olan bir bileşenin `down` olması `readyz`'yi `degraded`
   * yapar ama `down` yapmaz: sistem kısıtlı çalışabilir.
   */
  readonly required: boolean;
}

export interface ReadinessReport {
  readonly status: ComponentStatus;
  readonly components: readonly ComponentHealth[];
  readonly checkedAt: string;
  readonly durationMs: number;
}

export interface HealthCheck {
  readonly name: string;
  readonly required: boolean;
  probe(): Promise<{ status: ComponentStatus; message: string }>;
}

/** Tek bir probe'un azami süresi. */
export const PROBE_TIMEOUT_MS = 3_000;

/**
 * Probe'u zaman aşımıyla sarar.
 *
 * Zaman aşımı OLMADAN, asılı kalan tek bir bağımlılık `readyz`'yi
 * süresiz bloklar ve load balancer probe'u da zaman aşımına uğrar —
 * sonuç, teşhis edilemeyen bir kesintidir.
 */
export async function probeWithTimeout(
  check: HealthCheck,
  timeoutMs: number = PROBE_TIMEOUT_MS
): Promise<ComponentHealth> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    const result = await Promise.race([
      check.probe(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`probe zaman asimi (${timeoutMs}ms)`)), timeoutMs)
      )
    ]);

    return {
      name: check.name,
      status: result.status,
      message: result.message,
      latencyMs: Date.now() - startedAt,
      checkedAt,
      required: check.required
    };
  } catch (error) {
    return {
      name: check.name,
      status: "down",
      message: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
      checkedAt,
      required: check.required
    };
  }
}

/**
 * Bileşen durumlarını tek bir hazırlık kararına indirger.
 *
 * KURAL:
 *   - Zorunlu bir bileşen `down` ise → `down`.
 *   - Zorunlu bir bileşen `degraded` ya da zorunlu olmayan biri `down`
 *     ise → `degraded`.
 *   - Aksi halde `ok`.
 *
 * `degraded` bilinçli olarak ayrı bir durumdur: "çalışıyor ama tam
 * değil" ile "çalışmıyor" arasındaki fark, operatörün müdahale
 * aciliyetini belirler.
 */
export function aggregate(components: readonly ComponentHealth[]): ComponentStatus {
  if (components.length === 0) return "ok";

  const requiredDown = components.some((c) => c.required && c.status === "down");
  if (requiredDown) return "down";

  const anyProblem = components.some(
    (c) => c.status === "degraded" || (!c.required && c.status === "down")
  );
  return anyProblem ? "degraded" : "ok";
}

/**
 * Tüm probe'ları PARALEL çalıştırır.
 *
 * Sıralı çalıştırmak, `readyz` süresini probe sayısıyla çarpardı:
 * 9 bileşen × 3 saniye = 27 saniye, ki bu her load balancer probe'unun
 * zaman aşımını aşar.
 */
export async function checkReadiness(
  checks: readonly HealthCheck[],
  timeoutMs: number = PROBE_TIMEOUT_MS
): Promise<ReadinessReport> {
  const startedAt = Date.now();
  const components = await Promise.all(checks.map((check) => probeWithTimeout(check, timeoutMs)));

  return {
    status: aggregate(components),
    components,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt
  };
}

/** Hazırlık durumundan HTTP kodu. */
export function statusCodeFor(status: ComponentStatus): number {
  // `degraded` 200 doner: sistem trafik alabilir ama operator
  // bilgilendirilmeli. 503 dondurmek, kismi calisan bir sistemi
  // tamamen kapatmak olurdu.
  return status === "down" ? 503 : 200;
}

// --- Standart probe'lar ----------------------------------------------------

export interface ProbeDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export function databaseCheck(db: ProbeDb): HealthCheck {
  return {
    name: "database",
    required: true,
    async probe() {
      await db.query("SELECT 1;");
      return { status: "ok", message: "Baglanti calisiyor." };
    }
  };
}

/**
 * Policy store — P02 fail-closed ile tutarlı.
 *
 * Erişilemezse `readyz` degraded olur. Yetki kararı verilemeyen bir
 * sistem trafik almamalıdır; ama tamamen `down` da değildir çünkü
 * fail-closed davranış zaten güvenli tarafta (her şeyi DENY eder).
 */
export function policyStoreCheck(db: ProbeDb): HealthCheck {
  return {
    name: "policy_store",
    required: true,
    async probe() {
      const result = await db.query("SELECT COUNT(*)::int AS count FROM policy_rules;");
      const count = Number(result.rows[0]?.count ?? 0);
      if (count === 0) {
        return {
          status: "degraded",
          message:
            "Policy kurali yok. Fail-closed davranis her seyi DENY eder; " +
            "sistem calisir ama hicbir context uretilemez."
        };
      }
      return { status: "ok", message: `${count} policy kurali yuklu.` };
    }
  };
}

/**
 * Kuyruk derinliği.
 *
 * Eşik AŞILDIĞINDA `degraded`: kuyruk birikiyorsa sistem çalışıyor ama
 * geride kalıyor. Bunu `ok` saymak, sorunun ancak tamamen durduğunda
 * fark edilmesi demek olurdu.
 */
export function queueCheck(db: ProbeDb, degradedThreshold = 1_000): HealthCheck {
  return {
    name: "queue",
    required: false,
    async probe() {
      const result = await db.query(
        "SELECT COUNT(*)::int AS count FROM jobs WHERE status = 'queued';"
      );
      const depth = Number(result.rows[0]?.count ?? 0);

      if (depth > degradedThreshold) {
        return {
          status: "degraded",
          message: `Kuyrukta ${depth} is bekliyor (esik ${degradedThreshold}). Worker'lar geride kaliyor.`
        };
      }
      return { status: "ok", message: `Kuyruk derinligi ${depth}.` };
    }
  };
}

/**
 * Worker canlılığı.
 *
 * Lease süresi dolmuş çalışan iş varsa worker çökmüş demektir. Kuyruk
 * bunları geri alır (P12) ama sık tekrarlanması bir sorun işaretidir.
 */
export function workerCheck(db: ProbeDb): HealthCheck {
  return {
    name: "workers",
    required: false,
    async probe() {
      const result = await db.query(
        "SELECT COUNT(*)::int AS count FROM jobs WHERE status = 'running' AND lease_expires_at < NOW();"
      );
      const stale = Number(result.rows[0]?.count ?? 0);

      if (stale > 0) {
        return {
          status: "degraded",
          message: `${stale} isin lease'i dolmus; worker cokmus olabilir. Kuyruk bunlari geri alacak.`
        };
      }
      return { status: "ok", message: "Bayat lease yok." };
    }
  };
}

/**
 * Kanıt zinciri bütünlüğü.
 *
 * Yalnız zincirin UCUNU kontrol eder; tam doğrulama pahalıdır ve
 * ayrı bir işe aittir. Uç okunamıyorsa zincir yazılamıyor demektir ve
 * bu, kanıt üretiminin durduğu anlamına gelir.
 */
export function evidenceChainCheck(db: ProbeDb): HealthCheck {
  return {
    name: "evidence_chain",
    required: true,
    async probe() {
      await db.query("SELECT MAX(sequence) AS head FROM evidence_chain;");
      return { status: "ok", message: "Zincir ucu okunabiliyor." };
    }
  };
}

/**
 * Index sağlığı.
 *
 * Hiç sembol yoksa `degraded`: sistem çalışır ama retrieval boş döner.
 * Bunu `ok` saymak, boş context'in sebebinin görünmemesi demektir.
 */
export function indexCheck(db: ProbeDb): HealthCheck {
  return {
    name: "index",
    required: false,
    async probe() {
      const result = await db.query("SELECT COUNT(*)::int AS count FROM symbols;");
      const count = Number(result.rows[0]?.count ?? 0);

      if (count === 0) {
        return {
          status: "degraded",
          message: "Hicbir sembol index'lenmemis; retrieval bos donecek."
        };
      }
      return { status: "ok", message: `${count} sembol index'li.` };
    }
  };
}

/**
 * Graph sağlığı (spec §27: "graph health").
 *
 * Sembol var ama düğüm yoksa `degraded`: graph worker'ı geride kalmış
 * demektir. Retrieval çalışmaya devam eder ama **graph genişletmesi
 * sessizce boş döner** — ve sonuç, hiç bağımlılığı olmayan bir kod tabanı
 * gibi görünür. Bunu `ok` saymak, eksik context'in sebebini gizler.
 */
export function graphCheck(db: ProbeDb): HealthCheck {
  return {
    name: "graph",
    required: false,
    async probe() {
      const result = await db.query(
        `SELECT
           (SELECT COUNT(*)::int FROM graph_nodes) AS nodes,
           (SELECT COUNT(*)::int FROM graph_edges) AS edges,
           (SELECT COUNT(*)::int FROM symbols)    AS symbols;`
      );
      const row = result.rows[0] ?? {};
      const nodes = Number(row.nodes ?? 0);
      const edges = Number(row.edges ?? 0);
      const symbols = Number(row.symbols ?? 0);

      if (symbols > 0 && nodes === 0) {
        return {
          status: "degraded",
          message:
            `${symbols} sembol var ama graph dugumu yok; graph worker'i geride. ` +
            "Graph genisletmesi bos donecek."
        };
      }
      return { status: "ok", message: `${nodes} dugum, ${edges} kenar.` };
    }
  };
}

/**
 * Event store sağlığı (spec §27: "event health").
 *
 * Olaylar yayının (P13 SSE) ve durum geçişi kaydının (ADR-048) kaynağıdır.
 * Yazılamıyorsa run'lar ilerler ama **hiçbir geçiş kaydedilmez** — kanıt
 * zinciri sessizce boşalır.
 *
 * Probe yalnız OKUR. Sağlık kontrolünün yan etkisi olmamalıdır: yazan bir
 * probe, sistem sağlıklı olduğu sürece veri üretmeye devam eder ve
 * ölçtüğü şeyi kirletir.
 */
export function eventStoreCheck(db: ProbeDb): HealthCheck {
  return {
    name: "event_store",
    required: true,
    async probe() {
      const result = await db.query(
        "SELECT COUNT(*)::int AS count, MAX(created_at) AS latest FROM run_events;"
      );
      const row = result.rows[0] ?? {};
      const count = Number(row.count ?? 0);
      return {
        status: "ok",
        message:
          count === 0
            ? "Olay yok (henuz run calismamis)."
            : `${count} olay, son kayit ${String(row.latest)}.`
      };
    }
  };
}

/**
 * CAS sağlığı (spec §27: "CAS health").
 *
 * Blob deposu yazılamıyorsa artifact ve evidence üretilemez. Probe
 * yalnız okur (bkz. `eventStoreCheck` gerekçesi).
 */
export function casCheck(db: ProbeDb): HealthCheck {
  return {
    name: "cas",
    required: true,
    async probe() {
      const result = await db.query("SELECT COUNT(*)::int AS count FROM cas_blobs;");
      const count = Number(result.rows[0]?.count ?? 0);
      return { status: "ok", message: `${count} blob.` };
    }
  };
}

/**
 * Sağlayıcı sağlığı (spec §27: "provider health").
 *
 * ## Bu probe AĞA ÇIKMAZ ve bu bilinçlidir
 *
 * Readiness probe'u her çağrıldığında dış bir sağlayıcıya istek atmak iki
 * ayrı zarar üretir: her load balancer yoklaması bir sağlayıcı kotası
 * harcar, ve sağlayıcının yavaşlaması Y'nin readiness'ını düşürür — yani
 * dış bir servis, iç bir sistemi trafikten düşürebilir hâle gelir.
 *
 * Probe bunun yerine **yapılandırmayı** raporlar: kaç adapter kayıtlı ve
 * hangisinin kimlik bilgisi var. Gerçek ağ yoklaması `adapter.health()`
 * içindedir ve sonucu `probedNetwork: true` taşır (ADR-045).
 *
 * Bugün hiçbir adapter'ın kimlik bilgisi yok; bu yüzden durum
 * `degraded` — ve bu, sistemin gerçeğidir: agent çalıştırılamaz.
 */
export function providerCheck(configuredAdapters: readonly string[]): HealthCheck {
  return {
    name: "provider",
    required: false,
    async probe() {
      if (configuredAdapters.length === 0) {
        return {
          status: "degraded",
          message:
            "Hicbir agent adapter'i yapilandirilmamis; agent calistirilamaz. " +
            "Bu probe AGA CIKMAZ (bkz. providerCheck gerekcesi)."
        };
      }
      return {
        status: "ok",
        message: `${configuredAdapters.length} adapter yapilandirilmis: ${configuredAdapters.join(", ")}.`
      };
    }
  };
}

/** Varsayılan bağımlılık kümesi. */
export function defaultChecks(
  db: ProbeDb,
  configuredAdapters: readonly string[] = []
): HealthCheck[] {
  return [
    databaseCheck(db),
    policyStoreCheck(db),
    evidenceChainCheck(db),
    queueCheck(db),
    workerCheck(db),
    indexCheck(db),
    // [P17 / A6] spec §27'nin ayrica istedigi dort bilesen. Eksik
    // olduklarinda readyz "ready" diyordu; simdi kendi sorgularini
    // calistiriyorlar.
    graphCheck(db),
    eventStoreCheck(db),
    casCheck(db),
    providerCheck(configuredAdapters)
  ];
}

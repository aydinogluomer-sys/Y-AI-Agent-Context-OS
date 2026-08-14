/**
 * P18 / Y-P18-003 — Metrik toplama.
 *
 * P00 Truth Audit: metrik YOKTU. Var olan "ölçümler" uydurmaydı ve
 * P16'da silindi (`92% cheaper`, `confidenceScore: 92.4`, sabit
 * sıkıştırma oranı).
 *
 * NEDEN KENDİ TOPLAYICISI, NEDEN prom-client DEĞİL
 *   `prom-client` iyi bir kütüphanedir ama bu aşamada bir bağımlılık
 *   daha eklemek, ölçülen tek şeyin kütüphane olduğu bir duruma yol
 *   açardı: hangi metriklerin gerçekten üretildiği belirsizken
 *   toplayıcıyı zenginleştirmenin değeri yok.
 *
 *   Buradaki toplayıcı Prometheus METİN BİÇİMİNİ üretir; bir gün
 *   `prom-client`e geçilirse dışa bakan yüzey değişmez.
 *
 * ÖLÇÜLMEYEN METRİK RAPORLANMAZ
 *   Bir metrik hiç `observe` edilmediyse çıktıda GÖRÜNMEZ. Sıfır
 *   değerle göstermek, "ölçtük ve sıfır çıktı" demek olurdu — P16'da
 *   sildiğimiz hatanın aynısı.
 */

export type MetricKind = "counter" | "gauge" | "histogram";

export interface MetricDefinition {
  readonly name: string;
  readonly kind: MetricKind;
  readonly help: string;
  /** Histogram kova sınırları (saniye ya da birim). */
  readonly buckets?: readonly number[];
}

/**
 * Master planın §27 metrik listesi.
 *
 * Bu liste bir NİYET BEYANI DEĞİL, kayıt defteridir: bir metriği burada
 * tanımlamak onu üretmez. Üretilmeyen metrik `/metrics` çıktısında
 * görünmez ve bu, hangisinin gerçekten toplandığını görünür kılar.
 */
export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  { name: "y_context_compile_duration_seconds", kind: "histogram", help: "Context derleme suresi", buckets: [0.1, 0.5, 1, 2, 5, 10, 30] },
  { name: "y_retrieval_duration_seconds", kind: "histogram", help: "Retrieval suresi (kanal basina)", buckets: [0.01, 0.05, 0.1, 0.5, 1, 5] },
  { name: "y_index_duration_seconds", kind: "histogram", help: "Index isi suresi", buckets: [1, 5, 15, 60, 300] },
  { name: "y_agent_run_duration_seconds", kind: "histogram", help: "Agent run suresi", buckets: [10, 60, 300, 900, 3600] },
  { name: "y_provider_errors_total", kind: "counter", help: "Saglayici hatasi" },
  { name: "y_policy_denials_total", kind: "counter", help: "Policy DENY karari" },
  { name: "y_approvals_total", kind: "counter", help: "Onay istegi ve sonucu" },
  { name: "y_context_tokens", kind: "histogram", help: "Uretilen context token sayisi", buckets: [1000, 5000, 20000, 50000, 100000] },
  { name: "y_queue_depth", kind: "gauge", help: "Kuyrukta bekleyen is" },
  { name: "y_queue_wait_seconds", kind: "histogram", help: "Isin kuyrukta bekleme suresi", buckets: [1, 5, 30, 120, 600] },
  { name: "y_worker_retries_total", kind: "counter", help: "Worker yeniden deneme" },
  { name: "y_chain_verify_duration_seconds", kind: "histogram", help: "Kanit zinciri dogrulama suresi", buckets: [0.01, 0.1, 1, 5] },
  { name: "y_sse_connections_active", kind: "gauge", help: "Acik SSE baglantisi" },
  { name: "y_firewall_exclusions_total", kind: "counter", help: "Firewall tarafindan dislanan aday" }
];

type Labels = Readonly<Record<string, string>>;

interface Series {
  readonly definition: MetricDefinition;
  readonly labels: Labels;
  /** counter/gauge için değer; histogram için gözlem listesi. */
  value: number;
  observations: number[];
}

export class MetricsRegistry {
  private readonly series = new Map<string, Series>();
  private readonly definitions = new Map<string, MetricDefinition>();

  constructor(definitions: readonly MetricDefinition[] = METRIC_DEFINITIONS) {
    for (const definition of definitions) this.definitions.set(definition.name, definition);
  }

  /**
   * Sayaç artırır.
   *
   * Bilinmeyen bir metrik adı SESSİZCE kabul edilmez: kayıt defterinde
   * olmayan bir metrik, adı yanlış yazılmış bir metriktir ve sessizce
   * kabul edilirse `/metrics` çıktısında hiç görünmez.
   */
  increment(name: string, labels: Labels = {}, by = 1): void {
    const series = this.getOrCreate(name, labels, "counter");
    series.value += by;
  }

  /** Anlık değer yazar. */
  set(name: string, value: number, labels: Labels = {}): void {
    const series = this.getOrCreate(name, labels, "gauge");
    series.value = value;
  }

  /** Histogram gözlemi kaydeder. */
  observe(name: string, value: number, labels: Labels = {}): void {
    const series = this.getOrCreate(name, labels, "histogram");
    series.observations.push(value);
    series.value += value;
  }

  /** Süre ölçen yardımcı. Hata durumunda da ölçüm KAYDEDİLİR. */
  async time<T>(name: string, labels: Labels, fn: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      return await fn();
    } finally {
      // `finally`: hata firlatan bir islem de sure uretir ve o sure,
      // basarili olanlardan daha ilginctir.
      this.observe(name, (Date.now() - startedAt) / 1000, labels);
    }
  }

  /**
   * Prometheus metin biçimi.
   *
   * ÖLÇÜLMEMİŞ metrik GÖRÜNMEZ. Tanımlı ama hiç gözlem almamış bir
   * metriği sıfırla basmak, "ölçtük ve sıfır çıktı" demek olurdu.
   */
  render(): string {
    const lines: string[] = [];
    const byName = new Map<string, Series[]>();

    for (const series of this.series.values()) {
      const list = byName.get(series.definition.name) ?? [];
      list.push(series);
      byName.set(series.definition.name, list);
    }

    for (const [name, list] of [...byName.entries()].sort()) {
      const definition = list[0].definition;
      lines.push(`# HELP ${name} ${definition.help}`);
      lines.push(`# TYPE ${name} ${definition.kind}`);

      for (const series of list) {
        const labelText = renderLabels(series.labels);

        if (definition.kind === "histogram") {
          const buckets = definition.buckets ?? [];
          for (const bucket of buckets) {
            const count = series.observations.filter((o) => o <= bucket).length;
            lines.push(`${name}_bucket${renderLabels({ ...series.labels, le: String(bucket) })} ${count}`);
          }
          lines.push(`${name}_bucket${renderLabels({ ...series.labels, le: "+Inf" })} ${series.observations.length}`);
          lines.push(`${name}_sum${labelText} ${series.value}`);
          lines.push(`${name}_count${labelText} ${series.observations.length}`);
          continue;
        }

        lines.push(`${name}${labelText} ${series.value}`);
      }
    }

    return lines.join("\n") + (lines.length > 0 ? "\n" : "");
  }

  /** Kayıt defterinde tanımlı ama hiç ölçülmemiş metrikler. */
  unmeasured(): string[] {
    const measured = new Set([...this.series.values()].map((s) => s.definition.name));
    return [...this.definitions.keys()].filter((name) => !measured.has(name)).sort();
  }

  reset(): void {
    this.series.clear();
  }

  private getOrCreate(name: string, labels: Labels, expectedKind: MetricKind): Series {
    const definition = this.definitions.get(name);
    if (!definition) {
      throw new Error(
        `Bilinmeyen metrik: '${name}'. Kayit defterinde olmayan bir metrik, adi yanlis ` +
          `yazilmis bir metriktir; sessizce kabul edilirse /metrics ciktisinda hic gorunmez.`
      );
    }
    if (definition.kind !== expectedKind) {
      throw new Error(
        `Metrik turu uyusmuyor: '${name}' bir ${definition.kind}, ${expectedKind} olarak kullanildi.`
      );
    }

    const key = `${name}${renderLabels(labels)}`;
    let series = this.series.get(key);
    if (!series) {
      series = { definition, labels, value: 0, observations: [] };
      this.series.set(key, series);
    }
    return series;
  }
}

function renderLabels(labels: Labels): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "";
  const rendered = entries
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
    .join(",");
  return `{${rendered}}`;
}

/**
 * Etiket değeri kaçışı.
 *
 * Kaçırılmazsa bir etiket değerindeki tırnak ya da satır sonu,
 * Prometheus çıktısını bozar ve TÜM metrikler ayrıştırılamaz hale
 * gelir — tek bir kötü etiket, gözlemlenebilirliğin tamamını düşürür.
 */
function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

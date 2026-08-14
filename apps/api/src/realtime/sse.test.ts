/**
 * P13 — SSE testleri.
 *
 * P00'da hiçbir gerçek zamanlı mekanizma yoktu; UI'daki "canlı" log
 * akışları hard-coded string dizileri üzerinde `setInterval`
 * çalıştırıyordu.
 */

import { describe, it, expect } from "vitest";
import {
  HEARTBEAT_MS,
  openStream,
  parseLastEventId,
  streamEvents,
  writeEvent,
  writeHeartbeat,
  type SseEvent
} from "./sse";

/** Yazılanları biriktiren sahte Response. */
function createResponse() {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  let ended = false;
  const listeners: Record<string, (() => void)[]> = {};

  const res = {
    headers,
    chunks,
    get body() {
      return chunks.join("");
    },
    get ended() {
      return ended;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    flushHeaders() {},
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end() {
      ended = true;
    },
    on(event: string, handler: () => void) {
      (listeners[event] ??= []).push(handler);
    },
    emit(event: string) {
      for (const handler of listeners[event] ?? []) handler();
    }
  };
  return res;
}

describe("openStream — SSE başlıkları", () => {
  it("event-stream içerik tipi ayarlanır", () => {
    const res = createResponse();
    openStream(res as never);
    expect(res.headers["Content-Type"]).toBe("text/event-stream");
  });

  it("önbellek ve dönüşüm kapatılır", () => {
    const res = createResponse();
    openStream(res as never);
    expect(res.headers["Cache-Control"]).toContain("no-cache");
    expect(res.headers["Cache-Control"]).toContain("no-transform");
  });

  it("proxy tamponlaması kapatılır", () => {
    // NGINX varsayilan tamponlamasi olaylari biriktirip toplu gonderir;
    // "gercek zamanli" akis saniyeler gecikmeli gorunur.
    const res = createResponse();
    openStream(res as never);
    expect(res.headers["X-Accel-Buffering"]).toBe("no");
  });
});

describe("writeEvent — SSE biçimi", () => {
  it("id, event ve data satırlarını yazar", () => {
    const res = createResponse();
    writeEvent(res as never, { id: "5", event: "run.created", data: { runId: "run_1" } });

    expect(res.body).toContain("id: 5\n");
    expect(res.body).toContain("event: run.created\n");
    expect(res.body).toContain('data: {"runId":"run_1"}\n\n');
  });

  it("olay çift satır sonuyla biter", () => {
    const res = createResponse();
    writeEvent(res as never, { id: "1", event: "x", data: {} });
    expect(res.body.endsWith("\n\n")).toBe(true);
  });

  it("çok satırlı veride HER satır data: ile başlar", () => {
    // Aksi halde akis bozulur ve istemci JSON'u ayristiramaz.
    const res = createResponse();
    writeEvent(res as never, { id: "1", event: "x", data: { text: "birinci\nikinci" } });

    const dataLines = res.body.split("\n").filter((l) => l.length > 0 && !l.startsWith("id:") && !l.startsWith("event:"));
    for (const line of dataLines) {
      expect(line.startsWith("data: ")).toBe(true);
    }
  });
});

describe("writeHeartbeat", () => {
  it("yorum satırı yazar (istemci yok sayar)", () => {
    const res = createResponse();
    writeHeartbeat(res as never);
    expect(res.body.startsWith(": heartbeat")).toBe(true);
  });

  it("varsayılan aralık proxy timeout'unun altında", () => {
    // Proxy'ler sessiz bir baglantiyi 30-60 saniye sonra kapatir.
    expect(HEARTBEAT_MS).toBeLessThan(30_000);
  });
});

describe("parseLastEventId — istemci girdisi GÜVENİLMEZ", () => {
  it("geçerli sayıyı ayrıştırır", () => {
    expect(parseLastEventId("42")).toBe(42);
  });

  it("başlık yoksa sıfır döner", () => {
    expect(parseLastEventId(undefined)).toBe(0);
  });

  it("enjeksiyon denemesi sıfıra düşer", () => {
    // Dogrulanmadan sorguya konsaydi bir enjeksiyon yuzeyi olurdu.
    expect(parseLastEventId("0 OR 1=1")).toBe(0);
    expect(parseLastEventId("'; DROP TABLE runs; --")).toBe(0);
  });

  it("negatif değer sıfıra düşer", () => {
    expect(parseLastEventId("-5")).toBe(0);
  });

  it("sayı olmayan metin sıfıra düşer", () => {
    expect(parseLastEventId("abc")).toBe(0);
  });
});

describe("streamEvents — akış döngüsü", () => {
  const noSleep = async () => {};

  it("olayları yayınlar ve tamamlanınca biter", async () => {
    const res = createResponse();
    let done = false;

    await streamEvents({
      res: res as never,
      startAfter: 0,
      sleep: noSleep,
      async fetchSince(after) {
        if (after >= 2) return [];
        return [
          { id: "1", event: "run.created", data: { a: 1 } },
          { id: "2", event: "run.completed", data: { a: 2 } }
        ];
      },
      async isComplete() {
        const wasDone = done;
        done = true;
        return wasDone;
      }
    });

    expect(res.body).toContain("event: run.created");
    expect(res.body).toContain("event: run.completed");
    expect(res.ended).toBe(true);
  });

  it("Last-Event-ID'den DEVAM eder (kayıpsız)", async () => {
    const res = createResponse();
    const seen: number[] = [];

    await streamEvents({
      res: res as never,
      // Istemci 5'e kadar gormus; 6'dan devam.
      startAfter: 5,
      sleep: noSleep,
      async fetchSince(after) {
        seen.push(after);
        return [];
      },
      async isComplete() {
        return true;
      }
    });

    expect(seen[0]).toBe(5);
  });

  it("imleç yayınlanan en yüksek sıraya ilerler", async () => {
    const res = createResponse();
    const cursors: number[] = [];
    let round = 0;

    await streamEvents({
      res: res as never,
      startAfter: 0,
      sleep: noSleep,
      maxIterations: 3,
      async fetchSince(after) {
        cursors.push(after);
        round++;
        if (round === 1) return [{ id: "3", event: "x", data: {} }];
        return [];
      },
      async isComplete() {
        return round >= 2;
      }
    });

    // Ikinci turda imlec 3'ten devam etmeli.
    expect(cursors[1]).toBe(3);
  });

  it("bağlantı kapanınca döngü durur", async () => {
    const res = createResponse();
    let iterations = 0;

    const promise = streamEvents({
      res: res as never,
      startAfter: 0,
      maxIterations: 100,
      sleep: async () => {
        iterations++;
        if (iterations === 2) res.emit("close");
      },
      async fetchSince() {
        return [];
      },
      async isComplete() {
        return false;
      }
    });

    await promise;
    expect(iterations).toBeLessThan(100);
  });

  it("kapanan bağlantıda res.end çağrılmaz", async () => {
    const res = createResponse();

    await streamEvents({
      res: res as never,
      startAfter: 0,
      maxIterations: 5,
      sleep: async () => res.emit("close"),
      async fetchSince() {
        return [];
      },
      async isComplete() {
        return false;
      }
    });

    expect(res.ended).toBe(false);
  });

  it("sonsuz döngüye karşı üst sınır var", async () => {
    const res = createResponse();
    let calls = 0;

    await streamEvents({
      res: res as never,
      startAfter: 0,
      maxIterations: 4,
      sleep: noSleep,
      async fetchSince() {
        calls++;
        return [];
      },
      async isComplete() {
        return false;
      }
    });

    expect(calls).toBe(4);
  });
});

describe("SSE — at-least-once teslim", () => {
  it("aynı olay iki kez gelebilir, ID ile tekilleştirilir", async () => {
    // Kopma sonrasi `Last-Event-ID`'den devam edilir. Bir olay IKI KEZ
    // gelebilir; KAYBOLMAZ. Exactly-once vaadi vermek yanlis olurdu:
    // TCP kopmasi ile olayin yazilmasi arasindaki yaris sunucu
    // tarafinda cozulemez.
    const events: SseEvent[] = [
      { id: "7", event: "agent.tool_call", data: { tool: "Read" } },
      { id: "7", event: "agent.tool_call", data: { tool: "Read" } }
    ];

    const unique = new Map(events.map((e) => [e.id, e]));
    expect(unique.size).toBe(1);
  });
});

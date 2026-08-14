/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * P15 / P17 — NAVİGASYON DÜRÜSTLÜK DEĞİŞMEZİ.
 *
 * P00 bulgusu:
 *   `navigation.ts` bir `status` alanı taşıyordu ama 114 kaydın **tamamı**
 *   `"implemented"` idi. Oysa `App.tsx`'in switch gövdesinde yalnız 12
 *   `case` vardı; kalan 102 ekran hiç kodlanmamıştı.
 *
 * P15'te alan gerçeğe çekildi (102 kayıt → `placeholder`).
 *
 * P17 / A3'te sözlük spec §38'in **dokuz** durumuna genişletildi. İki
 * değer, aralarında gerçek fark olan şeyleri aynı kelimeye sıkıştırıyordu:
 * hiç var olmayan bir ekran ile çalışan ama verisi ölçüm olmayan bir ekran
 * ikisi de "placeholder" idi.
 *
 * Zorlanan kural TEK YÖNLÜDÜR: render edilmeyen bir ekran, çalıştığını
 * iddia eden bir durum taşıyamaz. Tersi serbesttir — daha kısıtlayıcı olan
 * taraf her zaman güvenlidir.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.resolve(HERE, "../App.tsx");
const NAV_PATH = path.resolve(HERE, "navigation.ts");

/** spec §38'in, ekranın GERÇEKTEN çalıştığını iddia eden durumları. */
const CLAIMS_WORKING = new Set(["PASS", "PARTIAL", "SIMULATED", "UI_ONLY"]);

const ALL_STATUSES = [
  "MISSING",
  "STUB",
  "SIMULATED",
  "PARTIAL",
  "BACKEND_ONLY",
  "UI_ONLY",
  "BLOCKED",
  "BROKEN",
  "PASS"
] as const;

/** `App.tsx`'in switch gövdesinde gerçekten render edilen ekranlar. */
function renderedScreens(): Set<string> {
  const source = readFileSync(APP_PATH, "utf-8");
  return new Set([...source.matchAll(/case "([a-z0-9-]+)":/g)].map((m) => m[1]));
}

/** `navigation.ts`'teki her item'ın kimliği ve bildirilen durumu. */
function declaredItems(): { id: string; status: string; line: number }[] {
  const source = readFileSync(NAV_PATH, "utf-8");
  const items: { id: string; status: string; line: number }[] = [];
  const statusAlternation = ALL_STATUSES.join("|");
  const pattern = new RegExp(`\\{\\s*id: "([a-z0-9-]+)".*status: "(${statusAlternation})"`);

  source.split("\n").forEach((line, index) => {
    const match = line.match(pattern);
    if (match) items.push({ id: match[1], status: match[2], line: index + 1 });
  });

  return items;
}

describe("navigasyon dürüstlüğü — işaret VERİDEN türer (ADR-056)", () => {
  it("POZİTİF KONTROL: navigation.ts okunabiliyor ve item içeriyor", () => {
    // Bu kontrol olmadan aşağıdaki testler BOŞ KÜME üzerinde de geçerdi.
    expect(declaredItems().length).toBeGreaterThan(50);
  });

  it("POZİTİF KONTROL: App.tsx render edilen ekranları içeriyor", () => {
    expect(renderedScreens().size).toBeGreaterThan(5);
  });

  it("render EDİLMEYEN hiçbir item 'çalışıyor' iddiasında bulunamaz", () => {
    const rendered = renderedScreens();
    const lying = declaredItems().filter(
      (item) => CLAIMS_WORKING.has(item.status) && !rendered.has(item.id)
    );

    expect(
      lying,
      `Bu item'lar calistiklarini iddia ediyor ama App.tsx'te render EDILMIYOR:\n` +
        lying.map((i) => `  navigation.ts:${i.line}  ${i.id} (${i.status})`).join("\n") +
        `\n\nSidebar operatore bu ekranlarin gercek oldugunu soyluyor. P00'da ` +
        `114 kaydin tamami boyleydi.`
    ).toEqual([]);
  });

  it("her item'ın durumu spec §38 kümesinden", () => {
    const source = readFileSync(NAV_PATH, "utf-8");
    // Kümede olmayan bir değer kullanılırsa yakalanır: regex yalnız geçerli
    // değerleri eşlediği için sayı düşer.
    const declaredCount = declaredItems().length;
    const anyStatusCount = [...source.matchAll(/\{ id: "[a-z0-9-]+".*?status: "/g)].length;
    expect(declaredCount).toBe(anyStatusCount);
  });

  it("hiçbir item 'PASS' değil — §38'in PASS çıtası karşılanmıyor", () => {
    // spec §38 PASS icin integration test ve (kullaniciya donukse) E2E
    // zorunlu kiliyor. Ikisi de canli Postgres bekliyor (P19). Bugun bir
    // ekrani PASS saymak, spec'in kendi tanimini gevsetmek olurdu.
    const passing = declaredItems().filter((i) => i.status === "PASS");
    expect(
      passing,
      "PASS isaretli item'lar var ama §38'in integration/E2E kriteri " +
        "henuz karsilanmiyor:\n" +
        passing.map((i) => `  navigation.ts:${i.line}  ${i.id}`).join("\n")
    ).toEqual([]);
  });

  it("render edilen ekranlar MISSING olamaz", () => {
    // Ters yon: kodlanmis bir ekrani "yok" diye isaretlemek de yanlistir,
    // yalniz daha az zararlidir. Yine de tutarsizliktir.
    const rendered = renderedScreens();
    const understated = declaredItems().filter(
      (item) => item.status === "MISSING" && rendered.has(item.id)
    );
    expect(understated).toEqual([]);
  });

  it("dağılım ölçülebilir ve raporlanabilir", () => {
    const counts = new Map<string, number>();
    for (const item of declaredItems()) {
      counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
    }
    // Dagilimin KENDISI bir iddia degil; testin amaci sayinin okunabilir
    // olmasi ve sifira dusen bir kategorinin sessizce kaybolmamasi.
    expect(counts.size).toBeGreaterThan(1);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(declaredItems().length);
  });
});

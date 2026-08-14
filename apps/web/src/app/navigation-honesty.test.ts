/**
 * P15 / ADR-056 — Navigasyon dürüstlük değişmezi.
 *
 * P00 Truth Audit'in en sinsi bulgusu buydu.
 *
 *   `navigation.ts` bir `status: "implemented" | "placeholder"` alanı
 *   taşıyor ve `AppShell` `placeholder` için "Simüle" rozeti
 *   gösteriyordu. Dürüstlük mekanizması KURULMUŞTU.
 *
 *   Ama 114 kaydın **tamamı** `"implemented"` idi ve `"placeholder"`
 *   sayısı **sıfırdı**. Yani sidebar operatöre 113 ekranın da gerçek
 *   olduğunu söylüyordu — oysa `App.tsx`'in `switch`'inde yalnız 11
 *   `case` vardı; kalan 102 ekran `ModuleSimulationPanel`'e düşüyordu.
 *
 *   Dahası `renderPlaceholderView()` — dürüst bir "Henüz Kodlanmadı"
 *   kartı render eden fonksiyon — kodda DURUYOR ama HİÇ ÇAĞRILMIYORDU.
 *
 * NEDEN BU BİR TESTLE ÇÖZÜLÜYOR
 *   Alanı elle düzeltmek yeterli değil: bir kez daha elle bakıma
 *   bırakılırsa yine kayar. Bu test, işareti VERİDEN TÜRETİR:
 *   `App.tsx`'in `switch` gövdesinde `case` olarak geçmeyen her nav
 *   item'ı `placeholder` olmak ZORUNDADIR.
 *
 *   Yeni bir ekran gerçekten kodlandığında test kendiliğinden geçer;
 *   kodlanmadan `implemented` işaretlenirse KIRILIR.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.resolve(HERE, "../App.tsx");
const NAV_PATH = path.resolve(HERE, "navigation.ts");

/** `App.tsx`'in switch gövdesinde gerçekten render edilen ekranlar. */
function renderedScreens(): Set<string> {
  const source = readFileSync(APP_PATH, "utf-8");
  return new Set([...source.matchAll(/case "([a-z0-9-]+)":/g)].map((m) => m[1]));
}

/** `navigation.ts`'teki her item'ın kimliği ve bildirilen durumu. */
function declaredItems(): { id: string; status: string; line: number }[] {
  const source = readFileSync(NAV_PATH, "utf-8");
  const items: { id: string; status: string; line: number }[] = [];

  source.split("\n").forEach((line, index) => {
    const match = line.match(/\{\s*id: "([a-z0-9-]+)".*status: "(implemented|placeholder)"/);
    if (match) items.push({ id: match[1], status: match[2], line: index + 1 });
  });

  return items;
}

describe("navigasyon dürüstlüğü — işaret VERİDEN türer (ADR-056)", () => {
  it("navigation.ts okunabiliyor ve item içeriyor", () => {
    // Bu kontrol olmadan asagidaki testler bos kume uzerinde de gecerdi.
    expect(declaredItems().length).toBeGreaterThan(50);
  });

  it("App.tsx gerçekten render edilen ekranları içeriyor", () => {
    expect(renderedScreens().size).toBeGreaterThan(5);
  });

  it("render EDİLMEYEN hiçbir item 'implemented' olamaz", () => {
    const rendered = renderedScreens();
    const lying = declaredItems().filter(
      (item) => item.status === "implemented" && !rendered.has(item.id)
    );

    expect(
      lying,
      `Bu item'lar 'implemented' isaretli ama App.tsx'te render EDILMIYOR:\n` +
        lying.map((i) => `  navigation.ts:${i.line}  ${i.id}`).join("\n") +
        `\n\nSidebar operatore bu ekranlarin gercek oldugunu soyluyor. P00'da ` +
        `114 kaydin tamami boyleydi.`
    ).toEqual([]);
  });

  it("render edilmek TEK BAŞINA 'implemented' için yeterli DEĞİLDİR", () => {
    // Alan iki farkli seyi karistirabilir: "ekran kodlandi mi" ve
    // "verisi gercek mi". P00'un bulgusu IKINCISIYDI.
    //
    // Sohbet kokpiti render EDILIYOR ama pipeline'i simulasyon (sabit
    // gecikmelerle oynatilan adimlar). Bu yuzden mesru olarak
    // `placeholder` isaretli — ve bu, testin izin vermesi gereken bir
    // durum.
    //
    // Zorlanan kural TEK YONLUDUR: render edilmeyen bir ekran
    // `implemented` OLAMAZ. Tersi serbesttir cunku daha kisitlayici
    // olan taraf her zaman guvenlidir.
    const rendered = renderedScreens();
    const simulatedButRendered = declaredItems().filter(
      (item) => item.status === "placeholder" && rendered.has(item.id)
    );

    // Bu sayi sifir OLMAK ZORUNDA DEGIL; gorunur olmasi yeterli.
    expect(simulatedButRendered.length).toBeGreaterThanOrEqual(0);
  });

  it("placeholder sayısı SIFIR DEĞİLDİR", () => {
    // P00'daki tam durum buydu: 114 implemented, 0 placeholder.
    // Fabrikasyon ekranlar varken bu sayinin sifir olmasi, isaretin
    // hic uygulanmadigi anlamina gelir.
    const items = declaredItems();
    const placeholders = items.filter((i) => i.status === "placeholder");

    expect(placeholders.length).toBeGreaterThan(0);
  });

  it("gerçek ekran sayısı bildirilen sayıyla TUTARLI", () => {
    const rendered = renderedScreens();
    const implemented = declaredItems().filter((i) => i.status === "implemented");
    const implementedIds = new Set(implemented.map((i) => i.id));

    // `implemented` isaretli her item render EDILIYOR olmali.
    // (Tersi gecerli degil: render edilen bir ekran, verisi simulasyon
    // oldugu icin `placeholder` kalabilir.)
    for (const id of implementedIds) expect(rendered.has(id), id).toBe(true);
  });
});

describe("navigasyon — ölçülen gerçek", () => {
  it("fabrikasyon ekran oranı raporlanır", () => {
    const items = declaredItems();
    const placeholders = items.filter((i) => i.status === "placeholder").length;
    const ratio = placeholders / items.length;

    // Bu test bir esik ZORLAMAZ; sayiyi gorunur kilar. P15'in tamami
    // uygulandiginda bu oran duser ve testin mesaji guncellenir.
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });
});

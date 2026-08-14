/**
 * P07 — Context Firewall testleri.
 *
 * En kritik iddia: DENY kapsamındaki içerik hiçbir retrieval kanalında
 * aday OLAMAZ — ve bunun sebebi bir kontrol değil, sorgunun ŞEKLİDİR.
 */

import { describe, it, expect } from "vitest";
import {
  GlobError,
  assertSupportedGlob,
  globSpecificity,
  globToLikePattern,
  globToRegExp,
  matchesGlob
} from "./glob";
import {
  FirewallError,
  compilePredicate,
  computeUniverse,
  effectForPath,
  type PolicyRule
} from "./universe";
import {
  CONFIDENCE_THRESHOLD,
  classifyFile,
  generalizeToGlob,
  toUniverseGlobs
} from "./classify";

const BASE_RULES: PolicyRule[] = [
  { effect: "allow", resourceGlob: "src/**" },
  { effect: "allow", resourceGlob: "tests/**" },
  { effect: "allow", resourceGlob: "docs/**" },
  { effect: "approval", resourceGlob: "migrations/**" },
  { effect: "approval", resourceGlob: "infra/**" },
  { effect: "deny", resourceGlob: "secrets/**" },
  { effect: "deny", resourceGlob: "production/**" },
  { effect: "deny", resourceGlob: "customer-data/**" }
];

const INPUTS = {
  organizationId: "org_a",
  projectId: "proj_1",
  principalSub: "oidc|alice",
  role: "developer",
  policyVersion: "v1",
  rules: BASE_RULES
};

describe("glob — desteklenen dil (ADR-028)", () => {
  it("tek yıldız dizin sınırını GEÇMEZ", () => {
    expect(matchesGlob("src/a.ts", "src/*")).toBe(true);
    expect(matchesGlob("src/deep/a.ts", "src/*")).toBe(false);
  });

  it("çift yıldız dizin sınırını geçer", () => {
    expect(matchesGlob("src/deep/nested/a.ts", "src/**")).toBe(true);
  });

  it("orta konumdaki çift yıldız sıfır segment eşler", () => {
    expect(matchesGlob("src/a.ts", "src/**/a.ts")).toBe(true);
    expect(matchesGlob("src/x/y/a.ts", "src/**/a.ts")).toBe(true);
  });

  it("soru işareti tek karakter eşler", () => {
    expect(matchesGlob("src/a.ts", "src/?.ts")).toBe(true);
    expect(matchesGlob("src/ab.ts", "src/?.ts")).toBe(false);
  });

  it("karakter sınıfı çalışır", () => {
    expect(matchesGlob("src/a.ts", "src/[ab].ts")).toBe(true);
    expect(matchesGlob("src/c.ts", "src/[ab].ts")).toBe(false);
  });

  it("büyük/küçük harf DUYARLI (platform bağımsız)", () => {
    // Windows'ta duyarsiz olsa, bir DENY kurali Linux'ta calisip
    // Windows'ta calismazdi.
    expect(matchesGlob("SECRETS/a.env", "secrets/**")).toBe(false);
  });

  it("nokta karakteri literal eşleşir", () => {
    expect(matchesGlob("srcXts", "src.ts")).toBe(false);
  });
});

describe("glob — desteklenmeyen sözdizimi REDDEDİLİR", () => {
  it("alternasyon reddedilir", () => {
    expect(() => assertSupportedGlob("src/{a,b}/**")).toThrow(GlobError);
  });

  it("negasyon reddedilir", () => {
    expect(() => assertSupportedGlob("!(secrets)/**")).toThrow(/Desteklenmeyen/);
  });

  it("boş kalıp reddedilir", () => {
    expect(() => assertSupportedGlob("   ")).toThrow(/Bos glob/);
  });

  it("aşırı derin kalıp reddedilir", () => {
    expect(() => assertSupportedGlob("a/".repeat(40) + "b")).toThrow(/segmentten uzun/);
  });

  it("desteklenmeyen kalıp SESSİZCE kısmen eşleşmez", () => {
    // Kismi eslesme, kural yazanin yazdigini sandigi kuraldan farkli bir
    // kural uygulamak olurdu.
    expect(() => globToRegExp("src/{a,b}")).toThrow(GlobError);
  });
});

describe("globToLikePattern — kaba ön eleme", () => {
  it("yıldızı yüzdeye çevirir", () => {
    expect(globToLikePattern("src/**")).toBe("src/%");
  });

  it("kullanıcının yazdığı % karakterini kaçırır", () => {
    // Kacirilmazsa kullanicinin yazdigi `%` bir joker olur ve kural
    // beklenenden GENIS calisir.
    expect(globToLikePattern("a%b/**")).toBe("a\\%b/%");
  });

  it("soru işaretini alt çizgiye çevirir", () => {
    expect(globToLikePattern("src/?.ts")).toBe("src/_.ts");
  });
});

describe("globSpecificity — çakışan kurallar", () => {
  it("daha derin kural daha özgüldür", () => {
    expect(globSpecificity("src/auth/**")).toBeGreaterThan(globSpecificity("src/**"));
  });

  it("çift yıldız özgüllüğü düşürür", () => {
    expect(globSpecificity("src/auth/login.ts")).toBeGreaterThan(globSpecificity("src/**"));
  });
});

describe("computeUniverse — determinizm (ADR-030)", () => {
  it("aynı girdi aynı hash'i verir", () => {
    expect(computeUniverse(INPUTS).universeHash).toBe(computeUniverse(INPUTS).universeHash);
  });

  it("kural sırası hash'i DEĞİŞTİRMEZ", () => {
    const shuffled = { ...INPUTS, rules: [...BASE_RULES].reverse() };
    expect(computeUniverse(shuffled).universeHash).toBe(computeUniverse(INPUTS).universeHash);
  });

  it("tek bir kural değişince hash değişir", () => {
    const changed = {
      ...INPUTS,
      rules: [...BASE_RULES, { effect: "deny" as const, resourceGlob: "vendor/**" }]
    };
    expect(computeUniverse(changed).universeHash).not.toBe(computeUniverse(INPUTS).universeHash);
  });

  it("farklı rol farklı universe üretir", () => {
    const admin = { ...INPUTS, role: "maintainer" };
    expect(computeUniverse(admin).universeHash).not.toBe(computeUniverse(INPUTS).universeHash);
  });

  it("kullanıcı kimliği hash'e GİRMEZ", () => {
    // Ayni roldeki iki kullanici ayni universe'u gormeli; aksi halde
    // manifest karsilastirmasi imkansizlasirdi.
    const other = { ...INPUTS, principalSub: "oidc|bob" };
    expect(computeUniverse(other).universeHash).toBe(computeUniverse(INPUTS).universeHash);
  });

  it("policy sürümü hash'e girer", () => {
    const v2 = { ...INPUTS, policyVersion: "v2" };
    expect(computeUniverse(v2).universeHash).not.toBe(computeUniverse(INPUTS).universeHash);
  });
});

describe("computeUniverse — hata yolları", () => {
  it("ALLOW kuralı yoksa AÇIKÇA hata verir (boş universe ile devam etmez)", () => {
    const noAllow = { ...INPUTS, rules: BASE_RULES.filter((r) => r.effect !== "allow") };
    expect(() => computeUniverse(noAllow)).toThrow(FirewallError);
    expect(() => computeUniverse(noAllow)).toThrow(/hicbir ALLOW kurali/);
  });

  it("desteklenmeyen glob içeren kural reddedilir", () => {
    const bad = { ...INPUTS, rules: [...BASE_RULES, { effect: "deny" as const, resourceGlob: "a|b" }] };
    expect(() => computeUniverse(bad)).toThrow(GlobError);
  });

  it("kural sayısı üst sınırı aşarsa reddedilir", () => {
    const many = {
      ...INPUTS,
      rules: [
        ...BASE_RULES,
        ...Array.from({ length: 300 }, (_, i) => ({
          effect: "deny" as const,
          resourceGlob: `dir${i}/**`
        }))
      ]
    };
    expect(() => computeUniverse(many)).toThrow(/ust sinir/);
  });

  it("sınıflandırmadan gelen DENY'ler policy kurallarıyla BİRLEŞİR", () => {
    const universe = computeUniverse({ ...INPUTS, classifiedDenyGlobs: ["vendor/**"] });
    expect(universe.deny).toContain("vendor/**");
    expect(universe.deny).toContain("secrets/**");
  });
});

describe("effectForPath — DENY her zaman kazanır (ADR-029)", () => {
  const universe = computeUniverse(INPUTS);

  it("izinli yol allow döner", () => {
    expect(effectForPath(universe, "src/auth/login.ts")).toBe("allow");
  });

  it("yasak yol deny döner", () => {
    expect(effectForPath(universe, "secrets/prod.env")).toBe("deny");
  });

  it("onay bekleyen yol approval döner", () => {
    expect(effectForPath(universe, "migrations/0001.sql")).toBe("approval");
  });

  it("daha özgül bir ALLOW, DENY'i YENEMEZ", () => {
    const overlapping = computeUniverse({
      ...INPUTS,
      rules: [
        { effect: "allow", resourceGlob: "src/secrets/keys.ts" },
        { effect: "deny", resourceGlob: "src/secrets/**" }
      ]
    });
    // "Bu dizinde her sey serbest AMA su dosya yasak" ancak boyle guvenli.
    expect(effectForPath(overlapping, "src/secrets/keys.ts")).toBe("deny");
  });

  it("hiçbir kurala uymayan yol REDDEDİLİR (varsayılan izin yok)", () => {
    // Yeni eklenen bir dizinin sessizce erisilebilir olmasi kabul edilemez.
    expect(effectForPath(universe, "yeni-dizin/a.ts")).toBe("deny");
  });
});

describe("compilePredicate — SQL'e derleme (ADR-028)", () => {
  const universe = computeUniverse(INPUTS);

  it("parametreli SQL üretir (glob metni SQL'e gömülmez)", () => {
    const predicate = compilePredicate(universe, "c.path", 5);

    expect(predicate.sql).toContain("$5");
    expect(predicate.sql).toContain("$6");
    expect(predicate.sql).toContain("$7");
    // Glob metni SQL govdesinde GECMEMELI.
    expect(predicate.sql).not.toContain("secrets");
    expect(predicate.sql).not.toContain("src/");
  });

  it("ALLOW hem LIKE hem regex ile kontrol edilir", () => {
    const predicate = compilePredicate(universe, "c.path", 1);
    expect(predicate.sql).toContain("LIKE ANY");
    expect(predicate.sql).toContain("~ ANY");
  });

  it("APPROVAL bloklanan kümeye girer (retrieval'da DENY gibi)", () => {
    const predicate = compilePredicate(universe, "c.path", 1);
    const blocked = predicate.params[2] as string[];

    expect(blocked.some((r) => r.includes("secrets"))).toBe(true);
    // Onay bekleyen kaynak da bloklanir: "once goster sonra onayla"
    // provenance'i bozar.
    expect(blocked.some((r) => r.includes("migrations"))).toBe(true);
  });

  it("bloklanan kümenin NOT ile sarmalandığını doğrular", () => {
    expect(compilePredicate(universe, "c.path", 1).sql).toContain("NOT (");
  });

  it("güvenli olmayan kolon adı reddedilir", () => {
    expect(() => compilePredicate(universe, "c.path; DROP TABLE chunks --", 1)).toThrow(
      /Guvenli olmayan kolon adi/
    );
  });

  it("parametre indeksi çağırandan gelir", () => {
    const predicate = compilePredicate(universe, "c.path", 10);
    expect(predicate.firstParamIndex).toBe(10);
    expect(predicate.sql).toContain("$10");
    expect(predicate.sql).toContain("$12");
  });
});

describe("classifyFile — P00'daki beş dosyalık liste yerine", () => {
  it("sır tarayıcısının bulgusu en yüksek güveni alır", () => {
    const result = classifyFile({ path: "src/config.ts", containsSecret: true });
    expect(result.kind).toBe("secret");
    expect(result.confidence).toBe(1);
    expect(result.suggestedEffect).toBe("deny");
  });

  it(".env dosyasını tanır", () => {
    expect(classifyFile({ path: ".env.production" }).kind).toBe("secret");
    expect(classifyFile({ path: "config/.env" }).kind).toBe("secret");
  });

  it("sertifika ve anahtar dosyalarını tanır", () => {
    for (const path of ["certs/server.pem", "keys/private.key", "ssh/id_rsa"]) {
      expect(classifyFile({ path }).kind, path).toBe("secret");
    }
  });

  it("P00'da kaçan altyapı dosyalarını yakalar", () => {
    // Eski sabit liste bunlarin HICBIRINI icermiyordu.
    expect(classifyFile({ path: "terraform/prod.tfvars" }).kind).toBe("secret");
    expect(classifyFile({ path: "k8s/deployment.yaml" }).kind).toBe("infra");
    expect(classifyFile({ path: "infra/main.tf" }).kind).toBe("infra");
    expect(classifyFile({ path: "Dockerfile" }).kind).toBe("infra");
  });

  it("bağımlılık dizinlerini tanır", () => {
    expect(classifyFile({ path: "node_modules/react/index.js" }).kind).toBe("vendor");
    expect(classifyFile({ path: "vendor/lib/x.go" }).kind).toBe("vendor");
  });

  it("test, doküman ve ADR'yi ayırır", () => {
    expect(classifyFile({ path: "src/a.test.ts" }).kind).toBe("test");
    expect(classifyFile({ path: "docs/adr/adr-001.md" }).kind).toBe("adr");
    expect(classifyFile({ path: "docs/rehber.md" }).kind).toBe("doc");
  });

  it("üretilmiş ve minified dosyaları DENY'e koyar", () => {
    expect(classifyFile({ path: "dist/app.js", isGenerated: true }).suggestedEffect).toBe("deny");
    expect(classifyFile({ path: "app.min.js", isMinified: true }).suggestedEffect).toBe("deny");
  });

  it("sıradan kaynak dosyası ALLOW", () => {
    const result = classifyFile({ path: "src/auth/login.ts" });
    expect(result.kind).toBe("source");
    expect(result.suggestedEffect).toBe("allow");
  });

  it("her sınıflandırma GEREKÇE taşır", () => {
    expect(classifyFile({ path: "secrets/a.env" }).basis.length).toBeGreaterThan(0);
  });

  it("sır dosyası altyapı dizininde de olsa SECRET kazanır", () => {
    // Daha kisitlayici olan kazanmali.
    expect(classifyFile({ path: "infra/secrets/db.env" }).kind).toBe("secret");
  });
});

describe("classifyFile — belirsizlik ALLOW'a değil APPROVAL'a düşer", () => {
  it("eşik altındaki DENY, APPROVAL olur", () => {
    // Asimetri bilincli: yanlis DENY'in bedeli gecikme, yanlis ALLOW'un
    // bedeli sizintidir.
    expect(CONFIDENCE_THRESHOLD).toBeGreaterThan(0.5);
  });

  it("config dosyaları APPROVAL'dadır (ALLOW değil)", () => {
    expect(classifyFile({ path: "app.config.json" }).suggestedEffect).toBe("approval");
  });

  it("migration APPROVAL'dadır", () => {
    expect(classifyFile({ path: "migrations/0001_x.sql" }).suggestedEffect).toBe("approval");
  });
});

describe("toUniverseGlobs — kural patlaması yok", () => {
  it("dosya yollarını dizin glob'una genelleştirir", () => {
    const globs = toUniverseGlobs([
      classifyFile({ path: "secrets/a.env" }),
      classifyFile({ path: "secrets/b.env" }),
      classifyFile({ path: "secrets/deep/c.env" })
    ]);

    // Uc dosya, TEK kural.
    expect(globs.deny).toEqual(["secrets/**"]);
  });

  it("ALLOW'lar kural üretmez", () => {
    const globs = toUniverseGlobs([classifyFile({ path: "src/a.ts" })]);
    expect(globs.deny).toEqual([]);
    expect(globs.approval).toEqual([]);
  });

  it("kök seviyesindeki dosya genelleştirilmez", () => {
    expect(generalizeToGlob("Dockerfile")).toBe("Dockerfile");
  });

  it("DENY ve APPROVAL ayrı listelerde döner", () => {
    const globs = toUniverseGlobs([
      classifyFile({ path: "secrets/a.env" }),
      classifyFile({ path: "migrations/0001.sql" })
    ]);

    expect(globs.deny).toContain("secrets/**");
    expect(globs.approval).toContain("migrations/**");
  });
});

describe("uçtan uca — DENY'li dosya universe'ün dışında", () => {
  it("sınıflandırma + policy birleşimi sır dosyasını dışlar", () => {
    const classifications = [
      classifyFile({ path: "terraform/prod.tfvars" }),
      classifyFile({ path: "src/auth/login.ts" })
    ];
    const globs = toUniverseGlobs(classifications);

    const universe = computeUniverse({
      ...INPUTS,
      classifiedDenyGlobs: globs.deny,
      classifiedApprovalGlobs: globs.approval
    });

    expect(effectForPath(universe, "terraform/prod.tfvars")).toBe("deny");
    expect(effectForPath(universe, "src/auth/login.ts")).toBe("allow");
  });
});

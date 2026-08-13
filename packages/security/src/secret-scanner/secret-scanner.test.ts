/**
 * P03 / Y-P03-010 — Secret scanner testleri (P0-11).
 *
 * Kritik kural: bu dosya HİÇBİR gerçek sır içermez. Test verileri
 * parçalardan runtime'da kurulur ki dosyanın kendisi bir sır sızıntısı
 * olmasın — eski tarayıcının düştüğü tuzak tam da buydu.
 */

import { describe, it, expect } from "vitest";
import {
  scanForSecrets,
  redactSecrets,
  containsSecret,
  shannonEntropy
} from "./index";

/** Test verisi üreticileri — sabit sır literal'i yok. */
const fake = {
  pgUrl: (pass: string) => `postgres` + `ql://appuser:${pass}@db.example.com:5432/appdb`,
  ghToken: () => "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8",
  awsKey: () => "AKIA" + "IOSFODNN7EXAMPLE",
  googleKey: () => "AIza" + "SyD1234567890abcdefghijklmnopqrstuv", // AIza + 35
  openaiKey: () => "sk-" + "proj-" + "abcdefghijklmnopqrstuvwxyz012345",
  anthropicKey: () => "sk-ant-" + "api03-abcdefghijklmnopqrstuvwxyz0123",
  slackToken: () => "xoxb-" + "123456789012-1234567890123-abcdefghijklmnopqrst",
  gitlabToken: () => "glpat-" + "abcdefghij1234567890",
  jwt: () =>
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ." +
    "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  pem: () =>
    "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1234567890abcdef\n-----END RSA PRIVATE KEY-----"
};

describe("kaynak hijyeni — P0-11 regresyonu", () => {
  it("tarayıcı kaynağında gömülü sır yoktur", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const url = await import("url");
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(here, "index.ts"), "utf-8");

    // Eski tarayicidaki kalip: gercek parolayi parcalara bolup birlestirme.
    expect(source).not.toContain("obfuscatedSecretParts");
    expect(source).not.toMatch(/\[\s*"[A-Za-z0-9]{8,}"\s*,\s*"[A-Za-z0-9]{4,}"\s*\]/);

    // Belirli bir Supabase project ref'i hard-code edilmemeli.
    expect(source).not.toMatch(/\bdb\.[a-z]{20}\.supabase\.co\b/);
  });
});

describe("scanForSecrets — tespit", () => {
  it("bağlantı dizesindeki parolayı bulur", () => {
    const findings = scanForSecrets(fake.pgUrl("s3cretP4ssw0rd"));
    expect(findings.some((f) => f.kind === "connection_string")).toBe(true);
  });

  it("GitHub token'ını bulur", () => {
    expect(scanForSecrets(fake.ghToken()).some((f) => f.kind === "github_token")).toBe(true);
  });

  it("AWS anahtarını bulur", () => {
    expect(scanForSecrets(fake.awsKey()).some((f) => f.kind === "aws_key")).toBe(true);
  });

  it("Google API anahtarını bulur", () => {
    expect(scanForSecrets(fake.googleKey()).some((f) => f.kind === "google_api_key")).toBe(true);
  });

  it("OpenAI ve Anthropic anahtarlarını bulur", () => {
    expect(scanForSecrets(fake.openaiKey()).some((f) => f.kind === "openai_key")).toBe(true);
    expect(scanForSecrets(fake.anthropicKey()).some((f) => f.kind === "anthropic_key")).toBe(true);
  });

  it("Slack ve GitLab token'larını bulur", () => {
    expect(scanForSecrets(fake.slackToken()).some((f) => f.kind === "slack_token")).toBe(true);
    expect(scanForSecrets(fake.gitlabToken()).some((f) => f.kind === "gitlab_token")).toBe(true);
  });

  it("JWT bulur", () => {
    expect(scanForSecrets(fake.jwt()).some((f) => f.kind === "jwt")).toBe(true);
  });

  it("PEM özel anahtar bloğunu bulur", () => {
    expect(scanForSecrets(fake.pem()).some((f) => f.kind === "private_key_block")).toBe(true);
  });

  it("atama biçimindeki sırrı bulur", () => {
    expect(scanForSecrets('API_KEY = "aB3xK9mQ7pL2vN5r"').some((f) => f.kind === "assignment")).toBe(true);
    expect(scanForSecrets('{"password": "Tr0ub4dor&3xKq"}').some((f) => f.kind === "assignment")).toBe(true);
  });

  it("kod referanslarını sır saymaz (gürültü kontrolü)", () => {
    // Ilk calistirmada tarayici 919 bulgu uretti ve neredeyse tamami
    // bunlar gibi kod referansiydi. Gurultulu bir tarayici, kapatilan
    // bir tarayicidir — eski script'in `validate-*` muafiyeti boyle dogmustu.
    const noise = [
      "TOKEN: process.env.INDEX_WORKER_TOKEN",
      "const apiKey = config.apiKey;",
      "password: string;",
      "API_KEY = ${secretRef}",
      'PASSWORD = "REDACTED"',
      'API_KEY = "your-token-here"',
      "secret: options.secret"
    ];
    for (const line of noise) {
      expect(scanForSecrets(line), line).toEqual([]);
    }
  });

  it("çok kısa değerleri sır saymaz (eşik: 12 karakter)", () => {
    // Kisa degerler pratikte gercek sir degil; esigi dusurmek yanlis
    // pozitifi patlatiyor. Esik bilincli bir tercihtir ve burada kilitlenir.
    expect(scanForSecrets('PASSWORD = "kisa123"')).toEqual([]);
    expect(scanForSecrets('API_KEY = "aB3xK9mQ7pL2vN5r"').length).toBeGreaterThan(0);
  });

  it("Bearer header'ı bulur", () => {
    const findings = scanForSecrets("Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456");
    expect(findings.some((f) => f.kind === "bearer_token")).toBe(true);
  });

  it("bulgu satır ve sütun bilgisi taşır", () => {
    const text = `birinci satir\nAPI_KEY = "gizlideger123"\nucuncu satir`;
    const findings = scanForSecrets(text);
    expect(findings[0].line).toBe(2);
    expect(findings[0].column).toBeGreaterThan(0);
  });

  it("bulgu HAM SIRRI TAŞIMAZ", () => {
    const secret = "cokgizlibirparola12345";
    const findings = scanForSecrets(`PASSWORD = "${secret}"`);
    for (const f of findings) {
      expect(f.preview).not.toBe(secret);
      expect(JSON.stringify(f)).not.toContain(secret);
    }
  });

  it("boş metinde bulgu üretmez", () => {
    expect(scanForSecrets("")).toEqual([]);
  });
});

describe("scanForSecrets — yanlış pozitif kontrolü", () => {
  it("git SHA'sını sır saymaz", () => {
    const sha = "9f10f70123cc72d0cfa59bf0998fc8cfafd557d6";
    expect(scanForSecrets(`commit ${sha}`)).toEqual([]);
  });

  it("SHA-256 içerik hash'ini sır saymaz", () => {
    const hash = "a".repeat(8) + "b3c4d5e6f7089a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071829";
    expect(scanForSecrets(`content_hash: ${hash}`)).toEqual([]);
  });

  it("UUID'yi sır saymaz", () => {
    expect(scanForSecrets("run_3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8")).toEqual([]);
  });

  it("normal kaynak kodunu sır saymaz", () => {
    const code = [
      "export function computeBudget(limit: number): number {",
      "  return limit - SYSTEM_RESERVE - TOOL_RESERVE;",
      "}"
    ].join("\n");
    expect(scanForSecrets(code)).toEqual([]);
  });

  it("düşük entropili uzun diziyi sır saymaz", () => {
    expect(scanForSecrets("a".repeat(64))).toEqual([]);
    expect(scanForSecrets("abababababababababababababababababababab")).toEqual([]);
  });
});

describe("redactSecrets", () => {
  it("bağlantı dizesindeki parolayı maskeler, kullanıcıyı bırakır", () => {
    const out = redactSecrets(fake.pgUrl("s3cretP4ssw0rd"));
    expect(out).not.toContain("s3cretP4ssw0rd");
    expect(out).toContain("appuser");
    expect(out).toContain("[REDACTED_PASSWORD]");
  });

  it("token türlerini tür bilgisiyle maskeler", () => {
    expect(redactSecrets(fake.ghToken())).toContain("[REDACTED_GITHUB_TOKEN]");
    expect(redactSecrets(fake.awsKey())).toContain("[REDACTED_AWS_KEY]");
    expect(redactSecrets(fake.jwt())).toContain("[REDACTED_JWT]");
  });

  it("PEM bloğunu tamamen kaldırır", () => {
    const out = redactSecrets(fake.pem());
    expect(out).toBe("[REDACTED_PRIVATE_KEY]");
    expect(out).not.toContain("MIIEow");
  });

  it("maskeleme sonrası metinde sır kalmaz", () => {
    const text = [
      fake.pgUrl("gizli123"),
      fake.ghToken(),
      fake.awsKey(),
      'API_KEY = "baskabirgizli456"'
    ].join("\n");

    const out = redactSecrets(text);
    expect(containsSecret(out)).toBe(false);
  });

  it("git SHA'larını BOZMAZ (kanıt kayıtları için kritik)", () => {
    // Eski tarayicidaki /([A-Za-z0-9+/]{40,})/g kurali her uzun diziyi
    // maskeliyordu; evidence kayitlarindaki mesru hash'ler de bozuluyordu.
    const sha = "9f10f70123cc72d0cfa59bf0998fc8cfafd557d6";
    expect(redactSecrets(`commit_sha: ${sha}`)).toContain(sha);
  });

  it("normal kaynak kodunu değiştirmez", () => {
    const code = "export const MAX_TOKENS = 200000;\n";
    expect(redactSecrets(code)).toBe(code);
  });

  it("boş girdide boş döner", () => {
    expect(redactSecrets("")).toBe("");
  });

  it("idempotenttir", () => {
    const once = redactSecrets(fake.pgUrl("gizli"));
    expect(redactSecrets(once)).toBe(once);
  });
});

describe("shannonEntropy", () => {
  it("tek karakter tekrarında 0 döner", () => {
    expect(shannonEntropy("aaaaaaaa")).toBe(0);
  });

  it("hex dizisinde düşük entropi verir", () => {
    expect(shannonEntropy("0123456789abcdef0123456789abcdef")).toBeLessThan(4.5);
  });

  it("rastgele token'da yüksek entropi verir", () => {
    expect(shannonEntropy("A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0")).toBeGreaterThan(4.5);
  });

  it("boş dizide 0 döner", () => {
    expect(shannonEntropy("")).toBe(0);
  });
});

describe("containsSecret", () => {
  it("sır içeren metinde true döner", () => {
    expect(containsSecret(fake.ghToken())).toBe(true);
  });

  it("temiz metinde false döner", () => {
    expect(containsSecret("export const a = 1;")).toBe(false);
  });
});

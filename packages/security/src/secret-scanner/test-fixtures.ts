/**
 * P03/P04 — Sır tespitini test etmek için sahte kimlik bilgisi üreticileri.
 *
 * NEDEN TEK BİR DOSYADA:
 *   Sır tespitini doğrulayan her test, sır GİBİ görünen veri içermek
 *   zorundadır. Bu veriler farklı test dosyalarına dağılırsa, tarayıcının
 *   muafiyet listesi her yeni testle büyür — ve büyüyen bir muafiyet
 *   listesi, eski `startsWith("validate-")` muafiyetinin doğuş hikâyesidir.
 *
 *   Bunun yerine sahte veri TEK BİR yerde toplanır. Tarayıcının
 *   self-referential listesinde yalnız bu dosya bulunur; testler buradan
 *   import eder ve kendileri temiz kalır.
 *
 * BU DOSYADAKİ HİÇBİR DEĞER GERÇEK DEĞİLDİR.
 *   Tümü parçalardan runtime'da kurulur ve hiçbir sisteme ait değildir.
 *   Biçimleri gerçek token'lara benzer çünkü test edilen şey tam olarak
 *   o biçimlerin tanınmasıdır.
 */

/** Sahte bağlantı dizesi. Parola çağıran tarafından verilir. */
export function fakeConnectionString(password: string): string {
  return "postgres" + `ql://appuser:${password}@db.example.invalid:5432/appdb`;
}

export function fakeGitHubToken(): string {
  return "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
}

export function fakeGitLabToken(): string {
  return "glpat-" + "abcdefghij1234567890";
}

export function fakeAwsKey(): string {
  return "AKIA" + "IOSFODNN7EXAMPLE";
}

export function fakeGoogleApiKey(): string {
  return "AIza" + "SyD1234567890abcdefghijklmnopqrstuv";
}

export function fakeOpenAiKey(): string {
  return "sk-" + "proj-" + "abcdefghijklmnopqrstuvwxyz012345";
}

export function fakeAnthropicKey(): string {
  return "sk-ant-" + "api03-abcdefghijklmnopqrstuvwxyz0123";
}

export function fakeSlackToken(): string {
  return "xoxb-" + "123456789012-1234567890123-abcdefghijklmnopqrst";
}

export function fakeJwt(): string {
  return (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ." +
    "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
  );
}

export function fakePrivateKeyBlock(): string {
  return [
    "-----BEGIN RSA PRIVATE KEY-----",
    "MIIEowIBAAKCAQEA1234567890abcdef",
    "-----END RSA PRIVATE KEY-----"
  ].join("\n");
}

/** Yüksek entropili, tür öneki olmayan sahte sır. */
export function fakeOpaqueSecret(): string {
  return "aB3xK9mQ7pL2vN5r" + "T8wY4uJ6hG1dF0sZ";
}

/**
 * Bir kaynak dosyaya gömülmüş gibi görünen sahte sır.
 * `containsSecret` gibi bütünsel testlerde kullanılır.
 */
export function fakeSourceWithSecret(): string {
  return `const client = createClient({ token: "${fakeGitHubToken()}" });`;
}

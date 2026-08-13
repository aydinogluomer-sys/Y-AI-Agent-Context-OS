import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  GoogleGeminiProvider,
  ProviderRegistry,
  type ModelProvider,
} from "../packages/providers/src/index";
import {
  LocalFilesystemRepoAdapter,
  ReadOnlyGitHubRepoAdapter,
} from "../packages/core/src/repo-adapter";
import { fakeConnectionString } from "@y/security/secret-scanner/test-fixtures";

const fakeProvider: ModelProvider = {
  id: "fake-local",
  async connect() {
    return {
      providerId: this.id,
      configured: true,
      status: "ready",
      checkedAt: new Date().toISOString(),
      message: "ready",
    };
  },
  getCapabilities() {
    return {
      providerId: this.id,
      displayName: "Fake Local",
      privacyBoundary: "local_only",
      sendsPromptsOffDevice: false,
      supportsStreaming: false,
      supportsStructuredJson: true,
      models: [],
    };
  },
  async generate(request) {
    return { providerId: this.id, model: request.model, text: "{}" };
  },
};

const registry = new ProviderRegistry().register(fakeProvider);
assert.equal(registry.resolve("fake-local"), fakeProvider);
assert.equal(registry.listCapabilities()[0].privacyBoundary, "local_only");
assert.equal((await registry.health())[0].status, "ready");

const gemini = new GoogleGeminiProvider(undefined);
const geminiCapabilities = gemini.getCapabilities();
assert.equal(geminiCapabilities.privacyBoundary, "external_processor");
assert.equal(geminiCapabilities.sendsPromptsOffDevice, true);
assert.equal((await gemini.connect()).status, "not_configured");

const localRepo = new LocalFilesystemRepoAdapter(process.cwd());
assert.equal(localRepo.getCapabilities().operations.contentDiff, true);
assert.equal(localRepo.getCapabilities().operations.commit, false);
// Sahte kimlik bilgileri TEK yerde uretilir; boylece sir tarayicisinin
// muafiyet listesi her yeni test dosyasiyla buyumez (P03 karari).
const diff = await localRepo.getDiff({
  path: "src/config.ts",
  baseContent: `DATABASE_URL=${fakeConnectionString("secret")}`,
  targetContent: `DATABASE_URL=${fakeConnectionString("new-secret")}`,
});
assert.equal(diff.ok, true);
assert.doesNotMatch(diff.data || "", /user:(?:secret|new-secret)@/);

const github = new ReadOnlyGitHubRepoAdapter(
  "project-a",
  "https://github.com/example/repo",
);
assert.equal(github.getCapabilities().accessMode, "unavailable");
assert.equal(github.getCapabilities().operations.openPullRequest, false);
assert.equal((await github.getDiff({
  path: "README.md",
  baseContent: "a",
  targetContent: "b",
})).ok, false);

// P04 / Y-P04-009 — Index worker sözleşmesi bu script'ten ÇIKARILDI.
//
// Buradaki eski blok tam olarak şunu doğruluyordu:
//
//     assert.deepEqual(workerResult, { claimed: true, jobId: "job-a", processedFiles: 1 });
//     assert.match(calls[2].url, /\/job-a\/complete$/);
//
// Yani "worker bir dosyayı OKUDU ve /complete çağırdı" davranışı PASS
// sayılıyordu. Hiçbir sembol, hiçbir chunk, hiçbir satır yazılmıyordu.
// Bu assertion seti, P00 Truth Audit'in "false green" tanımının kendisiydi:
// script yeşil kalırken worker hiçbir iş yapmıyordu.
//
// Yeni worker veritabanına yazar ve yazım kanıtı olmadan job'ı `completed`
// işaretlemez. Sözleşmesi 20 gerçek test ile kilitlenmiştir:
//
//     workers/index-worker.test.ts
//
// Özellikle "negatif: kanıtsız tamamlanamaz" bölümü, eski davranışın geri
// gelmesi hâlinde kırmızıya döner. Bir HTTP çağrı sayısını doğrulayan bu
// script ile aynı iddiayı iki yerde tutmanın anlamı yok; tekrar eden ama
// zayıf olan taraf kaldırıldı.

const serverSource = await readFile(
  new URL("../server.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(serverSource, /from\s+["']@google\/genai["']/);
assert.match(serverSource, /createDefaultProviderRegistry/);

console.log("Phase 7 provider/repo contracts: PASS (worker: workers/index-worker.test.ts)");

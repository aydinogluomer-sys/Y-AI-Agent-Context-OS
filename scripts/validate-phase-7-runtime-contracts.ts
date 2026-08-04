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
import { IndexWorker } from "../workers/index-worker";
import type { IndexJobDTO } from "@y/shared";

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
const diff = await localRepo.getDiff({
  path: "src/config.ts",
  baseContent: "DATABASE_URL=postgresql://user:secret@localhost/db",
  targetContent: "DATABASE_URL=postgresql://user:new-secret@localhost/db",
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

const claimedJob: IndexJobDTO = {
  id: "job-a",
  projectId: "project-a",
  taskId: null,
  jobType: "file_delta_scan",
  status: "processing",
  priority: "medium",
  adapterKind: "local_filesystem",
  rootPathRedacted: ".",
  requestedPaths: ["src/index.ts"],
  metadataJson: {},
  attempts: 1,
  maxAttempts: 3,
  lockedAt: new Date().toISOString(),
  lockedBy: "worker-a",
  startedAt: new Date().toISOString(),
  completedAt: null,
  failedAt: null,
  errorRedacted: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const calls: Array<{ url: string; init?: RequestInit }> = [];
const fetchImpl = async (input: URL | RequestInfo, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, init });
  const payload = url.endsWith("/claim-next")
    ? claimedJob
    : url.includes("/repo/file?")
      ? { ok: true, content: "export {}" }
      : claimedJob;
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

const worker = new IndexWorker({
  apiBaseUrl: "http://localhost:3000",
  projectId: "project-a",
  workerId: "worker-a",
  bearerToken: "test-token",
  fetchImpl,
});
const workerResult = await worker.runOnce();
assert.deepEqual(workerResult, {
  claimed: true,
  jobId: "job-a",
  processedFiles: 1,
});
assert.equal(calls.length, 3);
assert.match(calls[2].url, /\/job-a\/complete$/);
assert.equal(
  (calls[0].init?.headers as Record<string, string>).Authorization,
  "Bearer test-token",
);

const serverSource = await readFile(
  new URL("../server.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(serverSource, /from\s+["']@google\/genai["']/);
assert.match(serverSource, /createDefaultProviderRegistry/);

console.log("Phase 7 provider/repo/worker contracts: PASS");

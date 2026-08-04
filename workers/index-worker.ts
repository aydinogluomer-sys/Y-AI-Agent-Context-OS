import { pathToFileURL } from "node:url";
import type { IndexJobDTO } from "@y/shared";

export interface IndexWorkerOptions {
  apiBaseUrl: string;
  projectId: string;
  workerId: string;
  bearerToken: string;
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
}

export interface IndexWorkerRunResult {
  claimed: boolean;
  jobId: string | null;
  processedFiles: number;
}

export class IndexWorker {
  private readonly fetchImpl: typeof fetch;
  private stopped = false;

  constructor(private readonly options: IndexWorkerOptions) {
    this.fetchImpl = options.fetchImpl || fetch;
    if (!options.projectId || !options.workerId || !options.bearerToken) {
      throw new Error(
        "Index worker requires projectId, workerId and bearerToken.",
      );
    }
  }

  stop(): void {
    this.stopped = true;
  }

  private async request(path: string, init: RequestInit = {}): Promise<any> {
    const response = await this.fetchImpl(
      `${this.options.apiBaseUrl.replace(/\/$/, "")}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${this.options.bearerToken}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Worker API ${response.status}: ${body.slice(0, 500)}`);
    }
    return response.status === 204 ? null : response.json();
  }

  private async processJob(job: IndexJobDTO): Promise<number> {
    const paths = job.requestedPaths || [];
    if (paths.length === 0) {
      const listed = await this.request(
        `/api/projects/${encodeURIComponent(this.options.projectId)}/repo/files?root=.&limit=200`,
      );
      return Array.isArray(listed?.files) ? listed.files.length : 0;
    }

    let processed = 0;
    for (const path of paths) {
      await this.request(
        `/api/projects/${encodeURIComponent(this.options.projectId)}/repo/file?path=${encodeURIComponent(path)}`,
      );
      processed += 1;
    }
    return processed;
  }

  async runOnce(): Promise<IndexWorkerRunResult> {
    const projectPath = encodeURIComponent(this.options.projectId);
    const job = (await this.request(
      `/api/projects/${projectPath}/index-jobs/claim-next`,
      {
        method: "POST",
        body: JSON.stringify({ workerId: this.options.workerId }),
      },
    )) as IndexJobDTO | null;

    if (!job) {
      return { claimed: false, jobId: null, processedFiles: 0 };
    }

    try {
      const processedFiles = await this.processJob(job);
      await this.request(
        `/api/projects/${projectPath}/index-jobs/${encodeURIComponent(job.id)}/complete`,
        {
          method: "POST",
          body: JSON.stringify({ resultCount: processedFiles }),
        },
      );
      return { claimed: true, jobId: job.id, processedFiles };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.request(
        `/api/projects/${projectPath}/index-jobs/${encodeURIComponent(job.id)}/fail`,
        {
          method: "POST",
          body: JSON.stringify({ error: message }),
        },
      );
      throw error;
    }
  }

  async run(): Promise<void> {
    const interval = Math.max(250, this.options.pollIntervalMs || 2_000);
    while (!this.stopped) {
      await this.runOnce();
      if (!this.stopped) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }
  }
}

async function main(): Promise<void> {
  const worker = new IndexWorker({
    apiBaseUrl: process.env.API_BASE_URL || "http://127.0.0.1:3000",
    projectId: process.env.INDEX_WORKER_PROJECT_ID || "",
    workerId: process.env.INDEX_WORKER_ID || `index-worker-${process.pid}`,
    bearerToken: process.env.INDEX_WORKER_TOKEN || "",
    pollIntervalMs: Number(process.env.INDEX_WORKER_POLL_MS || 2_000),
  });

  process.once("SIGINT", () => worker.stop());
  process.once("SIGTERM", () => worker.stop());

  if (process.env.INDEX_WORKER_RUN_ONCE === "true") {
    const result = await worker.runOnce();
    console.log(JSON.stringify(result));
    return;
  }
  await worker.run();
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

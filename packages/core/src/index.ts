import { Project, Task } from "@y/shared";

export function evaluatePlatformReadiness(project: Project, task: Task): { riskScore: number; advice: string[] } {
  const advice: string[] = [];
  let riskScore = 15;

  if (task.category === "Coding" && task.riskLevel === "High") {
    riskScore += 45;
    advice.push("Figma interaction frames and spec connections recommended.");
  }
  
  if (!project.metadataJson || Object.keys(project.metadataJson).length === 0) {
    riskScore += 20;
    advice.push("Project lack custom documentation anchors. Highly recommend importing Context Vault README.");
  }

  return { riskScore, advice };
}

export * from "./repo-adapter";
export * from "./repo-adapter-service";
export * from "./index-job-service";
export * from "./incremental-index-service";
export * from "./static-analysis";


// ==========================================
// P03 — Repository ingestion (ADR-006, ADR-018, ADR-019)
// ==========================================

export {
  AdapterError,
  isWritable,
  classifyFileShape,
  type RepositoryAdapter,
  type WritableRepositoryAdapter,
  type AdapterCapabilities,
  type AdapterErrorCode,
  type FileEntry,
  type FileContent,
  type RepositoryKind,
  type RepositoryMetadata,
  type ListFilesOptions
} from "./repo/adapter";

export { LocalRepositoryAdapter } from "./repo/local-adapter";
export {
  RemoteRepositoryAdapter,
  GitHubRepositoryAdapter,
  GitLabRepositoryAdapter,
  parseGitHubPath,
  encodeGitLabProjectPath,
  type CredentialResolver,
  type RemoteAdapterOptions
} from "./repo/remote-adapter";
export { RepositoryRegistry, type RepositoryRecord, type RegistryOptions } from "./repo/registry";
export {
  WorkspaceManager,
  WorkspaceError,
  assertSafeSegment,
  DEFAULT_QUOTA,
  type RepositoryLocation,
  type WorkspaceQuota
} from "./repo/workspace";

export {
  GitRepository,
  cloneRepository,
  type CommitInfo,
  type ChangedFile,
  type ChangeStatus
} from "./git/repository";
export {
  runGit,
  assertNotFlag,
  assertValidRef,
  assertSafeRemoteUrl,
  isPrivateHost,
  GitSecurityError,
  GitCommandError,
  ALLOWED_SUBCOMMANDS
} from "./git/git-cli";

export {
  SnapshotService,
  detectLanguage,
  type SnapshotResult,
  type SnapshotStatus,
  type IngestOptions,
  type SnapshotDb
} from "./ingestion/snapshot-service";

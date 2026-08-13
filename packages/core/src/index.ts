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

// ==========================================
// P04 — Static analysis & symbol intelligence (ADR-007, ADR-020, ADR-021)
// ==========================================

export {
  computeConfidence,
  ParserTimeoutError,
  type LanguageParser,
  type ParsedSymbol,
  type ParsedImport,
  type ParseResult,
  type ParseOptions,
  type ParseDiagnostic,
  type SymbolType
} from "./parsers/types";

export { ParserRegistry, createDefaultRegistry } from "./parsers/registry";
export { TypeScriptParser } from "./parsers/typescript-parser";
export { TreeSitterParser, GRAMMAR_FILES } from "./parsers/tree-sitter-parser";
export { StructuralParser } from "./parsers/structural-parser";
export { chunkBySymbols, estimateTokens, type Chunk, type ChunkOptions } from "./parsers/symbol-chunker";
export {
  SymbolIndexer,
  type IndexResult,
  type IndexOptions,
  type FileToIndex,
  type IndexerDb
} from "./parsers/symbol-indexer";
export {
  IncrementalIndexPlanner,
  resolveImportCandidates,
  type IncrementalPlan,
  type InvalidationDb,
  type InvalidationReason,
  type InvalidationRecord,
  type PlanParams,
  type PlannerOptions
} from "./parsers/invalidation";

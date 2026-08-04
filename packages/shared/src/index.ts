/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ==========================================
// 1. Shared Error Types
// ==========================================

export class BaseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error(message).stack;
    }
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message = "Unauthorized action. Please authenticate.", details?: Record<string, unknown>) {
    super("UNAUTHORIZED", message, 401, details || {});
  }
}

export class PermissionDeniedError extends BaseError {
  constructor(message = "Permission denied for this asset.", details?: Record<string, unknown>) {
    super("PERMISSION_DENIED", message, 403, details || {});
  }
}

export class ContextBoundaryViolationError extends BaseError {
  constructor(message = "Forbidden file or out-of-scope context access blocked.", details?: Record<string, unknown>) {
    super("CONTEXT_BOUNDARY_VIOLATION", message, 400, details || {});
  }
}

export class SecretLeakedError extends BaseError {
  constructor(message = "Potential API key or secret leak prevented in logs or prompts.", details?: Record<string, unknown>) {
    super("SECRET_LEAK_PREVENTED", message, 400, details || {});
  }
}

export class NotFoundError extends BaseError {
  constructor(message = "Requested resources could not be found.", details?: Record<string, unknown>) {
    super("NOT_FOUND", message, 404, details || {});
  }
}

export class ConflictError extends BaseError {
  constructor(message = "Conflict detected.", details?: Record<string, unknown>) {
    super("CONFLICT", message, 409, details || {});
  }
}

// ==========================================
// 2. Explicit Union Types
// ==========================================

export type UserRole = "admin" | "developer" | "reviewer";
export type ContextSourceType =
  | "code"
  | "markdown"
  | "test"
  | "prompt"
  | "agent_session"
  | "git_history"
  | "api_doc"
  | "ux_spec"
  | "design_spec"
  | "decision_log"
  | "task_history"
  | "connected_tool_data"
  | "external_repo_reference";
export type FreshnessStatusType = "fresh" | "stale" | "outdated";
export type TaskCategoryType = "Coding" | "Review" | "UI/UX" | "Research" | "Data/SQL";
export type TaskRiskLevelType = "Low" | "Medium" | "High";
export type TaskDifficultyType = "Easy" | "Medium" | "Hard";
export type TaskStatusType = "pending" | "running" | "paused" | "failed" | "completed" | "cancelled" | "archived";
export type TaskStatus = TaskStatusType;
export type TaskTransitionActionType = "start" | "pause" | "resume" | "complete" | "fail" | "retry" | "cancel" | "archive";
export type TaskTransitionAction = TaskTransitionActionType;
export type GraphNodeType = "file" | "doc" | "decision" | "task" | "test" | "commit" | "agent_session" | "connected_asset" | "code" | "session" | "connector";
export type GraphNodeStatusType = "active" | "related";
export type GraphEdgeLabelType = "references" | "belongs_to" | "documents" | "tests" | "derived_from" | "related_to" | "created_by" | "connected_to" | "imported_by" | "exports_to" | "tested_by" | "decided_by" | "linked_with";
export type ConnectionHealthType = "ok" | "warning" | "error";
export type ConnectionAccessMode = "read-only" | "write" | "admin";
export type AuditLogStatusType = "authorized" | "denied_untrusted" | "redacted_and_completed";
export type AuditFeatureIdType = "CORE" | "CTX" | "TASK" | "SEC" | "AGENT" | "RESUME" | "WORKER";
export type AuditActionType =
  | "CREATE_PROJECT"
  | "UPDATE_PROJECT"
  | "DELETE_PROJECT"
  | "CREATE_TASK"
  | "UPDATE_TASK"
  | "STATUS_CHANGE_TASK"
  | "TASK_TRANSITION_REQUESTED"
  | "TASK_TRANSITION_COMPLETED"
  | "TASK_TRANSITION_FAILED"
  | "TASK_TRANSITION_BLOCKED"
  | "TASK_TRANSITION_HISTORY_RECORDED"
  | "TASK_TRANSITION_ADMIN_OVERRIDE_USED"
  | "TASK_LIFECYCLE_SECRET_REDACTED"
  | "TASK_LIFECYCLE_CROSS_PROJECT_ACCESS_BLOCKED"
  | "RUN_MIGRATION"
  | "DB_READINESS_CHECK"
  | "CREATE_CONTEXT_ITEM"
  | "UPDATE_CONTEXT_ITEM"
  | "DELETE_CONTEXT_ITEM"
  | "READ_CONTEXT_ITEM"
  | "COMPLETED_CHUNKING"
  | "FAILED_CLASSIFICATION"
  | "REJECTED_UNSAFE"
  | "SYNC_GRAPH_STARTED"
  | "SYNC_GRAPH_COMPLETED"
  | "CREATE_GRAPH_NODE"
  | "UPDATE_GRAPH_NODE"
  | "DELETE_GRAPH_NODE"
  | "CREATE_GRAPH_EDGE"
  | "REJECT_GRAPH_RELATIONSHIP"
  | "READ_GRAPH"
  | "DENIED_CROSS_PROJECT"
  | "PROJECT_SCOPE_VALIDATION_FAILED"
  | "SYNC_GRAPH_BLOCKED"
  | "SEED_EXECUTION_SUCCESS"
  | "SEED_EXECUTION_SKIPPED"
  | "STARTUP_VERIFICATION_SUCCESS"
  | "STARTUP_VERIFICATION_FAILED"
  | "CREATE_AGENT_MEMORY"
  | "UPDATE_AGENT_MEMORY"
  | "READ_AGENT_MEMORY"
  | "PAUSE_TASK"
  | "CREATE_RESUME_STATE"
  | "UPDATE_RESUME_STATE"
  | "READ_RESUME_STATE"
  | "GET_RESUME_PAYLOAD"
  | "RESUME_BLOCKED"
  | "CREATE_RESUME_SCHEDULE"
  | "UPDATE_RESUME_SCHEDULE"
  | "CANCEL_RESUME_SCHEDULE"
  | "RESUME_SCHEDULE_READY"
  | "ADD_TASK_TO_PAUSED_QUEUE"
  | "REQUEUE_TASK_FOR_RESUME"
  | "SCAN_AUTO_REQUEUE"
  | "REJECT_INVALID_SCHEDULE"
  | "RESUME_SCHEDULE_DUPLICATE_REJECTED"
  | "RESUME_SCHEDULE_REPLACED"
  | "RESUME_REQUEUE_IDEMPOTENT_SKIP"
  | "RESUME_REQUEUE_TRANSITIONED"
  | "CREATE_AGENT_SESSION"
  | "UPDATE_AGENT_SESSION"
  | "READ_AGENT_SESSION"
  | "GENERATE_RECOVERY_PAYLOAD"
  | "TASK_STATE_FALLBACK_PARSED"
  | "TASK_STATE_FALLBACK_MISSING"
  | "UNRECOVERABLE_SESSION_DETECTED"
  | "CROSS_PROJECT_SESSION_BLOCKED"
  | "CREATE_AGENT_HANDOFF"
  | "UPDATE_AGENT_HANDOFF"
  | "VALIDATE_AGENT_HANDOFF"
  | "READ_AGENT_HANDOFF"
  | "CROSS_PROJECT_HANDOFF_BLOCKED"
  | "TIMELINE_READ"
  | "TIMELINE_SUMMARY_GENERATED"
  | "TIMELINE_REBUILT"
  | "TIMELINE_MISSING_SOURCE_WARNING"
  | "TIMELINE_CROSS_PROJECT_ACCESS_BLOCKED"
  | "READ_DEBUG_LOGS"
  | "APPEND_DEBUG_LOG"
  | "CLEAR_DEBUG_LOGS"
  | "EXECUTE_BUG_DIAGNOSIS"
  | "DEBUG_CROSS_PROJECT_ACCESS_BLOCKED"
  | "DEBUG_SECRET_REDACTED"
  | "QUEUE_INDEX_JOB"
  | "CLAIM_INDEX_JOB"
  | "UPDATE_INDEX_JOB_STATUS"
  | "CANCEL_INDEX_JOB"
  | "RELEASE_STALE_LOCKS_INDEX_JOB"
  | "INDEX_JOB_CREATED"
  | "INDEX_JOB_CLAIMED"
  | "INDEX_JOB_PROCESSING"
  | "INDEX_JOB_COMPLETED"
  | "INDEX_JOB_FAILED"
  | "INDEX_JOB_CANCELLED"
  | "INDEX_JOB_RETRIED"
  | "INDEX_JOB_STALE_LOCK_RELEASED"
  | "INDEX_JOB_CROSS_PROJECT_ACCESS_BLOCKED"
  | "INDEX_JOB_SECRET_REDACTED"
  | "QUALITY_GATE_RUN_CREATED"
  | "QUALITY_GATE_RUN_STARTED"
  | "QUALITY_GATE_COMMAND_INGESTED"
  | "QUALITY_GATE_RUN_COMPLETED"
  | "QUALITY_GATE_RUN_FAILED"
  | "QUALITY_GATE_RUN_CANCELLED"
  | "QUALITY_GATE_SECRET_REDACTED"
  | "QUALITY_GATE_CROSS_PROJECT_ACCESS_BLOCKED"
  | "EVIDENCE_RECORD_STORED"
  | "EVIDENCE_RECORD_VERIFIED"
  | "EVIDENCE_RECORD_CORRUPTION_DETECTED"
  | "EVIDENCE_VERIFICATION_FAILED"
  | "EVIDENCE_SECRET_REDACTED"
  | "EVIDENCE_CROSS_PROJECT_ACCESS_BLOCKED"
  | "EVENT_RECORD_APPENDED"
  | "EVENT_RECORD_READ"
  | "EVENT_RECORD_BLOCKED"
  | "EVENT_RECORD_FAILURE"
  | "EVENT_SECRET_REDACTED"
  | "EVENT_CROSS_PROJECT_ACCESS_BLOCKED"
  | "EVENT_IDEMPOTENCY_REUSED"
  | "EVENT_APPEND_ONLY_VIOLATION_BLOCKED"
  | "CONTEXT_OBJECT_STORED"
  | "CONTEXT_OBJECT_READ"
  | "CONTEXT_OBJECT_REF_CREATED"
  | "CONTEXT_OBJECT_STATE_TRANSITIONED"
  | "CONTEXT_OBJECT_QUARANTINED"
  | "CONTEXT_OBJECT_SECRET_REDACTED"
  | "CONTEXT_OBJECT_ACCESS_DENIED"
  | "CONTEXT_OBJECT_PAYLOAD_REJECTED"
  | "WORKER_REGISTERED"
  | "WORKER_HEARTBEAT_RECORDED"
  | "WORKER_PAUSED"
  | "WORKER_STOPPED"
  | "WORKER_STALE_DETECTED"
  | "WORKER_STALE_EVICTED"
  | "WORKER_JOB_CLAIMED"
  | "WORKER_JOB_COMPLETED"
  | "WORKER_JOB_FAILED"
  | "WORKER_JOB_RETRY_SCHEDULED"
  | "WORKER_STALE_LEASE_RELEASED"
  | "WORKER_SECRET_REDACTED"
  | "WORKER_CROSS_PROJECT_ACCESS_BLOCKED"
  | "FILE_LOCK_ACQUIRED"
  | "FILE_LOCK_BLOCKED"
  | "FILE_LOCK_REFRESHED"
  | "FILE_LOCK_RELEASED"
  | "FILE_LOCK_STALE_RELEASED"
  | "FILE_LOCK_EXPIRED"
  | "FILE_LOCK_SECRET_REDACTED"
  | "FILE_LOCK_PATH_BLOCKED"
  | "FILE_LOCK_CROSS_PROJECT_ACCESS_BLOCKED"
  | "PERMISSION_KERNEL_BOOTED"
  | "PERMISSION_EVALUATED"
  | "PERMISSION_DENIED"
  | "PERMISSION_BYPASS_USED"
  | "PERMISSION_POLICY_LOADED"
  | "PERMISSION_SECRET_REDACTED"
  | "PERMISSION_CROSS_PROJECT_ACCESS_BLOCKED"
  | "ARTIFACT_CAS_BLOB_STORED"
  | "ARTIFACT_CAS_DEDUP_REUSED"
  | "ARTIFACT_VERSION_REGISTERED"
  | "ARTIFACT_VERSION_SUPERSEDED"
  | "ARTIFACT_VERSION_ARCHIVED"
  | "ARTIFACT_VERSION_QUARANTINED"
  | "ARTIFACT_SECRET_REDACTED"
  | "ARTIFACT_PAYLOAD_REJECTED"
  | "ARTIFACT_ACCESS_DENIED"
  | "ARTIFACT_CROSS_PROJECT_ACCESS_BLOCKED";

// ==========================================
// 3. Base Scoping Interfaces
// ==========================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  teamId: string;
  createdAt: string;
  updatedAt: string;
  metadataJson: Record<string, unknown>;
}

export interface ContextItem {
  id: string;
  projectId: string;
  sourceType: ContextSourceType;
  sourceUri: string;
  checksum: string;
  version: string;
  contentHash: string;
  tokenCount: number;
  confidence: number; // 0.0 - 100.0 score
  freshnessStatus: FreshnessStatusType;
  createdAt: string;
  updatedAt: string;
  metadataJson: Record<string, unknown>;
}

export interface ContextChunk {
  id: string;
  contextItemId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embeddingId?: string; // Reference to pgvector index
}

export interface ContextPack {
  id: string;
  projectId: string;
  taskId: string;
  confidenceScore: number;
  tokensInvolved: number;
  compressedPackTokens: number;
  createdAt: string;
}

export interface ContextPackItem {
  id: string;
  contextPackId: string;
  contextItemId: string;
  reasonForInclusion: string;
  role: string;
}

export interface GraphNode {
  id: string; // Typically matches File Path / URI
  projectId?: string;
  label: string;
  type: GraphNodeType;
  status: GraphNodeStatusType;
  contextItemId?: string | null;
  taskId?: string | null;
  nodeIdentifier?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface GraphEdge {
  id: string;
  projectId: string;
  source: string;
  target: string;
  label: GraphEdgeLabelType;
  weight: number;
  relationship?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  category: TaskCategoryType;
  riskLevel: TaskRiskLevelType;
  difficulty: TaskDifficultyType;
  status: TaskStatusType;
  ownerAgent?: string;
  humanOwner?: string;
  acceptanceCriteria: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEventAgentSession {
  id: string;
  taskId: string;
  agentName: string;
  status: "active" | "paused" | "completed" | "failed";
  timelineEventDescription: string;
  createdAt: string;
}

export interface ResumeState {
  id: string;
  projectId: string;
  taskId: string;
  agentMemoryId: string | null;
  contextPackId: string | null;
  changeSimulationId: string | null;
  status: string;
  pausedReason: string | null;
  taskState: {
    taskId?: string;
    projectId?: string;
    featureIdsInProgress?: string[];
    currentStep?: string;
    completedSteps?: string[];
    pendingSteps?: string[];
    blockedSteps?: string[];
    knownRisks?: string[];
    validationStatus?: string;
    relatedMemoryRef?: string | null;
    relatedContextPackRef?: string | null;
    relatedSimulationRef?: string | null;
  };
  repoDiffSnapshot: {
    source: "metadata_only" | "git_diff";
    files?: Array<{
      path: string;
      change_summary?: string;
      added_lines?: number;
      removed_lines?: number;
      checksum?: string;
    }>;
    redacted_diffs?: string[];
    checksum_metadata?: string;
  };
  currentPhase: string | null;
  failedStep: {
    failed_command?: string;
    failed_endpoint?: string;
    failed_validation?: string;
    failed_migration?: string;
    failed_test?: string;
    failed_boundary_check?: string;
    message?: string;
    resolved: boolean;
    resolution?: string;
  } | null;
  nextAction: string | null;
  affectedFiles: Array<{
    path: string;
    reason: string;
    risk?: string;
    confidence?: number;
    boundary_status?: string;
  }>;
  validationState: Record<string, any>;
  resumePayload: Record<string, any>;
  confidenceScore: number;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;

  // Backward compatibility fields
  sessionSnapshotRef?: string;
  gitDiffSnapshot?: string;
  lastHaltedStep?: string;
  nextRecommendedAction?: string;
}

export interface AgentMemory {
  id: string;
  projectId: string;
  taskId: string;
  agentRunId: string | null;
  status: string;
  whatAgentDid: Array<{
    action_type: string;
    description: string;
    related_files?: string[];
    related_feature_ids?: string[];
    timestamp?: string;
    confidence?: number;
  }>;
  whyAgentDidIt: Array<{
    rationale_type: string;
    description: string;
    source?: string;
  }>;
  whatChanged: {
    files_changed?: string[];
    database_changes?: string[];
    api_changes?: string[];
    ui_changes?: string[];
    test_changes?: string[];
    security_changes?: string[];
    audit_logging_changes?: string[];
  };
  whatFailed: Array<{
    failure_type: string;
    message: string;
    affected_area: string;
    resolved: boolean;
    resolution?: string;
  }>;
  whatRemains: Array<{
    feature_id: string;
    status: "blocked" | "partial" | "pending";
    description: string;
    risks?: string[];
  }>;
  nextRecommendedAction: string;
  confidenceScore: number;
  sourceRefs: string[];
  metadataJson: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Connector {
  id: string;
  projectId: string;
  toolName: string;
  healthStatus: ConnectionHealthType;
  accessMode: ConnectionAccessMode;
  lastSyncAt: string;
  metadataJson: Record<string, unknown>;
}

export interface AuditLog {
  id: string;
  projectId: string;
  actor: string; // e.g. "User-Aydinoglu" or "Agent-Claude"
  action: string; // e.g. "GENERATE_CONTEXT_PACK" or "BYPASS_UNSUPPORTED_CLAIM"
  status: AuditLogStatusType;
  ipAddress: string;
  resourceId: string;
  timestamp: string;
  rationale: string;
}

export interface DebugEvent {
  id: string;
  taskId: string;
  sessionId: string;
  eventType: "log" | "warn" | "error" | "network" | "query";
  severity: "info" | "warning" | "critical";
  traceId: string;
  probeTag?: string; // Tagged with debug session tags
  payloadRedacted: string;
  createdAt: string;
}

export interface QualityGateRun {
  id: string;
  taskId: string;
  gateType: "lint" | "typecheck" | "unit-test" | "lighthouse" | "accessibility";
  status: "passed" | "failed_blocking" | "bypassed";
  score?: number;
  logs: string;
  createdAt: string;
}

// ==========================================
// 4. Data Transfer Objects (DTOs)
// ==========================================

// Project DTOs
export interface ProjectDTO {
  id: string;
  name: string;
  description: string | null;
  teamId: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export interface CreateProjectDTO {
  id?: string;
  name: string;
  description?: string;
  teamId?: string;
  metadataJson?: Record<string, unknown>;
}
export interface UpdateProjectDTO {
  name?: string;
  description?: string;
  teamId?: string;
  metadataJson?: Record<string, unknown>;
}

// Membership DTOs
export interface MembershipDTO {
  id: string;
  projectId: string;
  userEmail: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
export interface CreateMembershipDTO {
  projectId: string;
  userEmail: string;
  role: UserRole;
}

// Task DTOs
export interface TaskDTO {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  category: TaskCategoryType;
  riskLevel: TaskRiskLevelType;
  difficulty: TaskDifficultyType;
  status: TaskStatusType;
  ownerAgent: string | null;
  humanOwner: string | null;
  acceptanceCriteria: string[];
  createdAt: string;
  updatedAt: string;
}
export interface CreateTaskDTO {
  id?: string;
  projectId: string;
  title: string;
  description?: string;
  category?: TaskCategoryType;
  riskLevel?: TaskRiskLevelType;
  difficulty?: TaskDifficultyType;
  status?: TaskStatusType;
  ownerAgent?: string;
  humanOwner?: string;
  acceptanceCriteria?: string[];
}
export interface UpdateTaskDTO {
  title?: string;
  description?: string;
  category?: TaskCategoryType;
  riskLevel?: TaskRiskLevelType;
  difficulty?: TaskDifficultyType;
  status?: TaskStatusType;
  ownerAgent?: string;
  humanOwner?: string;
  acceptanceCriteria?: string[];
}

export interface TaskTransitionDTO {
  id: string;
  projectId: string;
  taskId: string;
  fromStatus: TaskStatusType | null;
  toStatus: TaskStatusType;
  action: TaskTransitionActionType;
  actorType: string;
  actorId: string | null;
  rationale: string | null;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface TaskLifecycleStateDTO {
  taskId: string;
  projectId: string;
  currentStatus: TaskStatusType;
  allowedActions: TaskTransitionActionType[];
  blockedActions: TaskTransitionActionType[];
  lastTransitionAt: string | null;
  warnings: string[];
}

export interface TransitionRequestDTO {
  taskId: string;
  action: TaskTransitionActionType;
  targetStatus?: TaskStatusType;
  actorType?: string;
  actorId?: string;
  rationale?: string;
  metadata?: Record<string, any>;
}

// ContextItem DTOs
export interface ContextItemDTO {
  id: string;
  projectId: string;
  sourceType: ContextSourceType;
  sourceUri: string;
  checksum: string;
  version: string;
  contentHash: string;
  tokenCount: number;
  confidence: number;
  freshnessStatus: FreshnessStatusType;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export interface CreateContextItemDTO {
  id?: string;
  projectId: string;
  sourceType: ContextSourceType;
  sourceUri: string;
  checksum: string;
  version: string;
  contentHash: string;
  tokenCount: number;
  confidence?: number;
  freshnessStatus?: FreshnessStatusType;
  metadataJson?: Record<string, unknown>;
}
export interface UpdateContextItemDTO {
  sourceType?: ContextSourceType;
  sourceUri?: string;
  checksum?: string;
  version?: string;
  contentHash?: string;
  tokenCount?: number;
  confidence?: number;
  freshnessStatus?: FreshnessStatusType;
  metadataJson?: Record<string, unknown>;
}

// ContextChunk DTOs
export interface ContextChunkDTO {
  id: string;
  contextItemId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embeddingId: string | null;
}
export interface CreateContextChunkDTO {
  id?: string;
  contextItemId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embeddingId?: string;
}

// GraphNode DTOs
export interface GraphNodeDTO {
  id: string; // FilePath / URI
  projectId: string;
  label: string;
  type: GraphNodeType;
  status: GraphNodeStatusType;
  contextItemId?: string | null;
  taskId?: string | null;
  nodeIdentifier?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
export interface CreateGraphNodeDTO {
  id?: string;
  projectId: string;
  label: string;
  type: GraphNodeType;
  status?: GraphNodeStatusType;
  contextItemId?: string | null;
  taskId?: string | null;
  nodeIdentifier?: string;
  metadata?: Record<string, any>;
}

// GraphEdge DTOs
export interface GraphEdgeDTO {
  id: string;
  projectId: string;
  source: string;
  target: string;
  label: GraphEdgeLabelType;
  weight: number;
  relationship?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}
export interface CreateGraphEdgeDTO {
  id?: string;
  projectId: string;
  source: string;
  target: string;
  label: GraphEdgeLabelType;
  weight?: number;
  relationship?: string;
  metadata?: Record<string, any>;
}

// Artifact DTOs
export interface ArtifactDTO {
  id: string;
  projectId: string;
  taskId: string | null;
  name: string;
  type: string;
  contentRef: string;
  createdAt: string;
  updatedAt: string;
}
export interface CreateArtifactDTO {
  id?: string;
  projectId: string;
  taskId?: string;
  name: string;
  type: string;
  contentRef: string;
}

// DebugLog DTOs (events mapping)
export interface DebugLogDTO {
  id: string;
  taskId: string;
  sessionId: string;
  eventType: "log" | "warn" | "error" | "network" | "query";
  severity: "info" | "warning" | "critical";
  traceId: string;
  probeTag: string | null;
  payloadRedacted: string;
  createdAt: string;
}
export interface CreateDebugLogDTO {
  id?: string;
  taskId: string;
  sessionId: string;
  eventType: "log" | "warn" | "error" | "network" | "query";
  severity: "info" | "warning" | "critical";
  traceId: string;
  probeTag?: string;
  payloadRedacted: string;
}

// Connection DTOs
export interface ConnectionDTO {
  id: string;
  projectId: string;
  toolName: string;
  healthStatus: ConnectionHealthType;
  accessMode: ConnectionAccessMode;
  lastSyncAt: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export interface CreateConnectionDTO {
  id?: string;
  projectId: string;
  toolName: string;
  healthStatus?: ConnectionHealthType;
  accessMode?: ConnectionAccessMode;
  lastSyncAt?: string;
  metadataJson?: Record<string, unknown>;
}

// AuditLog DTOs
export interface AuditLogDTO {
  id: string;
  projectId: string;
  actor: string;
  featureId: AuditFeatureIdType;
  action: AuditActionType;
  status: AuditLogStatusType;
  metadata: Record<string, unknown>;
  rationale: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  createdAt: string;
}
export interface CreateAuditLogDTO {
  id?: string;
  projectId: string;
  actor: string;
  featureId: AuditFeatureIdType;
  action: AuditActionType;
  status: AuditLogStatusType;
  metadata?: Record<string, unknown>;
  rationale?: string;
  resourceId?: string;
  ipAddress?: string;
}

// AgentMemory DTOs
export interface AgentMemoryDTO {
  id: string;
  projectId: string;
  taskId: string;
  agentRunId: string | null;
  status: string;
  whatAgentDid: Array<{
    action_type: string;
    description: string;
    related_files?: string[];
    related_feature_ids?: string[];
    timestamp?: string;
    confidence?: number;
  }>;
  whyAgentDidIt: Array<{
    rationale_type: string;
    description: string;
    source?: string;
  }>;
  whatChanged: {
    files_changed?: string[];
    database_changes?: string[];
    api_changes?: string[];
    ui_changes?: string[];
    test_changes?: string[];
    security_changes?: string[];
    audit_logging_changes?: string[];
  };
  whatFailed: Array<{
    failure_type: string;
    message: string;
    affected_area: string;
    resolved: boolean;
    resolution?: string;
  }>;
  whatRemains: Array<{
    feature_id: string;
    status: "blocked" | "partial" | "pending";
    description: string;
    risks?: string[];
  }>;
  nextRecommendedAction: string;
  confidenceScore: number;
  sourceRefs: string[];
  metadataJson: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentMemoryDTO {
  id?: string;
  projectId: string;
  taskId: string;
  agentRunId?: string | null;
  status: string;
  whatAgentDid?: Array<{
    action_type: string;
    description: string;
    related_files?: string[];
    related_feature_ids?: string[];
    timestamp?: string;
    confidence?: number;
  }>;
  whyAgentDidIt?: Array<{
    rationale_type: string;
    description: string;
    source?: string;
  }>;
  whatChanged?: {
    files_changed?: string[];
    database_changes?: string[];
    api_changes?: string[];
    ui_changes?: string[];
    test_changes?: string[];
    security_changes?: string[];
    audit_logging_changes?: string[];
  };
  whatFailed?: Array<{
    failure_type: string;
    message: string;
    affected_area: string;
    resolved: boolean;
    resolution?: string;
  }>;
  whatRemains?: Array<{
    feature_id: string;
    status: "blocked" | "partial" | "pending";
    description: string;
    risks?: string[];
  }>;
  nextRecommendedAction?: string;
  confidenceScore?: number;
  sourceRefs?: string[];
  metadataJson?: Record<string, any>;
}

export interface UpdateAgentMemoryDTO {
  status?: string;
  whatAgentDid?: Array<{
    action_type: string;
    description: string;
    related_files?: string[];
    related_feature_ids?: string[];
    timestamp?: string;
    confidence?: number;
  }>;
  whyAgentDidIt?: Array<{
    rationale_type: string;
    description: string;
    source?: string;
  }>;
  whatChanged?: {
    files_changed?: string[];
    database_changes?: string[];
    api_changes?: string[];
    ui_changes?: string[];
    test_changes?: string[];
    security_changes?: string[];
    audit_logging_changes?: string[];
  };
  whatFailed?: Array<{
    failure_type: string;
    message: string;
    affected_area: string;
    resolved: boolean;
    resolution?: string;
  }>;
  whatRemains?: Array<{
    feature_id: string;
    status: "blocked" | "partial" | "pending";
    description: string;
    risks?: string[];
  }>;
  nextRecommendedAction?: string;
  confidenceScore?: number;
  sourceRefs?: string[];
  metadataJson?: Record<string, any>;
}

export interface CreateResumeStateDTO {
  projectId: string;
  taskId: string;
  agentMemoryId?: string | null;
  contextPackId?: string | null;
  changeSimulationId?: string | null;
  status: string;
  pausedReason?: string | null;
  taskState?: {
    taskId?: string;
    projectId?: string;
    featureIdsInProgress?: string[];
    currentStep?: string;
    completedSteps?: string[];
    pendingSteps?: string[];
    blockedSteps?: string[];
    knownRisks?: string[];
    validationStatus?: string;
    relatedMemoryRef?: string | null;
    relatedContextPackRef?: string | null;
    relatedSimulationRef?: string | null;
  };
  repoDiffSnapshot?: {
    source: "metadata_only" | "git_diff";
    files?: Array<{
      path: string;
      change_summary?: string;
      added_lines?: number;
      removed_lines?: number;
      checksum?: string;
    }>;
    redacted_diffs?: string[];
    checksum_metadata?: string;
  };
  currentPhase?: string | null;
  failedStep?: {
    failed_command?: string;
    failed_endpoint?: string;
    failed_validation?: string;
    failed_migration?: string;
    failed_test?: string;
    failed_boundary_check?: string;
    message?: string;
    resolved: boolean;
    resolution?: string;
  } | null;
  nextAction?: string | null;
  affectedFiles?: Array<{
    path: string;
    reason: string;
    risk?: string;
    confidence?: number;
    boundary_status?: string;
  }>;
  validationState?: Record<string, any>;
  resumePayload?: Record<string, any>;
  confidenceScore?: number;
  metadata?: Record<string, any>;
}

export interface UpdateResumeStateDTO {
  status?: string;
  pausedReason?: string | null;
  taskState?: {
    taskId?: string;
    projectId?: string;
    featureIdsInProgress?: string[];
    currentStep?: string;
    completedSteps?: string[];
    pendingSteps?: string[];
    blockedSteps?: string[];
    knownRisks?: string[];
    validationStatus?: string;
    relatedMemoryRef?: string | null;
    relatedContextPackRef?: string | null;
    relatedSimulationRef?: string | null;
  };
  repoDiffSnapshot?: {
    source: "metadata_only" | "git_diff";
    files?: Array<{
      path: string;
      change_summary?: string;
      added_lines?: number;
      removed_lines?: number;
      checksum?: string;
    }>;
    redacted_diffs?: string[];
    checksum_metadata?: string;
  };
  currentPhase?: string | null;
  failedStep?: {
    failed_command?: string;
    failed_endpoint?: string;
    failed_validation?: string;
    failed_migration?: string;
    failed_test?: string;
    failed_boundary_check?: string;
    message?: string;
    resolved: boolean;
    resolution?: string;
  } | null;
  nextAction?: string | null;
  affectedFiles?: Array<{
    path: string;
    reason: string;
    risk?: string;
    confidence?: number;
    boundary_status?: string;
  }>;
  validationState?: Record<string, any>;
  resumePayload?: Record<string, any>;
  confidenceScore?: number;
  metadata?: Record<string, any>;
  agentMemoryId?: string | null;
  contextPackId?: string | null;
  changeSimulationId?: string | null;
}

export type ResumeScheduleType = "one_hour" | "three_hours" | "one_day" | "custom";
export type ResumeScheduleStatus = "scheduled" | "ready" | "requeued" | "cancelled" | "expired" | "failed";

export interface ResumeSchedule {
  id: string;
  projectId: string;
  taskId: string;
  resumeStateId: string | null;
  scheduleType: ResumeScheduleType;
  delayMinutes: number;
  resumeAt: string;
  status: ResumeScheduleStatus;
  queueStatus: string;
  attempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResumeScheduleDTO {
  schedule_type: ResumeScheduleType;
  delay_minutes?: number;
  reason?: string;
  metadata?: Record<string, any>;
  replace_existing?: boolean;
}

export interface UpdateResumeScheduleDTO {
  status?: ResumeScheduleStatus;
  queueStatus?: string;
  attempts?: number;
  delay_minutes?: number;
  resume_at?: string;
  metadata?: Record<string, any>;
}

export type AgentSessionProvider = "claude_code" | "codex" | "generic_agent";
export type AgentSessionStatus = "active" | "paused" | "recoverable" | "expired" | "failed" | "archived";

export interface AgentSession {
  id: string;
  projectId: string;
  taskId: string;
  agentMemoryId: string | null;
  resumeStateId: string | null;
  provider: AgentSessionProvider;
  externalSessionId: string;
  sessionLabel: string | null;
  status: AgentSessionStatus;
  lastKnownStep: string | null;
  lastSeenAt: string | null;
  recoveryPayload: Record<string, any>;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentSessionDTO {
  provider: AgentSessionProvider;
  external_session_id: string;
  session_label?: string;
  status?: AgentSessionStatus;
  agent_memory_id?: string;
  resume_state_id?: string;
  last_known_step?: string;
  recovery_payload?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface UpdateAgentSessionDTO {
  status?: AgentSessionStatus;
  session_label?: string;
  last_known_step?: string;
  recovery_payload?: Record<string, any>;
  metadata?: Record<string, any>;
}

// ==========================================
// 15. Timeline DTOs (Phase 16)
// ==========================================

export type TimelineSourceType =
  | "event_store"
  | "audit_log"
  | "agent_memory"
  | "resume_state"
  | "resume_schedule"
  | "agent_session"
  | "agent_handoff"
  | "task";

export interface TimelineEventDTO {
  id: string;
  project_id: string;
  task_id: string;
  source_type: TimelineSourceType;
  source_id: string;
  event_type: string;
  title: string;
  summary: string;
  status: string;
  timestamp: string;
  feature_id: string | null;
  confidence: number | null;
  source_completeness: string;
  warnings: string[];
  metadata: Record<string, any>;
}

export interface TimelineDecision {
  id: string;
  timestamp: string;
  source: string;
  title: string;
  decision: string;
}

export interface TimelineFailedAttempt {
  id: string;
  timestamp: string;
  failure_type: string;
  message: string;
  resolved: boolean;
  resolution?: string;
  affected_files?: string[];
}

export interface TimelineRecoveryAttempt {
  id: string;
  timestamp: string;
  recovery_type: string;
  readiness_status: string;
  warnings: string[];
  next_action?: string;
}

export interface TimelineSummaryDTO {
  project_id: string;
  task_id: string;
  first_known_action: string | null;
  latest_known_action: string | null;
  major_decisions: TimelineDecision[];
  failed_attempts: TimelineFailedAttempt[];
  recovery_attempts: TimelineRecoveryAttempt[];
  final_or_current_state: string;
  remaining_work: string | null;
  next_recommended_action: string | null;
  source_completeness: string;
  warnings: string[];
}

// ==========================================
// 16. Debug MVP DTOs (Phase 17)
// ==========================================

export interface DebugLogEntryDTO {
  id: string;
  project_id: string;
  task_id: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR";
  message: string;
  source: string;
  timestamp: string;
  marker_task_id: string | null;
  redacted: boolean;
  metadata?: Record<string, any>;
}

export interface DebugLogQueryDTO {
  level?: "DEBUG" | "INFO" | "WARN" | "ERROR" | null;
  search?: string | null;
  limit?: number | null;
  offset?: number | null;
  since?: string | null;
}

export interface DebugDiagnosisDTO {
  project_id: string;
  task_id: string;
  root_cause: string;
  impact_analysis: string;
  remedial_strategy: string;
  confidence: number; // 0.0 to 1.0 or 0 to 100? Let's use 0 to 100 or standard. 0.0 to 1.0 works as floating.
  evidence_refs: string[];
  affected_files: string[];
  warnings: string[];
  generated_at: string;
}

export interface DebugStatusDTO {
  project_id: string;
  buffer_size: number;
  max_buffer_size: number;
  levels_count: Record<string, number>;
  last_log_at: string | null;
  redaction_enabled: boolean;
  healthy: boolean;
}

// ==========================================
// 17. RepoAdapter MVP DTOs (Phase 18)
// ==========================================

export interface RepoSourceDTO {
  id: string;
  project_id: string;
  adapter_kind: "local_filesystem" | "readonly_github_stub" | "virtual_memory_stub";
  root_path: string;
  display_name: string;
  metadata_json: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface RepoAccessLogDTO {
  id: string;
  project_id: string;
  task_id: string | null;
  adapter_kind: string;
  operation: string;
  path_redacted: string;
  result_status: string;
  warnings_json: string[];
  created_at: string;
}

export interface RepoFileRef {
  project_id: string;
  repo_id: string | null;
  path: string;
  normalized_path: string;
  file_type: "file" | "directory" | "symlink" | "unknown";
  hash: string | null;
  size_bytes: number | null;
  last_modified: string | null;
  source_type: string;
}

export interface RepoAdapterResult<T = any> {
  ok: boolean;
  data: T | null;
  warnings: string[];
  errors: string[];
  redacted: boolean;
}

// ==========================================
// 19. Local DB-backed Job Queue & Index Job Types
// ==========================================

export type IndexJobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type IndexJobType = "repo_scan" | "file_delta_scan" | "context_reindex" | "graph_sync_prepare";
export type IndexJobPriority = "low" | "medium" | "high";

export interface IndexJobDTO {
  id: string;
  projectId: string;
  taskId: string | null;
  jobType: IndexJobType;
  status: IndexJobStatus;
  priority: IndexJobPriority;
  adapterKind: string;
  rootPathRedacted: string | null;
  requestedPaths: string[] | null;
  metadataJson: Record<string, any>;
  attempts: number;
  maxAttempts: number;
  lockedAt: string | null;
  lockedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  errorRedacted: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIndexJobDTO {
  taskId?: string | null;
  jobType: IndexJobType;
  priority?: IndexJobPriority;
  adapterKind?: string;
  rootPathRedacted?: string | null;
  requestedPaths?: string[] | null;
  metadataJson?: Record<string, any>;
  maxAttempts?: number;
}

// ==========================================
// 20. Incremental Indexing Pipeline Types (Phase 20)
// ==========================================

export type ChangeKind = "created" | "modified" | "deleted" | "renamed" | "unknown";

export interface IncrementalIndexEventDTO {
  id: string;
  project_id: string;
  task_id: string | null;
  event_type: string;
  path: string;
  normalized_path: string;
  hash_before: string | null;
  hash_after: string | null;
  change_kind: ChangeKind;
  adapter_kind: string;
  index_job_id?: string | null;
  detected_at: string;
  warnings: string[];
  metadata: Record<string, any>;
}

export interface IncrementalIndexStatusDTO {
  project_id: string;
  enabled: boolean;
  watched_roots: string[];
  excluded_patterns: string[];
  debounce_ms: number;
  pending_events: number;
  last_event_at: string | null;
  last_job_id: string | null;
  healthy: boolean;
  warnings: string[];
}

export interface CreateIncrementalIndexEventDTO {
  project_id: string;
  task_id?: string | null;
  path: string;
  change_kind: ChangeKind;
  metadata?: Record<string, any> | null;
}

// ==========================================
// 21. Retrieval Ranking & Search Server Types (Phase 22)
// ==========================================

export type RankingStrategy = "keyword_bm25_mvp" | "graph_weighted_mvp" | "hybrid_local_mvp";
export type SearchServerKind = "local_sql" | "local_memory_stub" | "external_stub_only";

export interface RetrievalQueryDTO {
  project_id: string;
  task_id?: string | null;
  query: string;
  source_types?: string[] | null;
  limit?: number | null;
  budget_tokens?: number | null;
  include_graph_weights?: boolean | null;
  include_recent_activity?: boolean | null;
  metadata?: Record<string, any> | null;
}

export interface RetrievalCandidateDTO {
  id: string;
  project_id: string;
  source_type: string;
  source_id: string;
  path?: string | null;
  title?: string | null;
  excerpt?: string | null;
  token_estimate?: number | null;
  base_score: number;
  keyword_score: number;
  semantic_score?: number | null;
  graph_score?: number | null;
  recency_score?: number | null;
  final_score: number;
  reason_codes: string[];
  warnings: string[];
  metadata: Record<string, any>;
}

export interface RetrievalRankingResultDTO {
  project_id: string;
  task_id?: string | null;
  query: string;
  candidates: RetrievalCandidateDTO[];
  selected: RetrievalCandidateDTO[];
  total_candidates: number;
  ranking_strategy: RankingStrategy;
  budget_tokens: number;
  estimated_tokens: number;
  warnings: string[];
  generated_at: string;
}

// ==========================================
// 22. Quality Gate Orchestrator Types
// ==========================================

export enum QualityGateRunStatus {
  PENDING = "pending",
  RUNNING = "running",
  PASSED = "passed",
  FAILED = "failed",
  WARNING = "warning",
  CANCELLED = "cancelled",
  ERROR = "error",
}

export enum QualityGateCommandType {
  LINT = "lint",
  TYPECHECK = "typecheck",
  BUILD = "build",
  TEST = "test",
  SECRET_SCAN = "secret_scan",
  DEBUG_TAGS = "debug_tags",
  DB_STATUS = "db_status",
}

export interface QualityGateRunDTO {
  id: string;
  project_id: string;
  task_id: string | null;
  feature_id: string | null;
  status: QualityGateRunStatus | string;
  run_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  summary_output: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreateQualityGateRunDTO {
  project_id: string;
  task_id?: string | null;
  feature_id?: string | null;
  run_by?: string | null;
  metadata?: Record<string, any> | null;
}

export interface QualityGateCommandResultDTO {
  id: string;
  run_id: string;
  project_id: string;
  task_id: string | null;
  command_type: QualityGateCommandType | string;
  status: string;
  exit_code: number | null;
  output_summary: string | null;
  raw_output_redacted: string | null;
  duration_ms: number | null;
  executed_at: string;
  metadata: Record<string, any>;
}

export interface IngestQualityGateCommandDTO {
  command_type: QualityGateCommandType | string;
  status: string;
  exit_code?: number | null;
  stdout?: string | null;
  stderr?: string | null;
  output_summary?: string | null;
  duration_ms?: number | null;
  metadata?: Record<string, any> | null;
}

// ==========================================
// 23. Evidence Store MVP Types
// ==========================================

export enum EvidenceType {
  AUDIT_LOG = "audit_log",
  QUALITY_GATE = "quality_gate",
  TASK_TRANSITION = "task_transition",
  FILE_READ = "file_read",
  FILE_CHANGE = "file_change",
  VALIDATION_RESULT = "validation_result",
  ARTIFACT = "artifact",
  MANUAL_NOTE = "manual_note",
}

export enum EvidenceStatus {
  PENDING = "pending",
  VERIFIED = "verified",
  CORRUPTED = "corrupted",
  FAILED = "failed",
}

export interface EvidenceRecordDTO {
  id: string;
  project_id: string;
  task_id: string | null;
  feature_id: string | null;
  evidence_type: EvidenceType | string;
  status: EvidenceStatus | string;
  actor_type: string;
  actor_id: string | null;
  audit_log_id: string | null;
  quality_gate_run_id: string | null;
  quality_gate_command_result_id: string | null;
  artifact_id: string | null;
  source_table: string | null;
  source_id: string | null;
  payload_json: Record<string, any>;
  content_hash: string;
  hash_algorithm: string;
  payload_size_bytes: number;
  created_at: string;
  verified_at: string | null;
  verification_meta_json: Record<string, any> | null;
}

export interface CreateEvidenceRecordDTO {
  project_id: string;
  task_id?: string | null;
  feature_id?: string | null;
  evidence_type: EvidenceType | string;
  actor_type: string;
  actor_id?: string | null;
  audit_log_id?: string | null;
  quality_gate_run_id?: string | null;
  quality_gate_command_result_id?: string | null;
  artifact_id?: string | null;
  source_table?: string | null;
  source_id?: string | null;
  payload_json: Record<string, any>;
  metadata?: Record<string, any> | null;
}

export interface VerifyEvidenceDTO {
  evidence_id?: string;
  evidence_ids?: string[];
  evidence_type?: EvidenceType | string;
  task_id?: string;
  feature_id?: string;
}

export interface EvidenceVerificationResultDTO {
  evidence_id: string;
  status: EvidenceStatus | string;
  expected_hash: string;
  actual_hash: string;
  matched: boolean;
  verified_at: string;
  warnings: string[];
  verification_meta_json: Record<string, any> | null;
}

// ==========================================
// 24. Event Store MVP Types
// ==========================================

export enum EventRecordStatus {
  COMMITTED = "committed",
  REJECTED = "rejected",
}

export enum EventType {
  TASK_STATUS_TRANSITIONED = "task_status_transitioned",
  QUALITY_GATE_RUN_RECORDED = "quality_gate_run_recorded",
  EVIDENCE_RECORD_STORED = "evidence_record_stored",
  AGENT_HANDOFF_INITIATED = "agent_handoff_initiated",
  SESSION_ARCHIVED = "session_archived",
  REPO_FILE_READ = "repo_file_read",
  REPO_FILE_CHANGED = "repo_file_changed",
  INDEX_JOB_TRANSITIONED = "index_job_transitioned",
  INCREMENTAL_INDEX_EVENT_RECORDED = "incremental_index_event_recorded",
  RETRIEVAL_RANKING_COMPLETED = "retrieval_ranking_completed",
  DEBUG_LOG_RECORDED = "debug_log_recorded",
  MANUAL_EVENT = "manual_event",
}

export interface EventRecordDTO {
  id: string;
  project_id: string;
  task_id: string | null;
  feature_id: string | null;
  event_type: EventType | string;
  status: EventRecordStatus | string;
  source_table: string | null;
  source_id: string | null;
  actor_type: string;
  actor_id: string | null;
  idempotency_key: string | null;
  audit_log_id: string | null;
  evidence_record_id: string | null;
  payload_json: Record<string, any>;
  payload_hash: string;
  hash_algorithm: string;
  payload_size_bytes: number;
  created_at: string;
  metadata_json: Record<string, any>;
}

export interface AppendEventDTO {
  project_id: string;
  task_id?: string | null;
  feature_id?: string | null;
  event_type: EventType | string;
  source_table?: string | null;
  source_id?: string | null;
  actor_type: string;
  actor_id?: string | null;
  idempotency_key?: string | null;
  audit_log_id?: string | null;
  evidence_record_id?: string | null;
  payload_json: Record<string, any>;
  metadata?: Record<string, any> | null;
}

export interface EventQueryDTO {
  task_id?: string;
  feature_id?: string;
  event_type?: string;
  source_table?: string;
  source_id?: string;
  idempotency_key?: string;
  limit?: number;
  cursor?: string;
}

// ==========================================
// 25. Context Object Store Types
// ==========================================

export enum ContextObjectType {
  SOURCE_FILE = "source_file",
  SUMMARY = "summary",
  PACK = "pack",
  CUSTOM_REFERENCE = "custom_reference",
  DERIVED_CONTEXT = "derived_context",
  RETRIEVAL_CANDIDATE = "retrieval_candidate",
  GRAPH_CONTEXT = "graph_context",
}

export enum ContextObjectStatus {
  ACTIVE = "active",
  STALE = "stale",
  QUARANTINED = "quarantined",
}

export interface ContextObjectDTO {
  id: string;
  project_id: string;
  task_id: string | null;
  feature_id: string | null;
  object_type: ContextObjectType | string;
  status: ContextObjectStatus | string;
  source_table: string | null;
  source_id: string | null;
  content_hash: string;
  hash_algorithm: string;
  payload_size_bytes: number;
  payload_text: string | null;
  payload_json: Record<string, any> | null;
  metadata_json: Record<string, any>;
  created_at: string;
  updated_at: string;
  stale_at: string | null;
  quarantined_at: string | null;
}

export interface CreateContextObjectDTO {
  project_id: string;
  task_id?: string | null;
  feature_id?: string | null;
  object_type: ContextObjectType | string;
  source_table?: string | null;
  source_id?: string | null;
  payload_text?: string | null;
  payload_json?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
}

export interface ContextObjectRefDTO {
  id: string;
  project_id: string;
  task_id: string | null;
  context_object_id: string;
  ref_type: string;
  ref_table: string | null;
  ref_id: string | null;
  created_at: string;
  metadata_json: Record<string, any>;
}

// ==========================================
// 26. Worker Runtime DTOs & Types (Phase 28)
// ==========================================

export type WorkerStatusType = "active" | "paused" | "stale" | "stopped";

export interface WorkerRuntimeDTO {
  id: string;
  worker_id: string;
  project_id: string;
  status: WorkerStatusType | string;
  process_label: string | null;
  started_at: string;
  heartbeat_at: string;
  stopped_at: string | null;
  max_concurrency: number;
  active_job_count: number;
  metadata_json: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface RegisterWorkerDTO {
  worker_id: string;
  project_id: string;
  max_concurrency?: number;
  process_label?: string | null;
  metadata_json?: Record<string, any> | null;
}

export interface WorkerTelemetryDTO {
  project_id: string;
  workers: WorkerRuntimeDTO[];
  queue_counts: Record<string, number>;
  stale_workers: number;
  active_processing_jobs: number;
  retryable_jobs: number;
  updated_at: string;
}

export interface WorkerRuntimeLogDTO {
  id: string;
  worker_id: string;
  project_id: string;
  task_id: string | null;
  index_job_id: string | null;
  action: string;
  status: string;
  message_redacted: string | null;
  metadata_json: Record<string, any>;
  created_at: string;
}

export enum FileLockStatus {
  ACTIVE = "active",
  RELEASED = "released",
  EXPIRED = "expired",
  BLOCKED = "blocked"
}

export enum FileLockMode {
  READ = "read",
  WRITE = "write"
}

export interface FileLockDTO {
  id: string;
  project_id: string;
  task_id: string | null;
  worker_id: string | null;
  index_job_id: string | null;
  lock_mode: FileLockMode;
  lock_status: FileLockStatus;
  normalized_path: string;
  path_hash: string;
  lock_owner_type: string;
  lock_owner_id: string;
  acquired_at: string;
  refreshed_at: string;
  expires_at: string;
  released_at: string | null;
  release_reason: string | null;
  metadata_json: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AcquireFileLockDTO {
  project_id: string;
  task_id?: string | null;
  worker_id?: string | null;
  index_job_id?: string | null;
  path: string;
  lock_mode: FileLockMode;
  lock_owner_type: string;
  lock_owner_id: string;
  ttl_seconds?: number;
  metadata_json?: Record<string, any> | null;
}

export interface FileLockTelemetryDTO {
  project_id: string;
  active_locks: number;
  read_locks: number;
  write_locks: number;
  blocked_attempts: number;
  expired_locks: number;
  stale_released: number;
  updated_at: string;
}

// ==========================================
// Phase 30: Centralized Permission Kernel Types & DTOs
// ==========================================

export type PermissionDecision = "allow" | "deny";
export type PermissionEffect = "allow" | "deny";
export type PermissionSubjectType = "user" | "worker" | "task" | "system";
export type PermissionResourceType =
  | "project"
  | "task"
  | "file"
  | "file_lock"
  | "context_object"
  | "event_record"
  | "evidence_record"
  | "quality_gate"
  | "index_job"
  | "worker"
  | "database_table"
  | "artifact"
  | "artifact_version";

export type PermissionAction =
  | "read"
  | "write"
  | "create"
  | "update"
  | "delete"
  | "lock"
  | "unlock"
  | "claim"
  | "transition"
  | "administer";

export type PermissionSensitivity = "public" | "internal" | "restricted" | "secret";

export interface PermissionSubjectDTO {
  subject_type: PermissionSubjectType;
  subject_id: string;
  project_id?: string;
  task_id?: string;
  worker_id?: string;
  roles?: string[];
  attributes?: Record<string, any>;
}

export interface PermissionResourceDTO {
  resource_type: PermissionResourceType;
  resource_id: string;
  project_id?: string;
  task_id?: string;
  worker_id?: string;
  owner_id?: string;
  normalized_path?: string;
  sensitivity?: PermissionSensitivity;
  attributes?: Record<string, any>;
}

export interface PermissionContextDTO {
  request_id?: string;
  source?: string;
  is_system?: boolean;
  admin_override?: boolean;
  rationale?: string;
  metadata_json?: Record<string, any>;
}

export interface PermissionEvaluationRequestDTO {
  subject: PermissionSubjectDTO;
  resource: PermissionResourceDTO;
  action: PermissionAction;
  context?: PermissionContextDTO;
}

export interface PermissionRuleDTO {
  id: string;
  effect: PermissionEffect;
  subject_type: string;
  resource_type: string;
  action: string;
  conditions: Record<string, any>;
  description?: string;
  enabled: boolean;
}

export interface PermissionEvaluationResultDTO {
  decision: PermissionDecision;
  allowed: boolean;
  denied_reason?: string;
  matched_rules: PermissionRuleDTO[];
  failed_conditions?: string[];
  sanitized_context?: Record<string, any>;
  evaluated_at: string;
}

// ==========================================
// Phase 31: Artifact Versioning / CAS MVP Types & DTOs
// ==========================================

export type ArtifactType =
  | "code_diff"
  | "context_pack"
  | "quality_report"
  | "architecture_report"
  | "evidence_bundle"
  | "manual_note"
  | "generic_file";

export type ArtifactStatus = "active" | "superseded" | "archived" | "quarantined";

export type ArtifactContentKind = "text" | "json" | "markdown" | "diff" | "binary_stub";

export interface CASBlobDTO {
  id: string;
  project_id: string;
  cas_hash: string;
  hash_algorithm: string;
  content_kind: ArtifactContentKind | string;
  mime_type: string | null;
  size_bytes: number;
  payload_text: string | null;
  payload_json: Record<string, any> | null;
  storage_status: string;
  created_at: string;
  metadata_json: Record<string, any>;
}

export interface ArtifactVersionDTO {
  id: string;
  project_id: string;
  task_id: string | null;
  feature_id: string | null;
  artifact_type: ArtifactType | string;
  artifact_status: ArtifactStatus | string;
  logical_path: string;
  version_number: number;
  cas_blob_id: string;
  cas_hash: string;
  parent_version_id: string | null;
  created_by_type: string;
  created_by_id: string | null;
  size_bytes: number;
  title: string | null;
  description: string | null;
  metadata_json: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreateArtifactVersionDTO {
  project_id: string;
  task_id?: string | null;
  feature_id?: string | null;
  artifact_type: ArtifactType | string;
  logical_path: string;
  content_kind: ArtifactContentKind | string;
  mime_type?: string | null;
  payload_text?: string | null;
  payload_json?: Record<string, any> | null;
  title?: string | null;
  description?: string | null;
  created_by_type: string;
  created_by_id?: string | null;
  parent_version_id?: string | null;
  metadata_json?: Record<string, any> | null;
}

export interface ArtifactVersionQueryDTO {
  task_id?: string | null;
  feature_id?: string | null;
  artifact_type?: ArtifactType | string | null;
  artifact_status?: ArtifactStatus | string | null;
  logical_path?: string | null;
  include_payload?: boolean | null;
}

export interface ArtifactVersionResultDTO {
  artifact: ArtifactVersionDTO;
  blob?: CASBlobDTO | null;
  deduplicated: boolean;
  previous_version_id: string | null;
  next_version_number?: number;
}

export interface ArtifactCASStatsDTO {
  project_id: string;
  total_versions: number;
  unique_blobs: number;
  deduplicated_references: number;
  total_logical_bytes: number;
  total_cas_bytes: number;
  savings_bytes: number;
  updated_at: string;
}

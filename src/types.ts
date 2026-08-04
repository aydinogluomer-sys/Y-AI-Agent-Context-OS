export interface PrimaryFile {
  path: string;
  reason: string;
  role: string;
}

export interface RelatedFile {
  path: string;
  reason: string;
  role: string;
}

export interface ContextOSData {
  confidenceScore: number;
  totalScannedDocs: number;
  tokensInvolved: number;
  compressedPackTokens: number;
  primaryFiles: PrimaryFile[];
  relatedFiles: RelatedFile[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: "code" | "doc" | "test" | "decision";
  status: "active" | "related";
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TaskSummary {
  title: string;
  category: "Coding" | "Review" | "UI/UX" | "Research" | "Data/SQL";
  riskLevel: "Low" | "Medium" | "High";
  difficulty: "Easy" | "Medium" | "Hard";
}

export interface AgentEvent {
  time: string;
  agent: string;
  event: string;
  outcome: string;
}

export interface AgentHandoffData {
  activeAgent: string;
  stateSummary: string;
  nextPrimaryAction: string;
  timeline: AgentEvent[];
}

export interface DecisionMemory {
  decision: string;
  source: string;
  enforceable: boolean;
}

export interface UnsupportedClaim {
  claim: string;
  reason: string;
}

export interface DecisionEnforcementData {
  applicableDecisions: DecisionMemory[];
  unsupportedClaims: UnsupportedClaim[];
}

export interface CapabilityAdvisorData {
  recommendedSkills: string[];
  recommendedCommands: string[];
  recommendedMCPs: string[];
}

export interface ModelComparison {
  model: string;
  strength: string;
  weakness: string;
  hallucinationRisk: "Low" | "Medium" | "High";
  costEstimate: number;
}

export interface ModelCouncilData {
  recommendedModel: string;
  comparisons: ModelComparison[];
}

export interface ConnectTool {
  tool: string;
  reason: string;
  score: number;
}

export interface ConnectAdvisorData {
  missingContextAlert: string;
  recommendedConnects: ConnectTool[];
}

export interface CostGovernanceData {
  tokenBudget: number;
  estimatedCost: string;
}

export interface IndexJobUI {
  id: string;
  projectId: string;
  taskId: string | null;
  jobType: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled" | string;
  priority: "high" | "medium" | "low" | string;
  adapterKind: string;
  rootPathRedacted: string | null;
  requestedPaths: string[] | null;
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

export interface SimulationResult {
  isFallback?: boolean;
  fallbackReason?: string;
  taskSummary: TaskSummary;
  contextOS: ContextOSData;
  knowledgeGraph: KnowledgeGraphData;
  agentHandoff: AgentHandoffData;
  decisionEnforcement: DecisionEnforcementData;
  capabilityAdvisor: CapabilityAdvisorData;
  modelCouncil: ModelCouncilData;
  connectAdvisor: ConnectAdvisorData;
  costGovernance: CostGovernanceData;
}

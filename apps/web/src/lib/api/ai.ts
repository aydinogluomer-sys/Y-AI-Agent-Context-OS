/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AiTaskSimulationRequest {
  taskName: string;
  repoUrl?: string;
  customInputs?: string;
}

export interface AiFileReference {
  path: string;
  reason: string;
  role: string;
}

export interface AiGraphNode {
  id: string;
  label: string;
  type: "code" | "doc" | "test" | "decision" | string;
  status: "active" | "related" | string;
}

export interface AiGraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface AiTimelineItem {
  time: string;
  agent: string;
  event: string;
  outcome: string;
}

export interface AiModelComparison {
  model: string;
  strength: string;
  weakness: string;
  hallucinationRisk: "Low" | "Medium" | "High" | string;
  costEstimate: number;
}

export interface AiSimulationResponse {
  isFallback?: boolean;
  fallbackReason?: string;
  taskSummary: {
    title: string;
    category: "Coding" | "Review" | "UI/UX" | "Research" | "Data/SQL" | string;
    riskLevel: "Low" | "Medium" | "High" | string;
    difficulty: "Easy" | "Medium" | "Hard" | string;
  };
  contextOS: {
    confidenceScore: number;
    totalScannedDocs: number;
    tokensInvolved: number;
    compressedPackTokens: number;
    primaryFiles: AiFileReference[];
    relatedFiles: AiFileReference[];
  };
  knowledgeGraph: {
    nodes: AiGraphNode[];
    edges: AiGraphEdge[];
  };
  agentHandoff: {
    activeAgent: string;
    stateSummary: string;
    nextPrimaryAction: string;
    timeline: AiTimelineItem[];
  };
  decisionEnforcement: {
    applicableDecisions: Array<{
      decision: string;
      source: string;
      enforceable: boolean;
    }>;
    unsupportedClaims: Array<{
      claim: string;
      reason: string;
    }>;
  };
  capabilityAdvisor: {
    recommendedSkills: string[];
    recommendedCommands: string[];
    recommendedMCPs: string[];
  };
  modelCouncil: {
    recommendedModel: string;
    comparisons: AiModelComparison[];
  };
  connectAdvisor: {
    missingContextAlert: string;
    recommendedConnects: Array<{
      tool: string;
      reason: string;
      score: number;
    }>;
  };
  costGovernance: {
    tokenBudget: number;
    estimatedCost: string;
  };
}

export async function simulateTask(
  request: AiTaskSimulationRequest
): Promise<AiSimulationResponse> {
  const response = await fetch("/api/simulate-task", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`AI simulation request failed with HTTP ${response.status}`);
  }

  return response.json();
}

export function createLocalAiSimulation(
  taskName: string,
  repoUrl = "local workspace",
  reason = "Local deterministic preview generated while provider or network runtime is unavailable."
): AiSimulationResponse {
  const normalizedTask = taskName.trim() || "Improve the AI mission control cockpit";
  const lowerTask = normalizedTask.toLowerCase();
  const isUi = /(ui|ux|dashboard|screen|cockpit|tasar|arayüz|görsel)/i.test(lowerTask);
  const isDb = /(db|database|postgres|sql|supabase|schema)/i.test(lowerTask);
  const isAuth = /(auth|login|permission|token|jwt|security|güven)/i.test(lowerTask);

  const category = isUi ? "UI/UX" : isDb ? "Data/SQL" : isAuth ? "Coding" : "Review";
  const riskLevel = isAuth || isDb ? "High" : isUi ? "Medium" : "Low";

  const primaryFiles: AiFileReference[] = isUi
    ? [
        {
          path: "apps/web/src/components/AIMissionControlPanel.tsx",
          reason: "Primary AI task composer, agent run state, context pack, and trust rail.",
          role: "AI Cockpit Surface",
        },
        {
          path: "apps/web/src/modules/command/ProjectDashboard.tsx",
          reason: "Command tab boundary that now hosts the AI-first experience.",
          role: "Route Panel",
        },
        {
          path: "apps/web/src/app/AppShell.tsx",
          reason: "Global cockpit frame, navigation, local mode disclosure, and operator telemetry.",
          role: "Application Shell",
        },
      ]
    : [
        {
          path: "apps/api/src/index.ts",
          reason: "Runtime API surface used by the AI simulation and kernel services.",
          role: "API Gateway",
        },
        {
          path: "packages/context/src/search-server.ts",
          reason: "Canonical context retrieval path for grounded agent context.",
          role: "Context Retrieval",
        },
        {
          path: "packages/providers/src/index.ts",
          reason: "Provider registry and model capability contract.",
          role: "Model Provider Contract",
        },
      ];

  const relatedFiles: AiFileReference[] = [
    {
      path: "awwwards-loop/implementation.md",
      reason: "Phase plan, acceptance gates, and visual quality rubric alignment.",
      role: "Execution Plan",
    },
    {
      path: "implementation.md",
      reason: "Kernel remediation execution record and production DB blocker state.",
      role: "Kernel History",
    },
    {
      path: "docs/kernel-debt-register.md",
      reason: "Current debt registry and deferred production gate context.",
      role: "Trust Context",
    },
  ];

  return {
    isFallback: true,
    fallbackReason: reason,
    taskSummary: {
      title: normalizedTask,
      category,
      riskLevel,
      difficulty: isDb || isAuth ? "Hard" : "Medium",
    },
    contextOS: {
      confidenceScore: isUi ? 92.4 : 88.7,
      totalScannedDocs: 23,
      tokensInvolved: 12450000,
      compressedPackTokens: 48200,
      primaryFiles,
      relatedFiles,
    },
    knowledgeGraph: {
      nodes: [
        ...primaryFiles.map((file) => ({
          id: file.path,
          label: file.path.split("/").pop() || file.path,
          type: "code",
          status: "active",
        })),
        ...relatedFiles.map((file) => ({
          id: file.path,
          label: file.path.split("/").pop() || file.path,
          type: file.path.endsWith(".md") ? "decision" : "doc",
          status: "related",
        })),
      ],
      edges: [
        {
          source: primaryFiles[0]?.path || "task",
          target: relatedFiles[0]?.path || "plan",
          label: "planned_by",
        },
        {
          source: primaryFiles[1]?.path || "panel",
          target: primaryFiles[0]?.path || "surface",
          label: "renders",
        },
        {
          source: relatedFiles[1]?.path || "implementation.md",
          target: relatedFiles[2]?.path || "debt-register",
          label: "documents_blocker",
        },
      ],
    },
    agentHandoff: {
      activeAgent: "Y Mission Analyst",
      stateSummary: `Prepared a grounded local analysis for "${normalizedTask}" against ${repoUrl}.`,
      nextPrimaryAction: isUi
        ? "Apply cockpit UI changes, run typecheck/build, then inspect responsive states."
        : "Compile a bounded implementation plan, verify impacted runtime contracts, and run deterministic gates.",
      timeline: [
        {
          time: "T+00",
          agent: "Operator",
          event: "Task submitted",
          outcome: "Mission intent captured and normalized.",
        },
        {
          time: "T+07",
          agent: "Context OS",
          event: "Context pack compiled",
          outcome: "Primary files, related docs, and trust notes selected.",
        },
        {
          time: "T+14",
          agent: "Model Council",
          event: "Model fit evaluated",
          outcome: "Provider-backed path preferred; deterministic fallback is active locally.",
        },
        {
          time: "T+21",
          agent: "Trust Kernel",
          event: "Release gate checked",
          outcome: "Local preview allowed; production DB remains blocked until DNS is fixed.",
        },
      ],
    },
    decisionEnforcement: {
      applicableDecisions: [
        {
          decision: "Do not present mock DB results as production validation.",
          source: "implementation.md",
          enforceable: true,
        },
        {
          decision: "Every main phase must pass its gate before the next phase starts.",
          source: "awwwards-loop/implementation.md",
          enforceable: true,
        },
      ],
      unsupportedClaims: [
        {
          claim: "Production database release is ready.",
          reason: "The configured Supabase hostname still fails DNS resolution in strict DB tests.",
        },
      ],
    },
    capabilityAdvisor: {
      recommendedSkills: ["repo-impact-analysis", "ui-quality-loop", "trust-gate-verification"],
      recommendedCommands: ["npm.cmd run typecheck", "npm.cmd run build", "npm.cmd run test:ai-cockpit"],
      recommendedMCPs: ["local-browser-inspection", "github-context", "postgres-status"],
    },
    modelCouncil: {
      recommendedModel: "Provider-backed Gemini when configured; deterministic local analyst otherwise",
      comparisons: [
        {
          model: "Gemini provider registry",
          strength: "Fast structured JSON generation when GEMINI_API_KEY is configured.",
          weakness: "Depends on external provider configuration.",
          hallucinationRisk: "Medium",
          costEstimate: 0.02,
        },
        {
          model: "Deterministic local analyst",
          strength: "Stable, offline-safe, and honest about mock/runtime limits.",
          weakness: "Cannot perform live semantic model reasoning.",
          hallucinationRisk: "Low",
          costEstimate: 0,
        },
      ],
    },
    connectAdvisor: {
      missingContextAlert:
        "Production PostgreSQL is unreachable; local preview uses volatile mock data until the Supabase host is corrected.",
      recommendedConnects: [
        {
          tool: "Supabase PostgreSQL",
          reason: "Required to close the strict production DB validation gate.",
          score: 99,
        },
        {
          tool: "Browser QA",
          reason: "Required to prove the redesigned cockpit behaves across desktop, tablet, and mobile.",
          score: 92,
        },
      ],
    },
    costGovernance: {
      tokenBudget: 150000,
      estimatedCost: "Local fallback: $0.00; provider mode depends on configured model.",
    },
  };
}

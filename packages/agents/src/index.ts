import { AgentSession, ResumeState } from "@y/shared";

// AGENTS module - Orchestration and Continuity Handoff
export function executeContinuationCheck(session: AgentSession, state: ResumeState): boolean {
  // If task status contains failed markers, we preserve context
  if (session.status === "failed" || state.gitDiffSnapshot.length > 0) {
    return true; // Auto-continuity preserved
  }
  return false;
}

export { PersistentAgentMemoryService } from "./memory.js";
export { ResumeEngineService } from "./resume.js";
export { AgentSessionRecoveryService, parseTaskStateMarkdown } from "./recovery.js";
export { MultiAgentHandoffService } from "./handoff.js";
export { AgentTimelineService } from "./timeline.js";
export { AgentDebugService } from "./debug.js";

# 01 — Workspace Map

## Monorepo Structure

- `apps/web`: Vite 6 + React 19 Frontend Engineering Cockpit (`AppShell.tsx`, `AIMissionControlPanel.tsx`, `ModuleSimulationPanel.tsx`, `ArtifactCenterPanel.tsx`, `ImpactAnalysisPanel.tsx`, `WorkerRuntimeDashboard.tsx`, `PermissionKernelPanel.tsx`, `EvidenceStorePanel.tsx`, `EventJournalPanel.tsx`, `FileLockingPanel.tsx`, `QualityGateReportPanel.tsx`, `IndexJobOrchestratorPanel.tsx`).
- `apps/api`: Express Backend API (`PermissionKernelService.ts`, `TaskLifecycleService.ts`, `ArtifactCASService.ts`, `EvidenceStoreService.ts`, `EventStoreService.ts`, `WorkerRuntimeService.ts`, `FileLockingService.ts`, `QualityGateService.ts`, `ContextObjectStoreService.ts`).
- `packages/shared`: Core DTOs and type contracts (`@y/shared`).
- `packages/core`: Low-level RepoAdapters, AST Parsers, Indexers (`@y/core`).
- `packages/context`: Context OS compactor, chunking, 50K pack builder (`@y/context`).
- `packages/graph`: KnowledgeGraphService, AST dependency mapping (`@y/graph`).
- `packages/agents`: Multi-agent handoff, timeline, session checkpoints (`@y/agents`).
- `packages/security`: ABAC policy evaluation, credential redactor (`@y/security`).
- `packages/providers`: ModelProvider abstraction for Gemini, Claude, DeepSeek (`@y/providers`).
- `workers`: Index Worker entry points (`workers/index-worker.ts`).
- `scripts`: Validation scripts for Stage 27 to 35 and deterministic test runner.

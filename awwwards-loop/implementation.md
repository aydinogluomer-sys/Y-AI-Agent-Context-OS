# AI Cockpit Product Experience Remediation Plan

Date: 2026-07-07  
Route: `/`  
Owner intent: turn the already-remediated kernel into a product surface that unmistakably feels like an AI engineering agent cockpit.

## 0. Operating rule

The user has granted approval to plan and implement without further confirmation.

Execution must be sequential:

1. Finish the current main phase.
2. Run that phase's named gate commands.
3. If the gate is green, continue to the next phase.
4. If the gate is red, fix within the same phase until green.
5. Production DB validation remains a separate external blocker because the configured Supabase host currently fails DNS resolution; local product work must operate **strictly on the frontend layer** with rich mock simulations.

## 1. Problem statement

The kernel is now much healthier than the product experience. The user-visible app still fails the "this is an AI" test for five concrete reasons:

1. The work so far mostly fixed backend/kernel contracts: auth, DB startup, event store, timeline, evidence, test gates, docs.
2. Local preview runs in mock/offline mode because the configured production PostgreSQL/Supabase host is unreachable.
3. The UI does not start with a clear task/prompt composer, agent run, thinking/progress lane, context pack, model selection, or evidence trail.
4. Provider/runtime infrastructure exists, but the user does not see a surfaced AI flow that calls `/api/simulate-task`, handles fallback, and turns the result into an intelligible agent handoff.
5. Navigation and panels read like system internals instead of an AI product cockpit.

## 2. Product thesis

The first screen after loading `/` should answer three questions immediately:

- "What can I ask this AI to do?"
- "What context will it use and why can I trust it?"
- "What is happening right now as the agent processes the task?"

The redesigned cockpit must feel like a command surface for an AI engineering operator, not a raw infrastructure dashboard.

## 3. Quality rubric

Hard gates:

- Build/tests must pass.
- Required viewport must not have horizontal overflow or clipped primary content.
- Functional text must be legible.
- Primary controls must have accessible names and keyboard focus.
- Primary task simulation interaction must work with API success or local fallback.
- Reduced-motion users must not receive attention-seeking animation.
- Browser evidence must be captured before claiming final visual pass.

Score target:

- Total: at least 90/100.
- Composition: at least 14/20.
- Typography: at least 11/15.
- Visual system: at least 11/15.
- Interaction and motion: at least 11/15.
- Responsive behavior: at least 14/20.
- Accessibility: at least 7/10.
- Originality and brand fit: at least 4/5.

## 4. Baseline evidence

Observed local facts:

- `npm run build` is green.
- `npm run typecheck` is green after the local server changes.
- `/` can be served locally on `127.0.0.1:5173` using:

```cmd
set ALLOW_OFFLINE_API_BOOT=true&& set SERVE_STATIC=true&& set HOST=127.0.0.1&& set PORT=5173&& set DISABLE_HMR=true&& npm.cmd run dev
```

- Port `3000` is rejected by the host OS with `EACCES`; local preview should prefer `5173`.
- Vite development middleware triggers an esbuild optimizer failure under this Windows/sandbox path, even though the production build succeeds. Local UI preview should use `SERVE_STATIC=true` and built assets.
- `apps/web/src/App.tsx` still gates the shell behind a cinematic landing page.
- `apps/web/src/modules/command/ProjectDashboard.tsx` is telemetry-heavy and not a task-first AI surface.
- `/api/simulate-task` exists in `server.ts` and can return a structured simulated AI analysis, with provider-backed generation when a real provider is configured and fallback when it is not.
- Production DB gate is still blocked by `ENOTFOUND db.vnnfcwpywdxepdwwuqoo.supabase.co`.

## 5. Allowed files

Primary implementation:

- `apps/web/src/App.tsx`
- `apps/web/src/app/AppShell.tsx`
- `apps/web/src/app/navigation.ts`
- `apps/web/src/modules/command/ProjectDashboard.tsx`
- `apps/web/src/components/AIMissionControlPanel.tsx`
- `apps/web/src/lib/api/ai.ts`
- `apps/web/src/styles/awwwards-effects.css`
- `src/index.css`

Validation and docs:

- `scripts/validate-ai-cockpit.ts`
- `package.json`
- `awwwards-loop/implementation.md`
- `awwwards-loop/iterations/iteration-01.md`
- `awwwards-loop/reports/iteration-01.md`
- `implementation.md` only if a short cross-reference is needed.

Server support, only if required:

- `server.ts`

## 6. Forbidden / constrained files

- Do not change `.env` or print secrets.
- Do not weaken auth, permission, evidence, startup, or DB fail-loud behavior.
- Do not mark production release as unblocked until `npm run test:db` passes with zero critical skips.
- Do not remove existing implemented kernel panels; the cockpit may reframe navigation but must preserve access.
- Do not use destructive git or filesystem operations.

## 7. Test command catalog

Core gates:

```cmd
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:phase6
npm.cmd run test:phase8
npm.cmd run test:deterministic
```

New cockpit gate to add:

```cmd
npm.cmd run test:ai-cockpit
```

Local preview gate:

```cmd
set ALLOW_OFFLINE_API_BOOT=true&& set SERVE_STATIC=true&& set HOST=127.0.0.1&& set PORT=5173&& set DISABLE_HMR=true&& npm.cmd run dev
```

HTTP smoke after local preview:

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:5173/ -UseBasicParsing -TimeoutSec 10
```

## 8. Viewport matrix

Final visual QA must inspect:

| Viewport | Size | Purpose |
| --- | ---: | --- |
| Desktop | 1366 × 900 | Main operator cockpit with side navigation, composer, right trust rail, and timeline visible. |
| Tablet | 768 × 1024 | Stacked information hierarchy without cramped task composer or clipped cards. |
| Mobile | 375 × 812 | Single-column task-first AI experience; navigation and side rails must not force horizontal scroll. |

## 9. Main phases and sub-phases

### Phase 0 — Plan, baseline, and quality loop setup

Goal: create the authoritative implementation plan and baseline iteration artifacts before product changes.

Sub-phases:

0.1. Confirm target route `/` and current entry behavior.  
0.2. Record current blocker distinction: local mock preview is allowed; production DB release remains blocked.  
0.3. Create or refresh `awwwards-loop/implementation.md`.  
0.4. Create initial iteration/report placeholders.  
0.5. Run baseline typecheck.

Acceptance:

- The plan exists and names every later phase.
- Baseline command is green.
- No runtime behavior changes are hidden inside Phase 0 except plan artifacts.

Gate:

```cmd
npm.cmd run typecheck
```

### Phase 1 — AI-first entry and information architecture

Goal: the first shell view must read as an AI command center, not a generic telemetry dashboard.

Sub-phases:

1.1. Make the cockpit shell the default route experience.  
1.2. Preserve the cinematic landing as code, but stop requiring the user to pass an audio/visual boot screen before reaching the useful product.  
1.3. Rename the primary command tab copy from "Dashboard Cockpit" to an AI-first label such as "AI Mission Control".  
1.4. Adjust AppShell header microcopy from generic "Multi-Agent Command Shell" toward "AI Engineering Agent Cockpit".  
1.5. Add a clear local mode indicator: "Local simulation / mock DB" when DB is not connected.  
1.6. Keep all existing functional tabs reachable.

Acceptance:

- The default app state lands in the cockpit.
- The first active tab label communicates AI task execution.
- Offline/mock state is visible and honest.
- Existing navigation implementation count remains valid.

Gate:

```cmd
npm.cmd run typecheck
```

### Phase 2 — Task / Prompt Composer (Client-Only Simulation)

Goal: create the unmistakable "ask the AI to do work" surface running entirely on the client side.

Sub-phases:

2.1. Add `apps/web/src/lib/api/ai.ts` with typed `simulateTask()` client.  
2.2. Implement high-fidelity local deterministic mock database inside the React context to drive all AI analysis steps (plan generation, timeline events, model scores, and context files listings) with zero API failures.  
2.3. Add `apps/web/src/components/AIMissionControlPanel.tsx`.  
2.4. Include a large task textarea with accessible label, placeholder, examples, repo reference, and custom constraints.  
2.5. Add primary "Run AI analysis" action and secondary "Load example" actions.  
2.6. Show loading state that says what is happening without exposing fake chain-of-thought.  
2.7. Replace `ProjectDashboard` content with the AI Mission Control component while preserving `ProjectDashboard` as the tab boundary.

Acceptance:

- A user immediately sees where to type a task.
- The primary interaction can run via API or fallback.
- Empty task is blocked with clear validation text.
- Loading state is legible and not misleading.

Gate:

```cmd
npm.cmd run typecheck
```

### Phase 3 — Agent Run Narrative, Context Pack, and Timeline

Goal: transform simulation output into an AI operating story: request → context → model → risk → plan → handoff.

Sub-phases:

3.1. Render task summary: title, category, risk, difficulty.  
3.2. Render context pack: confidence, scanned docs, raw tokens, compressed tokens, primary files, related files.  
3.3. Render agent handoff: active agent, state summary, next primary action.  
3.4. Render timeline lane from simulation result with timestamp, event, agent, and outcome.  
3.5. Render knowledge graph preview with nodes/edges as readable cards or compact graph-like rows.  
3.6. Render decision enforcement: enforceable decisions and unsupported claims.  
3.7. Add visible "what this AI used" copy so the output feels grounded rather than decorative.

Acceptance:

- Running the composer creates a filled cockpit, not just a JSON dump.
- Result sections remain useful in mock/offline mode.
- Empty states explain how to begin.
- No section claims production DB certainty in local mock mode.

Gate:

```cmd
npm.cmd run typecheck
```

### Phase 4 — Model Council, Provider Visibility, and Trust Rails

Goal: expose the provider/runtime layer as product value without hiding current limitations.

Sub-phases:

4.1. Render model council recommendations from simulation result.  
4.2. Show model comparisons with strength, weakness, hallucination risk, and cost estimate.  
4.3. Add provider-state microcopy: "Provider-backed if configured; deterministic fallback otherwise."  
4.4. Add trust rail cards: DB mode, evidence state, permission kernel, quality gate.  
4.5. Make the production DB blocker visible but non-catastrophic for local demo.  
4.6. Add "why this can be trusted" bullets tied to evidence, redaction, permission checks, and context pack boundaries.

Acceptance:

- Users can see model choice and fallback behavior.
- Mock/offline DB is plainly labeled.
- Trust indicators do not overclaim cryptographic signatures or production readiness.

Gate:

```cmd
npm.cmd run typecheck
```

### Phase 5 — Responsive layout, accessibility, and motion restraint

Goal: the cockpit must work as a polished product surface across desktop, tablet, and mobile.

Sub-phases:

5.1. Desktop: 12-column cockpit grid with composer, context/result center, right trust rail.  
5.2. Tablet: collapse to two-column or stacked sections with no clipped controls.  
5.3. Mobile: single-column order: composer → current run → context → timeline → trust.  
5.4. Add focus-visible states for textarea, chips, run button, and navigation.  
5.5. Add accessible names and semantic headings.  
5.6. Respect `prefers-reduced-motion`; disable attention-seeking glow/ambient animation where necessary.  
5.7. Guard long paths and file names with wrapping/truncation that does not cause horizontal overflow.

Acceptance:

- Typecheck and build pass.
- Primary content remains readable and keyboard reachable.
- No obvious horizontal overflow in component structure.

Gate:

```cmd
npm.cmd run typecheck
npm.cmd run build
```

### Phase 6 — Navigation copy and supporting panel coherence

Goal: reduce the "random internal dashboards" feeling by reframing navigation around the AI work loop.

Sub-phases:

6.1. Reorder navigation categories around the user journey: Command, Context, Trust, Assets.  
6.2. Rename labels to product-facing terms while keeping tab IDs stable.  
6.3. Ensure every visible tab still has a real component.  
6.4. Make AppShell header/subheader match the AI cockpit positioning.  
6.5. Keep expert kernel panels available but no longer make them the first impression.

Acceptance:

- The first impression is an AI workflow, not isolated infrastructure.

Gate:

```cmd
npm.cmd run typecheck
```

### Phase 7 — Documentation, validation script, and deterministic gates

Goal: codify the product experience so future changes cannot silently regress it.

Sub-phases:

7.1. Add `scripts/validate-ai-cockpit.ts`.  
7.2. Add `test:ai-cockpit` script to `package.json`.  
7.3. Validate presence of AI cockpit component, typed API client, composer labels, simulation fallback copy, model council, context pack, timeline, trust rail, and default cockpit launch.  
7.4. Update iteration artifact with implemented file list and acceptance evidence.  
7.5. Run deterministic non-DB gates.

Acceptance:

- New validation command passes.
- Existing suite remains green.
- Docs accurately state local mock mode vs production DB blocker.

Gate:

```cmd
npm.cmd run typecheck
```

### Phase 8 — Local preview and browser QA report

Goal: inspect the rendered page and score it against the visual rubric.

Sub-phases:

8.1. Build production assets.  
8.2. Start local static preview on `127.0.0.1:5173` with offline API boot.  
8.3. Verify HTTP 200.  
8.4. Inspect desktop 1366 × 900.  
8.5. Inspect tablet 768 × 1024.  
8.6. Inspect mobile 375 × 812.  
8.7. Check primary composer interaction.  
8.8. Check focus and reduced-motion behavior as far as available tooling allows.  
8.9. Write `awwwards-loop/reports/iteration-01.md` with scores, evidence, defects, and PASS/ITERATE/BLOCKED result.  
8.10. If score is below 90, convert failed criteria into the next iteration before final handoff.

Acceptance:

- Build passes.
- Local preview responds 200.
- Browser evidence exists or a concrete browser-tool blocker is recorded.
- Final report follows the rubric.

Gate:

```cmd
npm.cmd run build
```

## 10. Expected implementation shape

New user-visible cockpit regions:

1. **Hero/operator band**:
   - "Y is ready. What are we changing?"
   - Local mode badge.
   - AI provider/fallback badge.

2. **Task composer**:
   - Task textarea.
   - Repository/reference input.
   - Constraint chips.
   - Example task chips.
   - Primary run button.

3. **Agent run state**:
   - Loading stages.
   - Task summary.
   - Next action.
   - Run confidence and risk.

4. **Context pack**:
   - Primary files.
   - Related files.
   - Token compression.
   - Scanned docs.

5. **Model council**:
   - Recommended model.
   - Alternatives with strengths/weaknesses.
   - Cost and hallucination risk.

6. **Trust rail**:
   - Permission kernel.
   - Evidence store.
   - Quality gates.
   - DB mode and production blocker.

7. **Timeline**:
   - User task received.
   - Context compiled.
   - Risk evaluated.
   - Handoff prepared.

## 11. Final handoff criteria

The work is complete only when:

- All implementation phases are complete.
- Each phase gate was run after that phase.
- `npm.cmd run typecheck` passes.
- `npm.cmd run build` passes.
- Existing phase/navigation/docs gates pass where touched.
- Browser QA report exists or records an explicit tooling blocker.
- Production DB blocker remains honestly documented if still unresolved.

## 12. Frontend-Only Architecture & Interactive Composables

To ensure maximum stability and zero-dependencies during development under Postgres infrastructure constraints, the AI Cockpit operates fully on client-side state engines:

### Glassmorphism & Cyber-HUD Design Tokens

CSS properties defined in [awwwards-effects.css](file:///c:/Users/Trade%20Bilisim/Y-%E2%80%94-AI-Agent-Context-OS/apps/web/src/styles/awwwards-effects.css) must implement a cohesive translucent Sci-Fi HUD:

- **Backgrounds**: `rgba(12, 15, 18, 0.75)` combined with `backdrop-filter: blur(12px) saturate(180%)`.
- **Borders**: Thin `1px solid rgba(255, 255, 255, 0.08)`.
- **Glow Accents**: Sub-surface linear-gradients (`linear-gradient(135deg, rgba(57, 211, 83, 0.15), transparent)`).
- **Typography**: Monospace formatting (`JetBrains Mono` or `Fira Code`) for log files and timeline indexes, and highly legible Sans-Serif font (`Inter`) for headers and descriptions.

### Simulated Agent State Machine

A pure React state container manages the task simulation workflow:

```typescript
type CockpitState = 'idle' | 'analyzing' | 'packing' | 'simulating' | 'success' | 'failed';
```

When a task is submitted, the frontend executes a sequence of timed state updates (e.g., 800ms per stage) to simulate deep reasoning, updating active progress steps visible to the user:

1. **`analyzing`**: Scans prompt symbols, checks ABAC policies.
2. **`packing`**: Gathers relational tables, computes token scores (50K compression).
3. **`simulating`**: Resolves AST nodes, checks code graph constraints, estimates cost.
4. **`success`**: Emits mock task details, model council stats, and timeline events to the dashboard layout.

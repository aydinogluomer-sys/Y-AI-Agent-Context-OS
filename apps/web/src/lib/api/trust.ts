/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- ABAC Permission Policy Matrix ---
export async function fetchPermissionPolicies(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/permission-policies`);
  if (!res.ok) throw new Error("Failed to load permission policies.");
  return res.json();
}

export async function evaluatePermission(projectId: string, payload: any) {
  const res = await fetch(`/api/projects/${projectId}/permissions/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to evaluate permission.");
  }
  return res.json();
}

export async function fetchPermissionEvaluationsLog(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/permissions/evaluations`);
  if (!res.ok) throw new Error("Failed to load permission evaluations history.");
  return res.json();
}

// --- Cryptographic Evidence Store ---
export async function fetchEvidenceRecords(projectId: string, taskId?: string) {
  const url = taskId 
    ? `/api/projects/${projectId}/tasks/${taskId}/evidence` 
    : `/api/projects/${projectId}/evidence`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load evidence: HTTP ${res.status}`);
  return res.json();
}

export async function createEvidenceRecord(projectId: string, taskId: string | undefined, payload: any) {
  const url = taskId
    ? `/api/projects/${projectId}/tasks/${taskId}/evidence`
    : `/api/projects/${projectId}/evidence`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errDetail = await res.json().catch(() => ({}));
    throw new Error(errDetail.error || "Failed to create evidence record.");
  }
  return res.json();
}

export async function verifyEvidenceRecord(projectId: string, id: string) {
  const res = await fetch(`/api/projects/${projectId}/evidence/${id}/verify`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Verification API failed.");
  return res.json();
}

export async function verifyEvidenceBatch(projectId: string, taskId?: string) {
  const query = taskId ? `?task_id=${taskId}` : "";
  const res = await fetch(`/api/projects/${projectId}/evidence/verify${query}`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Batch verification API failed.");
  return res.json();
}

// --- Immutable Global Event Journal ---
export async function fetchEventJournal(projectId: string, filters: Record<string, string>) {
  let url = `/api/projects/${projectId}/events?`;
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      url += `${key}=${encodeURIComponent(value)}&`;
    }
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Event journal fetch failed: HTTP ${res.status}`);
  return res.json();
}

export async function appendEventJournal(projectId: string, payload: any) {
  const res = await fetch(`/api/projects/${projectId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errDetail = await res.json().catch(() => ({}));
    throw new Error(errDetail.error || "Failed to append event record.");
  }
  return res.json();
}

// --- Automated Security Code Redaction Watchdog ---
export async function executeRedactionCheck(text: string) {
  const res = await fetch("/api/security/redact-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: text })
  });
  if (!res.ok) throw new Error("Redaction scan execution failed.");
  return res.json();
}

// --- Quality Gate Orchestrator telemetry runs ---
export async function fetchQualityRuns(projectId: string, taskId?: string) {
  const url = taskId 
    ? `/api/projects/${projectId}/tasks/${taskId}/quality-gates/runs` 
    : `/api/projects/${projectId}/quality-gates/runs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load runs: HTTP ${res.status}`);
  return res.json();
}

export async function fetchQualityRunDetails(projectId: string, taskId: string, runId: string) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/quality-gates/runs/${runId}`);
  if (!res.ok) throw new Error(`Failed to inspect run details: HTTP ${res.status}`);
  return res.json();
}

export async function createQualityRun(projectId: string, taskId: string, featureId: string, runBy: string, metadata: any) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/quality-gates/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feature_id: featureId, run_by: runBy, metadata })
  });
  if (!res.ok) {
    const errDetail = await res.json().catch(() => ({}));
    throw new Error(errDetail.error?.message || errDetail.error || "Failed to create quality run.");
  }
  return res.json();
}

export async function startQualityRun(projectId: string, taskId: string, runId: string) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/quality-gates/runs/${runId}/start`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Could not start run.");
  return res.json();
}

export async function cancelQualityRun(projectId: string, taskId: string, runId: string) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/quality-gates/runs/${runId}/cancel`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Could not cancel run.");
  return res.json();
}

export async function ingestQualityCommand(projectId: string, taskId: string, runId: string, payload: any) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/quality-gates/runs/${runId}/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errDetail = await res.json().catch(() => ({}));
    throw new Error(errDetail.error?.message || errDetail.error || "Could not ingest command result.");
  }
  return res.json();
}

export async function completeQualityRun(projectId: string, taskId: string, runId: string) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/quality-gates/runs/${runId}/complete`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to complete quality gate run.");
  return res.json();
}

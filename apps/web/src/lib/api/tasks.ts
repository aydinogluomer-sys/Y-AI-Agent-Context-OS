/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task } from "@y/shared";

export async function fetchTasks(projectId: string): Promise<Task[]> {
  const res = await fetch(`/api/projects/${projectId}/tasks`);
  if (!res.ok) throw new Error(`Failed to load tasks: ${res.status}`);
  return res.json();
}

export async function searchTasks(projectId: string, query: string, status: string, limit: number): Promise<Task[]> {
  const queryParams = new URLSearchParams();
  if (query) queryParams.append("query", query);
  if (status) queryParams.append("status", status);
  queryParams.append("limit", String(limit));

  const res = await fetch(`/api/projects/${projectId}/tasks/search?${queryParams.toString()}`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to search tasks.");
  }
  const data = await res.json();
  return data.items || [];
}

export async function createTask(projectId: string, payload: any): Promise<Task> {
  const res = await fetch(`/api/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to create task.");
  }
  return res.json();
}

// --- FSM Lifecycle Transitions ---
export async function fetchTaskLifecycleInfo(projectId: string, taskId: string) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/lifecycle`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load task FSM coordinates.");
  }
  return res.json();
}

export async function fetchTaskStatusHistory(projectId: string, taskId: string) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/status-history`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load transition history.");
  }
  return res.json();
}

export async function transitionTask(projectId: string, taskId: string, payload: any) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "State transition was rejected by FSM engine.");
  }
  return res.json();
}

// --- Boundary Scope Checks & Locking ---
export async function fetchTaskBoundary(taskId: string) {
  const res = await fetch(`/api/tasks/${taskId}/boundary`);
  if (!res.ok) throw new Error(`Failed to load boundaries. Status: ${res.status}`);
  return res.json();
}

export async function lockTaskBoundary(taskId: string) {
  const res = await fetch(`/api/tasks/${taskId}/boundary/lock`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to lock scope boundaries.");
  return res.json();
}

export async function checkTaskBoundaryFiles(taskId: string, files: string[]) {
  const res = await fetch(`/api/tasks/${taskId}/boundary/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposed_files: files })
  });
  if (!res.ok) throw new Error("Proposed boundary check failed.");
  return res.json();
}

// --- Resume Snapshot States ---
export async function fetchLatestResumeState(taskId: string) {
  const res = await fetch(`/api/tasks/${taskId}/resume-state/latest`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load resume state.");
  return res.json();
}

export async function pauseTask(taskId: string, reason: string) {
  const res = await fetch(`/api/tasks/${taskId}/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pausedReason: reason })
  });
  if (!res.ok) throw new Error("Failed to pause task.");
  return res.json();
}

export async function generateResumePayload(taskId: string) {
  const res = await fetch(`/api/tasks/${taskId}/resume-payload`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to generate resume payload.");
  return res.json();
}

// --- Auto Resume Timed Schedules ---
export async function fetchTaskResumeSchedules(taskId: string) {
  const res = await fetch(`/api/tasks/${taskId}/resume-schedules`);
  if (!res.ok) throw new Error("Failed to load task schedules.");
  return res.json();
}

export async function createTaskResumeSchedule(taskId: string, payload: any) {
  const res = await fetch(`/api/tasks/${taskId}/resume-schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errObj = await res.json().catch(() => ({}));
    throw new Error(errObj.error?.message || "Failed to create resume schedule.");
  }
  return res.json();
}

export async function cancelTaskResumeSchedule(scheduleId: string) {
  const res = await fetch(`/api/resume-schedules/${scheduleId}`, {
    method: "DELETE"
  });
  if (!res.ok) throw new Error("Failed to cancel schedule.");
  return res.json();
}

export async function fetchProjectResumeQueue(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/resume-queue`);
  if (!res.ok) throw new Error("Failed to fetch project resume queue.");
  return res.json();
}

export async function sweepRequeueReady(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/resume-queue/requeue-ready`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to process requeue ready sweep.");
  return res.json();
}

// --- Multi-Agent Handoffs ---
export async function fetchTaskHandoffs(taskId: string) {
  const res = await fetch(`/api/tasks/${taskId}/handoffs`);
  if (!res.ok) throw new Error("Failed to load handoffs.");
  return res.json();
}

export async function createTaskHandoff(taskId: string, payload: any) {
  const res = await fetch(`/api/tasks/${taskId}/handoffs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errObj = await res.json().catch(() => ({}));
    throw new Error(errObj.error?.message || "Failed to create handoff.");
  }
  return res.json();
}

export async function validateHandoff(handoffId: string) {
  const res = await fetch(`/api/handoffs/${handoffId}/validate`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to validate handoff.");
  return res.json();
}

export async function updateHandoffStatus(handoffId: string, nextStatus: string) {
  const res = await fetch(`/api/handoffs/${handoffId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: nextStatus })
  });
  if (!res.ok) throw new Error("Failed to update handoff status.");
  return res.json();
}

// --- Chronological Memory Timeline ---
export async function fetchTaskTimeline(projectId: string, taskId: string, order: string, srcType?: string, status?: string) {
  const srcQuery = srcType ? `&source_type=${srcType}` : "";
  const statQuery = status ? `&status=${status}` : "";
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/timeline?order=${order}${srcQuery}${statQuery}`);
  if (!res.ok) throw new Error("Failed to load timeline events.");
  return res.json();
}

export async function fetchTaskTimelineSummary(projectId: string, taskId: string) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/timeline/summary`);
  if (!res.ok) throw new Error("Failed to load timeline summary statistics.");
  return res.json();
}

export async function rebuildTaskTimeline(projectId: string, taskId: string) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/timeline/rebuild`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Rebuild request returned an error.");
  return res.json();
}

// --- Debug stream logs & Diagnostic Probes ---
export async function fetchTaskDebugLogs(projectId: string, taskId: string, limit = 150, level = "ALL", search = "") {
  const levelParam = level !== "ALL" ? `&level=${level}` : "";
  const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/debug/logs?limit=${limit}${levelParam}${searchParam}`);
  if (!res.ok) throw new Error("Failed to load task debug logs.");
  return res.json();
}

export async function clearTaskDebugLogs(projectId: string, taskId: string) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/debug/clear`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to clear logs.");
  return res.json();
}

export async function runTaskDiagnostics(projectId: string, taskId: string) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/debug/diagnose`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to execute diagnostic checks.");
  return res.json();
}

export async function appendDiagnosticProbeLog(projectId: string, taskId: string, payload: any) {
  const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/debug/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("Failed to append probe log.");
  return res.json();
}

export async function evaluateReadiness(projectId: string, task: Task, humanApproved: boolean) {
  const res = await fetch("/api/tasks/readiness-eval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: { id: projectId }, task, isApprovedByHuman: humanApproved })
  });
  if (!res.ok) throw new Error("Readiness evaluation request denied by guard rails.");
  return res.json();
}

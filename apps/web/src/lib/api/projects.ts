/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from "@y/shared";

export async function fetchHealthStatus() {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Health status check failed: ${res.status}`);
  return res.json();
}

// [P02 / Y-P02-009] fetchConfigInspect KALDIRILDI.
// GET /api/config/inspect silindi: yaniti regex'lenip duz metin DB parolasi
// React state'ine yaziliyordu (P0-12). Operasyonel ozet icin
// /api/v1/admin/health kullanilacak (P18).

// [P02 / Y-P02-009] configureDatabase KALDIRILDI.
// POST /api/db/configure silindi (P0-2): govdeden connection string alip
// duz metin parolayi .env'e yaziyordu. DATABASE_URL artik yalnizca ortam
// degiskeni / secret manager'dan gelir.

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error(`Failed to load projects: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.projects)) return data.projects;
  return [];
}

export async function createProject(name: string, description: string): Promise<Project> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description })
  });
  if (!res.ok) throw new Error(`Failed to create project: ${res.status}`);
  return res.json();
}

export async function fetchTaskMetrics(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/task-metrics`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Failed to load project task metrics.");
  }
  return res.json();
}

export async function fetchTasks(projectId: string): Promise<any[]> {
  const res = await fetch(`/api/projects/${projectId}/tasks`);
  if (!res.ok) throw new Error(`Failed to load tasks for project ${projectId}: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.tasks)) return data.tasks;
  return [];
}

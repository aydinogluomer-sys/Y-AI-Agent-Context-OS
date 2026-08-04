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

export async function fetchConfigInspect() {
  const res = await fetch("/api/config/inspect");
  if (!res.ok) throw new Error(`Config inspect failed: ${res.status}`);
  return res.json();
}

export async function configureDatabase(payload: any) {
  const res = await fetch("/api/db/configure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Failed to configure database dynamic connection.");
  }
  return data;
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error(`Failed to load projects: ${res.status}`);
  return res.json();
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

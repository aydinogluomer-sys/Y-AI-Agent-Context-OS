/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export async function fetchRepoStatus(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/repo/status`);
  if (!res.ok) throw new Error("Failed to load repository adapter configuration state.");
  return res.json();
}

export async function fetchRepoFiles(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/repo/files`);
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.errors?.[0] || "Failed to list repository adapter directories.");
  }
  return data;
}

export async function fetchRepoFileContent(projectId: string, filePath: string) {
  const res = await fetch(`/api/projects/${projectId}/repo/file?path=${encodeURIComponent(filePath)}`);
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.errors?.[0] || "File read or authorization constraint block denied access.");
  }
  return data;
}

export async function configureLocalRepo(projectId: string, rootPath: string, displayName: string) {
  const res = await fetch(`/api/projects/${projectId}/repo/configure-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ root_path: rootPath, display_name: displayName })
  });
  if (!res.ok) throw new Error("Failed to configure repository root path.");
  return res.json();
}

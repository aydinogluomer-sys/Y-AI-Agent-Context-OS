/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export async function fetchKnowledgeGraph(projectId: string, nodeType = "all", relationshipType = "all") {
  const nodeParam = nodeType !== "all" ? `&nodeType=${nodeType}` : "";
  const relParam = relationshipType !== "all" ? `&relationshipType=${relationshipType}` : "";
  const res = await fetch(`/api/projects/${projectId}/graph?${nodeParam}${relParam}`);
  if (!res.ok) throw new Error("Failed to load knowledge graph structure.");
  return res.json();
}

export async function synchronizeGraph(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/graph/sync`, {
    method: "POST"
  });
  if (!res.ok) throw new Error("Failed to synchronize knowledge graph foundation.");
  return res.json();
}

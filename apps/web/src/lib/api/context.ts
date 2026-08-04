/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Obsidian Context Vault ---
export async function fetchContextItems(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/context-items`);
  if (!res.ok) throw new Error(`Failed to load context items: ${res.status}`);
  return res.json();
}

export async function fetchContextItemDetail(projectId: string, itemId: string) {
  const res = await fetch(`/api/projects/${projectId}/context-items/${itemId}`);
  if (!res.ok) throw new Error(`Failed to fetch context item details.`);
  return res.json();
}

export async function createContextItem(projectId: string, pathOrUri: string, content: string, explicitType?: string) {
  const res = await fetch(`/api/projects/${projectId}/context-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path_or_uri: pathOrUri,
      content,
      explicit_source_type: explicitType || undefined
    })
  });
  const result = await res.json();
  if (!res.ok) {
    throw new Error(result.error || "Failed to create context item.");
  }
  return result;
}

export async function deleteContextItem(itemId: string) {
  const res = await fetch(`/api/context-items/${itemId}`, { method: "DELETE" });
  if (!res.ok) {
    const errRes = await res.json().catch(() => ({}));
    throw new Error(errRes.error || "Deletion failed.");
  }
  return res.json();
}

// --- Dynamic Search Server Rankings ---
export async function fetchSearchServerStatus() {
  const res = await fetch("/api/context/search-server/status");
  if (!res.ok) throw new Error(`Search server health status check failed: ${res.status}`);
  return res.json();
}

export async function executeIsolatedRetrieve(payload: any) {
  const res = await fetch("/api/context/isolated-retrieve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Retrieve check failed with status: ${res.status}`);
  }
  return res.json();
}

export async function executeVaultSearch(projectId: string, query: string, sourceType: string) {
  const url = `/api/projects/${projectId}/context-search?query=${encodeURIComponent(query)}&source_type=${sourceType}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Vault search failed: ${res.status}`);
  }
  return res.json();
}

// --- Context Pack Assembler ---
export async function generateContextPack(taskId: string, tokenBudget: number) {
  const res = await fetch(`/api/tasks/${taskId}/context-pack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token_budget: tokenBudget })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to compile Context Pack. Status: ${res.status}`);
  }
  return res.json();
}

export async function fetchContextPacks(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/context-packs`);
  if (!res.ok) throw new Error(`Failed to load context packs: ${res.status}`);
  return res.json();
}

// --- Impact Analysis Engine ---
export async function fetchImpactReports(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/impact/reports`);
  if (!res.ok) throw new Error(`Failed to load impact reports list: ${res.status}`);
  return res.json();
}

export async function fetchImpactReportDetail(projectId: string, reportId: string) {
  const res = await fetch(`/api/projects/${projectId}/impact/reports/${reportId}`);
  if (!res.ok) throw new Error("Could not retrieve specific impact report detail.");
  return res.json();
}

export async function runImpactAnalysis(projectId: string, payload: any) {
  const res = await fetch(`/api/projects/${projectId}/impact/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Impact analysis failed: ${res.status}`);
  }
  return res.json();
}

// --- Index Jobs Queue Orchestration ---
export async function fetchIndexJobs(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/index-jobs`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || "Failed to load index jobs.");
  }
  return res.json();
}

export async function createIndexJob(projectId: string, payload: any) {
  const res = await fetch(`/api/projects/${projectId}/index-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || "Failed to create index job.");
  }
  return res.json();
}

export async function cancelIndexJob(projectId: string, jobId: string) {
  const res = await fetch(`/api/projects/${projectId}/index-jobs/${jobId}/cancel`, {
    method: "POST"
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || "Failed to cancel job.");
  }
  return res.json();
}

export async function retryIndexJob(projectId: string, jobId: string) {
  const res = await fetch(`/api/projects/${projectId}/index-jobs/${jobId}/retry`, {
    method: "POST"
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || "Failed to retry job.");
  }
  return res.json();
}

export async function claimNextIndexJob(projectId: string, workerId: string) {
  const res = await fetch(`/api/projects/${projectId}/index-jobs/claim-next`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || "Failed to claim next index job.");
  }
  return res.json();
}

export async function releaseStaleLocks(projectId: string, staleThresholdMs: number) {
  const res = await fetch(`/api/projects/${projectId}/index-jobs/release-stale-locks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staleThresholdMs })
  });
  if (!res.ok) throw new Error("Failed to release stale locks.");
  return res.json();
}

// --- Incremental WATCH change logs watcher ---
export async function fetchIncrementalStatus(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/incremental-index/status`);
  if (!res.ok) throw new Error("Failed to fetch incremental pipeline status.");
  return res.json();
}

export async function fetchIncrementalEvents(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/incremental-index/events`);
  if (!res.ok) throw new Error("Failed to fetch incremental indexing events.");
  return res.json();
}

export async function registerManualScanPath(projectId: string, pathStr: string) {
  const res = await fetch(`/api/projects/${projectId}/incremental-index/scan-path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: pathStr })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || "Failed to scan targeted file.");
  }
  return res.json();
}

export async function triggerRebuildDelta(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}/incremental-index/rebuild-delta`, {
    method: "POST"
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || "Failed to enqueue rebuild job.");
  }
  return res.json();
}

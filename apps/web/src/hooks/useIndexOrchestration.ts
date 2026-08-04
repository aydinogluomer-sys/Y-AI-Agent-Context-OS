/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import * as apiContext from "../lib/api/context";
import * as apiAdapter from "../lib/api/adapter";

export function useIndexOrchestration(projectId: string) {
  // Index Jobs Queue states
  const [indexJobs, setIndexJobs] = useState<any[]>([]);
  const [indexJobsLoading, setIndexJobsLoading] = useState(false);
  const [indexJobsError, setIndexJobsError] = useState("");
  const [creatingIndexJob, setCreatingIndexJob] = useState(false);
  const [releasingLocksLoading, setReleasingLocksLoading] = useState(false);
  const [claimingNextJob, setClaimingNextJob] = useState(false);
  const [cancellingJobIds, setCancellingJobIds] = useState<Record<string, boolean>>({});
  const [retryingJobIds, setRetryingJobIds] = useState<Record<string, boolean>>({});

  // Watcher Incremental Index states
  const [incrementalStatus, setIncrementalStatus] = useState<any>(null);
  const [incrementalEvents, setIncrementalEvents] = useState<any[]>([]);
  const [incrementalLoading, setIncrementalLoading] = useState(false);
  const [incrementalError, setIncrementalError] = useState<string | null>(null);
  const [scanningPath, setScanningPath] = useState(false);
  const [rebuildingDelta, setRebuildingDelta] = useState(false);

  // Local Directory Repo Adapter states
  const [repoStatus, setRepoStatus] = useState<any | null>(null);
  const [repoFiles, setRepoFiles] = useState<any[]>([]);
  const [repoFilesLoading, setRepoFilesLoading] = useState(false);
  const [repoWarnings, setRepoWarnings] = useState<string[]>([]);
  const [repoErrors, setRepoErrors] = useState<string[]>([]);
  const [selectedRepoFilePath, setSelectedRepoFilePath] = useState<string | null>(null);
  const [selectedRepoFileContent, setSelectedRepoFileContent] = useState<string | null>(null);
  const [selectedRepoFileLoading, setSelectedRepoFileLoading] = useState(false);
  const [selectedRepoFileRedacted, setSelectedRepoFileRedacted] = useState(false);
  const [selectedRepoFileWarnings, setSelectedRepoFileWarnings] = useState<string[]>([]);
  const [selectedRepoFileErrors, setSelectedRepoFileErrors] = useState<string[]>([]);
  const [configuringRepo, setConfiguringRepo] = useState(false);

  // Index jobs dispatchers
  const loadIndexJobs = async () => {
    if (!projectId) return;
    setIndexJobsLoading(true);
    setIndexJobsError("");
    try {
      const data = await apiContext.fetchIndexJobs(projectId);
      setIndexJobs(data || []);
    } catch (err: any) {
      setIndexJobsError(err.message || "Failed to load index jobs queue.");
    } finally {
      setIndexJobsLoading(false);
    }
  };

  const handleCreateIndexJob = async (jobType: string, pathInput: string, priority: string) => {
    if (!projectId) return;
    setCreatingIndexJob(true);
    try {
      await apiContext.createIndexJob(projectId, {
        jobType,
        requestedPaths: pathInput ? [pathInput] : [],
        priority,
        adapterKind: "local_filesystem"
      });
      await loadIndexJobs();
    } catch (err: any) {
      alert(err.message || "Failed to create index job.");
      throw err;
    } finally {
      setCreatingIndexJob(false);
    }
  };

  const handleCancelIndexJob = async (jobId: string) => {
    if (!projectId) return;
    setCancellingJobIds(prev => ({ ...prev, [jobId]: true }));
    try {
      await apiContext.cancelIndexJob(projectId, jobId);
      await loadIndexJobs();
    } catch (err: any) {
      alert(err.message || "Failed to cancel job.");
    } finally {
      setCancellingJobIds(prev => ({ ...prev, [jobId]: false }));
    }
  };

  const handleRetryIndexJob = async (jobId: string) => {
    if (!projectId) return;
    setRetryingJobIds(prev => ({ ...prev, [jobId]: true }));
    try {
      await apiContext.retryIndexJob(projectId, jobId);
      await loadIndexJobs();
    } catch (err: any) {
      alert(err.message || "Failed to retry job.");
    } finally {
      setRetryingJobIds(prev => ({ ...prev, [jobId]: false }));
    }
  };

  const handleClaimNextJob = async () => {
    if (!projectId) return;
    setClaimingNextJob(true);
    try {
      const workerId = `worker_ui_${Math.random().toString(36).substring(2, 7)}`;
      const data = await apiContext.claimNextIndexJob(projectId, workerId);
      if (data) {
        alert(`Successfully claimed Job ID: ${data.id}. Worker started in background.`);
      } else {
        alert("No pending/queued jobs available in queue to claim.");
      }
      await loadIndexJobs();
    } catch (err: any) {
      alert(err.message || "Failed to claim next index job.");
    } finally {
      setClaimingNextJob(false);
    }
  };

  const handleReleaseStaleLocks = async () => {
    if (!projectId) return;
    setReleasingLocksLoading(true);
    try {
      await apiContext.releaseStaleLocks(projectId, 15 * 60 * 1000);
      await loadIndexJobs();
      alert("Stale locks scanned and released successfully!");
    } catch (err: any) {
      alert(err.message || "Failed to sweep locks.");
    } finally {
      setReleasingLocksLoading(false);
    }
  };

  // Watcher Incremental Indexing dispatchers
  const loadIncrementalData = async () => {
    if (!projectId) return;
    setIncrementalLoading(true);
    setIncrementalError(null);
    try {
      const [status, events] = await Promise.all([
        apiContext.fetchIncrementalStatus(projectId),
        apiContext.fetchIncrementalEvents(projectId)
      ]);
      setIncrementalStatus(status);
      setIncrementalEvents(events || []);
    } catch (err: any) {
      setIncrementalError(err.message || "Failed to load incremental index logs.");
    } finally {
      setIncrementalLoading(false);
    }
  };

  const handleScanPath = async (pathStr: string) => {
    if (!projectId || !pathStr.trim()) return;
    setScanningPath(true);
    try {
      await apiContext.registerManualScanPath(projectId, pathStr.trim());
      alert("File change event registered successfully!");
      await Promise.all([loadIncrementalData(), loadIndexJobs()]);
    } catch (err: any) {
      alert(err.message || "Failed to register target scan.");
    } finally {
      setScanningPath(false);
    }
  };

  const handleRebuildDelta = async () => {
    if (!projectId) return;
    if (!confirm("Are you sure you want to trigger a full delta context reindexing?")) return;
    setRebuildingDelta(true);
    try {
      await apiContext.triggerRebuildDelta(projectId);
      alert("Full delta-rebuild context reindex job queued successfully!");
      await Promise.all([loadIncrementalData(), loadIndexJobs()]);
    } catch (err: any) {
      alert(err.message || "Failed to enqueue rebuild job.");
    } finally {
      setRebuildingDelta(false);
    }
  };

  // Local Directory Repo Adapter dispatchers
  const loadRepoStatus = async () => {
    if (!projectId) return;
    try {
      const data = await apiAdapter.fetchRepoStatus(projectId);
      setRepoStatus(data);
    } catch (err) {
      console.warn("Error fetching repo adapter status:", err);
    }
  };

  const loadRepoFiles = async () => {
    if (!projectId) return;
    setRepoFilesLoading(true);
    setRepoErrors([]);
    setRepoWarnings([]);
    try {
      const data = await apiAdapter.fetchRepoFiles(projectId);
      setRepoFiles(data.files || []);
      if (data.warnings?.length) setRepoWarnings(data.warnings);
    } catch (err: any) {
      setRepoErrors([err.message || "Failed to list repository files."]);
    } finally {
      setRepoFilesLoading(false);
    }
  };

  const loadRepoFileContent = async (filePath: string) => {
    if (!projectId || !filePath) return;
    setSelectedRepoFilePath(filePath);
    setSelectedRepoFileLoading(true);
    setSelectedRepoFileContent(null);
    setSelectedRepoFileRedacted(false);
    setSelectedRepoFileWarnings([]);
    setSelectedRepoFileErrors([]);
    try {
      const data = await apiAdapter.fetchRepoFileContent(projectId, filePath);
      setSelectedRepoFileContent(data.content);
      setSelectedRepoFileRedacted(data.redacted || false);
      setSelectedRepoFileWarnings(data.warnings || []);
    } catch (err: any) {
      setSelectedRepoFileErrors([err.message || "Failed to read file."]);
    } finally {
      setSelectedRepoFileLoading(false);
    }
  };

  const handleConfigureRepo = async (rootPath: string, displayName: string) => {
    if (!projectId || !rootPath.trim() || !displayName.trim()) return;
    setConfiguringRepo(true);
    try {
      await apiAdapter.configureLocalRepo(projectId, rootPath, displayName);
      await loadRepoStatus();
      await loadRepoFiles();
    } catch (err) {
      console.warn("Error configuring local repo adapter:", err);
    } finally {
      setConfiguringRepo(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadIndexJobs();
      loadIncrementalData();
      loadRepoStatus();
      loadRepoFiles();
    }
  }, [projectId]);

  return {
    indexJobs,
    indexJobsLoading,
    indexJobsError,
    creatingIndexJob,
    releasingLocksLoading,
    claimingNextJob,
    cancellingJobIds,
    retryingJobIds,
    loadIndexJobs,
    handleCreateIndexJob,
    handleCancelIndexJob,
    handleRetryIndexJob,
    handleClaimNextJob,
    handleReleaseStaleLocks,

    // Watcher parameters
    incrementalStatus,
    incrementalEvents,
    incrementalLoading,
    incrementalError,
    scanningPath,
    rebuildingDelta,
    loadIncrementalData,
    handleScanPath,
    handleRebuildDelta,

    // Repo adapter settings
    repoStatus,
    repoFiles,
    repoFilesLoading,
    repoWarnings,
    repoErrors,
    selectedRepoFilePath,
    selectedRepoFileContent,
    selectedRepoFileLoading,
    selectedRepoFileRedacted,
    selectedRepoFileWarnings,
    selectedRepoFileErrors,
    configuringRepo,
    loadRepoFiles,
    loadRepoFileContent,
    handleConfigureRepo
  };
}

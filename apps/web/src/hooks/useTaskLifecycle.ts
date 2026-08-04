/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Task } from "@y/shared";
import * as api from "../lib/api/tasks";

export function useTaskLifecycle(projectId: string) {
  // Search and Metrics states
  const [searchResults, setSearchResults] = useState<Task[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState("");
  const [searchLimit, setSearchLimit] = useState(25);

  // Quick task creation states
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Coding");
  const [newRisk, setNewRisk] = useState("Low");
  const [newDifficulty, setNewDifficulty] = useState("Medium");
  const [newStatus, setNewStatus] = useState("pending");
  const [newOwnerAgent, setNewOwnerAgent] = useState("Gemini 2.5 Flash");
  const [newHumanOwner, setNewHumanOwner] = useState("Aydinoglu");
  const [newDesc, setNewDesc] = useState("");
  const [isAddingTask, setIsAddingTask] = useState(false);

  // Active targeted task and checkout boundaries
  const [selectedTaskForBoundary, setSelectedTaskForBoundary] = useState<Task | null>(null);
  const [boundaryData, setBoundaryData] = useState<any | null>(null);
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [boundaryError, setBoundaryError] = useState("");
  const [lockLoading, setLockLoading] = useState(false);
  const [proposedFilesInput, setProposedFilesInput] = useState("");
  const [checkResult, setCheckResult] = useState<any | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState("");

  // Resume Engine snapshot states
  const [selectedTaskResumeState, setSelectedTaskResumeState] = useState<any>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [resumePayload, setResumePayload] = useState<any>(null);
  const [resumePayloadLoading, setResumePayloadLoading] = useState(false);
  const [resumePayloadError, setResumePayloadError] = useState("");
  const [pausingTask, setPausingTask] = useState(false);
  const [pauseReasonInput, setPauseReasonInput] = useState("");

  // Auto requeue timer scheduler
  const [taskSchedules, setTaskSchedules] = useState<any[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [schedulesError, setSchedulesError] = useState("");
  const [scheduleTypeInput, setScheduleTypeInput] = useState("one_hour");
  const [customDelayInput, setCustomDelayInput] = useState<number>(60);
  const [scheduleReasonInput, setScheduleReasonInput] = useState("");
  const [replaceExistingInput, setReplaceExistingInput] = useState(false);
  const [schedulingTask, setSchedulingTask] = useState(false);
  const [schedulingError, setSchedulingError] = useState("");
  const [projectResumeQueue, setProjectResumeQueue] = useState<any[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [sweepProcessing, setSweepProcessing] = useState(false);

  // Dynamic Multi-Agent Handoffs
  const [handoffs, setHandoffs] = useState<any[]>([]);
  const [handoffsLoading, setHandoffsLoading] = useState(false);
  const [handoffsError, setHandoffsError] = useState("");
  const [sourceProviderInput, setSourceProviderInput] = useState("claude_code");
  const [targetProviderInput, setTargetProviderInput] = useState("codex");
  const [handoffReasonInput, setHandoffReasonInput] = useState("");
  const [creatingHandoff, setCreatingHandoff] = useState(false);
  const [inspectingHandoff, setInspectingHandoff] = useState<any | null>(null);

  // Chronological memory timeline
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [timelineSummary, setTimelineSummary] = useState<any | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [timelineFilterSource, setTimelineFilterSource] = useState("");
  const [timelineFilterStatus, setTimelineFilterStatus] = useState("");
  const [timelineOrder, setTimelineOrder] = useState<"asc" | "desc">("desc");
  const [rebuildingTimeline, setRebuildingTimeline] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Debug Logger logs & Diagnostic Probes
  const [debugLogs, setDebugLogs] = useState<any[]>([]);
  const [debugLogsLoading, setDebugLogsLoading] = useState(false);
  const [debugLogsError, setDebugLogsError] = useState("");
  const [debugLevelFilter, setDebugLevelFilter] = useState("ALL");
  const [debugSearchText, setDebugSearchText] = useState("");
  const [diagnosisResult, setDiagnosisResult] = useState<any | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState("");
  
  const [probeMessage, setProbeMessage] = useState("");
  const [probeLevel, setProbeLevel] = useState("INFO");
  const [probeSource, setProbeSource] = useState("compiler");
  const [probeSubmitting, setProbeSubmitting] = useState(false);
  const [probeSuccessMsg, setProbeSuccessMsg] = useState("");

  // FSM State parameters
  const [taskLifecycleInfo, setTaskLifecycleInfo] = useState<any | null>(null);
  const [taskLifecycleLoading, setTaskLifecycleLoading] = useState(false);
  const [taskLifecycleError, setTaskLifecycleError] = useState("");
  const [taskStatusHistory, setTaskStatusHistory] = useState<any[]>([]);
  const [statusHistoryLoading, setStatusHistoryLoading] = useState(false);
  const [statusHistoryError, setStatusHistoryError] = useState("");
  const [transitionError, setTransitionError] = useState("");
  const [isTransitioningTask, setIsTransitioningTask] = useState(false);
  const [transitionRationale, setTransitionRationale] = useState("");
  const [adminOverrideChecked, setAdminOverrideChecked] = useState(false);

  // Search Tasks Dispatch
  const handleSearchTasks = async () => {
    if (!projectId) return;
    setSearchLoading(true);
    setSearchError("");
    try {
      const items = await api.searchTasks(projectId, searchQuery, searchStatus, searchLimit);
      setSearchResults(items);
    } catch (err: any) {
      setSearchError(err.message || "Failed to search tasks.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleCreateTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!projectId || !newTitle.trim()) return;
    setIsAddingTask(true);
    try {
      const payload = {
        title: newTitle,
        description: newDesc || "AutoTodo decompose subtask sequence",
        category: newCategory,
        riskLevel: newRisk,
        difficulty: newDifficulty,
        status: newStatus,
        ownerAgent: newOwnerAgent,
        humanOwner: newHumanOwner,
        acceptanceCriteria: ["JSON fields match exact model specification"]
      };
      await api.createTask(projectId, payload);
      setNewTitle("");
      setNewDesc("");
      await handleSearchTasks();
    } catch (err: any) {
      alert(`Error creating task: ${err.message}`);
    } finally {
      setIsAddingTask(false);
    }
  };

  // FSM Status Transition dispatcher
  const handleTransitionTask = async (action: string, targetStatus?: string) => {
    if (!selectedTaskForBoundary || !projectId) return;
    setIsTransitioningTask(true);
    setTransitionError("");
    try {
      await api.transitionTask(projectId, selectedTaskForBoundary.id, {
        action,
        targetStatus,
        rationale: transitionRationale || `Triggered action "${action}" from Task Board UI`,
        metadata: { adminOverride: adminOverrideChecked }
      });
      setTransitionRationale("");
      setAdminOverrideChecked(false);
      
      // Reload states
      await fetchTaskLifecycleInfo(selectedTaskForBoundary.id);
      await fetchTaskStatusHistory(selectedTaskForBoundary.id);
      await handleSearchTasks();
      setSelectedTaskForBoundary(prev => prev ? { ...prev, status: targetStatus || prev.status } : null);
    } catch (err: any) {
      setTransitionError(err.message || "FSM Transition failed.");
    } finally {
      setIsTransitioningTask(false);
    }
  };

  const fetchTaskLifecycleInfo = async (taskId: string) => {
    if (!projectId || !taskId) return;
    setTaskLifecycleLoading(true);
    setTaskLifecycleError("");
    try {
      const data = await api.fetchTaskLifecycleInfo(projectId, taskId);
      setTaskLifecycleInfo(data);
    } catch (err: any) {
      setTaskLifecycleError(err.message || "Failed to load FSM state.");
    } finally {
      setTaskLifecycleLoading(false);
    }
  };

  const fetchTaskStatusHistory = async (taskId: string) => {
    if (!projectId || !taskId) return;
    setStatusHistoryLoading(true);
    setStatusHistoryError("");
    try {
      const data = await api.fetchTaskStatusHistory(projectId, taskId);
      setTaskStatusHistory(data || []);
    } catch (err: any) {
      setStatusHistoryError(err.message || "Failed to load transition logs.");
    } finally {
      setStatusHistoryLoading(false);
    }
  };

  // Checkpoint pause snapshot dispatchers
  const fetchResumeStateForTask = async (taskId: string) => {
    setResumeLoading(true);
    setResumeError("");
    try {
      const data = await api.fetchLatestResumeState(taskId);
      setSelectedTaskResumeState(data);
    } catch (err: any) {
      setResumeError(err.message || "Failed to load resume state.");
    } finally {
      setResumeLoading(false);
    }
  };

  const handlePauseTask = async (reason: string) => {
    if (!selectedTaskForBoundary) return;
    setPausingTask(true);
    try {
      await api.pauseTask(selectedTaskForBoundary.id, reason || "Manual pause requested");
      setSearchResults(prev => prev.map(t => t.id === selectedTaskForBoundary.id ? { ...t, status: "paused" } : t));
      setSelectedTaskForBoundary(prev => prev ? { ...prev, status: "paused" } : null);
      setPauseReasonInput("");
      await fetchResumeStateForTask(selectedTaskForBoundary.id);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setPausingTask(false);
    }
  };

  const handleGenerateResumePayload = async () => {
    if (!selectedTaskForBoundary) return;
    setResumePayloadLoading(true);
    setResumePayloadError("");
    try {
      const data = await api.generateResumePayload(selectedTaskForBoundary.id);
      setResumePayload(data);
    } catch (err: any) {
      setResumePayloadError(err.message || "Failed to generate resume payload.");
    } finally {
      setResumePayloadLoading(false);
    }
  };

  // Timed requeue schedules
  const fetchTaskSchedules = async (taskId: string) => {
    setSchedulesLoading(true);
    setSchedulesError("");
    try {
      const data = await api.fetchTaskResumeSchedules(taskId);
      setTaskSchedules(data || []);
    } catch (err: any) {
      setSchedulesError(err.message || "Failed to load task schedules.");
    } finally {
      setSchedulesLoading(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!selectedTaskForBoundary) return;
    setSchedulingTask(true);
    setSchedulingError("");
    try {
      const payload: any = {
        schedule_type: scheduleTypeInput,
        reason: scheduleReasonInput || "Standard interval pause",
        replace_existing: replaceExistingInput
      };
      if (scheduleTypeInput === "custom") {
        payload.delay_minutes = Number(customDelayInput);
      }
      await api.createTaskResumeSchedule(selectedTaskForBoundary.id, payload);
      await fetchTaskSchedules(selectedTaskForBoundary.id);
      setScheduleReasonInput("");
      setReplaceExistingInput(false);
    } catch (err: any) {
      setSchedulingError(err.message || "Failed to schedule requeue timer.");
    } finally {
      setSchedulingTask(false);
    }
  };

  const handleCancelSchedule = async (scheduleId: string) => {
    if (!selectedTaskForBoundary) return;
    try {
      await api.cancelTaskResumeSchedule(scheduleId);
      await fetchTaskSchedules(selectedTaskForBoundary.id);
    } catch (err: any) {
      alert(err.message || "Failed to cancel schedule.");
    }
  };

  const fetchProjectResumeQueue = async () => {
    if (!projectId) return;
    setQueueLoading(true);
    setQueueError("");
    try {
      const data = await api.fetchProjectResumeQueue(projectId);
      setProjectResumeQueue(data || []);
    } catch (err: any) {
      setQueueError(err.message || "Failed to load requeue buffer.");
    } finally {
      setQueueLoading(false);
    }
  };

  const handleManualRequeueSweep = async () => {
    if (!projectId) return;
    setSweepProcessing(true);
    try {
      await api.sweepRequeueReady(projectId);
      await fetchProjectResumeQueue();
      if (selectedTaskForBoundary) {
        await fetchTaskSchedules(selectedTaskForBoundary.id);
      }
    } catch (err: any) {
      alert(err.message || "Failed to trigger timed requeue sweeps.");
    } finally {
      setSweepProcessing(false);
    }
  };

  // Delegations & multi-agent handoffs
  const fetchHandoffsForTask = async (taskId: string) => {
    setHandoffsLoading(true);
    setHandoffsError("");
    try {
      const data = await api.fetchTaskHandoffs(taskId);
      setHandoffs(data || []);
    } catch (err: any) {
      setHandoffsError(err.message || "Failed to load handoffs.");
    } finally {
      setHandoffsLoading(false);
    }
  };

  const handleCreateHandoff = async () => {
    if (!selectedTaskForBoundary) return;
    setCreatingHandoff(true);
    try {
      const data = await api.createTaskHandoff(selectedTaskForBoundary.id, {
        source_provider: sourceProviderInput,
        target_provider: targetProviderInput,
        reason: handoffReasonInput
      });
      setHandoffReasonInput("");
      setInspectingHandoff(data);
      await fetchHandoffsForTask(selectedTaskForBoundary.id);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreatingHandoff(false);
    }
  };

  const handleValidateHandoff = async (handoffId: string) => {
    try {
      const data = await api.validateHandoff(handoffId);
      setHandoffs(prev => prev.map(h => h.handoff_id === handoffId ? data : h));
      if (inspectingHandoff?.handoff_id === handoffId) {
        setInspectingHandoff(data);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateHandoffStatus = async (handoffId: string, nextStatus: string) => {
    try {
      const data = await api.updateHandoffStatus(handoffId, nextStatus);
      setHandoffs(prev => prev.map(h => h.handoff_id === handoffId ? data : h));
      if (inspectingHandoff?.handoff_id === handoffId) {
        setInspectingHandoff(data);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Chronological memory timeline
  const fetchTimelineForTask = async (taskId: string, order = timelineOrder, srcType = timelineFilterSource, stat = timelineFilterStatus) => {
    if (!projectId) return;
    setTimelineLoading(true);
    setTimelineError("");
    try {
      const data = await api.fetchTaskTimeline(projectId, taskId, order, srcType, stat);
      setTimelineEvents(data || []);

      const summary = await api.fetchTaskTimelineSummary(projectId, taskId);
      setTimelineSummary(summary);
    } catch (err: any) {
      setTimelineError(err.message || "Failed to load timeline Playback.");
    } finally {
      setTimelineLoading(false);
    }
  };

  const handleRebuildTimeline = async (taskId: string) => {
    if (!projectId) return;
    setRebuildingTimeline(true);
    try {
      await api.rebuildTaskTimeline(projectId, taskId);
      await fetchTimelineForTask(taskId);
    } catch (err: any) {
      alert(err.message || "Timeline compilation failed.");
    } finally {
      setRebuildingTimeline(false);
    }
  };

  // Debug Console logs & Diagnostic Probes
  const fetchDebugLogs = async (taskId: string, level = "ALL", search = "") => {
    if (!projectId) return;
    setDebugLogsLoading(true);
    setDebugLogsError("");
    try {
      const data = await api.fetchTaskDebugLogs(projectId, taskId, 150, level, search);
      setDebugLogs(data || []);
    } catch (err: any) {
      setDebugLogsError(err.message || "Failed to load log stream.");
    } finally {
      setDebugLogsLoading(false);
    }
  };

  const handleClearDebugLogs = async () => {
    if (!selectedTaskForBoundary || !projectId) return;
    try {
      await api.clearTaskDebugLogs(projectId, selectedTaskForBoundary.id);
      setDiagnosisResult(null);
      await fetchDebugLogs(selectedTaskForBoundary.id, debugLevelFilter, debugSearchText);
    } catch (err: any) {
      alert(err.message || "Clear logs failed.");
    }
  };

  const handleRunDiagnostics = async () => {
    if (!selectedTaskForBoundary || !projectId) return;
    setDiagnosing(true);
    setDiagnosisError("");
    setDiagnosisResult(null);
    try {
      const data = await api.runTaskDiagnostics(projectId, selectedTaskForBoundary.id);
      setDiagnosisResult(data);
    } catch (err: any) {
      setDiagnosisError(err.message || "Diagnostics execution failed.");
    } finally {
      setDiagnosing(false);
    }
  };

  const handleAppendProbeLog = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedTaskForBoundary || !projectId || !probeMessage.trim()) return;
    setProbeSubmitting(true);
    setProbeSuccessMsg("");
    try {
      const loggedLine = await api.appendDiagnosticProbeLog(projectId, selectedTaskForBoundary.id, {
        level: probeLevel,
        message: probeMessage,
        source: probeSource
      });
      setProbeMessage("");
      setProbeSuccessMsg(loggedLine.redacted ? "Stored! (secrets redacted)" : "Probe log registered.");
      setTimeout(() => setProbeSuccessMsg(""), 3000);
      await fetchDebugLogs(selectedTaskForBoundary.id, debugLevelFilter, debugSearchText);
    } catch (err: any) {
      alert(err.message || "Append probe log failed.");
    } finally {
      setProbeSubmitting(false);
    }
  };

  // Boundary Scope checks and checkout locks
  const fetchBoundaryForTask = async (task: Task) => {
    setSelectedTaskForBoundary(task);
    setBoundaryData(null);
    setCheckResult(null);
    setProposedFilesInput("");
    setBoundaryError("");
    setBoundaryLoading(true);

    // Reset snap levels
    setSelectedTaskResumeState(null);
    setResumePayload(null);
    setResumeError("");
    setResumePayloadError("");

    // Reset FSM states
    setTaskLifecycleInfo(null);
    setTaskLifecycleError("");
    setTaskStatusHistory([]);
    setStatusHistoryError("");
    setTransitionError("");

    try {
      const data = await api.fetchTaskBoundary(task.id);
      setBoundaryData(data);

      // Async fetch siblings
      fetchResumeStateForTask(task.id);
      fetchTaskSchedules(task.id);
      fetchHandoffsForTask(task.id);
      fetchTimelineForTask(task.id);
      fetchTaskLifecycleInfo(task.id);
      fetchTaskStatusHistory(task.id);
    } catch (err: any) {
      setBoundaryError(err.message || "Failed to load task boundary specifications.");
    } finally {
      setBoundaryLoading(false);
    }
  };

  const handleLockBoundary = async () => {
    if (!selectedTaskForBoundary) return;
    setLockLoading(true);
    try {
      const data = await api.lockTaskBoundary(selectedTaskForBoundary.id);
      setBoundaryData(data);
    } catch (err: any) {
      alert(err.message || "Checkout lock request failed.");
    } finally {
      setLockLoading(false);
    }
  };

  const handleCheckProposedChanges = async () => {
    if (!selectedTaskForBoundary) return;
    setCheckLoading(true);
    setCheckError("");
    setCheckResult(null);
    try {
      const files = proposedFilesInput.split(/[,\n]+/).map(f => f.trim()).filter(Boolean);
      const data = await api.checkTaskBoundaryFiles(selectedTaskForBoundary.id, files);
      setCheckResult(data);
    } catch (err: any) {
      setCheckError(err.message || "Proposed check failed.");
    } finally {
      setCheckLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      handleSearchTasks();
      fetchProjectResumeQueue();
    }
  }, [projectId]);

  return {
    searchResults,
    searchLoading,
    searchError,
    searchQuery,
    setSearchQuery,
    searchStatus,
    setSearchStatus,
    searchLimit,
    setSearchLimit,
    handleSearchTasks,

    // Task Creation Form states
    newTitle,
    setNewTitle,
    newCategory,
    setNewCategory,
    newRisk,
    setNewRisk,
    newDifficulty,
    setNewDifficulty,
    newStatus,
    setNewStatus,
    newOwnerAgent,
    setNewOwnerAgent,
    newHumanOwner,
    setNewHumanOwner,
    newDesc,
    setNewDesc,
    isAddingTask,
    handleCreateTask,

    // Targeted Task & Boundaries
    selectedTaskForBoundary,
    setSelectedTaskForBoundary,
    boundaryData,
    boundaryLoading,
    boundaryError,
    lockLoading,
    proposedFilesInput,
    setProposedFilesInput,
    checkResult,
    checkLoading,
    checkError,
    fetchBoundaryForTask,
    handleLockBoundary,
    handleCheckProposedChanges,

    // Resume snapshot checks
    selectedTaskResumeState,
    resumeLoading,
    resumeError,
    resumePayload,
    resumePayloadLoading,
    resumePayloadError,
    pausingTask,
    pauseReasonInput,
    setPauseReasonInput,
    handlePauseTask,
    handleGenerateResumePayload,

    // Timed queues & sweeps
    taskSchedules,
    schedulesLoading,
    schedulesError,
    scheduleTypeInput,
    setScheduleTypeInput,
    customDelayInput,
    setCustomDelayInput,
    scheduleReasonInput,
    setScheduleReasonInput,
    replaceExistingInput,
    setReplaceExistingInput,
    schedulingTask,
    schedulingError,
    projectResumeQueue,
    queueLoading,
    queueError,
    sweepProcessing,
    handleCreateSchedule,
    handleCancelSchedule,
    fetchProjectResumeQueue,
    handleManualRequeueSweep,

    // Multi-Agent handoffs
    handoffs,
    handoffsLoading,
    handoffsError,
    sourceProviderInput,
    setSourceProviderInput,
    targetProviderInput,
    setTargetProviderInput,
    handoffReasonInput,
    setHandoffReasonInput,
    creatingHandoff,
    inspectingHandoff,
    setInspectingHandoff,
    handleCreateHandoff,
    handleValidateHandoff,
    handleUpdateHandoffStatus,

    // Timeline Playback Replay
    timelineEvents,
    timelineSummary,
    timelineLoading,
    timelineError,
    timelineFilterSource,
    setTimelineFilterSource,
    timelineFilterStatus,
    setTimelineFilterStatus,
    timelineOrder,
    setTimelineOrder,
    rebuildingTimeline,
    expandedEventId,
    setExpandedEventId,
    fetchTimelineForTask,
    handleRebuildTimeline,

    // Debug Console Logger stream & Probes
    debugLogs,
    debugLogsLoading,
    debugLogsError,
    debugLevelFilter,
    setDebugLevelFilter,
    debugSearchText,
    setDebugSearchText,
    diagnosisResult,
    diagnosing,
    diagnosisError,
    probeMessage,
    setProbeMessage,
    probeLevel,
    setProbeLevel,
    probeSource,
    setProbeSource,
    probeSubmitting,
    probeSuccessMsg,
    handleClearDebugLogs,
    handleRunDiagnostics,
    handleAppendProbeLog,
    fetchDebugLogs,

    // FSM Life-Cycle parameters
    taskLifecycleInfo,
    taskLifecycleLoading,
    taskLifecycleError,
    taskStatusHistory,
    statusHistoryLoading,
    statusHistoryError,
    transitionError,
    isTransitioningTask,
    transitionRationale,
    setTransitionRationale,
    adminOverrideChecked,
    setAdminOverrideChecked,
    handleTransitionTask
  };
}

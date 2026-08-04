/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import * as api from "../lib/api/trust";

export function useSecurityVault(projectId: string) {
  // Permission policies & audits
  const [policies, setPolicies] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [loadingEvals, setLoadingEvals] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [evalResult, setEvalResult] = useState<any | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState("");

  // Evidence cryptographic audit store
  const [evidenceRecords, setEvidenceRecords] = useState<any[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [selectedEvidenceRecord, setSelectedEvidenceRecord] = useState<any | null>(null);
  const [verificationResults, setVerificationResults] = useState<Record<string, any>>({});
  const [verifyingMap, setVerifyingMap] = useState<Record<string, boolean>>({});

  // Immutable global transaction logs journal
  const [eventRecordsJournal, setEventRecordsJournal] = useState<any[]>([]);
  const [eventJournalLoading, setEventJournalLoading] = useState(false);
  const [eventJournalError, setEventJournalError] = useState("");
  const [selectedEventJournal, setSelectedEventJournal] = useState<any | null>(null);

  // Quality telemetry runs
  const [qualityRuns, setQualityRuns] = useState<any[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState("");
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  const [selectedRunCommands, setSelectedRunCommands] = useState<any[]>([]);

  // Policy handlers
  const loadPolicies = async () => {
    if (!projectId) return;
    setLoadingPolicies(true);
    try {
      const data = await api.fetchPermissionPolicies(projectId);
      setPolicies(data.policies || []);
    } catch (err: any) {
      setErrorText(err.message || "Failed to load policies.");
    } finally {
      setLoadingPolicies(false);
    }
  };

  const loadEvaluations = async () => {
    if (!projectId) return;
    setLoadingEvals(true);
    try {
      const data = await api.fetchPermissionEvaluationsLog(projectId);
      setEvaluations(data.evaluations || []);
    } catch (err: any) {
      console.warn("Failed to retrieve evaluations logs: ", err.message);
    } finally {
      setLoadingEvals(false);
    }
  };

  const handleTestEvaluate = async (payload: any) => {
    if (!projectId) return;
    setEvaluating(true);
    setEvalError("");
    setEvalResult(null);
    try {
      const data = await api.evaluatePermission(projectId, payload);
      setEvalResult(data.evaluation);
      await loadEvaluations();
      return data.evaluation;
    } catch (err: any) {
      setEvalError(err.message || "Access evaluation check failed.");
      throw err;
    } finally {
      setEvaluating(false);
    }
  };

  // Evidence handlers
  const loadEvidenceRecords = async (taskId?: string) => {
    if (!projectId) return;
    setEvidenceLoading(true);
    setEvidenceError("");
    try {
      const data = await api.fetchEvidenceRecords(projectId, taskId);
      setEvidenceRecords(data || []);
    } catch (err: any) {
      setEvidenceError(err.message || "Failed to retrieve evidence.");
    } finally {
      setEvidenceLoading(false);
    }
  };

  const handleCreateEvidence = async (taskId: string | undefined, payload: any) => {
    if (!projectId) return;
    try {
      const data = await api.createEvidenceRecord(projectId, taskId, payload);
      setSelectedEvidenceRecord(data);
      await loadEvidenceRecords(taskId);
      return data;
    } catch (err: any) {
      alert(err.message || "Failed to create evidence.");
      throw err;
    }
  };

  const handleVerifyEvidence = async (evidenceId: string) => {
    if (!projectId) return;
    setVerifyingMap((prev) => ({ ...prev, [evidenceId]: true }));
    try {
      const result = await api.verifyEvidenceRecord(projectId, evidenceId);
      setVerificationResults((prev) => ({ ...prev, [evidenceId]: result }));
      if (selectedEvidenceRecord?.id === evidenceId) {
        setSelectedEvidenceRecord((prev: any) =>
          prev
            ? {
                ...prev,
                status: result.status,
                verified_at: result.verified_at,
                verification_meta_json: result.verification_meta_json
              }
            : null
        );
      }
      await loadEvidenceRecords();
    } catch (err: any) {
      alert(err.message || "Integrity verification failed.");
    } finally {
      setVerifyingMap((prev) => ({ ...prev, [evidenceId]: false }));
    }
  };

  const handleVerifyEvidenceBatch = async (taskId?: string) => {
    if (!projectId) return;
    setEvidenceLoading(true);
    try {
      const resultsArray = await api.verifyEvidenceBatch(projectId, taskId);
      const newResults: Record<string, any> = {};
      for (const r of resultsArray) {
        newResults[r.evidence_id] = r;
      }
      setVerificationResults((prev) => ({ ...prev, ...newResults }));
      await loadEvidenceRecords(taskId);
      alert(`Batch verification complete! Verified ${resultsArray.length} records.`);
    } catch (err: any) {
      alert(err.message || "Batch verification failed.");
    } finally {
      setEvidenceLoading(false);
    }
  };

  // Event Journal handlers
  const loadEventJournal = async (filters: Record<string, string>) => {
    if (!projectId) return;
    setEventJournalLoading(true);
    setEventJournalError("");
    try {
      const data = await api.fetchEventJournal(projectId, filters);
      setEventRecordsJournal(data || []);
    } catch (err: any) {
      setEventJournalError(err.message || "Failed to retrieve event ledger.");
    } finally {
      setEventJournalLoading(false);
    }
  };

  const handleAppendEventJournal = async (payload: any) => {
    if (!projectId) return;
    try {
      const created = await api.appendEventJournal(projectId, payload);
      setSelectedEventJournal(created);
      return created;
    } catch (err: any) {
      alert(err.message || "Failed to append ledger record.");
      throw err;
    }
  };

  // Quality runs handlers
  const loadQualityRuns = async (taskId?: string) => {
    if (!projectId) return;
    setRunsLoading(true);
    setRunsError("");
    try {
      const data = await api.fetchQualityRuns(projectId, taskId);
      setQualityRuns(data || []);
    } catch (err: any) {
      setRunsError(err.message || "Failed to load runs.");
    } finally {
      setRunsLoading(false);
    }
  };

  const loadQualityRunDetails = async (taskId: string, runId: string) => {
    if (!projectId) return;
    try {
      const data = await api.fetchQualityRunDetails(projectId, taskId, runId);
      setSelectedRun(data);
      setSelectedRunCommands(data.commands || []);
    } catch (err: any) {
      alert(err.message || "Inspection details failed.");
    }
  };

  const handleCreateQualityRun = async (taskId: string, featureId: string, runBy: string, metadata: any) => {
    if (!projectId) return;
    try {
      const run = await api.createQualityRun(projectId, taskId, featureId, runBy, metadata);
      setSelectedRun(run);
      setSelectedRunCommands([]);
      await loadQualityRuns(taskId);
      return run;
    } catch (err: any) {
      alert(err.message);
      throw err;
    }
  };

  const handleStartQualityRun = async (taskId: string, runId: string) => {
    if (!projectId) return;
    try {
      const updated = await api.startQualityRun(projectId, taskId, runId);
      setSelectedRun(updated);
      await loadQualityRuns(taskId);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCancelQualityRun = async (taskId: string, runId: string) => {
    if (!projectId) return;
    try {
      const updated = await api.cancelQualityRun(projectId, taskId, runId);
      setSelectedRun(updated);
      await loadQualityRuns(taskId);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleIngestQualityCommand = async (taskId: string, runId: string, payload: any) => {
    if (!projectId) return;
    try {
      const added = await api.ingestQualityCommand(projectId, taskId, runId, payload);
      setSelectedRunCommands((prev) => [...prev, added]);
      await loadQualityRunDetails(taskId, runId);
      return added;
    } catch (err: any) {
      alert(err.message || "Command ingestion failed.");
      throw err;
    }
  };

  const handleCompleteQualityRun = async (taskId: string, runId: string) => {
    if (!projectId) return;
    try {
      const updated = await api.completeQualityRun(projectId, taskId, runId);
      setSelectedRun(updated);
      await loadQualityRuns(taskId);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSimulateCleanPipeline = async (taskId: string, runId: string) => {
    if (!projectId) return;
    try {
      await api.startQualityRun(projectId, taskId, runId);
      const commands = [
        { type: "LINT", summary: "Linter succeeded", stdout: "All 23 source files verified perfectly. No prettier or styling violations.", duration: 180 },
        { type: "TYPECHECK", summary: "Types verified", stdout: "tsc --noEmit: compilation successful. 0 errors detected.", duration: 320 },
        { type: "BUILD", summary: "Production build complete", stdout: "Vite compiled and generated production-ready chunks in dist/.", duration: 1200 },
        { type: "TEST", summary: "All assertions passed", stdout: "Running automated specs. Passed: 104 specs. Failed: 0.", duration: 850 },
        { type: "SECRET_SCAN", summary: "No leaking credentials", stdout: "Scanning secrets. Warn: RSA keys check OK. No credentials found.", duration: 190 },
        { type: "DEBUG_TAGS", summary: "No active QA tags", stdout: "Check for temporary tags done. 0 tags found.", duration: 120 },
        { type: "DB_STATUS", summary: "Metadata matched active schema", stdout: "Table structures and active indexes match core migrations perfectly.", duration: 150 }
      ];

      for (const cmd of commands) {
        await api.ingestQualityCommand(projectId, taskId, runId, {
          command_type: cmd.type,
          status: "passed",
          exit_code: 0,
          stdout: cmd.stdout,
          stderr: "",
          output_summary: cmd.summary,
          duration_ms: cmd.duration,
          metadata: {}
        });
      }

      await api.completeQualityRun(projectId, taskId, runId);
      await loadQualityRuns(taskId);
      await loadQualityRunDetails(taskId, runId);
    } catch (err: any) {
      alert("Simulation failed: " + err.message);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadPolicies();
      loadEvaluations();
    }
  }, [projectId]);

  return {
    policies,
    evaluations,
    loadingPolicies,
    loadingEvals,
    errorText,
    evalResult,
    evaluating,
    evalError,
    handleTestEvaluate,
    loadPolicies,
    loadEvaluations,

    // Evidence parameters
    evidenceRecords,
    evidenceLoading,
    evidenceError,
    selectedEvidenceRecord,
    setSelectedEvidenceRecord,
    verificationResults,
    verifyingMap,
    loadEvidenceRecords,
    handleCreateEvidence,
    handleVerifyEvidence,
    handleVerifyEvidenceBatch,

    // Ledger Event journal parameters
    eventRecordsJournal,
    eventJournalLoading,
    eventJournalError,
    selectedEventJournal,
    setSelectedEventJournal,
    loadEventJournal,
    handleAppendEventJournal,

    // Telemetry Quality Gates
    qualityRuns,
    runsLoading,
    runsError,
    selectedRun,
    selectedRunCommands,
    loadQualityRuns,
    loadQualityRunDetails,
    handleCreateQualityRun,
    handleStartQualityRun,
    handleCancelQualityRun,
    handleIngestQualityCommand,
    handleCompleteQualityRun,
    handleSimulateCleanPipeline
  };
}

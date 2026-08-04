/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Project } from "@y/shared";
import * as api from "../lib/api/projects";

export function useWorkspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>("");
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [isCreatingProj, setIsCreatingProj] = useState(false);

  // Database Connection configuration modal states
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [dbUsername, setDbUsername] = useState("postgres");
  const [dbPassword, setDbPassword] = useState("");
  const [dbHost, setDbHost] = useState("db.vnnfcwpywdxepdwwuqoo.supabase.co");
  const [dbPort, setDbPort] = useState("5432");
  const [dbName, setDbName] = useState("postgres");
  const [dbConnStr, setDbConnStr] = useState("");
  const [useRawString, setUseRawString] = useState(false);
  const [configPending, setConfigPending] = useState(false);
  const [configResultMsg, setConfigResultMsg] = useState<{ success: boolean; text: string } | null>(null);

  // Global Telemetry Systems
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState("");

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;

  const loadProjects = async () => {
    setProjectsLoading(true);
    setProjectError("");
    try {
      const data = await api.fetchProjects();
      setProjects(data);
      if (data.length > 0) {
        setActiveProjectId((prev) => {
          if (data.some((p) => p.id === prev)) return prev;
          return data[0].id;
        });
      } else {
        setActiveProjectId("");
      }
    } catch (err: any) {
      setProjectError(err.message || "Failed to load projects list.");
    } finally {
      setProjectsLoading(false);
    }
  };

  const handleCreateProject = async (name: string, description: string) => {
    setIsCreatingProj(true);
    try {
      const newProj = await api.createProject(name, description);
      setProjects((prev) => [...prev, newProj]);
      setActiveProjectId(newProj.id);
      setNewProjectName("");
      setNewProjectDesc("");
      return newProj;
    } catch (err: any) {
      setProjectError(err.message || "Failed to create project.");
      throw err;
    } finally {
      setIsCreatingProj(false);
    }
  };

  const loadHealthStatus = async () => {
    try {
      const data = await api.fetchHealthStatus();
      setHealthStatus(data);
      if (data.database && !data.database.connected) {
        setShowConfigModal(true);
      }
    } catch (e) {
      console.warn("Backend health endpoint unreachable. falling back to simulation.", e);
    }
  };

  const loadTaskMetrics = async () => {
    if (!activeProjectId) return;
    setMetricsLoading(true);
    setMetricsError("");
    try {
      const data = await api.fetchTaskMetrics(activeProjectId);
      setMetrics(data);
    } catch (err: any) {
      setMetricsError(err.message || "Failed to load project task metrics.");
    } finally {
      setMetricsLoading(false);
    }
  };

  const loadConfigInspect = async () => {
    try {
      const data = await api.fetchConfigInspect();
      if (data && data.databaseUrl) {
        setDbConnStr(data.databaseUrl);
        try {
          const match = data.databaseUrl.match(/postgresql?:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
          if (match) {
            setDbUsername(decodeURIComponent(match[1]));
            const rawPass = decodeURIComponent(match[2]);
            if (!rawPass.includes("REDACTED") && rawPass !== "[REDACTED_API_KEY_PRESENT]" && rawPass !== "[REDACTED]") {
              setDbPassword(rawPass);
            }
            setDbHost(match[3]);
            if (match[4]) setDbPort(match[4]);
            setDbName(match[5].split("?")[0]);
          }
        } catch (e) {
          console.warn("Failed to parse config inspect URL:", e);
        }
      }
    } catch (e) {
      console.warn("Failed to inspect config parameters:", e);
    }
  };

  const handleConfigureDb = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setConfigPending(true);
    setConfigResultMsg(null);
    try {
      const payload: any = {};
      if (useRawString) {
        payload.connectionString = dbConnStr;
      } else {
        payload.username = dbUsername;
        payload.password = dbPassword;
        payload.host = dbHost;
        payload.port = dbPort;
        payload.dbname = dbName;
      }
      const data = await api.configureDatabase(payload);
      setConfigResultMsg({ success: true, text: data.message });
      await loadHealthStatus();
      setTimeout(() => {
        setShowConfigModal(false);
        setConfigResultMsg(null);
      }, 1500);
    } catch (err: any) {
      setConfigResultMsg({ success: false, text: err.message || "孙Sunucu connection configure failed." });
    } finally {
      setConfigPending(false);
    }
  };

  useEffect(() => {
    loadHealthStatus();
    loadConfigInspect();
    loadProjects();
  }, []);

  useEffect(() => {
    if (activeProjectId) {
      loadTaskMetrics();
    }
  }, [activeProjectId]);

  return {
    projects,
    activeProjectId,
    setActiveProjectId,
    activeProject,
    projectsLoading,
    projectError,
    newProjectName,
    setNewProjectName,
    newProjectDesc,
    setNewProjectDesc,
    isCreatingProj,
    handleCreateProject,
    loadProjects,

    // Db config states
    showConfigModal,
    setShowConfigModal,
    dbUsername,
    setDbUsername,
    dbPassword,
    setDbPassword,
    dbHost,
    setDbHost,
    dbPort,
    setDbPort,
    dbName,
    setDbName,
    dbConnStr,
    setDbConnStr,
    useRawString,
    setUseRawString,
    configPending,
    configResultMsg,
    handleConfigureDb,

    // Telemetries
    healthStatus,
    metrics,
    metricsLoading,
    metricsError,
    loadTaskMetrics,
    loadHealthStatus
  };
}

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

  /**
   * [P02 / Y-P02-009] P0-12 KAPATILDI.
   *
   * Onceki hali GET /api/config/inspect yanitindaki DATABASE_URL'i regex'leyip
   * DUZ METIN PAROLAYI React state'ine yaziyordu; parola bir <input> value'sunda
   * DOM'da bulunuyordu. Endpoint de silindi (P0-2 ile ayni ailede).
   *
   * Baglanti bilgisi artik istemciye hic gonderilmez.
   */
  const loadConfigInspect = async () => {
    // Bilerek bos: istemcinin veritabani baglanti bilgisine ihtiyaci yok.
  };

  /**
   * [P02 / Y-P02-009] P0-2 KAPATILDI.
   *
   * POST /api/db/configure silindi: govdeden connection string alip global db
   * referansini calisma zamaninda degistiriyor ve duz metin parolayi .env'e
   * yaziyordu (SSRF + credential harvest + kalici config zehirlenmesi).
   *
   * Veritabani yapilandirmasi bir UI islemi degildir; DATABASE_URL ortam
   * degiskeni / secret manager'dan gelir (ADR-073).
   */
  const handleConfigureDb = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setConfigResultMsg({
      success: false,
      text:
        "Veritabani yapilandirmasi UI uzerinden yapilamaz. DATABASE_URL ortam " +
        "degiskeni veya secret manager uzerinden ayarlanir (P02 / ADR-073)."
    });
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

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

  /**
   * [P17 / P0-12 kalintisi] Veritabani kimlik bilgisi state'i KALDIRILDI.
   *
   * Burada dbUsername / dbPassword / dbHost / dbPort / dbName / dbConnStr
   * tutuluyordu ve bir <input type="password"> ile besleniyordu. Arkasindaki
   * POST /api/db/configure P02'de silindiginden form hicbir sey yapmiyordu.
   *
   * Ayrica `dbHost` varsayilani GERCEK bir Supabase host adiydi ve on yuz
   * paketine gomulu geliyordu — P0-11 ile ayni aile (kaynak koda gomulu
   * altyapi kimligi). Altyapi adresi bir UI varsayilani degildir.
   *
   * Modal hala aciliyor; icerigi artik DATABASE_URL'in nereden geldigini
   * anlatan durgun bir panel.
   */
  const [showConfigModal, setShowConfigModal] = useState(false);

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

  useEffect(() => {
    loadHealthStatus();
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

    // Db config modal (yalniz gorunurluk; kimlik bilgisi state'i yok)
    showConfigModal,
    setShowConfigModal,

    // Telemetries
    healthStatus,
    metrics,
    metricsLoading,
    metricsError,
    loadTaskMetrics,
    loadHealthStatus
  };
}

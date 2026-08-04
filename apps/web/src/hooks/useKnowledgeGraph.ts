/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import * as api from "../lib/api/graph";

export function useKnowledgeGraph(projectId: string) {
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState("");
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [syncDetails, setSyncDetails] = useState<any | null>(null);
  
  const [graphSearchQuery, setGraphSearchQuery] = useState("");
  const [nodeFilterType, setNodeFilterType] = useState("all");
  const [relationshipFilterType, setRelationshipFilterType] = useState("all");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const loadGraphData = async () => {
    if (!projectId) return;
    setGraphLoading(true);
    setGraphError("");
    try {
      const data = await api.fetchKnowledgeGraph(projectId, nodeFilterType, relationshipFilterType);
      setGraphData(data || { nodes: [], edges: [] });
    } catch (err: any) {
      setGraphError(err.message || "Failed to load knowledge graph.");
    } finally {
      setGraphLoading(false);
    }
  };

  const handleSyncGraph = async () => {
    if (!projectId) return;
    setSyncLoading(true);
    setSyncSuccess(null);
    setSyncDetails(null);
    setGraphError("");
    try {
      const result = await api.synchronizeGraph(projectId);
      setSyncSuccess(`Synchronization completed successfully! Synthesized ${result.nodesSynced} total nodes and ${result.edgesSynced} edges.`);
      setSyncDetails(result);
      await loadGraphData();
    } catch (err: any) {
      setGraphError(err.message || "Failed to compile knowledge graph synchronizer.");
    } finally {
      setSyncLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadGraphData();
    }
  }, [projectId, nodeFilterType, relationshipFilterType]);

  return {
    graphData,
    graphLoading,
    graphError,
    syncLoading,
    syncSuccess,
    syncDetails,
    graphSearchQuery,
    setGraphSearchQuery,
    nodeFilterType,
    setNodeFilterType,
    relationshipFilterType,
    setRelationshipFilterType,
    expandedNodes,
    setExpandedNodes,
    loadGraphData,
    handleSyncGraph
  };
}

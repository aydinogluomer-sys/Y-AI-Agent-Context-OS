import crypto from "crypto";
import { 
  GraphNode, 
  GraphEdge, 
  GraphNodeType, 
  GraphNodeStatusType, 
  GraphEdgeLabelType,
  CreateGraphNodeDTO,
  CreateGraphEdgeDTO,
  NotFoundError,
  PermissionDeniedError
} from "@y/shared";
import { redactSecretLeaks } from "@y/security";
import { TypeScriptASTParser } from "../../core/src/static-analysis";

// GRAPH module - Discovery and impact mapping
export function calculateImpactTrace(
  nodes: GraphNode[], 
  edges: GraphEdge[], 
  modifiedNodeId: string,
  options: { maxDepth?: number; direction?: "outgoing" | "incoming" | "both" } = {}
): string[] {
  const maxDepth = options.maxDepth || 10;
  const direction = options.direction || "both";
  const visited = new Set<string>([modifiedNodeId]);
  const queue: { nodeId: string; depth: number }[] = [{ nodeId: modifiedNodeId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    for (const edge of edges) {
      let targetNodeId: string | null = null;
      if ((direction === "outgoing" || direction === "both") && edge.source === current.nodeId) {
        targetNodeId = edge.target;
      } else if ((direction === "incoming" || direction === "both") && edge.target === current.nodeId) {
        targetNodeId = edge.source;
      }

      if (targetNodeId && !visited.has(targetNodeId)) {
        visited.add(targetNodeId);
        queue.push({ nodeId: targetNodeId, depth: current.depth + 1 });
      }
    }
  }

  return Array.from(visited);
}

/**
 * Enterprise Knowledge Graph Foundation Service.
 * Orchestrates secure node-edge mapping, project scoping, explicit context synchronization, 
 * and redaction-compliant audit logs sequentially.
 */
export class KnowledgeGraphService {
  constructor(private pool: any) {
    if (!pool) {
      throw new Error("A valid database connection pool is required for KnowledgeGraphService.");
    }
  }

  /**
   * Internal DB query helper
   */
  private async query(sql: string, params: unknown[] = []): Promise<any> {
    return this.pool.query(sql, params);
  }

  /**
   * Validates project scope. Throws NotFoundError if project does not exist.
   */
  public async validateProjectScope(projectId: string): Promise<void> {
    const safeProjectId = redactSecretLeaks(String(projectId || ""));
    const res = await this.query("SELECT id FROM projects WHERE id = $1 LIMIT 1;", [projectId]);
    if (res.rowCount === 0) {
      console.warn(`[Y-OS:SECURITY-WARN] Project scope validation failed: Project ID '${safeProjectId}' returned 0 row records.`);
      throw new NotFoundError(`Project scope validation failed: Project ${safeProjectId} not found.`);
    }
  }

  /**
   * Validates if target node belongs to project.
   */
  public async validateNodeOwnership(projectId: string, nodeId: string): Promise<boolean> {
    const res = await this.query(
      "SELECT 1 FROM graph_nodes WHERE id = $1 AND project_id = $2 LIMIT 1;",
      [nodeId, projectId]
    );
    return res.rowCount > 0;
  }

  /**
   * Maps a DB raw row cleanly to a Typed GraphNode.
   */
  public mapRowToNode(row: any): GraphNode {
    return {
      id: row.id,
      projectId: row.project_id,
      label: row.label,
      type: row.type,
      status: row.status,
      contextItemId: row.context_item_id,
      taskId: row.task_id,
      nodeIdentifier: row.node_identifier,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Safe audit emission helper
   */
  public async emitAuditLog(
    projectId: string,
    actor: string,
    action: string,
    status: string,
    metadata: Record<string, any> = {},
    rationale = "",
    resourceId = "",
    ipAddress = "127.0.0.1"
  ): Promise<void> {
    const logId = `audit_log_${Math.random().toString(36).substring(2, 11)}`;
    const cleanRationale = redactSecretLeaks(rationale);
    
    let cleanMetadata: Record<string, any> = {};
    try {
      const redactedStr = redactSecretLeaks(JSON.stringify(metadata));
      cleanMetadata = JSON.parse(redactedStr);
    } catch {
      cleanMetadata = { redaction_error: "Serialization error during metadata logging." };
    }

    try {
      await this.query(
        `INSERT INTO audit_logs (id, project_id, actor, feature_id, action, status, metadata, rationale, resource_id, ip_address, created_at)
         VALUES ($1, $2, $3, 'CTX', $4, $5, $6, $7, $8, $9, NOW());`,
        [
          logId,
          projectId || null,
          actor,
          action,
          status,
          JSON.stringify(cleanMetadata),
          cleanRationale || null,
          resourceId || null,
          ipAddress
        ]
      );
    } catch (err: any) {
      console.error(`KnowledgeGraphService Audit Log emission failed: ${err.message}`);
    }
  }

  /**
   * Creates a new graph node cleanly under verified scope.
   */
  public async createNode(projectId: string, dto: CreateGraphNodeDTO, actor = "system"): Promise<GraphNode> {
    await this.validateProjectScope(projectId);

    const nodeId = dto.id || `node_${crypto.randomUUID()}`;
    const status = dto.status || "active";
    
    // Redact metadata secrets
    let cleanMetadata: Record<string, any> = {};
    if (dto.metadata) {
      try {
        const redactedStr = redactSecretLeaks(JSON.stringify(dto.metadata));
        cleanMetadata = JSON.parse(redactedStr);
      } catch {
        cleanMetadata = { redaction_error: "Serialization limits." };
      }
    }

    // Node Identifier fallback if not provided
    const nodeIdentifier = dto.nodeIdentifier || `${projectId}:${nodeId}`;

    await this.query(
      `INSERT INTO graph_nodes (id, project_id, label, type, status, context_item_id, task_id, node_identifier, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         label = EXCLUDED.label,
         type = EXCLUDED.type,
         status = EXCLUDED.status,
         context_item_id = EXCLUDED.context_item_id,
         task_id = EXCLUDED.task_id,
         node_identifier = EXCLUDED.node_identifier,
         metadata = EXCLUDED.metadata,
         updated_at = NOW();`,
      [
        nodeId,
        projectId,
        dto.label,
        dto.type,
        status,
        dto.contextItemId || null,
        dto.taskId || null,
        nodeIdentifier,
        JSON.stringify(cleanMetadata)
      ]
    );

    await this.emitAuditLog(
      projectId,
      actor,
      "CREATE_GRAPH_NODE",
      "authorized",
      { node_id: nodeId, label: dto.label, type: dto.type },
      `Created or upserted graph node: ${dto.label} (${dto.type})`,
      nodeId
    );

    return {
      id: nodeId,
      projectId,
      label: dto.label,
      type: dto.type,
      status: status as GraphNodeStatusType,
      contextItemId: dto.contextItemId || null,
      taskId: dto.taskId || null,
      nodeIdentifier,
      metadata: cleanMetadata
    };
  }

  /**
   * Updates graph node.
   */
  public async updateNode(projectId: string, nodeId: string, updates: Partial<GraphNode>, actor = "system"): Promise<GraphNode> {
    await this.validateProjectScope(projectId);
    
    const isOwner = await this.validateNodeOwnership(projectId, nodeId);
    if (!isOwner) {
      await this.emitAuditLog(projectId, actor, "DENIED_CROSS_PROJECT", "denied_untrusted", { node_id: nodeId }, "Cross-project graph node edit access denied.");
      throw new PermissionDeniedError("Requested graph node does not belong to specified project.");
    }

    // Build update dynamic sql
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.label !== undefined) {
      fields.push(`label = $${idx++}`);
      values.push(updates.label);
    }
    if (updates.type !== undefined) {
      fields.push(`type = $${idx++}`);
      values.push(updates.type);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.contextItemId !== undefined) {
      fields.push(`context_item_id = $${idx++}`);
      values.push(updates.contextItemId);
    }
    if (updates.taskId !== undefined) {
      fields.push(`task_id = $${idx++}`);
      values.push(updates.taskId);
    }
    if (updates.nodeIdentifier !== undefined) {
      fields.push(`node_identifier = $${idx++}`);
      values.push(updates.nodeIdentifier);
    }
    if (updates.metadata !== undefined) {
      let cleanMetadata: Record<string, any> = {};
      try {
        const redactedStr = redactSecretLeaks(JSON.stringify(updates.metadata));
        cleanMetadata = JSON.parse(redactedStr);
      } catch {
        cleanMetadata = { redaction_error: "Serialization limits." };
      }
      fields.push(`metadata = $${idx++}`);
      values.push(JSON.stringify(cleanMetadata));
    }

    if (fields.length === 0) {
      throw new Error("No fields provided for updateNode.");
    }

    fields.push(`updated_at = NOW()`);
    
    const queryStr = `UPDATE graph_nodes SET ${fields.join(", ")} WHERE id = $${idx++} AND project_id = $${idx++} RETURNING *;`;
    values.push(nodeId, projectId);
    
    const res = await this.query(queryStr, values);
    if (res.rowCount === 0) {
      throw new NotFoundError("Graph node to update not found.");
    }

    await this.emitAuditLog(
      projectId,
      actor,
      "UPDATE_GRAPH_NODE",
      "authorized",
      { node_id: nodeId },
      `Updated graph node attributes for ID: ${nodeId}`,
      nodeId
    );

    const row = res.rows[0];
    return {
      id: row.id,
      projectId: row.project_id,
      label: row.label,
      type: row.type,
      status: row.status,
      contextItemId: row.context_item_id,
      taskId: row.task_id,
      nodeIdentifier: row.node_identifier,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Deletes a graph node and all associated edges cleanly under project scope.
   */
  public async deleteNode(projectId: string, nodeId: string, actor = "system"): Promise<void> {
    await this.validateProjectScope(projectId);

    const isOwner = await this.validateNodeOwnership(projectId, nodeId);
    if (!isOwner) {
      await this.emitAuditLog(projectId, actor, "DENIED_CROSS_PROJECT", "denied_untrusted", { node_id: nodeId }, "Cross-project graph node deletion access denied.");
      throw new PermissionDeniedError("Requested graph node does not belong to specified project.");
    }

    // Delete edges referencing this node first sequentially
    await this.query(
      "DELETE FROM graph_edges WHERE project_id = $1 AND (source = $2 OR target = $2);",
      [projectId, nodeId]
    );

    // Delete node
    const res = await this.query(
      "DELETE FROM graph_nodes WHERE id = $1 AND project_id = $2 RETURNING id;",
      [nodeId, projectId]
    );

    if (res.rowCount === 0) {
      throw new NotFoundError("Graph node to delete not found.");
    }

    await this.emitAuditLog(
      projectId,
      actor,
      "DELETE_GRAPH_NODE",
      "authorized",
      { node_id: nodeId },
      `Deleted graph node and cascading links: ${nodeId}`,
      nodeId
    );
  }

  /**
   * Adds secure relationship edges between existing nodes.
   */
  public async createEdge(projectId: string, dto: CreateGraphEdgeDTO, actor = "system"): Promise<GraphEdge> {
    await this.validateProjectScope(projectId);

    // Validating source AND target node visibility under same project scope
    const sourceExists = await this.validateNodeOwnership(projectId, dto.source);
    const targetExists = await this.validateNodeOwnership(projectId, dto.target);

    if (!sourceExists || !targetExists) {
      await this.emitAuditLog(
        projectId,
        actor,
        "REJECT_GRAPH_RELATIONSHIP",
        "denied_untrusted",
        { source: dto.source, target: dto.target },
        "Relationship rejected. Source/target nodes must belong to the active project query."
      );
      throw new PermissionDeniedError("Invalid context boundary validation: Left/Right node coordinates out of bounds.");
    }

    const edgeId = dto.id || `edge_${crypto.randomUUID()}`;
    const weight = dto.weight !== undefined ? dto.weight : 1.0;
    const relationship = dto.relationship || dto.label;

    let cleanMetadata: Record<string, any> = {};
    if (dto.metadata) {
      try {
        const redactedStr = redactSecretLeaks(JSON.stringify(dto.metadata));
        cleanMetadata = JSON.parse(redactedStr);
      } catch {
        cleanMetadata = { redaction_error: "Serialization limits." };
      }
    }

    // Check duplicate first to make idempotent
    const checkDuplicate = await this.query(
      `SELECT id FROM graph_edges 
       WHERE project_id = $1 AND source = $2 AND target = $3 AND (label = $4 OR relationship = $5) LIMIT 1;`,
      [projectId, dto.source, dto.target, dto.label, relationship]
    );

    if (checkDuplicate.rowCount > 0) {
      const existingId = checkDuplicate.rows[0].id;
      // update weight & metadata instead, keeping stable edge configuration
      await this.query(
        `UPDATE graph_edges SET weight = $1, metadata = $2 WHERE id = $3;`,
        [weight, JSON.stringify(cleanMetadata), existingId]
      );
      return {
        id: existingId,
        projectId,
        source: dto.source,
        target: dto.target,
        label: dto.label,
        weight,
        relationship,
        metadata: cleanMetadata
      };
    }

    await this.query(
      `INSERT INTO graph_edges (id, project_id, source, target, label, weight, relationship, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW());`,
      [
        edgeId,
        projectId,
        dto.source,
        dto.target,
        dto.label,
        weight,
        relationship,
        JSON.stringify(cleanMetadata)
      ]
    );

    await this.emitAuditLog(
      projectId,
      actor,
      "CREATE_GRAPH_EDGE",
      "authorized",
      { edge_id: edgeId, source: dto.source, target: dto.target, relationship },
      `Added secure explicit relationship: ${dto.source} --[${relationship}]--> ${dto.target}`,
      edgeId
    );

    return {
      id: edgeId,
      projectId,
      source: dto.source,
      target: dto.target,
      label: dto.label,
      weight,
      relationship,
      metadata: cleanMetadata
    };
  }

  /**
   * Retrieves nodes and edges inside active project scope.
   */
  public async getGraph(
    projectId: string,
    filter?: { nodeType?: string; relationshipType?: string },
    actor = "system"
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    await this.validateProjectScope(projectId);

    // Fetch nodes
    let nodeSql = "SELECT * FROM graph_nodes WHERE project_id = $1";
    const nodeParams: any[] = [projectId];
    if (filter?.nodeType) {
      nodeSql += " AND type = $2";
      nodeParams.push(filter.nodeType);
    }
    const nodeRes = await this.query(nodeSql, nodeParams);

    // Fetch edges
    let edgeSql = "SELECT * FROM graph_edges WHERE project_id = $1";
    const edgeParams: any[] = [projectId];
    if (filter?.relationshipType) {
      edgeSql += " AND (label = $2 OR relationship = $2)";
      edgeParams.push(filter.relationshipType);
    }
    const edgeRes = await this.query(edgeSql, edgeParams);

    // Map rows cleanly to typed interfaces
    const nodes: GraphNode[] = nodeRes.rows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      label: row.label,
      type: row.type,
      status: row.status,
      contextItemId: row.context_item_id,
      taskId: row.task_id,
      nodeIdentifier: row.node_identifier,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    const edges: GraphEdge[] = edgeRes.rows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      source: row.source,
      target: row.target,
      label: row.label,
      weight: parseFloat(row.weight || 1.0),
      relationship: row.relationship || row.label,
      metadata: row.metadata,
      createdAt: row.created_at
    }));

    await this.emitAuditLog(
      projectId,
      actor,
      "READ_GRAPH",
      "authorized",
      { nodes_count: nodes.length, edges_count: edges.length },
      `Executed graph queries for project. Node count: ${nodes.length}`
    );

    return { nodes, edges };
  }

  /**
   * Retrieves nodes inside active project scope.
   */
  public async getNodes(projectId: string, type?: string): Promise<GraphNode[]> {
    const graph = await this.getGraph(projectId, { nodeType: type });
    return graph.nodes;
  }

  /**
   * Retrieves edges inside active project scope.
   */
  public async getEdges(projectId: string, relationship?: string): Promise<GraphEdge[]> {
    const graph = await this.getGraph(projectId, { relationshipType: relationship });
    return graph.edges;
  }

  /**
   * Returns a filtered sub-graph focusing purely on code, component, and schema dependencies.
   */
  public async getDependencyGraph(projectId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    await this.validateProjectScope(projectId);
    const graph = await this.getGraph(projectId);
    
    const dependencyRels = [
      "imports", "uses_component", "calls_api", "defines_api", 
      "defines_route", "references_route", "uses_table", "tests", 
      "documents_component", "references_design"
    ];
    
    const filteredEdges = graph.edges.filter(e => dependencyRels.includes(e.relationship || ""));
    const activeNodeIds = new Set<string>();
    filteredEdges.forEach(e => {
      activeNodeIds.add(e.source);
      activeNodeIds.add(e.target);
    });
    
    const filteredNodes = graph.nodes.filter(n => activeNodeIds.has(n.id) || n.type === "file");
    return { nodes: filteredNodes, edges: filteredEdges };
  }

  /**
   * Returns a localized sub-graph of dependencies centered around a specific Context Item.
   */
  public async getContextItemDependencies(projectId: string, contextItemId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    await this.validateProjectScope(projectId);
    
    // Find matching graph node
    const nodeRes = await this.query(
      "SELECT id FROM graph_nodes WHERE project_id = $1 AND context_item_id = $2 LIMIT 1;",
      [projectId, contextItemId]
    );
    if (nodeRes.rowCount === 0) {
      return { nodes: [], edges: [] };
    }
    const nodeId = nodeRes.rows[0].id;
    const graph = await this.getGraph(projectId);
    
    const dependencyRels = [
      "imports", "uses_component", "calls_api", "defines_api", 
      "defines_route", "references_route", "uses_table", "tests", 
      "documents_component", "references_design"
    ];
    
    const itemEdges = graph.edges.filter(e => 
      (e.source === nodeId || e.target === nodeId) && 
      dependencyRels.includes(e.relationship || "")
    );
    
    const connectedNodeIds = new Set<string>([nodeId]);
    itemEdges.forEach(e => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });
    
    const itemNodes = graph.nodes.filter(n => connectedNodeIds.has(n.id));
    return { nodes: itemNodes, edges: itemEdges };
  }

  /**
   * Syncs existing database project entities safely into graph nodes and relationship edges.
   * Runs sequentially, 100% database-isolated, with safe redactions.
   */
  public async syncGraphFoundation(
    projectId: string, 
    actor = "system", 
    ipAddress = "127.0.0.1"
  ): Promise<{ 
    nodesSynced: number; 
    edgesSynced: number;
    nodes_created: number;
    nodes_updated: number;
    edges_created: number;
    edges_skipped: number;
    warnings: string[];
  }> {
    await this.validateProjectScope(projectId);

    await this.emitAuditLog(
      projectId,
      actor,
      "SYNC_GRAPH_STARTED",
      "authorized",
      {},
      "Manual orchestration of Knowledge Graph Sync starting...",
      "",
      ipAddress
    );

    // Track detailed counters
    let nodes_created = 0;
    let nodes_updated = 0;
    let edges_created = 0;
    let edges_skipped = 0;
    const warnings: string[] = [];

    // Cache existing nodes to determine create vs. update counts
    const existingNodesRes = await this.query(
      "SELECT id, node_identifier FROM graph_nodes WHERE project_id = $1;", 
      [projectId]
    );
    const existingIdentifiers = new Set<string>();
    const existingNodeIds = new Set<string>();
    for (const r of existingNodesRes.rows) {
      existingIdentifiers.add(r.node_identifier);
      existingNodeIds.add(r.id);
    }

    // Cache existing edges to determine duplicates/skips
    const existingEdgesRes = await this.query(
      "SELECT source, target, relationship FROM graph_edges WHERE project_id = $1;", 
      [projectId]
    );
    const existingEdgeKeys = new Set<string>();
    for (const r of existingEdgesRes.rows) {
      existingEdgeKeys.add(`${r.source}:${r.target}:${r.relationship}`);
    }

    // Clear past dependency-specific edges to ensure a clean sync run of static relationships
    await this.query(
      `DELETE FROM graph_edges 
       WHERE project_id = $1 
         AND relationship IN ('imports', 'uses_component', 'calls_api', 'defines_api', 'defines_route', 'references_route', 'uses_table', 'tests', 'documents_component', 'references_design');`,
      [projectId]
    );

    let nodesSynced = 0;
    let edgesSynced = 0;

    // Helper to track node upsert activity
    const recordNodeUpsert = (id: string, identifier: string) => {
      if (existingNodeIds.has(id) || existingIdentifiers.has(identifier)) {
        nodes_updated++;
      } else {
        nodes_created++;
        existingNodeIds.add(id);
        existingIdentifiers.add(identifier);
      }
    };

    // Helper to track edge upsert activity
    const recordEdgeUpsert = (source: string, target: string, relationship: string) => {
      const key = `${source}:${target}:${relationship}`;
      if (existingEdgeKeys.has(key)) {
        edges_skipped++;
      } else {
        edges_created++;
        existingEdgeKeys.add(key);
      }
    };

    // -----------------------------------------------------
    // 1. Map Existing Context Vault items into Nodes
    // -----------------------------------------------------
    const itemsRes = await this.query(
      "SELECT id, source_type, source_uri, metadata_json FROM context_items WHERE project_id = $1;",
      [projectId]
    );

    // Keep an in-memory map of item_id -> graph_node_id to construct edges safely
    const itemToNodeMap = new Map<string, string>();
    const identifierToNodeMap = new Map<string, string>();

    for (const item of itemsRes.rows) {
      let nodeType: GraphNodeType = "doc";
      
      if (item.source_type === "code") {
        nodeType = "file" as GraphNodeType; // GRAPH-001 Files
      } else if (["markdown", "api_doc", "ux_spec", "design_spec"].includes(item.source_type)) {
        nodeType = "doc"; // GRAPH-002 Docs
      } else if (item.source_type === "decision_log") {
        nodeType = "decision"; // GRAPH-003 Decisions
      } else if (item.source_type === "test") {
        nodeType = "test"; // GRAPH-005 Tests
      } else if (item.source_type === "agent_session") {
        nodeType = "agent_session" as GraphNodeType; // GRAPH-007 Agent sessions
      } else if (["connected_tool_data", "external_repo_reference"].includes(item.source_type)) {
        nodeType = "connected_asset" as GraphNodeType; // GRAPH-008 Connected assets
      }

      const label = item.source_uri || "Unnamed Document";
      const nodeIdentifier = `${projectId}:${item.source_uri}`;
      
      recordNodeUpsert(item.id, nodeIdentifier);

      // Upsert node
      const node = await this.createNode(projectId, {
        id: item.id,
        projectId,
        label,
        type: nodeType,
        status: "active",
        contextItemId: item.id,
        nodeIdentifier,
        metadata: {
          original_source_type: item.source_type,
          ...item.metadata_json
        }
      }, actor);

      itemToNodeMap.set(item.id, node.id);
      identifierToNodeMap.set(nodeIdentifier, node.id);
      nodesSynced++;
    }

    // -----------------------------------------------------
    // 2. Map Existing Tasks into Nodes (GRAPH-004)
    // -----------------------------------------------------
    const tasksRes = await this.query(
      "SELECT id, title, category, risk_level, status FROM tasks WHERE project_id = $1;",
      [projectId]
    );

    const taskToNodeMap = new Map<string, string>();

    for (const task of tasksRes.rows) {
      const nodeIdentifier = `task:${task.id}`;
      recordNodeUpsert(task.id, nodeIdentifier);

      const node = await this.createNode(projectId, {
        id: task.id,
        projectId,
        label: task.title || "Unnamed Task",
        type: "task" as GraphNodeType,
        status: "active",
        taskId: task.id,
        nodeIdentifier,
        metadata: {
          task_category: task.category,
          task_risk_level: task.risk_level,
          task_status: task.status
        }
      }, actor);

      taskToNodeMap.set(task.id, node.id);
      identifierToNodeMap.set(nodeIdentifier, node.id);
      nodesSynced++;
    }

    // -----------------------------------------------------
    // 3. Map Context Packs and Explicit Relationships to Edges (GRAPH-009)
    // -----------------------------------------------------
    const packsRes = await this.query(
      `SELECT id, task_id, primary_files, related_files, related_docs, related_tests, related_decisions, related_connected_assets 
       FROM context_packs WHERE project_id = $1;`,
      [projectId]
    );

    for (const pack of packsRes.rows) {
      const taskNodeId = taskToNodeMap.get(pack.task_id);
      if (!taskNodeId) continue;

      const safeParseJson = (field: any): string[] => {
        if (!field) return [];
        if (Array.isArray(field)) return field;
        try {
          return typeof field === "string" ? JSON.parse(field) : field;
        } catch {
          return [];
        }
      };

      const primaries = safeParseJson(pack.primary_files);
      const relatedFiles = safeParseJson(pack.related_files);
      const relatedDocs = safeParseJson(pack.related_docs);
      const relatedTests = safeParseJson(pack.related_tests);
      const relatedDecisions = safeParseJson(pack.related_decisions);
      const relatedAssets = safeParseJson(pack.related_connected_assets);

      // Primary files: belongs_to
      for (const file of primaries) {
        const fileNodeId = identifierToNodeMap.get(`${projectId}:${file}`);
        if (fileNodeId) {
          recordEdgeUpsert(taskNodeId, fileNodeId, "belongs_to");
          await this.createEdge(projectId, {
            projectId,
            source: taskNodeId,
            target: fileNodeId,
            label: "belongs_to" as GraphEdgeLabelType,
            relationship: "belongs_to",
            weight: 1.5,
            metadata: { context_pack_id: pack.id, relation: "primary_code" }
          }, actor);
          edgesSynced++;
        }
      }

      // Related files: references
      for (const file of relatedFiles) {
        const fileNodeId = identifierToNodeMap.get(`${projectId}:${file}`);
        if (fileNodeId) {
          recordEdgeUpsert(taskNodeId, fileNodeId, "references");
          await this.createEdge(projectId, {
            projectId,
            source: taskNodeId,
            target: fileNodeId,
            label: "references" as GraphEdgeLabelType,
            relationship: "references",
            weight: 1.0,
            metadata: { context_pack_id: pack.id, relation: "related_code" }
          }, actor);
          edgesSynced++;
        }
      }

      // Related documentation: documents
      for (const doc of relatedDocs) {
        const docNodeId = identifierToNodeMap.get(`${projectId}:${doc}`);
        if (docNodeId) {
          recordEdgeUpsert(docNodeId, taskNodeId, "documents");
          await this.createEdge(projectId, {
            projectId,
            source: docNodeId,
            target: taskNodeId,
            label: "documents" as GraphEdgeLabelType,
            relationship: "documents",
            weight: 1.2,
            metadata: { context_pack_id: pack.id }
          }, actor);
          edgesSynced++;
        }
      }

      // Related tests: tests link
      for (const test of relatedTests) {
        const testNodeId = identifierToNodeMap.get(`${projectId}:${test}`);
        if (testNodeId) {
          recordEdgeUpsert(testNodeId, taskNodeId, "tests");
          await this.createEdge(projectId, {
            projectId,
            source: testNodeId,
            target: taskNodeId,
            label: "tests" as GraphEdgeLabelType,
            relationship: "tests",
            weight: 1.3,
            metadata: { context_pack_id: pack.id }
          }, actor);
          edgesSynced++;
        }
      }

      // Related decisions
      for (const decision of relatedDecisions) {
        const decNodeId = identifierToNodeMap.get(`${projectId}:${decision}`);
        if (decNodeId) {
          recordEdgeUpsert(taskNodeId, decNodeId, "derived_from");
          await this.createEdge(projectId, {
            projectId,
            source: taskNodeId,
            target: decNodeId,
            label: "derived_from" as GraphEdgeLabelType,
            relationship: "derived_from",
            weight: 1.1,
            metadata: { context_pack_id: pack.id }
          }, actor);
          edgesSynced++;
        }
      }

      // Related assets: connected_to
      for (const asset of relatedAssets) {
        const assetNodeId = identifierToNodeMap.get(`${projectId}:${asset}`);
        if (assetNodeId) {
          recordEdgeUpsert(taskNodeId, assetNodeId, "connected_to");
          await this.createEdge(projectId, {
            projectId,
            source: taskNodeId,
            target: assetNodeId,
            label: "connected_to" as GraphEdgeLabelType,
            relationship: "connected_to",
            weight: 1.0,
            metadata: { context_pack_id: pack.id }
          }, actor);
          edgesSynced++;
        }
      }
    }

    // -----------------------------------------------------
    // 4. Map Explicit Metadata Relationships
    // -----------------------------------------------------
    for (const item of itemsRes.rows) {
      const sourceNodeId = itemToNodeMap.get(item.id);
      if (!sourceNodeId) continue;

      const meta = item.metadata_json || {};
      const explicitRels = meta.explicit_relationships;
      
      if (Array.isArray(explicitRels)) {
        for (const rel of explicitRels) {
          if (rel && typeof rel === "object" && rel.target_uri && rel.relationship) {
            const targetNodeId = identifierToNodeMap.get(`${projectId}:${rel.target_uri}`);
            if (targetNodeId) {
              const labelMatched = [
                "references", "belongs_to", "documents", "tests", 
                "derived_from", "related_to", "created_by", "connected_to"
              ].includes(rel.relationship) 
                ? rel.relationship as GraphEdgeLabelType 
                : "related_to" as GraphEdgeLabelType;

              recordEdgeUpsert(sourceNodeId, targetNodeId, rel.relationship);
              await this.createEdge(projectId, {
                projectId,
                source: sourceNodeId,
                target: targetNodeId,
                label: labelMatched,
                relationship: rel.relationship,
                weight: 1.0,
                metadata: { source_item_id: item.id, explicit: true }
              }, actor);
              edgesSynced++;
            }
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 5. EXTRACT DEPENDENCY GRAPH FOUNDATION (regex/light parser static extraction)
    // -------------------------------------------------------------------------
    const chunksRes = await this.query(
      `SELECT context_item_id, chunk_index, content 
       FROM context_chunks 
       WHERE context_item_id IN (SELECT id FROM context_items WHERE project_id = $1)
       ORDER BY context_item_id, chunk_index ASC;`,
      [projectId]
    );

    // Assemble file contents statically in-memory
    const itemContents = new Map<string, string>();
    for (const chunk of chunksRes.rows) {
      const current = itemContents.get(chunk.context_item_id) || "";
      itemContents.set(chunk.context_item_id, current + chunk.content);
    }

    const regexParser = new MVPStaticExtractionParser();
    const astParser = new TypeScriptASTParser();
    const KNOWN_TABLES = [
      "projects", "memberships", "tasks", "context_items", "context_chunks", 
      "context_packs", "context_summaries", "durable_memories", "graph_nodes", 
      "graph_edges", "task_boundaries", "boundary_checks", "audit_logs", 
      "artifacts", "debug_logs", "connections"
    ];

    // Build map to find nodes matching filename as exported/symbol locations
    const filenameToNodeId = new Map<string, string>();
    for (const item of itemsRes.rows) {
      const parts = item.source_uri.split("/");
      const filenameWithExt = parts[parts.length - 1] || "";
      // Remove extension (e.g. Button.tsx -> Button)
      const baseName = filenameWithExt.replace(/\.[a-zA-Z0-9]+$/, "");
      const nodeId = itemToNodeMap.get(item.id);
      if (nodeId && baseName) {
        filenameToNodeId.set(baseName, nodeId);
      }
    }

    // Capture explicit exports for JSX component mappings
    const nodeExports = new Map<string, string[]>();

    // Pass 1: Extract basic exported symbols for code nodes & update node metadata
    for (const item of itemsRes.rows) {
      if (item.source_type !== "code" && item.source_type !== "test") continue;
      const content = itemContents.get(item.id) || "";
      if (!content) continue;

      const fileUri = item.source_uri || "";
      const isTsFile = fileUri.endsWith(".ts") || fileUri.endsWith(".tsx") || fileUri.endsWith(".ts.txt") || fileUri.endsWith(".tsx.txt");
      const parser = isTsFile ? astParser : regexParser;

      const exportsList = parser.parseExports(content);
      const nodeId = itemToNodeMap.get(item.id);
      if (nodeId && exportsList.length > 0) {
        nodeExports.set(nodeId, exportsList);
        
        // Save symbols into database node metadata (merge)
        const currentMeta = item.metadata_json || {};
        const freshMeta = {
          ...currentMeta,
          exports: exportsList,
          extraction_method: isTsFile ? "typescript_ast_mvp" : "regex_fallback"
        };
        await this.query(
          "UPDATE graph_nodes SET metadata = $1 WHERE id = $2;",
          [JSON.stringify(freshMeta), nodeId]
        );
        
        await this.emitAuditLog(
          projectId, actor, "EXPORT_SYMBOL_INDEXED", "authorized",
          { file_path: item.source_uri, export_count: exportsList.length },
          `Indexed ${exportsList.length} exported symbols for ${item.source_uri}`
        );
      }
    }

    // Pass 2: Map structural dependencies (Relative Imports, Package Imports, APIs, Routes, Tables, JSX components, Tests)
    for (const item of itemsRes.rows) {
      const sourceNodeId = itemToNodeMap.get(item.id);
      if (!sourceNodeId) continue;

      const content = itemContents.get(item.id) || "";
      if (!content) continue;

      const fileUri = item.source_uri || "";
      const isTsFile = fileUri.endsWith(".ts") || fileUri.endsWith(".tsx") || fileUri.endsWith(".ts.txt") || fileUri.endsWith(".tsx.txt");
      const parser = isTsFile ? astParser : regexParser;

      // --- GRAPH-010: Import relationship extraction ---
      if (item.source_type === "code" || item.source_type === "test") {
        const importsList = parser.parseImports(content);
        for (const rawImport of importsList) {
          if (rawImport.startsWith(".")) {
            // Resolve relative target uri
            const resolvedPath = resolveRelativePath(item.source_uri, rawImport);
            // Match in-memory context items
            const matchedTarget = itemsRes.rows.find((i: any) => {
              const u = i.source_uri;
              return u === resolvedPath ||
                     u === `${resolvedPath}.ts` ||
                     u === `${resolvedPath}.tsx` ||
                     u === `${resolvedPath}.js` ||
                     u === `${resolvedPath}.jsx` ||
                     u === `${resolvedPath}/index.ts` ||
                     u === `${resolvedPath}/index.tsx` ||
                     u === `${resolvedPath}/index.js` ||
                     u === `${resolvedPath}/index.jsx`;
            });

            if (matchedTarget) {
              const targetNodeId = itemToNodeMap.get(matchedTarget.id);
              if (targetNodeId && targetNodeId !== sourceNodeId) {
                recordEdgeUpsert(sourceNodeId, targetNodeId, "imports");
                await this.createEdge(projectId, {
                  projectId,
                  source: sourceNodeId,
                  target: targetNodeId,
                  label: "references" as GraphEdgeLabelType,
                  relationship: "imports",
                  weight: 1.0,
                  metadata: { resolved_import_path: matchedTarget.source_uri }
                }, actor);
                edgesSynced++;

                await this.emitAuditLog(
                  projectId, actor, "IMPORT_EDGE_CREATED", "authorized",
                  { from: item.source_uri, to: matchedTarget.source_uri },
                  `Created import edge from ${item.source_uri} to ${matchedTarget.source_uri}`
                );
              }
            } else {
              warnings.push(`Unresolved relative import: '${rawImport}' from '${item.source_uri}'`);
            }
          } else {
            // Package library import (e.g. @google/genai, express, pg)
            // Skip scanning Node SDK internals (like path, fs, crypto) for cleaner mapping
            const cleanPkg = rawImport.split("/")[0];
            if (["path", "fs", "crypto", "os", "http", "stream", "util"].includes(cleanPkg)) continue;

            const pkgNodeIdentifier = `${projectId}:package:${cleanPkg}`;
            const pkgNodeId = `pkg_${crypto.createHash("md5").update(pkgNodeIdentifier).digest("hex").substring(0, 11)}`;
            
            recordNodeUpsert(pkgNodeId, pkgNodeIdentifier);
            await this.createNode(projectId, {
              id: pkgNodeId,
              projectId,
              label: `${cleanPkg}`,
              type: "connected_asset" as GraphNodeType,
              status: "active",
              nodeIdentifier: pkgNodeIdentifier,
              metadata: { is_npm_package: true, package_name: cleanPkg }
            }, actor);

            recordEdgeUpsert(sourceNodeId, pkgNodeId, "imports");
            await this.createEdge(projectId, {
              projectId,
              source: sourceNodeId,
              target: pkgNodeId,
              label: "references" as GraphEdgeLabelType,
              relationship: "imports",
              weight: 0.5,
              metadata: { package_name: cleanPkg, is_external: true }
            }, actor);
            edgesSynced++;
          }
        }
      }

      // --- GRAPH-012: Component usage graph ---
      if (item.source_type === "code" && (item.source_uri.endsWith(".tsx") || item.source_uri.endsWith(".jsx") || content.includes("<"))) {
        const componentsUsed = parser.parseJSXComponents(content);
        for (const comp of componentsUsed) {
          // Find if there is a file exporting this component or matching its name
          let componentNodeId: string | undefined = undefined;
          
          // 1. Check exports metadata
          for (const [nodeId, exports] of nodeExports.entries()) {
            if (exports.includes(comp)) {
              componentNodeId = nodeId;
              break;
            }
          }

          // 2. Fallback to filename match
          if (!componentNodeId) {
            componentNodeId = filenameToNodeId.get(comp);
          }

          if (componentNodeId && componentNodeId !== sourceNodeId) {
            recordEdgeUpsert(sourceNodeId, componentNodeId, "uses_component");
            await this.createEdge(projectId, {
              projectId,
              source: sourceNodeId,
              target: componentNodeId,
              label: "references" as GraphEdgeLabelType,
              relationship: "uses_component",
              weight: 1.0,
              metadata: { component_name: comp }
            }, actor);
            edgesSynced++;
          }
        }
      }

      // --- GRAPH-013 & GRAPH-014: API Call / Route Definitions ---
      // 1. Definition scan (defines_route & defines_api)
      const isBackendFile = item.source_uri.includes("apps/api/") || item.source_uri.includes("server") || item.source_type === "code";
      if (isBackendFile) {
        const routesDefined = parser.parseRoutes(content);
        for (const r of routesDefined) {
          // Normalize path: prepend /api if route is in a sub-router mapping to /api
          const finalPath = r.path.startsWith("/api") ? r.path : `/api${r.path}`;
          const apiNodeIdentifier = `${projectId}:api:${r.method}:${finalPath}`;
          const apiNodeId = `api_${crypto.createHash("md5").update(apiNodeIdentifier).digest("hex").substring(0, 11)}`;

          recordNodeUpsert(apiNodeId, apiNodeIdentifier);
          await this.createNode(projectId, {
            id: apiNodeId,
            projectId,
            label: `${r.method.toUpperCase()} ${finalPath}`,
            type: "connected_asset" as GraphNodeType,
            status: "active",
            nodeIdentifier: apiNodeIdentifier,
            metadata: { method: r.method, path: finalPath, is_api_route: true }
          }, actor);

          // Creates "defines_api" and "defines_route" relationships
          recordEdgeUpsert(sourceNodeId, apiNodeId, "defines_api");
          await this.createEdge(projectId, {
            projectId,
            source: sourceNodeId,
            target: apiNodeId,
            label: "references" as GraphEdgeLabelType,
            relationship: "defines_api",
            weight: 1.2,
            metadata: { method: r.method, route: finalPath }
          }, actor);
          edgesSynced++;

          recordEdgeUpsert(sourceNodeId, apiNodeId, "defines_route");
          await this.createEdge(projectId, {
            projectId,
            source: sourceNodeId,
            target: apiNodeId,
            label: "references" as GraphEdgeLabelType,
            relationship: "defines_route",
            weight: 1.2,
            metadata: { method: r.method, route: finalPath }
          }, actor);
          edgesSynced++;

          await this.emitAuditLog(
            projectId, actor, "ROUTE_EDGE_CREATED", "authorized",
            { file: item.source_uri, method: r.method, route: finalPath },
            `Created route definition edge in ${item.source_uri} for ${r.method.toUpperCase()} ${finalPath}`
          );
        }
      }

      // 2. HTTP Call scan (calls_api & references_route)
      const apiCalls = parser.parseAPICalls(content);
      for (const call of apiCalls) {
        // Resolve target API route node
        const apiNodeIdentifier = `${projectId}:api:${call.method}:${call.path}`;
        const apiNodeId = `api_${crypto.createHash("md5").update(apiNodeIdentifier).digest("hex").substring(0, 11)}`;

        // Guarantee target API node exists
        recordNodeUpsert(apiNodeId, apiNodeIdentifier);
        await this.createNode(projectId, {
          id: apiNodeId,
          projectId,
          label: `${call.method.toUpperCase()} ${call.path}`,
          type: "connected_asset" as GraphNodeType,
          status: "active",
          nodeIdentifier: apiNodeIdentifier,
          metadata: { method: call.method, path: call.path, is_api_route: true }
        }, actor);

        recordEdgeUpsert(sourceNodeId, apiNodeId, "calls_api");
        await this.createEdge(projectId, {
          projectId,
          source: sourceNodeId,
          target: apiNodeId,
          label: "references" as GraphEdgeLabelType,
          relationship: "calls_api",
          weight: 1.0,
          metadata: { axios_or_fetch: true, target_path: call.path }
        }, actor);
        edgesSynced++;

        recordEdgeUpsert(sourceNodeId, apiNodeId, "references_route");
        await this.createEdge(projectId, {
          projectId,
          source: sourceNodeId,
          target: apiNodeId,
          label: "references" as GraphEdgeLabelType,
          relationship: "references_route",
          weight: 1.0,
          metadata: { target_path: call.path }
        }, actor);
        edgesSynced++;

        await this.emitAuditLog(
          projectId, actor, "API_CALL_EDGE_CREATED", "authorized",
          { file: item.source_uri, method: call.method, path: call.path },
          `Created API call edge from ${item.source_uri} calling endpoint ${call.method.toUpperCase()} ${call.path}`
        );
      }

      // --- GRAPH-015: Database usage graph ---
      const tablesUsed = parser.parseDatabaseTables(content, KNOWN_TABLES);
      for (const t of tablesUsed) {
        const tableNodeIdentifier = `${projectId}:table:${t}`;
        const tableNodeId = `tbl_${crypto.createHash("md5").update(tableNodeIdentifier).digest("hex").substring(0, 11)}`;

        recordNodeUpsert(tableNodeId, tableNodeIdentifier);
        await this.createNode(projectId, {
          id: tableNodeId,
          projectId,
          label: `Table: ${t}`,
          type: "connected_asset" as GraphNodeType,
          status: "active",
          nodeIdentifier: tableNodeIdentifier,
          metadata: { is_db_table: true, table_name: t }
        }, actor);

        recordEdgeUpsert(sourceNodeId, tableNodeId, "uses_table");
        await this.createEdge(projectId, {
          projectId,
          source: sourceNodeId,
          target: tableNodeId,
          label: "connected_to" as GraphEdgeLabelType,
          relationship: "uses_table",
          weight: 1.0,
          metadata: { referenced_table: t }
        }, actor);
        edgesSynced++;

        await this.emitAuditLog(
          projectId, actor, "DATABASE_USAGE_EDGE_CREATED", "authorized",
          { file: item.source_uri, table: t },
          `Created database table usage edge: ${item.source_uri} uses table '${t}'`
        );
      }

      // --- GRAPH-016: Test coverage graph ---
      const looksLikeTestFile = item.source_type === "test" || 
                               item.source_uri.includes(".test.") || 
                               item.source_uri.includes(".spec.") || 
                               item.source_uri.includes("tests/");
      if (looksLikeTestFile) {
        // Find match candidate code files
        const parts = item.source_uri.split("/");
        const testFilename = parts[parts.length - 1] || "";
        const cleanTestBase = testFilename.replace(/\.(test|spec)\.[a-zA-Z0-9]+$/, "");

        for (const potentialSource of itemsRes.rows) {
          if (potentialSource.source_type !== "code") continue;
          const targetNodeId = itemToNodeMap.get(potentialSource.id);
          if (!targetNodeId || targetNodeId === sourceNodeId) continue;

          let matched = false;
          let confidence = 0.5;
          let matchRule = "";

          // 1. Explicit Import match (e.g. test file imports "./auth" and code is auth.ts)
          const explicitImportsList = parser.parseImports(content);
          for (const rawImp of explicitImportsList) {
            if (rawImp.startsWith(".")) {
              const resImpPath = resolveRelativePath(item.source_uri, rawImp);
              if (potentialSource.source_uri.startsWith(resImpPath)) {
                matched = true;
                confidence = 1.0;
                matchRule = "explicit_import_reference";
                break;
              }
            }
          }

          // 2. Exact Filename Similarity match (e.g. auth.test.ts vs auth.ts)
          if (!matched) {
            const srcParts = potentialSource.source_uri.split("/");
            const srcFilename = srcParts[srcParts.length - 1] || "";
            const cleanSrcBase = srcFilename.replace(/\.[a-zA-Z0-9]+$/, "");
            if (cleanSrcBase && cleanTestBase && cleanSrcBase.toLowerCase() === cleanTestBase.toLowerCase()) {
              matched = true;
              confidence = 0.9;
              matchRule = "filename_similarity";
            }
          }

          // 3. Folder/Path match (e.g. src/auth/auth.test.ts and src/auth/helper.ts)
          if (!matched) {
            const testDir = parts.slice(0, -1).join("/");
            const srcDir = potentialSource.source_uri.split("/").slice(0, -1).join("/");
            if (testDir && srcDir && testDir === srcDir) {
              matched = true;
              confidence = 0.7;
              matchRule = "folder_co_location";
            }
          }

          if (matched) {
            recordEdgeUpsert(sourceNodeId, targetNodeId, "tests");
            await this.createEdge(projectId, {
              projectId,
              source: sourceNodeId, // test source tests the core target
              target: targetNodeId,
              label: "tests" as GraphEdgeLabelType,
              relationship: "tests",
              weight: 1.3,
              metadata: { test_file: item.source_uri, source_file: potentialSource.source_uri, confidence, rule: matchRule }
            }, actor);
            edgesSynced++;

            await this.emitAuditLog(
              projectId, actor, "TEST_COVERAGE_EDGE_CREATED", "authorized",
              { test: item.source_uri, source: potentialSource.source_uri, confidence, rule: matchRule },
              `Tested core asset: test '${item.source_uri}' mapped to source '${potentialSource.source_uri}' (${confidence * 100}% confidence)`
            );
          }
        }
      }

      // --- GRAPH-017: Design component graph ---
      const isDesignDoc = item.source_type === "design_spec" || item.source_type === "ux_spec";
      if (isDesignDoc) {
        // Inspect other files as component candidate files
        for (const potentialComp of itemsRes.rows) {
          if (potentialComp.source_type !== "code") continue;
          
          const targetNodeId = itemToNodeMap.get(potentialComp.id);
          if (!targetNodeId) continue;

          const pParts = potentialComp.source_uri.split("/");
          const pFilename = pParts[pParts.length - 1] || "";
          const pBaseName = pFilename.replace(/\.[a-zA-Z0-9]+$/, ""); // (e.g. Button)

          const fileMentioned = content.includes(potentialComp.source_uri) || 
                                (pBaseName && content.includes(pBaseName));

          if (fileMentioned) {
            // Document node references components (documents_component)
            recordEdgeUpsert(sourceNodeId, targetNodeId, "documents_component");
            await this.createEdge(projectId, {
              projectId,
              source: sourceNodeId,
              target: targetNodeId,
              label: "documents" as GraphEdgeLabelType,
              relationship: "documents_component",
              weight: 1.2,
              metadata: { doc_path: item.source_uri, component_path: potentialComp.source_uri }
            }, actor);
            edgesSynced++;

            // Component node points back to designs (references_design)
            recordEdgeUpsert(targetNodeId, sourceNodeId, "references_design");
            await this.createEdge(projectId, {
              projectId,
              source: targetNodeId,
              target: sourceNodeId,
              label: "references" as GraphEdgeLabelType,
              relationship: "references_design",
              weight: 1.2,
              metadata: { doc_path: item.source_uri, component_path: potentialComp.source_uri }
            }, actor);
            edgesSynced++;

            await this.emitAuditLog(
              projectId, actor, "DESIGN_COMPONENT_EDGE_CREATED", "authorized",
              { design_doc: item.source_uri, UI_component: potentialComp.source_uri },
              `Linked UX/Design documentation references: document '${item.source_uri}' linked to UI component '${potentialComp.source_uri}'`
            );
          }
        }
      }
    }

    await this.emitAuditLog(
      projectId,
      actor,
      "SYNC_GRAPH_COMPLETED",
      "authorized",
      { 
        nodes_synced: nodesSynced, 
        edges_synced: edgesSynced,
        nodes_created,
        nodes_updated,
        edges_created,
        edges_skipped
      },
      `Knowledge Graph Foundation Sync complete! Synthesized ${nodesSynced} nodes and ${edgesSynced} edges.`,
      "",
      ipAddress
    );

    return { 
      nodesSynced, 
      edgesSynced,
      nodes_created,
      nodes_updated,
      edges_created,
      edges_skipped,
      warnings
    };
  }

  /**
   * Performs reverse dependency analysis to discover which nodes "used by" or depend on a target file or context item.
   */
  public async getReverseDependencies(
    projectId: string,
    params: { contextItemId?: string; path?: string; relationshipFilters?: string[] },
    actor = "system"
  ): Promise<{
    target: Partial<GraphNode> | null;
    used_by: Array<{
      node: GraphNode;
      relationship_type: string;
      confidence: number;
    }>;
    relationship_types: string[];
    confidence: number;
    warnings: string[];
  }> {
    await this.validateProjectScope(projectId);

    const { contextItemId, path: targetPath, relationshipFilters } = params;
    
    // 1. Locate the target node
    let targetNode: GraphNode | null = null;
    if (contextItemId) {
      const res = await this.query(
        "SELECT * FROM graph_nodes WHERE project_id = $1 AND (context_item_id = $2 OR id = $2 OR node_identifier = $2) LIMIT 1;",
        [projectId, contextItemId]
      );
      if (res.rowCount > 0) {
        targetNode = this.mapRowToNode(res.rows[0]);
      }
    }
    
    if (!targetNode && targetPath) {
      const res = await this.query(
        "SELECT * FROM graph_nodes WHERE project_id = $1 AND (node_identifier = $2 OR label = $2 OR id = $2) LIMIT 1;",
        [projectId, targetPath]
      );
      if (res.rowCount > 0) {
        targetNode = this.mapRowToNode(res.rows[0]);
      } else {
        // Fallback suffix match for paths (e.g. apps/web/src/App.tsx matching node ending with App.tsx)
        const allNodes = await this.getNodes(projectId);
        targetNode = allNodes.find(n => 
          n.nodeIdentifier?.endsWith(targetPath) || 
          n.label?.endsWith(targetPath) ||
          targetPath.endsWith(n.label)
        ) || null;
      }
    }

    if (!targetNode) {
      await this.emitAuditLog(
        projectId,
        actor,
        "REVERSE_LOOKUP_NOT_FOUND",
        "authorized",
        { contextItemId, path: targetPath },
        "Reverse dependency lookup target node not found.",
        contextItemId || targetPath || ""
      );
      return {
        target: null,
        used_by: [],
        relationship_types: [],
        confidence: 0,
        warnings: ["Target node could not be identified inside the Project Graph."]
      };
    }

    // Emit Audit log
    await this.emitAuditLog(
      projectId,
      actor,
      "REVERSE_LOOKUP_EXECUTED",
      "authorized",
      { nodeId: targetNode.id, label: targetNode.label },
      `Executed reverse dependency analysis for ${targetNode.label}`,
      targetNode.id
    );

    // Fetch entire graph edges to trace reverse relationships
    const { nodes, edges } = await this.getGraph(projectId);
    
    // Find edges where target is OUR selected node
    const reverseEdges = edges.filter(e => e.target === targetNode!.id);
    
    const used_by: Array<{ node: GraphNode; relationship_type: string; confidence: number }> = [];
    const relationship_types = new Set<string>();
    const warnings: string[] = [];

    for (const edge of reverseEdges) {
      const srcNode = nodes.find(n => n.id === edge.source);
      if (!srcNode) continue;

      // Map the edge relationship label to a reverse label
      let revRelStr = "used_by";
      if (edge.relationship === "imports") {
        revRelStr = "imported_by";
      } else if (edge.relationship === "uses_component") {
        revRelStr = "used_by_component";
      } else if (edge.relationship === "calls_api") {
        revRelStr = "called_by_api_client";
      } else if (edge.relationship === "defines_api" || edge.relationship === "defines_route" || edge.relationship === "references_route") {
        revRelStr = "referenced_by_route";
      } else if (edge.relationship === "tests") {
        revRelStr = "tested_by";
      } else if (edge.relationship === "documents_component" || edge.relationship === "documents") {
        revRelStr = "documented_by";
      } else if (edge.relationship === "references_design") {
        revRelStr = "referenced_by_design";
      } else if (edge.relationship === "belongs_to") {
        revRelStr = "referenced_by_decision";
      }

      if (relationshipFilters && relationshipFilters.length > 0 && !relationshipFilters.includes(revRelStr)) {
        continue;
      }

      relationship_types.add(revRelStr);
      used_by.push({
        node: srcNode,
        relationship_type: revRelStr,
        confidence: 1.0 // Direct edges in the persisted graph are highly trusted
      });
    }

    // Heuristic lookup for hooks (starts with use) for GRAPH-020
    const lowercaseLabel = (targetNode.label || "").toLowerCase();
    const isHook = lowercaseLabel.startsWith("use") || lowercaseLabel.includes("/use");
    if (isHook) {
      // Find callers of this hook (files importing or containing mentions)
      for (const node of nodes) {
        if (node.id === targetNode.id) continue;
        const exportsList = node.metadata?.exports || [];
        const importsList = node.metadata?.imports || [];
        
        // If file explicitly imports targetNode file and mentions targetNode label
        const importsTarget = importsList.some((imp: string) => 
          imp.includes(targetNode!.label) || (targetNode!.nodeIdentifier && imp.includes(targetNode!.nodeIdentifier))
        );
        if (importsTarget && !used_by.some(u => u.node.id === node.id)) {
          relationship_types.add("used_by_component");
          used_by.push({
            node,
            relationship_type: "used_by_component",
            confidence: 0.85 // Path/import level confidence
          });
        }
      }
    }

    // Static test-warning validation: Check if target has explicit tests
    const hasTests = used_by.some(u => u.relationship_type === "tested_by" || u.node.type === "test");
    if (!hasTests && (targetNode.type === "code" as any || targetNode.type === "file" as any)) {
      warnings.push(`No associated tests detected verifying code file '${targetNode.label}'.`);
      await this.emitAuditLog(
        projectId,
        actor,
        "DEPENDENT_TESTS_MISSING",
        "authorized",
        { targetId: targetNode.id, label: targetNode.label },
        `WARNING: No dependent tests found for active code element ${targetNode.label}`
      );
    }

    // Static doc-warning validation: Check if target has documentation
    const hasDocs = used_by.some(u => u.relationship_type === "documented_by" || u.node.type === "doc");
    if (!hasDocs && (targetNode.type === "code" as any || targetNode.type === "file" as any)) {
      warnings.push(`No linked documentation markdown or architectural log files matching '${targetNode.label}'.`);
      await this.emitAuditLog(
        projectId,
        actor,
        "DEPENDENT_DOCS_MISSING",
        "authorized",
        { targetId: targetNode.id, label: targetNode.label },
        `WARNING: No dependent docs found for core resource ${targetNode.label}`
      );
    }

    // Confidence calculation: Average of direct used_by confidence, or 0 if none
    const overallConfidence = used_by.length > 0
      ? Number((used_by.reduce((sum, u) => sum + u.confidence, 0) / used_by.length).toFixed(2))
      : 0;

    return {
      target: targetNode,
      used_by,
      relationship_types: Array.from(relationship_types),
      confidence: overallConfidence,
      warnings
    };
  }

  /**
   * Generates a structural change impact preview showing affected parts of the system.
   */
  public async generateImpactPreview(
    projectId: string,
    params: { changed_files: string[]; include_indirect?: boolean; max_depth?: number },
    actor = "system"
  ): Promise<{
    project_id: string;
    changed_files: string[];
    affected_files: string[];
    affected_pages: string[];
    affected_tests: string[];
    affected_docs: string[];
    affected_components: string[];
    affected_hooks: string[];
    warnings: string[];
    confidence_score: number;
  }> {
    await this.validateProjectScope(projectId);

    const { changed_files, include_indirect = false, max_depth = 1 } = params;
    
    const affected_files = new Set<string>();
    const affected_pages = new Set<string>();
    const affected_tests = new Set<string>();
    const affected_docs = new Set<string>();
    const affected_components = new Set<string>();
    const affected_hooks = new Set<string>();
    const warnings: string[] = [];

    await this.emitAuditLog(
      projectId,
      actor,
      "IMPACT_PREVIEW_EXECUTED",
      "authorized",
      { changed_files, include_indirect, max_depth },
      `Constructing change impact preview for ${changed_files.length} mutated files.`
    );

    for (const filePath of changed_files) {
      const res = await this.getReverseDependencies(projectId, { path: filePath }, actor);
      
      if (!res.target) {
        warnings.push(`File '${filePath}' was not found in active graph representation.`);
        continue;
      }

      // Collect direct dependents
      for (const dep of res.used_by) {
        const depNode = dep.node;
        const depPath = depNode.label || depNode.nodeIdentifier || "";
        
        affected_files.add(depPath);

        // Group dependents by type (GRAPH-018 to GRAPH-023)
        // GRAPH-019 Parent Component
        if (dep.relationship_type === "used_by_component" || depNode.type === "code" as any || depNode.type === "file" as any) {
          affected_components.add(depPath);
        }
        
        // GRAPH-020 Consumer Hooks
        const depLabelLower = (depNode.label || "").toLowerCase();
        if (depLabelLower.startsWith("use") || depLabelLower.includes("/use")) {
          affected_hooks.add(depPath);
        }

        // GRAPH-022 Dependent Tests
        if (dep.relationship_type === "tested_by" || depNode.type === "test" || depPath.includes(".test.") || depPath.includes("tests/")) {
          affected_tests.add(depPath);
        }

        // GRAPH-023 Dependent Docs
        if (dep.relationship_type === "documented_by" || depNode.type === "doc" || depPath.endsWith(".md")) {
          affected_docs.add(depPath);
        }

        // GRAPH-021 Dependent Pages (heuristics check: pages/**, app/**, routes/**, src/routes/**, apps/web/src/**)
        const isPage = depPath.includes("pages/") || 
                       depPath.includes("app/") || 
                       depPath.includes("routes/") || 
                       depPath.includes("src/routes/");
        if (isPage) {
          affected_pages.add(depPath);
        }
      }

      // Handle indirect dependencies sequentially if include_indirect && max_depth > 1
      if (include_indirect && max_depth > 1) {
        let currentQueue = res.used_by.map(u => u.node);
        const visited = new Set<string>([res.target.id!]);
        currentQueue.forEach(v => visited.add(v.id));

        for (let depth = 1; depth < max_depth; depth++) {
          const nextQueue: GraphNode[] = [];
          for (const node of currentQueue) {
            const nodeRes = await this.getReverseDependencies(projectId, { contextItemId: node.contextItemId || node.id }, actor);
            for (const subDep of nodeRes.used_by) {
              const subNode = subDep.node;
              if (!visited.has(subNode.id)) {
                visited.add(subNode.id);
                nextQueue.push(subNode);

                const subPath = subNode.label || subNode.nodeIdentifier || "";
                affected_files.add(subPath);

                if (subDep.relationship_type === "used_by_component" || subNode.type === "code" as any || subNode.type === "file" as any) {
                  affected_components.add(subPath);
                }
                if (subPath.match(/\buse[A-Z]/) || subPath.includes("/use")) {
                  affected_hooks.add(subPath);
                }
                if (subDep.relationship_type === "tested_by" || subNode.type === "test" || subPath.includes(".test.") || subPath.includes("tests/")) {
                  affected_tests.add(subPath);
                }
                if (subDep.relationship_type === "documented_by" || subNode.type === "doc" || subPath.endsWith(".md")) {
                  affected_docs.add(subPath);
                }
                const isSubPage = subPath.includes("pages/") || 
                                  subPath.includes("app/") || 
                                  subPath.includes("routes/") || 
                                  subPath.includes("src/routes/");
                if (isSubPage) {
                  affected_pages.add(subPath);
                }
              }
            }
          }
          currentQueue = nextQueue;
          if (currentQueue.length === 0) break;
        }
      }
    }

    const hasAnyTest = affected_tests.size > 0;
    if (!hasAnyTest && changed_files.length > 0) {
      await this.emitAuditLog(
        projectId,
        actor,
        "DEPENDENT_TESTS_MISSING",
        "authorized",
        { changed_files },
        "WARNING: Impact preview has no test coverage linkages.",
        ""
      );
    }
    const hasAnyDoc = affected_docs.size > 0;
    if (!hasAnyDoc && changed_files.length > 0) {
      await this.emitAuditLog(
        projectId,
        actor,
        "DEPENDENT_DOCS_MISSING",
        "authorized",
        { changed_files },
        "WARNING: Impact preview has no documentation reference linkages.",
        ""
      );
    }

    // Determine overall confidence
    let confidence_score = 1.0;
    if (warnings.length > 0) {
      confidence_score = 0.5; // low confidence if some files were not found
      await this.emitAuditLog(
        projectId,
        actor,
        "LOW_CONFIDENCE_IMPACT_PREVIEW",
        "authorized",
        { warning_count: warnings.length },
        "LOW_CONFIDENCE: Synthesized impact preview with outstanding path mismatch warnings."
      );
    }

    return {
      project_id: projectId,
      changed_files,
      affected_files: Array.from(affected_files),
      affected_pages: Array.from(affected_pages),
      affected_tests: Array.from(affected_tests),
      affected_docs: Array.from(affected_docs),
      affected_components: Array.from(affected_components),
      affected_hooks: Array.from(affected_hooks),
      warnings,
      confidence_score
    };
  }

  /**
   * Generates and registers an Impact Analysis report for changed files in a project.
   */
  public async generateImpactAnalysis(
    projectId: string,
    params: {
      changed_files: string[];
      change_type?: string;
      include_indirect?: boolean;
      max_depth?: number;
      task_id?: string;
    },
    actor = "system"
  ): Promise<{
    id: string;
    project_id: string;
    task_id?: string;
    changed_files: string[];
    affected_files: string[];
    affected_tests: string[];
    affected_docs: string[];
    affected_routes: string[];
    affected_apis: string[];
    affected_database_rules: string[];
    affected_ui_components: string[];
    affected_prototypes: string[];
    risk_by_file: Array<{
      file: string;
      risk: "low" | "medium" | "high" | "critical";
      reasons: string[];
    }>;
    overall_risk: "low" | "medium" | "high" | "critical";
    warnings: string[];
    recommendations: string[];
    confidence_score: number;
    created_at?: string;
  }> {
    await this.validateProjectScope(projectId);

    const { changed_files, change_type = "unknown", include_indirect = false, max_depth = 1 } = params;

    const affected_files = new Set<string>();
    const affected_tests = new Set<string>();
    const affected_docs = new Set<string>();
    const affected_routes = new Set<string>();
    const affected_apis = new Set<string>();
    const affected_database_rules = new Set<string>();
    const affected_ui_components = new Set<string>();
    const affected_prototypes = new Set<string>();

    const warnings: string[] = [];
    const recommendations: string[] = [];
    const risk_by_file: Array<{
      file: string;
      risk: "low" | "medium" | "high" | "critical";
      reasons: string[];
    }> = [];

    let hasHighRiskDetected = false;
    let hasCriticalRiskDetected = false;
    let missingTestsWarningGenerated = false;
    let missingDocsWarningGenerated = false;
    let boundaryViolationIncluded = false;

    // Emit initial audit log
    await this.emitAuditLog(
      projectId,
      actor,
      "IMPACT_ANALYSIS_REQUESTED",
      "authorized",
      { changed_files, change_type, include_indirect, max_depth },
      `Initiating Phase 9 Change Impact Analysis for ${changed_files.length} paths.`
    );

    // Load active task boundaries for scope validation (GRAPH-024)
    const boundaryRes = await this.query(
      "SELECT * FROM task_boundaries WHERE project_id = $1 AND status = 'active' LIMIT 1;",
      [projectId]
    );
    const boundary = boundaryRes.rowCount > 0 ? boundaryRes.rows[0] : null;

    for (const filePath of changed_files) {
      const normalizedPath = filePath.trim().replace(/\\/g, "/");
      const domain = this.detectLocalDomain(normalizedPath);

      const fileReasons: string[] = [];
      let fileRisk: "low" | "medium" | "high" | "critical" = "low";

      // 1. Boundary & Safety enforcement checks
      if (boundary) {
        // Forbidden files/patterns
        const isExactForbidden = (boundary.forbidden_files || []).some((ff: string) => ff === normalizedPath || (ff.startsWith("/") && ff.substring(1) === normalizedPath));
        const isPatternForbidden = (boundary.forbidden_patterns || []).some((fp: string) => this.matchLocalGlob(normalizedPath, fp));
        if (isExactForbidden || isPatternForbidden) {
          fileRisk = "critical";
          fileReasons.push("BOUNDARY_VIOLATION");
          hasCriticalRiskDetected = true;
          boundaryViolationIncluded = true;
          warnings.push(`File path '${normalizedPath}' violates strict forbidden boundary rules.`);
          recommendations.push(`Immediately revert proposed changes to the blocked file: '${normalizedPath}'.`);
        }

        // Forbidden domains
        if ((boundary.forbidden_domains || []).includes(domain)) {
          if (fileRisk !== "critical") fileRisk = "high";
          fileReasons.push("BOUNDARY_VIOLATION");
          hasHighRiskDetected = true;
          boundaryViolationIncluded = true;
          warnings.push(`File path '${normalizedPath}' belongs to a forbidden domain: '${domain}'.`);
        }

        // Locked boundaries task checks
        const isExplicitlyAllowed = (boundary.allowed_files || []).includes(normalizedPath);
        const isPatternAllowed = (boundary.allowed_patterns || []).some((ap: string) => this.matchLocalGlob(normalizedPath, ap));
        if (boundary.status === "locked" && !isExplicitlyAllowed && !isPatternAllowed) {
          if (fileRisk === "low") fileRisk = "medium";
          fileReasons.push("OUT_OF_SCOPE_LOCK");
          warnings.push(`File path '${normalizedPath}' is outside locked task scope.`);
        }
      }

      // Check for secret bearing files
      const isEnvOrSecretFile = normalizedPath.includes(".env") || normalizedPath.includes("credentials") || normalizedPath.includes("secrets.json") || normalizedPath.endsWith(".pem") || normalizedPath.endsWith(".key");
      if (isEnvOrSecretFile) {
        fileRisk = "critical";
        if (!fileReasons.includes("SECRET_SENSITIVE_PATH")) {
          fileReasons.push("SECRET_SENSITIVE_PATH");
        }
        hasCriticalRiskDetected = true;
        warnings.push(`File path '${normalizedPath}' matches secret scan signature paths.`);
      }

      // 2. Resolve nodes in context vault / graph
      const nodeRes = await this.query(
        "SELECT * FROM graph_nodes WHERE project_id = $1 AND (node_identifier = $2 OR label = $2) LIMIT 1;",
        [projectId, normalizedPath]
      );
      let targetNode = nodeRes.rowCount > 0 ? this.mapRowToNode(nodeRes.rows[0]) : null;

      if (!targetNode) {
        // Look up by suffix match or context items as fallback (GRAPH-024)
        const ctxRes = await this.query(
          "SELECT * FROM context_items WHERE project_id = $1 AND source_uri = $2 LIMIT 1;",
          [projectId, normalizedPath]
        );
        if (ctxRes.rowCount > 0) {
          targetNode = {
            id: ctxRes.rows[0].id,
            projectId,
            label: ctxRes.rows[0].source_uri,
            type: ctxRes.rows[0].source_type,
            status: "active",
            metadata: ctxRes.rows[0].metadata_json
          };
        } else {
          // File is unknown or unindexed
          warnings.push(`File '${normalizedPath}' was not found in active graph representation.`);
          fileReasons.push("UNKNOWN_FILE_NOT_INDEXED");
          if (fileRisk === "low") fileRisk = "medium";
        }
      }

      // 3. Trace Dependencies
      const directDependents: any[] = [];
      if (targetNode) {
        const revRes = await this.getReverseDependencies(projectId, { path: normalizedPath }, actor);
        
        // Analyze direct used_by nodes
        for (const dep of revRes.used_by) {
          const depNode = dep.node;
          const depPath = depNode.label || depNode.nodeIdentifier || "";
          affected_files.add(depPath);
          directDependents.push(depNode);

          // Classify Direct Entities
          // Tests
          if (dep.relationship_type === "tested_by" || (depNode.type as string) === "test" || depPath.includes(".test.") || depPath.includes("tests/")) {
            affected_tests.add(depPath);
          }
          // Docs
          if (dep.relationship_type === "documented_by" || (depNode.type as string) === "doc" || depPath.endsWith(".md") || depPath.includes("docs/") || (depNode.type as string) === "api_doc" || (depNode.type as string) === "ux_spec" || (depNode.type as string) === "design_spec" || (depNode.type as string) === "decision_log") {
            affected_docs.add(depPath);
          }
          // Routes / Pages
          if (dep.relationship_type === "references_route" || dep.relationship_type === "defines_route" || depPath.includes("pages/") || depPath.includes("app/") || depPath.includes("routes/") || depPath.includes("src/routes/")) {
            affected_routes.add(depPath);
          }
          // APIs
          if (dep.relationship_type === "calls_api" || dep.relationship_type === "defines_api" || depPath.includes("api/") || depPath.includes("endpoints/")) {
            affected_apis.add(depPath);
          }
          // DB
          if (dep.relationship_type === "uses_table" || depPath.includes("migration") || depPath.includes("schema") || depPath.includes("db.ts") || depPath.includes("database")) {
            affected_database_rules.add(depPath);
          }
          // UI Components
          if (dep.relationship_type === "used_by_component" || dep.relationship_type === "uses_component" || (depNode.type as string) === "component" || depPath.includes("components/") || depPath.includes("src/ui/")) {
            affected_ui_components.add(depPath);
          }
          // Prototypes
          if (dep.relationship_type === "references_design" || dep.relationship_type === "documents_component" || (depNode.type as string) === "design_spec" || (depNode.type as string) === "ux_spec" || depPath.includes("prototype")) {
            affected_prototypes.add(depPath);
          }
        }

        // BFS traversal for indirect elements (GRAPH-025)
        if (include_indirect && max_depth > 1) {
          let currentQueue = [...directDependents];
          const visited = new Set<string>([targetNode.id!]);
          currentQueue.forEach(n => visited.add(n.id!));

          for (let depth = 1; depth < max_depth; depth++) {
            const nextQueue: GraphNode[] = [];
            for (const node of currentQueue) {
              const nodeRes = await this.getReverseDependencies(projectId, { contextItemId: node.id }, actor);
              for (const subDep of nodeRes.used_by) {
                const subNode = subDep.node;
                if (!visited.has(subNode.id!)) {
                  visited.add(subNode.id!);
                  nextQueue.push(subNode);

                  const subPath = subNode.label || subNode.nodeIdentifier || "";
                  affected_files.add(subPath);

                  // Classify Indirect Entities
                  if (subDep.relationship_type === "tested_by" || (subNode.type as string) === "test" || subPath.includes(".test.") || subPath.includes("tests/")) {
                    affected_tests.add(subPath);
                  }
                  if (subDep.relationship_type === "documented_by" || (subNode.type as string) === "doc" || subPath.endsWith(".md") || subPath.includes("docs/") || (subNode.type as string) === "api_doc" || (subNode.type as string) === "ux_spec" || (subNode.type as string) === "design_spec" || (subNode.type as string) === "decision_log") {
                    affected_docs.add(subPath);
                  }
                  if (subDep.relationship_type === "references_route" || subDep.relationship_type === "defines_route" || subPath.includes("pages/") || subPath.includes("app/") || subPath.includes("routes/") || subPath.includes("src/routes/")) {
                    affected_routes.add(subPath);
                  }
                  if (subDep.relationship_type === "calls_api" || subDep.relationship_type === "defines_api" || subPath.includes("api/") || subPath.includes("endpoints/")) {
                    affected_apis.add(subPath);
                  }
                  if (subDep.relationship_type === "uses_table" || subPath.includes("migration") || subPath.includes("schema") || subPath.includes("db.ts") || subPath.includes("database")) {
                    affected_database_rules.add(subPath);
                  }
                  if (subDep.relationship_type === "used_by_component" || subDep.relationship_type === "uses_component" || (subNode.type as string) === "component" || subPath.includes("components/") || subPath.includes("src/ui/")) {
                    affected_ui_components.add(subPath);
                  }
                  if (subDep.relationship_type === "references_design" || subDep.relationship_type === "documents_component" || (subNode.type as string) === "design_spec" || (subNode.type as string) === "ux_spec" || subPath.includes("prototype")) {
                    affected_prototypes.add(subPath);
                  }
                }
              }
            }
            currentQueue = nextQueue;
            if (currentQueue.length === 0) break;
          }
        }
      }

      // Check DB schemas / migration (GRAPH-030 & GRAPH-033)
      const isDbImpact = normalizedPath.includes("migration") || normalizedPath.includes("schema") || normalizedPath.includes("db.ts") || normalizedPath.includes("database") || domain === "database" || affected_database_rules.size > 0;
      if (isDbImpact) {
        if (fileRisk !== "critical") fileRisk = "high";
        if (!fileReasons.includes("DATABASE_MIGRATION_IMPACT")) {
          fileReasons.push("DATABASE_MIGRATION_IMPACT");
        }
        if (affected_database_rules.size > 0 && !fileReasons.includes("AFFECTS_DATABASE_TABLES")) {
          fileReasons.push("AFFECTS_DATABASE_TABLES");
        }
        hasHighRiskDetected = true;
      }

      // Check API Impact (GRAPH-029 & GRAPH-033)
      const isApiImpact = normalizedPath.includes("api/") || normalizedPath.includes("endpoints/") || domain === "api" || affected_apis.size > 0;
      if (isApiImpact) {
        if (fileRisk !== "critical" && fileRisk !== "high") fileRisk = "high";
        if (!fileReasons.includes("AFFECTS_API_ROUTES")) {
          fileReasons.push("AFFECTS_API_ROUTES");
        }
        hasHighRiskDetected = true;
      }

      // Check Broad Module Impact (GRAPH-033)
      if (directDependents.length >= 3) {
        if (fileRisk !== "critical" && fileRisk !== "high") fileRisk = "high";
        if (!fileReasons.includes("BROAD_MODULE_IMPACT")) {
          fileReasons.push("BROAD_MODULE_IMPACT");
        }
        hasHighRiskDetected = true;
      }
      if (affected_files.size >= 5) {
        if (fileRisk !== "critical" && fileRisk !== "high") fileRisk = "high";
        if (!fileReasons.includes("MULTIPLE_DEPENDENT_FILES")) {
          fileReasons.push("MULTIPLE_DEPENDENT_FILES");
        }
        hasHighRiskDetected = true;
      }

      // Missing tests check (GRAPH-026 & GRAPH-033)
      const isCodeFile = normalizedPath.endsWith(".ts") || normalizedPath.endsWith(".tsx") || normalizedPath.endsWith(".js") || normalizedPath.endsWith(".jsx") || domain === "api" || domain === "context" || domain === "graph" || domain === "ui";
      const hasTestsLinked = Array.from(affected_tests).some(tp => tp === normalizedPath || tp.toLowerCase().includes(normalizedPath.toLowerCase()) || normalizedPath.toLowerCase().includes(tp.toLowerCase()));
      if (isCodeFile && !hasTestsLinked && affected_tests.size === 0) {
        if (fileRisk === "low") fileRisk = "medium";
        if (!fileReasons.includes("MISSING_TESTS")) {
          fileReasons.push("MISSING_TESTS");
        }
        warnings.push("NO_RELATED_TESTS_FOUND");
        missingTestsWarningGenerated = true;
        recommendations.push(`Generate safety unit and E2E test scripts verifying changes within code file '${normalizedPath}'.`);
      }

      // Missing documentation check (GRAPH-027 & GRAPH-033)
      const hasDocsLinked = affected_docs.size > 0;
      if (isCodeFile && !hasDocsLinked && fileRisk !== "low") {
        if (!fileReasons.includes("MISSING_DOCS")) {
          fileReasons.push("MISSING_DOCS");
        }
        warnings.push("NO_RELATED_DOCS_FOUND");
        missingDocsWarningGenerated = true;
        recommendations.push(`Document architectural changes of '${normalizedPath}' in project specs / doc markdown files.`);
      }

      risk_by_file.push({
        file: normalizedPath,
        risk: fileRisk,
        reasons: fileReasons
      });
    }

    // Determine overall risk
    let overall_risk: "low" | "medium" | "high" | "critical" = "low";
    if (risk_by_file.some(f => f.risk === "critical")) {
      overall_risk = "critical";
      hasCriticalRiskDetected = true;
    } else if (risk_by_file.some(f => f.risk === "high")) {
      overall_risk = "high";
      hasHighRiskDetected = true;
    } else if (risk_by_file.some(f => f.risk === "medium")) {
      overall_risk = "medium";
    }

    // Determine confidence score (GRAPH-033)
    let confidence_score = 1.0;
    const unknownFilesCount = risk_by_file.filter(f => f.reasons.includes("UNKNOWN_FILE_NOT_INDEXED")).length;
    confidence_score -= unknownFilesCount * 0.2;
    if (missingTestsWarningGenerated) confidence_score -= 0.1;
    if (missingDocsWarningGenerated) confidence_score -= 0.1;
    confidence_score = Math.max(0.4, Number(confidence_score.toFixed(2)));

    // Ensure recommendations reflect safety and coverage
    if (warnings.length === 0) {
      recommendations.push("Proposed modifications look secure with full graph-indexed safety check validation.");
    }
    if (overall_risk === "critical" || overall_risk === "high") {
      recommendations.push("Require dual engineer validation and pull request review before branch merging.");
    }

    // Audit Log emissions based on risks & violations (GRAPH-033 / Security requirement)
    if (hasCriticalRiskDetected) {
      await this.emitAuditLog(projectId, actor, "CRITICAL_RISK_IMPACT_DETECTED", "authorized", { risk_by_file }, "Phase 9 critical warning flag attached.");
    } else if (hasHighRiskDetected) {
      await this.emitAuditLog(projectId, actor, "HIGH_RISK_IMPACT_DETECTED", "authorized", { risk_by_file }, "Phase 9 high risk indicator triggered.");
    }
    if (missingTestsWarningGenerated) {
      await this.emitAuditLog(projectId, actor, "MISSING_TESTS_WARNING_GENERATED", "authorized", { changed_files }, "Active code file missing verifies test.");
    }
    if (missingDocsWarningGenerated) {
      await this.emitAuditLog(projectId, actor, "MISSING_DOCS_WARNING_GENERATED", "authorized", { changed_files }, "Active high/mid-risk code path missing docs.");
    }
    if (boundaryViolationIncluded) {
      await this.emitAuditLog(projectId, actor, "BOUNDARY_VIOLATION_INCLUDED", "authorized", { changed_files }, "Strict task scope or forbidden boundary violation detected.");
    }

    const reportId = `report_${crypto.randomUUID()}`;

    // Persist Report to Postgres database (Phase 9 Database behavior)
    await this.query(
      `INSERT INTO impact_reports (
        id, project_id, task_id, changed_files, affected_files, affected_tests, 
        affected_docs, affected_routes, affected_apis, affected_database_rules, 
        affected_ui_components, affected_prototypes, risk_by_file, overall_risk, 
        warnings, recommendations, confidence_score, metadata_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW());`,
      [
        reportId,
        projectId,
        params.task_id || null,
        JSON.stringify(changed_files),
        JSON.stringify(Array.from(affected_files)),
        JSON.stringify(Array.from(affected_tests)),
        JSON.stringify(Array.from(affected_docs)),
        JSON.stringify(Array.from(affected_routes)),
        JSON.stringify(Array.from(affected_apis)),
        JSON.stringify(Array.from(affected_database_rules)),
        JSON.stringify(Array.from(affected_ui_components)),
        JSON.stringify(Array.from(affected_prototypes)),
        JSON.stringify(risk_by_file),
        overall_risk,
        JSON.stringify(warnings),
        JSON.stringify(recommendations),
        confidence_score,
        JSON.stringify({ actor, source: "generateImpactAnalysis" })
      ]
    );

    await this.emitAuditLog(
      projectId,
      actor,
      "IMPACT_REPORT_GENERATED",
      "authorized",
      { reportId, overall_risk, confidence_score },
      `Change impact report successfully saved and recorded: ${reportId}.`
    );

    return {
      id: reportId,
      project_id: projectId,
      task_id: params.task_id,
      changed_files,
      affected_files: Array.from(affected_files),
      affected_tests: Array.from(affected_tests),
      affected_docs: Array.from(affected_docs),
      affected_routes: Array.from(affected_routes),
      affected_apis: Array.from(affected_apis),
      affected_database_rules: Array.from(affected_database_rules),
      affected_ui_components: Array.from(affected_ui_components),
      affected_prototypes: Array.from(affected_prototypes),
      risk_by_file,
      overall_risk,
      warnings,
      recommendations,
      confidence_score,
      created_at: new Date().toISOString()
    };
  }

  public async getImpactReports(projectId: string): Promise<any[]> {
    await this.validateProjectScope(projectId);
    const res = await this.query(
      "SELECT * FROM impact_reports WHERE project_id = $1 ORDER BY created_at DESC;",
      [projectId]
    );
    return res.rows.map(row => ({
      ...row,
      changed_files: row.changed_files,
      affected_files: row.affected_files,
      affected_tests: row.affected_tests,
      affected_docs: row.affected_docs,
      affected_routes: row.affected_routes,
      affected_apis: row.affected_apis,
      affected_database_rules: row.affected_database_rules,
      affected_ui_components: row.affected_ui_components,
      affected_prototypes: row.affected_prototypes,
      risk_by_file: row.risk_by_file,
      warnings: row.warnings,
      recommendations: row.recommendations
    }));
  }

  public async getImpactReport(projectId: string, reportId: string): Promise<any | null> {
    await this.validateProjectScope(projectId);
    const res = await this.query(
      "SELECT * FROM impact_reports WHERE project_id = $1 AND id = $2 LIMIT 1;",
      [projectId, reportId]
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    return {
      ...row,
      changed_files: row.changed_files,
      affected_files: row.affected_files,
      affected_tests: row.affected_tests,
      affected_docs: row.affected_docs,
      affected_routes: row.affected_routes,
      affected_apis: row.affected_apis,
      affected_database_rules: row.affected_database_rules,
      affected_ui_components: row.affected_ui_components,
      affected_prototypes: row.affected_prototypes,
      risk_by_file: row.risk_by_file,
      warnings: row.warnings,
      recommendations: row.recommendations
    };
  }

  private matchLocalGlob(pathStr: string, pattern: string): boolean {
    const normalizedPath = pathStr.replace(/\\/g, "/");
    const normalizedPattern = pattern.replace(/\\/g, "/");
    let escaped = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    escaped = escaped.replace(/\*\*/g, '__DOUBLE_STAR__');
    escaped = escaped.replace(/\*/g, '[^/]*');
    escaped = escaped.replace(/__DOUBLE_STAR__/g, '.*');
    return new RegExp(`^${escaped}$`).test(normalizedPath);
  }

  private detectLocalDomain(pathStr: string): string {
    const lower = pathStr.toLowerCase().replace(/\\/g, "/");
    if (lower.includes("/context/") || lower.includes("packages/context") || lower.includes("classifier") || lower.includes("chunk")) return "context";
    if (lower.includes("graph") || lower.includes("traversal")) return "graph";
    if (lower.includes("resume")) return "resume";
    if (lower.includes("debug") || lower.includes("log")) return "debug";
    if (lower.includes("connect") || lower.includes("github")) return "connect";
    if (lower.includes("security") || lower.includes("secret") || lower.includes("redact") || lower.includes("audit") || lower.includes("vault")) return "security";
    if (lower.includes("boundary") || lower.includes("task")) return "task";
    if (lower.includes("db.ts") || lower.includes("database") || lower.includes("postgres") || lower.includes("migration") || lower.includes("schema")) return "database";
    if (lower.includes("/api/") || lower.includes("server.ts") || lower.includes("express") || lower.endsWith("src/index.ts")) return "api";
    if (lower.includes("/ui/") || lower.includes("src/components") || lower.includes("app.tsx") || lower.includes("index.html") || lower.includes("src/main.tsx") || lower.endsWith(".css")) return "ui";
    if (lower.endsWith(".md") || lower.includes("docs/")) return "docs";
    return "other";
  }

  /**
   * Generates a Change Simulation prediction mapping spread, missed relationships, and follow-up recommendation requirements.
   */
  public async generateChangeSimulation(
    projectId: string,
    params: {
      changed_files: string[];
      change_intent?: string;
      include_indirect?: boolean;
      max_depth?: number;
      risk_tolerance?: "low" | "medium" | "high";
      task_id?: string;
    },
    actor = "system"
  ): Promise<any> {
    await this.validateProjectScope(projectId);

    const changed_files = params.changed_files || [];
    const change_intent = params.change_intent || "unknown";
    const include_indirect = params.include_indirect ?? false;
    const max_depth = params.max_depth || 1;

    const directSet = new Set<string>();
    const indirectSet = new Set<string>();
    const blockedSet = new Set<string>();
    const warnings: string[] = [];
    const recommendations: string[] = [];
    const missed_relationships: any[] = [];
    const required_follow_up_edits: any[] = [];

    const required_testsSet = new Set<string>();
    const recommended_testsSet = new Set<string>();
    const missing_test_warningsSet = new Set<string>();

    const required_docsSet = new Set<string>();
    const recommended_docsSet = new Set<string>();
    const required_designSet = new Set<string>();
    const recommended_designSet = new Set<string>();
    const missing_docs_warningsSet = new Set<string>();

    const risk_by_file: any[] = [];

    // Audit Log Emission
    await this.emitAuditLog(
      projectId,
      actor,
      "CHANGE_SIMULATION_REQUESTED",
      "authorized",
      { changed_files, change_intent, include_indirect, max_depth },
      `Initiating Phase 10 Change Simulation prediction for ${changed_files.length} files.`
    );

    // Load active task boundaries (GRAPH-024 / Constraint alignment)
    const boundaryRes = await this.query(
      "SELECT * FROM task_boundaries WHERE project_id = $1 AND (status = 'active' OR status = 'locked') LIMIT 1;",
      [projectId]
    );
    const boundary = boundaryRes.rowCount > 0 ? boundaryRes.rows[0] : null;

    for (const filePath of changed_files) {
      const normalizedPath = filePath.trim().replace(/\\/g, "/");
      const domain = this.detectLocalDomain(normalizedPath);

      let fileRisk: "low" | "medium" | "high" | "critical" = "low";
      const fileReasons: string[] = [];

      // Flag boundary-blocked files (Security protection check)
      let boundaryStatus: "allowed" | "forbidden" | "unlisted" = "unlisted";
      if (boundary) {
        const isForbiddenExact = (boundary.forbidden_files || []).some((f: string) => f === normalizedPath || (f.startsWith("/") && f.substring(1) === normalizedPath));
        const isForbiddenPattern = (boundary.forbidden_patterns || []).some((pf: string) => this.matchLocalGlob(normalizedPath, pf));
        const isForbiddenDomain = (boundary.forbidden_domains || []).includes(domain);

        if (isForbiddenExact || isForbiddenPattern || isForbiddenDomain) {
          boundaryStatus = "forbidden";
          fileRisk = "critical";
          if (!fileReasons.includes("BOUNDARY_VIOLATION")) {
            fileReasons.push("BOUNDARY_VIOLATION");
          }
          blockedSet.add(normalizedPath);
          warnings.push(`Proposed change path '${normalizedPath}' is within secure forbidden boundaries.`);
          await this.emitAuditLog(projectId, actor, "BOUNDARY_BLOCKED_FILE_INCLUDED", "authorized", { path: normalizedPath }, "Boundary blocked path specified inside simulation set.");
        } else {
          const isAllowedExact = (boundary.allowed_files || []).includes(normalizedPath);
          const isAllowedPattern = (boundary.allowed_patterns || []).some((ap: string) => this.matchLocalGlob(normalizedPath, ap));
          if (isAllowedExact || isAllowedPattern) {
            boundaryStatus = "allowed";
          } else if (boundary.status === "locked") {
            boundaryStatus = "unlisted";
            if (fileRisk === "low") fileRisk = "medium";
            if (!fileReasons.includes("OUT_OF_SCOPE_LOCK")) {
              fileReasons.push("OUT_OF_SCOPE_LOCK");
            }
            warnings.push(`Proposed change path '${normalizedPath}' touches untracked boundaries.`);
          }
        }
      }

      // credentials keys guard
      const isEnvOrSecret = normalizedPath.includes(".env") || normalizedPath.includes("credentials") || normalizedPath.includes("secrets.json") || normalizedPath.endsWith(".pem") || normalizedPath.endsWith(".key");
      if (isEnvOrSecret) {
        fileRisk = "critical";
        if (!fileReasons.includes("SECRET_SENSITIVE_PATH")) {
          fileReasons.push("SECRET_SENSITIVE_PATH");
        }
        warnings.push(`File path '${normalizedPath}' matches secret keys scan signatures.`);
      }

      // Check indexing status
      const nodeRes = await this.query(
        "SELECT * FROM graph_nodes WHERE project_id = $1 AND (node_identifier = $2 OR label = $2) LIMIT 1;",
        [projectId, normalizedPath]
      );
      let targetNode = nodeRes.rowCount > 0 ? this.mapRowToNode(nodeRes.rows[0]) : null;

      if (!targetNode) {
        const ctxRes = await this.query(
          "SELECT * FROM context_items WHERE project_id = $1 AND source_uri = $2 LIMIT 1;",
          [projectId, normalizedPath]
        );
        if (ctxRes.rowCount > 0) {
          targetNode = {
            id: ctxRes.rows[0].id,
            projectId,
            label: ctxRes.rows[0].source_uri,
            type: ctxRes.rows[0].source_type,
            status: "active",
            metadata: ctxRes.rows[0].metadata_json
          };
        } else {
          // Unindexed changed file warning
          if (fileRisk === "low") fileRisk = "medium";
          fileReasons.push("UNKNOWN_FILE_NOT_INDEXED");
          missed_relationships.push({
            type: "UNKNOWN_FILE_NOT_INDEXED",
            file: normalizedPath,
            reason: `Target file '${normalizedPath}' is currently missing from Indexed Context Vault records.`,
            severity: "medium"
          });
          await this.emitAuditLog(projectId, actor, "MISSED_RELATIONSHIP_DETECTED", "authorized", { file: normalizedPath, type: "UNKNOWN_FILE_NOT_INDEXED" }, "Unindexed path simulated.");
        }
      }

      // Trace direct spread
      const dependents: GraphNode[] = [];
      if (targetNode && boundaryStatus !== "forbidden") {
        const revRes = await this.getReverseDependencies(projectId, { path: normalizedPath }, actor);
        for (const dep of revRes.used_by) {
          const depNode = dep.node;
          const depPath = depNode.label || depNode.nodeIdentifier || "";

          // Blocked containment check
          let depBoundaryStatus: "allowed" | "forbidden" | "unlisted" = "unlisted";
          if (boundary) {
            const depForbidden = (boundary.forbidden_files || []).some((f: string) => f === depPath) ||
                                (boundary.forbidden_patterns || []).some((pf: string) => this.matchLocalGlob(depPath, pf)) ||
                                (boundary.forbidden_domains || []).includes(this.detectLocalDomain(depPath));
            if (depForbidden) {
              depBoundaryStatus = "forbidden";
              blockedSet.add(depPath);
              continue;
            } else {
              const depAllowed = (boundary.allowed_files || []).includes(depPath) ||
                                (boundary.allowed_patterns || []).some((ap: string) => this.matchLocalGlob(depPath, ap));
              if (depAllowed) depBoundaryStatus = "allowed";
            }
          }

          directSet.add(depPath);
          dependents.push(depNode);

          const lowerPath = depPath.toLowerCase();
          const isTest = lowerPath.includes(".test.") || lowerPath.includes(".spec.") || lowerPath.includes("tests/") || depNode.type === "test";
          const isDoc = lowerPath.endsWith(".md") || lowerPath.includes("docs/") || ["doc", "api_doc", "ux_spec", "design_spec", "decision_log"].includes(depNode.type as string);

          if (isTest) {
            required_testsSet.add(depPath);
          } else if (isDoc) {
            required_docsSet.add(depPath);
          } else {
            // Suggest follow up edit
            required_follow_up_edits.push({
              target_file: depPath,
              reason: `Direct dependent of proposed file '${normalizedPath}' via edge relationship '${dep.relationship_type}'.`,
              confidence: dep.relationship_type === "imported_by" || dep.relationship_type === "forces_rebuild" ? 0.9 : 0.7,
              required: dep.relationship_type === "imported_by" || dep.relationship_type === "defines_api",
              boundary_status: depBoundaryStatus,
              risk_level: fileRisk === "critical" ? "high" : fileRisk
            });
            await this.emitAuditLog(projectId, actor, "REQUIRED_FOLLOW_UP_EDIT_GENERATED", "authorized", { file: depPath }, "Direct dependent follow-up recommended.");
          }
        }

        // Trace bounded deep indirect spread
        if (include_indirect && max_depth > 1) {
          let currentQueue = [...dependents];
          const visited = new Set<string>([targetNode.id!]);
          currentQueue.forEach(n => visited.add(n.id!));

          for (let depth = 1; depth < max_depth; depth++) {
            const nextQueue: GraphNode[] = [];
            for (const node of currentQueue) {
              const subRes = await this.getReverseDependencies(projectId, { contextItemId: node.id }, actor);
              for (const subDep of subRes.used_by) {
                const subNode = subDep.node;
                const subPath = subNode.label || subNode.nodeIdentifier || "";

                if (!visited.has(subNode.id!)) {
                  visited.add(subNode.id!);

                  // Forbidden checks
                  if (boundary) {
                    const subForbidden = (boundary.forbidden_files || []).some((f: string) => f === subPath) ||
                                         (boundary.forbidden_patterns || []).some((pf: string) => this.matchLocalGlob(subPath, pf)) ||
                                         (boundary.forbidden_domains || []).includes(this.detectLocalDomain(subPath));
                    if (subForbidden) {
                      blockedSet.add(subPath);
                      continue;
                    }
                  }

                  nextQueue.push(subNode);
                  indirectSet.add(subPath);

                  const subLower = subPath.toLowerCase();
                  const subIsTest = subLower.includes(".test.") || subLower.includes(".spec.") || subLower.includes("tests/") || subNode.type === "test";
                  const subIsDoc = subLower.endsWith(".md") || subLower.includes("docs/") || ["doc", "api_doc", "ux_spec", "design_spec", "decision_log"].includes(subNode.type as string);

                  if (subIsTest) {
                    recommended_testsSet.add(subPath);
                  } else if (subIsDoc) {
                    recommended_docsSet.add(subPath);
                  } else {
                    required_follow_up_edits.push({
                      target_file: subPath,
                      reason: `Indirect dependent at depth ${depth + 1} predicted through chain traversal.`,
                      confidence: 0.5,
                      required: false,
                      boundary_status: "unlisted",
                      risk_level: fileRisk
                    });
                    await this.emitAuditLog(projectId, actor, "REQUIRED_FOLLOW_UP_EDIT_GENERATED", "authorized", { file: subPath }, "Indirect follow-up suggested.");
                  }
                }
              }
            }
            currentQueue = nextQueue;
            if (currentQueue.length === 0) break;
          }
        }
      }

      // Quality check impacts
      const isDb = normalizedPath.includes("migration") || normalizedPath.includes("schema") || normalizedPath.includes("db.ts") || normalizedPath.includes("database") || domain === "database" || directSet.has("apps/api/src/db.ts");
      if (isDb) {
        if (fileRisk !== "critical") fileRisk = "high";
        if (!fileReasons.includes("DATABASE_MIGRATION_IMPACT")) {
          fileReasons.push("DATABASE_MIGRATION_IMPACT");
        }
      }

      const isApi = normalizedPath.includes("api/") || normalizedPath.includes("endpoints/") || domain === "api";
      if (isApi) {
        if (fileRisk !== "critical" && fileRisk !== "high") fileRisk = "high";
        if (!fileReasons.includes("AFFECTS_API_ROUTES")) {
          fileReasons.push("AFFECTS_API_ROUTES");
        }
      }

      // Check missing test relationships (GRAPH-035 missed relationship)
      const isCode = normalizedPath.endsWith(".ts") || normalizedPath.endsWith(".tsx") || normalizedPath.endsWith(".js") || normalizedPath.endsWith(".jsx");
      const testSetMerged = new Set([...Array.from(required_testsSet), ...Array.from(recommended_testsSet)]);
      const hasTestsLinked = Array.from(testSetMerged).some(tp => tp === normalizedPath || tp.toLowerCase().includes(normalizedPath.toLowerCase()) || normalizedPath.toLowerCase().includes(tp.toLowerCase()));
      if (isCode && !hasTestsLinked) {
        if (fileRisk === "low") fileRisk = "medium";
        if (!fileReasons.includes("MISSING_TESTS")) {
          fileReasons.push("MISSING_TESTS");
        }
        missing_test_warningsSet.add(`Proposed code change in '${normalizedPath}' is missing verifying tests.`);
        missed_relationships.push({
          type: "POSSIBLE_MISSING_TEST_RELATIONSHIP",
          file: normalizedPath,
          reason: `No corresponding test file covers changes in code resource: '${normalizedPath}'.`,
          severity: "medium"
        });
        await this.emitAuditLog(projectId, actor, "MISSED_RELATIONSHIP_DETECTED", "authorized", { file: normalizedPath, type: "POSSIBLE_MISSING_TEST_RELATIONSHIP" }, "Missing test coverage alert.");
      }

      // Check missing docs relationships
      const docsSetMerged = new Set([...Array.from(required_docsSet), ...Array.from(recommended_docsSet)]);
      if (isCode && docsSetMerged.size === 0 && fileRisk !== "low") {
        if (!fileReasons.includes("MISSING_DOCS")) {
          fileReasons.push("MISSING_DOCS");
        }
        missing_docs_warningsSet.add(`No active specs cover code modifications: '${normalizedPath}'.`);
        missed_relationships.push({
          type: "POSSIBLE_MISSING_DOC_RELATIONSHIP",
          file: normalizedPath,
          reason: `No Markdown file references design guidelines or specifications for code path: '${normalizedPath}'.`,
          severity: "low"
        });
        await this.emitAuditLog(projectId, actor, "MISSED_RELATIONSHIP_DETECTED", "authorized", { file: normalizedPath, type: "POSSIBLE_MISSING_DOC_RELATIONSHIP" }, "Missing architectural documentation warning.");
      }

      risk_by_file.push({
        file: normalizedPath,
        risk: fileRisk,
        reasons: fileReasons
      });
    }

    // Determine overall risk level
    let overall_risk: "low" | "medium" | "high" | "critical" = "low";
    if (risk_by_file.some(f => f.risk === "critical")) overall_risk = "critical";
    else if (risk_by_file.some(f => f.risk === "high")) overall_risk = "high";
    else if (risk_by_file.some(f => f.risk === "medium")) overall_risk = "medium";

    // Trace confidence score
    let confidence_score = 1.0;
    const unknownCount = missed_relationships.filter(m => m.type === "UNKNOWN_FILE_NOT_INDEXED").length;
    confidence_score -= unknownCount * 0.15;
    if (missing_test_warningsSet.size > 0) confidence_score -= 0.1;
    if (missing_docs_warningsSet.size > 0) confidence_score -= 0.1;
    confidence_score = Math.max(0.4, Number(confidence_score.toFixed(2)));

    // Risk alignment warnings
    if (overall_risk === "critical") {
      recommendations.push("Proposed edits cross restricted files, credentials parameters, or custom global configurations. Refactor target paths.");
    } else if (overall_risk === "high") {
      recommendations.push("Proposed updates cross database models or API routes. Require rigorous schema validation.");
    } else {
      recommendations.push("Modifications look ready for simulation execution within track boundaries.");
    }

    // Generate commands
    const test_commands = ["pnpm typecheck", "pnpm build"];
    if (required_testsSet.size > 0) {
      test_commands.push(`pnpm test ${Array.from(required_testsSet)[0]}`);
    } else {
      test_commands.push("pnpm test");
    }

    const simulationId = `sim_${crypto.randomUUID()}`;

    // Database simulation DTO payload
    const payload = {
      simulation_id: simulationId,
      project_id: projectId,
      task_id: params.task_id || null,
      changed_files,
      change_intent,
      spread: {
        direct: Array.from(directSet),
        indirect: Array.from(indirectSet),
        blocked: Array.from(blockedSet)
      },
      missed_relationships,
      required_follow_up_edits,
      required_follow_up_tests: {
        required_tests: Array.from(required_testsSet),
        recommended_tests: Array.from(recommended_testsSet),
        missing_test_warnings: Array.from(missing_test_warningsSet),
        test_commands
      },
      required_docs_design_updates: {
        required_docs_updates: Array.from(required_docsSet),
        recommended_docs_updates: Array.from(recommended_docsSet),
        required_design_updates: Array.from(required_designSet),
        recommended_design_updates: Array.from(recommended_designSet),
        missing_docs_warnings: Array.from(missing_docs_warningsSet)
      },
      risk_summary: {
        overall_risk,
        risk_by_file
      },
      confidence_score,
      warnings,
      recommendations
    };

    // Store to PostgreSQL
    await this.query(
      `INSERT INTO change_simulations (
        id, project_id, task_id, changed_files, change_intent, spread, 
        missed_relationships, required_follow_up_edits, required_follow_up_tests, 
        required_docs_design_updates, risk_summary, confidence_score, warnings, 
        recommendations, metadata_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW());`,
      [
        payload.simulation_id,
        payload.project_id,
        payload.task_id,
        JSON.stringify(payload.changed_files),
        payload.change_intent,
        JSON.stringify(payload.spread),
        JSON.stringify(payload.missed_relationships),
        JSON.stringify(payload.required_follow_up_edits),
        JSON.stringify(payload.required_follow_up_tests),
        JSON.stringify(payload.required_docs_design_updates),
        JSON.stringify(payload.risk_summary),
        payload.confidence_score,
        JSON.stringify(payload.warnings),
        JSON.stringify(payload.recommendations),
        JSON.stringify({ actor, source: "generateChangeSimulation" })
      ]
    );

    // Audit logs for sub components
    if (missed_relationships.length > 0) {
      await this.emitAuditLog(projectId, actor, "MISSED_RELATIONSHIP_DETECTED", "authorized", { missed_relationships }, "Simulation identified trace gaps.");
    }
    if (required_follow_up_edits.length > 0) {
      await this.emitAuditLog(projectId, actor, "REQUIRED_FOLLOW_UP_EDITS_GENERATED", "authorized", { count: required_follow_up_edits.length }, "Required edits cataloged.");
    }
    if (required_testsSet.size > 0) {
      await this.emitAuditLog(projectId, actor, "REQUIRED_FOLLOW_UP_TESTS_GENERATED", "authorized", { count: required_testsSet.size }, "Follow-up tests calculated.");
    }
    if (required_docsSet.size > 0) {
      await this.emitAuditLog(projectId, actor, "DOCS_DESIGN_UPDATES_GENERATED", "authorized", { count: required_docsSet.size }, "Specs change recommendations registered.");
    }
    if (confidence_score < 0.7) {
      await this.emitAuditLog(projectId, actor, "LOW_CONFIDENCE_SIMULATION_GENERATED", "authorized", { confidence_score }, "Low confidence score alert generated.");
    }

    const sanitizeSafePaths = (paths: string[]): string[] => {
      return paths.map(p => {
        const lower = p.toLowerCase();
        const isSecret = lower.includes(".env") || lower.includes("credentials") || lower.includes("secret") || lower.endsWith(".pem") || lower.endsWith(".key");
        if (isSecret) {
          return "[REDACTED_SECRET_PATH]";
        }
        return redactSecretLeaks(p);
      });
    };

    // Write explicit audit events for severe risks (Phase 10.1 Audit Hardening)
    const isHighRisk = overall_risk === "high" || risk_by_file.some(f => f.risk === "high");
    const isCriticalRisk = overall_risk === "critical" || risk_by_file.some(f => f.risk === "critical");

    if (isHighRisk) {
      await this.emitAuditLog(
        projectId,
        actor,
        "CHANGE_SIMULATION_HIGH_RISK_DETECTED",
        "authorized",
        {
          simulation_id: simulationId,
          project_id: projectId,
          task_id: params.task_id || null,
          overall_risk,
          affected_file_paths: sanitizeSafePaths(Array.from(new Set([...changed_files, ...Array.from(directSet), ...Array.from(indirectSet)]))),
          changed_files: sanitizeSafePaths(changed_files),
          risk_reason_codes: Array.from(new Set(risk_by_file.flatMap(r => r.reasons))),
          warnings_count: warnings.length,
          generated_at: new Date().toISOString()
        },
        `High risk proposed changes simulated in project ${projectId}. Reason codes: ${Array.from(new Set(risk_by_file.flatMap(r => r.reasons))).join(", ")}`
      );
    }

    if (isCriticalRisk) {
      await this.emitAuditLog(
        projectId,
        actor,
        "CHANGE_SIMULATION_CRITICAL_RISK_DETECTED",
        "authorized",
        {
          simulation_id: simulationId,
          project_id: projectId,
          task_id: params.task_id || null,
          overall_risk,
          affected_file_paths: sanitizeSafePaths(Array.from(new Set([...changed_files, ...Array.from(directSet), ...Array.from(indirectSet)]))),
          changed_files: sanitizeSafePaths(changed_files),
          risk_reason_codes: Array.from(new Set(risk_by_file.flatMap(r => r.reasons))),
          warnings_count: warnings.length,
          generated_at: new Date().toISOString()
        },
        `Critical risk proposed changes simulated in project ${projectId}. Reason codes: ${Array.from(new Set(risk_by_file.flatMap(r => r.reasons))).join(", ")}`
      );
    }

    await this.emitAuditLog(
      projectId,
      actor,
      "CHANGE_SIMULATION_GENERATED",
      "authorized",
      { simulationId, overall_risk, confidence_score },
      `Change simulation successfully parsed, saved and logged: ${simulationId}`
    );

    return payload;
  }

  /**
   * Lists historical simulation runs saved to PostgreSQL.
   */
  public async getChangeSimulations(projectId: string): Promise<any[]> {
    await this.validateProjectScope(projectId);
    const res = await this.query(
      "SELECT * FROM change_simulations WHERE project_id = $1 ORDER BY created_at DESC;",
      [projectId]
    );
    return res.rows.map(row => this.mapRowToChangeSimulation(row));
  }

  /**
   * Retrieves specific simulation details by project-simulation ID bindings.
   */
  public async getChangeSimulation(projectId: string, simulationId: string): Promise<any | null> {
    await this.validateProjectScope(projectId);
    const res = await this.query(
      "SELECT * FROM change_simulations WHERE project_id = $1 AND id = $2 LIMIT 1;",
      [projectId, simulationId]
    );
    if (res.rowCount === 0) return null;
    return this.mapRowToChangeSimulation(res.rows[0]);
  }

  /**
   * Formats DB row records into clear schema camelCase representations.
   */
  private mapRowToChangeSimulation(row: any): any {
    return {
      simulation_id: row.id,
      id: row.id,
      project_id: row.project_id || row.projectId,
      task_id: row.task_id || row.taskId,
      changed_files: row.changed_files,
      change_intent: row.change_intent || row.changeIntent || "",
      spread: row.spread,
      missed_relationships: row.missed_relationships || row.missedRelationships,
      required_follow_up_edits: row.required_follow_up_edits || row.requiredFollowUpEdits,
      required_follow_up_tests: row.required_follow_up_tests || row.requiredFollowUpTests,
      required_docs_design_updates: row.required_docs_design_updates || row.requiredDocsDesignUpdates,
      risk_summary: row.risk_summary || row.riskSummary,
      confidence_score: Number(row.confidence_score || row.confidenceScore || 0),
      warnings: row.warnings,
      recommendations: row.recommendations,
      created_at: row.created_at || row.createdAt
    };
  }
}

// =========================================================================
// GRAPH DEPENDENCY FOUNDATION: AST Parser Adapter & MVP static extraction
// =========================================================================

export interface ASTParserAdapter {
  parseImports(content: string): string[];
  parseExports(content: string): string[];
  parseJSXComponents(content: string): string[];
  parseAPICalls(content: string): { method: string; path: string }[];
  parseRoutes(content: string): { method: string; path: string }[];
  parseDatabaseTables(content: string, knownTables: string[]): string[];
}

export class MVPStaticExtractionParser implements ASTParserAdapter {
  public parseImports(content: string): string[] {
    const imports: string[] = [];
    // 1. ES Import: import { foo } from "./bar" or import foo from 'bar' or import './styl'
    const esImportRegex = /import\s+?(?:(?:[\w*\s{},]*)\s+from\s+)?['"](.*?)['"]/g;
    let match;
    while ((match = esImportRegex.exec(content)) !== null) {
      if (match[1]) imports.push(match[1]);
    }
    // 2. CommonJS Require: require('./bar')
    const cjsRequireRegex = /require\s*\(\s*['"](.*?)['"]\s*\)/g;
    while ((match = cjsRequireRegex.exec(content)) !== null) {
      if (match[1]) imports.push(match[1]);
    }
    return Array.from(new Set(imports));
  }

  public parseExports(content: string): string[] {
    const exportsSet = new Set<string>();
    // export const foo, export function bar, export class baz, etc.
    const exportStatementRegex = /export\s+(?:const|function|class|let|var|type|interface)\s+([a-zA-Z0-9_$]+)/g;
    let match;
    while ((match = exportStatementRegex.exec(content)) !== null) {
      if (match[1]) exportsSet.add(match[1]);
    }

    // export { foo, bar as baz }
    const exportCurlyRegex = /export\s+{[^}]*}/g;
    const curlyMatches = content.match(exportCurlyRegex) || [];
    for (const statement of curlyMatches) {
      const symbolsStr = statement.replace(/export\s*{/, "").replace(/}/, "");
      const symbols = symbolsStr.split(",").map(s => s.trim());
      for (const entity of symbols) {
        if (!entity) continue;
        const parts = entity.split(/\s+as\s+/);
        const name = parts[parts.length - 1].trim();
        if (name) exportsSet.add(name);
      }
    }

    // export default class Foo, export default function Bar, etc.
    const exportDefaultRegex = /export\s+default\s+(?:class|function)?\s*([a-zA-Z0-9_$]+)?/g;
    while ((match = exportDefaultRegex.exec(content)) !== null) {
      if (match[1]) {
        exportsSet.add(match[1]);
      } else {
        exportsSet.add("default");
      }
    }

    return Array.from(exportsSet);
  }

  public parseJSXComponents(content: string): string[] {
    const components: string[] = [];
    const jsxRegex = /<([A-Z][a-zA-Z0-9]*)\b/g;
    let match;
    while ((match = jsxRegex.exec(content)) !== null) {
      if (match[1]) components.push(match[1]);
    }
    return Array.from(new Set(components));
  }

  public parseAPICalls(content: string): { method: string; path: string }[] {
    const calls: { method: string; path: string }[] = [];
    // 1. fetch('/api/...')
    const fetchRegex = /fetch\s*\(\s*['"](\/api\/.*?)['"]/g;
    let match;
    while ((match = fetchRegex.exec(content)) !== null) {
      if (match[1]) calls.push({ method: "get", path: match[1] });
    }
    // 2. axios.get('/api/...'), axios.post(...)
    const axiosRegex = /axios\s*\.\s*(get|post|patch|delete|put)\s*\(\s*['"](\/api\/.*?)['"]/g;
    while ((match = axiosRegex.exec(content)) !== null) {
      if (match[2]) calls.push({ method: match[1].toLowerCase(), path: match[2] });
    }
    return calls;
  }

  public parseRoutes(content: string): { method: string; path: string }[] {
    const routes: { method: string; path: string }[] = [];
    // router.get("/projects/:id/tasks", ...)
    // app.post("/api/projects", ...)
    const routeRegex = /(?:router|app)\s*\.\s*(get|post|patch|delete|put)\s*\(\s*['"](\/.*?)['"]/g;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      if (match[2]) routes.push({ method: match[1].toLowerCase(), path: match[2] });
    }
    return routes;
  }

  public parseDatabaseTables(content: string, knownTables: string[]): string[] {
    const usedTablesSet = new Set<string>();
    for (const table of knownTables) {
      const tableWordRegex = new RegExp(`\\b${table}\\b`, 'g');
      if (tableWordRegex.test(content)) {
        usedTablesSet.add(table);
      }
    }
    return Array.from(usedTablesSet);
  }
}

/**
 * Normalizes relative target path relative to source path directory
 */
export function resolveRelativePath(sourcePath: string, relativePath: string): string {
  if (!relativePath.startsWith(".")) {
    return relativePath;
  }
  const sourceParts = sourcePath.split("/");
  sourceParts.pop(); // Remove filename
  
  const relParts = relativePath.split("/");
  for (const part of relParts) {
    if (part === "." || part === "") {
      continue;
    } else if (part === "..") {
      sourceParts.pop();
    } else {
      sourceParts.push(part);
    }
  }
  return sourceParts.join("/");
}

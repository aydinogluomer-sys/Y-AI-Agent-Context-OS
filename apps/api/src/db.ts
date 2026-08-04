/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import pg from "pg";
import { sysLogger } from "./logger";
import { redactSecretLeaks } from "@y/security";

const { Pool } = pg;

export const LATEST_SCHEMA_VERSION = "1.3.4-artifact-cas-mvp";

export interface DatabaseState {
  database_mode: "postgres" | "mock" | "unavailable";
  connected: boolean;
  migrations_applied: boolean;
  fallback_active: boolean;
  production_safe: boolean;
  poolSize: number;
  activeSchemaVersion: string;
  dialect: "postgres";
  connection_path: "pooler" | "direct" | "mock" | "none";
  fallback_type: "none" | "postgres_direct" | "mock";
  pooler_ssl_status: "ok" | "failed" | "not_configured" | "disabled" | "not_applicable" | "not_applicable_or_disabled";
  pooler_ssl_error_type: "none" | "certificate_chain" | "missing_ca" | "tenant_not_found" | "unknown";
  direct_ssl_status: "ok" | "failed" | "not_configured" | "not_applicable";
  tls_verification_enabled: boolean;
  mock_mode_active: boolean;
  ca_source: "base64" | "pem" | "none";
  derived_direct_fallback?: boolean;
}

export function getSupabaseCaCertDetails(): { cert: string | undefined; source: "base64" | "pem" | "none" } {
  const base64Cert = process.env.SUPABASE_CA_CERT_BASE64;
  if (base64Cert && base64Cert.trim().length > 0) {
    try {
      const decoded = Buffer.from(base64Cert, "base64").toString("utf8");
      if (decoded && decoded.trim().length > 0) {
        return { cert: decoded, source: "base64" };
      }
    } catch {
      // ignore
    }
  }
  const rawCert = process.env.SUPABASE_CA_CERT;
  if (rawCert && rawCert.trim().length > 0) {
    return { cert: rawCert, source: "pem" };
  }
  return { cert: undefined, source: "none" };
}

export function getSupabaseCaCert(): string | undefined {
  return getSupabaseCaCertDetails().cert;
}

/**
 * Y-OS Database connection orchestrator.
 * Connects directly to production PostgreSQL pools. Fallbacks are disabled.
 */
// Custom in-memory database store for full query resilient fallback
const inMemoryTables: Record<string, any[]> = {
  projects: [],
  memberships: [],
  tasks: [],
  context_items: [],
  context_chunks: [],
  graph_nodes: [],
  graph_edges: [],
  audit_logs: [],
  artifacts: [],
  debug_logs: [],
  connections: [],
  context_packs: [],
  context_summaries: [],
  durable_memories: [],
  task_boundaries: [],
  boundary_checks: [],
  impact_reports: [],
  change_simulations: [],
  schema_migrations: [],
  agent_memories: [],
  resume_states: [],
  resume_schedules: [],
  agent_sessions: [],
  agent_handoffs: [],
  repo_sources: [],
  repo_access_logs: [],
  index_jobs: [],
  incremental_index_events: [],
  task_status_history: [],
  quality_gate_runs: [],
  quality_gate_command_results: [],
  evidence_records: [],
  event_records: [],
  context_objects: [],
  context_object_refs: [],
  worker_registry: [],
  worker_runtime_logs: [],
  file_locks: [],
  permission_policies: [],
  permission_evaluations: [],
  permission_overrides: [],
  cas_blobs: [],
  artifact_versions: [],
};

// Key Normalization Helper
function normKeys(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  const newObj: any = {};
  for (const key of Object.keys(obj)) {
    const normKey = key.toLowerCase();
    newObj[key] = obj[key];
    newObj[normKey] = obj[key];
    if (key.includes("_")) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      newObj[camelKey] = obj[key];
    }
  }
  return newObj;
}

// Preseed Default Data for resilient startup mapping
const defaultProjects = [
  normKeys({
    id: "proj_92c",
    name: "Y AI Agent Context OS",
    description: "Aggregating massive project contexts for LLMs.",
    team_id: "team_alpha",
    metadata_json: { repoIndexed: true, activeConnectors: 3 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
];

const defaultTasks = [
  normKeys({
    id: "task_jwt_samesite",
    project_id: "proj_92c",
    title: "Create user auth-jwt flow and enforce SameSite secure cookie persistence",
    category: "Coding",
    risk_level: "High",
    difficulty: "Medium",
    status: "pending",
    description: "Enforce JWT authentication securely with SameSite secure httpOnly cookies to prevent CSRF.",
    owner_agent: "Gemini 2.5 Flash",
    human_owner: "Aydinoglu",
    acceptance_criteria: ["JWT generated on backend must have Secure suffix", "SameSite must be configured strictly", "Expose no database credentials in telemetry logs"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }),
  normKeys({
    id: "task_db_opt",
    project_id: "proj_92c",
    title: "Optimize PostgreSQL index strategies for contextual search performance",
    category: "Data/SQL",
    risk_level: "Medium",
    difficulty: "Hard",
    status: "pending",
    description: "Implement custom trigram and btree index overlays on context_chunks content queries.",
    owner_agent: "Gemini 2.5 Flash",
    human_owner: "Aydinoglu",
    acceptance_criteria: ["Trigram index on content", "Btree on matching tasks"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }),
  normKeys({
    id: "task_mcp_eval",
    project_id: "proj_92c",
    title: "Evaluate multi-model prompt performance across Gemini 2.5 and Claude 2.5 Sonnet",
    category: "Review",
    risk_level: "Low",
    difficulty: "Easy",
    status: "completed",
    description: "Compare context-window efficiency and token packaging output of core agent architectures.",
    owner_agent: "Claude Code",
    human_owner: "Aydinoglu",
    acceptance_criteria: ["Detailed comparison spreadsheet", "Efficiency ratios mapped"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
];

const defaultContextItems = [
  normKeys({
    id: "item_auth_middleware",
    project_id: "proj_92c",
    source_type: "code",
    source_uri: "src/middleware/auth.ts",
    checksum: "sha256-a1b2c3d4",
    version: "1.2.0",
    content_hash: "hash_a1",
    token_count: 540,
    confidence: 100.0,
    freshness_status: "fresh",
    metadata_json: { language: "typescript", sizeBytes: 3102 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }),
  normKeys({
    id: "item_security_utils",
    project_id: "proj_92c",
    source_type: "code",
    source_uri: "src/utils/security.ts",
    checksum: "sha256-e5f6g7h8",
    version: "1.0.1",
    content_hash: "hash_b2",
    token_count: 320,
    confidence: 95.0,
    freshness_status: "fresh",
    metadata_json: { language: "typescript", sizeBytes: 1540 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }),
  normKeys({
    id: "item_arch_spec",
    project_id: "proj_92c",
    source_type: "markdown",
    source_uri: "docs/architecture-spec.md",
    checksum: "sha256-i9j0k1l2",
    version: "2.5.0",
    content_hash: "hash_c3",
    token_count: 1420,
    confidence: 100.0,
    freshness_status: "fresh",
    metadata_json: { doc_type: "specification", originalGitRef: "main" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
];

const defaultContextChunks = [
  normKeys({
    id: "chunk_auth_1",
    context_item_id: "item_auth_middleware",
    chunk_index: 0,
    content: "export function authenticateJWT(req: Request, res: Response, next: NextFunction) {\n  const token = req.cookies['jwt'] || req.headers['authorization']?.split(' ')[1];\n  if (!token) return res.status(401).json({ error: 'Unauthorized: No JWT payload located' });\n  try {\n    const decoded = jwt.verify(token, process.env.JWT_SECRET!);\n    req.user = decoded;\n    next();\n  } catch (err) {\n    return res.status(403).json({ error: 'Forbidden: Invalid authorization signature' });\n  }\n}",
    token_count: 250
  }),
  normKeys({
    id: "chunk_sec_1",
    context_item_id: "item_security_utils",
    chunk_index: 0,
    content: "import crypto from 'crypto';\nexport function hashData(payload: string): string {\n  return crypto.createHash('sha256').update(payload).digest('hex');\n}\n\nexport function generateSecureToken(): string {\n  return crypto.randomBytes(32).toString('hex');\n}",
    token_count: 150
  }),
  normKeys({
    id: "chunk_spec_1",
    context_item_id: "item_arch_spec",
    chunk_index: 0,
    content: "# System Core Architecture Context Specifications\nThis document maps boundaries, cryptographic cookie persistence rules, and automatic knowledge graph indexing.\n- CTX-001: Every code file context item is automatically parsed.\n- CTX-003: JWT keys are read server-side only.",
    token_count: 350
  })
];

// Module-level seeding is disabled to respect the fail-loud database policy. Seeding only occurs explicitly when ENABLE_MOCK_DB=true is initialized.

function extractTableName(sql: string): string | null {
  const norm = sql.toLowerCase().replace(/\s+/g, " ");
  let match = norm.match(/\bfrom\s+([a-zA-Z0-9_]+)/);
  if (match) return match[1];
  match = norm.match(/\binsert\s+into\s+([a-zA-Z0-9_]+)/);
  if (match) return match[1];
  match = norm.match(/\bupdate\s+([a-zA-Z0-9_]+)/);
  if (match) return match[1];
  match = norm.match(/\bdelete\s+from\s+([a-zA-Z0-9_]+)/);
  if (match) return match[1];
  match = norm.match(/\balter\s+table\s+([a-zA-Z0-9_]+)/);
  if (match) return match[1];
  return null;
}

function parseSelectFields(fieldsStr: string): Array<{ col: string, alias: string }> {
  if (fieldsStr.trim() === "*") return [];
  const result: Array<{ col: string, alias: string }> = [];
  const parts = fieldsStr.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const asMatch = trimmed.match(/(.+?)\s+as\s+["']?([a-zA-Z0-9_]+)["']?/i);
    if (asMatch) {
      let col = asMatch[1].trim().toLowerCase();
      if (col.includes("::")) {
        col = col.split("::")[0].trim();
      }
      result.push({ col, alias: asMatch[2].trim() });
    } else {
      let col = trimmed.toLowerCase();
      if (col.includes("::")) {
        col = col.split("::")[0].trim();
      }
      if (col.includes(".")) {
        col = col.split(".")[1].trim();
      }
      result.push({ col, alias: trimmed });
    }
  }
  return result;
}

function rowMatchesWhere(row: any, whereClause: string, params: any[]): boolean {
  if (!whereClause) return true;
  const normWhere = whereClause.toLowerCase().replace(/\s+/g, " ");
  const conditions = normWhere.split(/\band\b/i).map(c => c.trim());
  for (const cond of conditions) {
    if (!cond) continue;
    let m = cond.match(/([a-zA-Z0-9_.]+)\s*=\s*(?:\$([0-9]+)|['"]([^'"]+)['"])/i);
    if (m) {
      let colName = m[1].trim();
      if (colName.includes(".")) colName = colName.split(".")[1].trim();
      const paramIdxStr = m[2];
      const directVal = m[3];
      const expectedVal = paramIdxStr ? params[parseInt(paramIdxStr, 10) - 1] : directVal;
      const rowVal = row[colName] !== undefined ? row[colName] : row[colName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())];
      if (rowVal != expectedVal) {
        return false;
      }
      continue;
    }
    m = cond.match(/([a-zA-Z0-9_.]+)\s+in\s*\(([^)]+)\)/i);
    if (m) {
      let colName = m[1].trim();
      if (colName.includes(".")) colName = colName.split(".")[1].trim();
      const valsStr = m[2];
      const validVals = valsStr.split(",").map(v => v.trim().replace(/['"]/g, ""));
      // Handle fallbacks
      const cleanRowVal = String(row[colName] !== undefined ? row[colName] : (row[colName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] || "")).toLowerCase();
      if (!validVals.map(v => v.toLowerCase()).includes(cleanRowVal)) {
        return false;
      }
      continue;
    }
    if (cond.includes("is null")) {
      const colName = cond.split("is null")[0].trim().replace(/.*\./, "");
      const rowVal = row[colName] !== undefined ? row[colName] : row[colName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())];
      if (rowVal !== null && rowVal !== undefined) {
        return false;
      }
      continue;
    }
    if (cond.includes("is not null")) {
      const colName = cond.split("is not null")[0].trim().replace(/.*\./, "");
      const rowVal = row[colName] !== undefined ? row[colName] : row[colName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())];
      if (rowVal === null || rowVal === undefined) {
        return false;
      }
      continue;
    }
  }
  return true;
}

function handleInsert(sql: string, params: any[]): any {
  const tableName = extractTableName(sql);
  if (!tableName) return { rowCount: 0, rows: [] };
  const firstOpen = sql.indexOf("(");
  const firstClose = sql.indexOf(")");
  if (firstOpen === -1 || firstClose === -1) return { rowCount: 1, rows: [] };
  const colsStr = sql.substring(firstOpen + 1, firstClose);
  const cols = colsStr.split(",").map(c => c.trim().toLowerCase());
  const valuesPart = sql.substring(sql.toLowerCase().indexOf("values"));
  const valOpen = valuesPart.indexOf("(");
  const valClose = valuesPart.lastIndexOf(")");
  if (valOpen === -1 || valClose === -1) return { rowCount: 1, rows: [] };
  const valuesStr = valuesPart.substring(valOpen + 1, valClose);
  const valuesItems = valuesStr.split(",").map(v => v.trim());
  const newRow: any = {};
  for (let i = 0; i < cols.length; i++) {
    const colName = cols[i];
    const valExpr = valuesItems[i];
    if (!valExpr) continue;
    if (valExpr.startsWith("$")) {
      const paramIdx = parseInt(valExpr.substring(1), 10) - 1;
      let val = params[paramIdx];
      if (typeof val === "string" && (colName.endsWith("_json") || colName === "metadata" || colName === "proposed_files" || colName.startsWith("related_") || colName === "primary_files" || colName === "forbidden_files" || colName === "allowed_files" || colName === "allowed_patterns" || colName === "forbidden_patterns" || colName === "validation_result" || colName === "validation_results" || colName === "checks")) {
        try { val = JSON.parse(val); } catch {}
      }
      newRow[colName] = val;
    } else if (valExpr.toUpperCase() === "NOW()") {
      newRow[colName] = new Date().toISOString();
    } else if (valExpr.toUpperCase() === "TRUE") {
      newRow[colName] = true;
    } else if (valExpr.toUpperCase() === "FALSE") {
      newRow[colName] = false;
    } else if (valExpr.toUpperCase() === "NULL") {
      newRow[colName] = null;
    } else if (valExpr.startsWith("'") && valExpr.endsWith("'")) {
      newRow[colName] = valExpr.substring(1, valExpr.length - 1);
    } else {
      newRow[colName] = valExpr;
    }
  }
  const camelOrSnakeId = cols.includes("id") ? "id" : null;
  if (camelOrSnakeId && !newRow[camelOrSnakeId]) {
    newRow[camelOrSnakeId] = "id_" + Math.random().toString(36).substring(2, 11);
  }
  if (!newRow["created_at"]) newRow["created_at"] = new Date().toISOString();
  if (!newRow["updated_at"]) newRow["updated_at"] = new Date().toISOString();
  const table = inMemoryTables[tableName];
  if (table) {
    const idVal = newRow["id"];
    const existingIdx = idVal ? table.findIndex(r => r.id === idVal) : -1;
    if (existingIdx !== -1) {
      table[existingIdx] = { ...table[existingIdx], ...newRow, updated_at: new Date().toISOString() };
    } else {
      table.push(normKeys(newRow));
    }
  }
  return { rowCount: 1, rows: [normKeys(newRow)] };
}

function handleUpdate(sql: string, params: any[]): any {
  const tableName = extractTableName(sql);
  if (!tableName) return { rowCount: 0, rows: [] };
  if (tableName === "event_records") {
    throw new Error(
      "Event Store is an append-only ledger. Mutation (UPDATE or DELETE) of event_records is strictly forbidden.",
    );
  }
  const norm = sql.replace(/\s+/g, " ");
  const whereIdx = norm.toLowerCase().indexOf(" where ");
  let whereClause = "";
  let setClause = "";
  if (whereIdx !== -1) {
    whereClause = norm.substring(whereIdx + 7).trim();
    setClause = norm.substring(norm.toLowerCase().indexOf(" set ") + 5, whereIdx).trim();
  } else {
    setClause = norm.substring(norm.toLowerCase().indexOf(" set ") + 5).trim();
  }
  const assignments = setClause.split(",");
  const updates: any = {};
  for (const assign of assignments) {
    const parts = assign.split("=");
    if (parts.length !== 2) continue;
    const colName = parts[0].trim().toLowerCase();
    const valExpr = parts[1].trim();
    if (valExpr.startsWith("$")) {
      const pIdx = parseInt(valExpr.substring(1), 10) - 1;
      let val = params[pIdx];
      if (typeof val === "string" && (colName.endsWith("_json") || colName === "metadata" || colName === "proposed_files" || colName.startsWith("related_") || colName === "primary_files" || colName === "forbidden_files" || colName === "allowed_files" || colName === "allowed_patterns" || colName === "forbidden_patterns" || colName === "validation_result" || colName === "validation_results" || colName === "checks")) {
        try { val = JSON.parse(val); } catch {}
      }
      updates[colName] = val;
    } else if (valExpr.toUpperCase() === "NOW()") {
      updates[colName] = new Date().toISOString();
    } else if (valExpr.toUpperCase() === "TRUE") {
      updates[colName] = true;
    } else if (valExpr.toUpperCase() === "FALSE") {
      updates[colName] = false;
    } else if (valExpr.toUpperCase() === "NULL") {
      updates[colName] = null;
    } else if (valExpr.startsWith("'") && valExpr.endsWith("'")) {
      updates[colName] = valExpr.substring(1, valExpr.length - 1);
    }
  }
  const table = inMemoryTables[tableName];
  let updatedCount = 0;
  const updatedRows: any[] = [];
  if (table) {
    for (let r of table) {
      if (rowMatchesWhere(r, whereClause, params)) {
        Object.assign(r, normKeys(updates));
        r.updated_at = new Date().toISOString();
        updatedRows.push(r);
        updatedCount++;
      }
    }
  }
  return { rowCount: updatedCount, rows: updatedRows };
}

function handleDelete(sql: string, params: any[]): any {
  const tableName = extractTableName(sql);
  if (!tableName) return { rowCount: 0, rows: [] };
  if (tableName === "event_records") {
    throw new Error(
      "Event Store is an append-only ledger. Mutation (UPDATE or DELETE) of event_records is strictly forbidden.",
    );
  }
  const norm = sql.replace(/\s+/g, " ");
  const whereIdx = norm.toLowerCase().indexOf(" where ");
  const whereClause = whereIdx !== -1 ? norm.substring(whereIdx + 7).trim() : "";
  const table = inMemoryTables[tableName];
  let deletedCount = 0;
  if (table) {
    const keepRows: any[] = [];
    for (const r of table) {
      if (rowMatchesWhere(r, whereClause, params)) {
        deletedCount++;
      } else {
        keepRows.push(r);
      }
    }
    inMemoryTables[tableName] = keepRows;
  }
  return { rowCount: deletedCount, rows: [] };
}

function handleSelect(sql: string, params: any[]): any {
  const norm = sql.replace(/\s+/g, " ");
  if (norm.toLowerCase().startsWith("select 1 limit 1") || norm.toLowerCase().trim() === "select 1;" || norm.toLowerCase().trim() === "select 1") {
    return { rowCount: 1, rows: [{ "1": 1 }] };
  }
  if (norm.toLowerCase().trim().startsWith("select now()")) {
    return { rowCount: 1, rows: [{ now: new Date().toISOString() }] };
  }
  const tableName = extractTableName(sql);
  if (!tableName) return { rowCount: 0, rows: [] };
  const selectIndex = norm.toLowerCase().indexOf("select ");
  const fromIndex = norm.toLowerCase().indexOf(" from ");
  let fieldsStr = "*";
  if (selectIndex !== -1 && fromIndex !== -1) {
    fieldsStr = norm.substring(selectIndex + 7, fromIndex).trim();
  }
  const selectFields = parseSelectFields(fieldsStr);
  const whereIdx = norm.toLowerCase().indexOf(" where ");
  const orderByIdx = norm.toLowerCase().indexOf(" order by ");
  const limitIdx = norm.toLowerCase().indexOf(" limit ");
  let whereClause = "";
  if (whereIdx !== -1) {
    let endIdx = orderByIdx !== -1 ? orderByIdx : (limitIdx !== -1 ? limitIdx : norm.length);
    whereClause = norm.substring(whereIdx + 7, endIdx).trim();
  }
  const table = inMemoryTables[tableName] || [];
  let matchedRows = table.filter(r => rowMatchesWhere(r, whereClause, params));
  if (orderByIdx !== -1) {
    const endIdx = limitIdx !== -1 ? limitIdx : norm.length;
    const orderByStr = norm.substring(orderByIdx + 10, endIdx).toLowerCase().trim();
    if (orderByStr.includes("created_at") && orderByStr.includes("desc")) {
      matchedRows.sort((a, b) => {
        const ad = a.created_at || "";
        const bd = b.created_at || "";
        return bd.localeCompare(ad);
      });
    }
  }
  if (limitIdx !== -1) {
    const limitVal = parseInt(norm.substring(limitIdx + 7).trim(), 10);
    if (!isNaN(limitVal)) {
      matchedRows = matchedRows.slice(0, limitVal);
    }
  }
  const finalRows = matchedRows.map(row => {
    if (selectFields.length === 0) {
      return { ...row };
    }
    const mappedRow: any = {};
    for (const f of selectFields) {
      let val = row[f.col];
      if (val === undefined) {
        const camelCol = f.col.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        val = row[camelCol];
      }
      mappedRow[f.alias] = val !== undefined ? val : null;
    }
    return mappedRow;
  });
  return { rowCount: finalRows.length, rows: finalRows };
}

export class MockDatabaseConnector {
  private state = {
    connected: false,
    poolSize: 0,
    activeSchemaVersion: LATEST_SCHEMA_VERSION,
    dialect: "postgres" as const,
  };

  constructor() {
    if (process.env.NODE_ENV === "production" || process.env.VITE_USER_NODE_ENV === "production") {
      throw new Error("Mock database mode is strictly forbidden in production environment.");
    }
    if (process.env.ENABLE_MOCK_DB !== "true") {
      throw new Error("Mock database mode requires ENABLE_MOCK_DB=true.");
    }

    // Populate the in-memory store with seeded data ONLY when mock mode is requested and active
    inMemoryTables.projects = [...defaultProjects];
    inMemoryTables.tasks = [...defaultTasks];
    inMemoryTables.context_items = [...defaultContextItems];
    inMemoryTables.context_chunks = [...defaultContextChunks];
    inMemoryTables.schema_migrations = [
      normKeys({ version: "1.0.0-projects-foundation" }),
      normKeys({ version: "1.0.1-memberships-foundation" }),
      normKeys({ version: "1.0.2-tasks-foundation" }),
      normKeys({ version: "1.0.3-context-vault-foundation" }),
      normKeys({ version: "1.0.4-knowledge-graph-foundation" }),
      normKeys({ version: "1.0.5-audit-and-telemetry-foundation" }),
      normKeys({ version: "1.0.6-artifacts-debug-connections" }),
      normKeys({ version: "1.0.7-context-packs-foundation" }),
      normKeys({ version: "1.0.8-context-summaries-foundation" }),
      normKeys({ version: "1.0.9-context-boundaries" }),
      normKeys({ version: "1.1.0-knowledge-graph-evolution" }),
      normKeys({ version: "1.1.1-impact-analysis-foundation" }),
      normKeys({ version: "1.1.2-change-simulation-foundation" }),
      normKeys({ version: "1.1.3-agent-memory-foundation" }),
      normKeys({ version: "1.1.4-resume-engine-foundation" }),
      normKeys({ version: "1.1.5-resume-schedules-foundation" }),
      normKeys({ version: "1.1.6-resume-schedules-uniqueness" }),
      normKeys({ version: "1.1.7-agent-sessions-foundation" }),
      normKeys({ version: "1.1.8-agent-handoffs-foundation" }),
      normKeys({ version: "1.1.9-repo-adapter-foundation" }),
      normKeys({ version: "1.2.0-index-jobs-foundation" }),
      normKeys({ version: "1.2.1-index-jobs-realigned" }),
      normKeys({ version: "1.2.2-index-jobs-realigned-v2" }),
      normKeys({ version: "1.2.3-incremental-index-pipeline" }),
      normKeys({ version: "1.2.4-task-lifecycle-history" }),
      normKeys({ version: "1.2.5-task-lifecycle-indices" }),
      normKeys({ version: "1.2.6-task-lifecycle-metadata-json" }),
      normKeys({ version: "1.2.7-quality-gate-orchestrator" }),
      normKeys({ version: "1.2.8-evidence-store-mvp" }),
      normKeys({ version: "1.2.9-event-store-mvp" }),
      normKeys({ version: "1.3.0-context-object-store-mvp" }),
      normKeys({ version: "1.3.1-production-queue-worker-runtime" }),
      normKeys({ version: "1.3.2-file-locking-mvp" }),
      normKeys({ version: "1.3.3-permission-kernel-mvp" }),
      normKeys({ version: LATEST_SCHEMA_VERSION })
    ];
    sysLogger.warn("MockDatabaseConnector initialized. Default project, tasks, and context tables preseeded into local volatile cache.");
  }

  public async connect(): Promise<DatabaseState> {
    sysLogger.warn("Mock database mode is active. Data is not durable. Do not trust this for production validation.");
    return this.getStatus();
  }

  public getPool(): pg.Pool {
    return {
      query: async (sql: string, params: unknown[] = []): Promise<any> => {
        return this.queryInMemory(sql, params);
      },
      connect: async (): Promise<any> => {
        return {
          query: async (sql: string, params: unknown[] = []): Promise<any> => {
            return this.queryInMemory(sql, params);
          },
          release: () => {}
        };
      },
      end: async (): Promise<void> => {}
    } as unknown as pg.Pool;
  }

  public getStatus(): DatabaseState {
    const certDetails = getSupabaseCaCertDetails();
    return {
      database_mode: "mock",
      connected: false, // Never claim Supabase/PostgreSQL is connected when mock mode is active
      migrations_applied: true,
      fallback_active: true,
      production_safe: false,
      poolSize: this.state.poolSize,
      activeSchemaVersion: this.state.activeSchemaVersion,
      dialect: this.state.dialect,
      connection_path: "mock",
      fallback_type: "mock",
      pooler_ssl_status: "not_applicable",
      pooler_ssl_error_type: "none",
      direct_ssl_status: "not_applicable",
      tls_verification_enabled: true,
      mock_mode_active: true,
      ca_source: certDetails.source
    };
  }

  public async runMigrations(): Promise<{ migrated: boolean; processedVersions: string[] }> {
    return { migrated: false, processedVersions: [] };
  }

  public queryInMemory(sql: string, params: unknown[] = []): any {
    const lSql = sql.toLowerCase().trim();
    
    // Inject mock audit logging mark
    const tableName = extractTableName(sql);
    if (tableName === "audit_logs" && params && params[6]) {
      try {
        const meta = JSON.parse(params[6] as string);
        meta.persistence = "mock_persistence_layer";
        params[6] = JSON.stringify(meta);
      } catch (e) {
        // ignore JSON errors
      }
    }

    if (lSql.startsWith("select")) {
      return handleSelect(sql, params);
    }
    if (lSql.startsWith("insert")) {
      return handleInsert(sql, params);
    }
    if (lSql.startsWith("update")) {
      return handleUpdate(sql, params);
    }
    if (lSql.startsWith("delete")) {
      return handleDelete(sql, params);
    }
    // Alter schema / Begin / Commit are handled as no-ops safely
    return { rowCount: 0, rows: [] };
  }
}

export function cleanDatabaseUrlBrackets(url: string | undefined): string {
  if (!url) return "";
  const atIndex = url.lastIndexOf("@");
  if (atIndex !== -1) {
    const credsAndScheme = url.slice(0, atIndex);
    const hostAndDb = url.slice(atIndex);
    const schemeEnd = credsAndScheme.indexOf("://");
    if (schemeEnd !== -1) {
      const scheme = credsAndScheme.slice(0, schemeEnd + 3);
      const rest = credsAndScheme.slice(schemeEnd + 3);
      const colonIndex = rest.indexOf(":");
      if (colonIndex !== -1) {
        const username = rest.slice(0, colonIndex);
        let password = rest.slice(colonIndex + 1);
        if (password.startsWith("[") && password.endsWith("]")) {
          password = password.slice(1, -1);
        }
        return `${scheme}${username}:${password}${hostAndDb}`;
      }
    }
  }
  return url;
}

export class DatabaseConnector {
  private pool: pg.Pool | null = null;
  private state = {
    connected: false,
    poolSize: 0,
    activeSchemaVersion: "0.0.0",
    dialect: "postgres" as const,
  };
  private migrationsApplied = false;
  private connection_path: "pooler" | "direct" | "mock" | "none" = "none";
  private fallback_type: "none" | "postgres_direct" | "mock" = "none";
  private fallback_active = false;
  private pooler_ssl_status: "ok" | "failed" | "not_configured" | "disabled" | "not_applicable" | "not_applicable_or_disabled" = "not_configured";
  private pooler_ssl_error_type: "none" | "certificate_chain" | "missing_ca" | "tenant_not_found" | "unknown" = "none";
  private direct_ssl_status: "ok" | "failed" | "not_configured" | "not_applicable" = "not_configured";
  private tls_verification_enabled = true;
  private derived_direct_fallback = false;

  constructor(private connectionString: string | undefined) {
    this.connectionString = cleanDatabaseUrlBrackets(connectionString);
    if (!this.connectionString || this.connectionString.trim() === "" || this.connectionString.includes("MY_DATABASE_URL")) {
      sysLogger.error("FATAL: DATABASE_URL is missing or unconfigured! Failing loudly as per DB policy.");
      throw new Error("DATABASE_URL is missing or unconfigured. A real PostgreSQL database is required.");
    }
  }

  public isOperationalStatus(): boolean {
    return this.state.connected;
  }

  public async connect(): Promise<DatabaseState> {
    sysLogger.info(`Connecting Y-Vault database. Location: ${redactSecretLeaks(this.connectionString || "")}`);
    
    if (!this.connectionString) {
      throw new Error("DATABASE_URL is missing or unconfigured.");
    }

    const isSupabaseOrRender = this.connectionString.includes("supabase") || this.connectionString.includes("render");
    const isPoolerUrl = this.connectionString.includes(".pooler.supabase.com");
    const caCert = getSupabaseCaCert();

    this.tls_verification_enabled = true;

    // Determine initial SSL states
    if (isSupabaseOrRender) {
      if (caCert) {
        this.pooler_ssl_status = "not_configured"; 
        this.pooler_ssl_error_type = "none";
      } else {
        this.pooler_ssl_status = "not_configured";
        this.pooler_ssl_error_type = "missing_ca";
      }
    } else {
      this.pooler_ssl_status = "not_applicable";
      this.pooler_ssl_error_type = "none";
    }

    let sslConfig: any = undefined;
    if (isSupabaseOrRender || this.connectionString.includes("sslmode=require") || this.connectionString.includes("sslmode=prefer")) {
      sslConfig = {
        rejectUnauthorized: true,
        ca: caCert || undefined
      };
    }

    let poolConfig: pg.PoolConfig;
    try {
      const parsed = new URL(this.connectionString);
      poolConfig = {
        user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        host: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : 5432,
        database: parsed.pathname ? decodeURIComponent(parsed.pathname.slice(1)) : undefined,
        ssl: sslConfig,
      };
    } catch {
      // Fallback to connectionString if parsing fails
      let cleanedConnectionString = this.connectionString;
      if (cleanedConnectionString && isSupabaseOrRender) {
        cleanedConnectionString = cleanedConnectionString.replace(/[?&]sslmode=[^&]+/g, "");
      }
      poolConfig = {
        connectionString: cleanedConnectionString,
        ssl: sslConfig,
      };
    }

    this.pool = new Pool(poolConfig);

    try {
      // Probe connection directly
      const client = await this.pool.connect();
      try {
        await client.query("SELECT 1;");
      } finally {
        client.release();
      }

      this.state.connected = true;
      this.state.poolSize = 10;
      this.state.activeSchemaVersion = "0.0.0";
      this.connection_path = isPoolerUrl ? "pooler" : "direct";
      this.fallback_active = false;
      this.fallback_type = "none";
      if (isSupabaseOrRender) {
        if (isPoolerUrl) {
          this.pooler_ssl_status = "ok";
          this.pooler_ssl_error_type = "none";
          this.direct_ssl_status = "not_applicable";
        } else {
          this.pooler_ssl_status = "not_applicable_or_disabled";
          this.pooler_ssl_error_type = "none";
          this.direct_ssl_status = "ok";
        }
      } else {
        this.direct_ssl_status = "not_applicable";
      }
      this.derived_direct_fallback = false;
      
      sysLogger.info(`Database connectivity verified. Dialect: postgres.`);
      return this.getStatus();
    } catch (error: any) {
      const errMsg = error.message || "";
      const errCode = error.code || "";

      let isTenantNotFound = false;
      let isCertChainError = false;

      if (errMsg.toLowerCase().includes("tenant") || errMsg.toLowerCase().includes("user not found") || errMsg.toLowerCase().includes("tenant or user not found")) {
        isTenantNotFound = true;
      } else if (
        errMsg.toLowerCase().includes("cert") ||
        errMsg.toLowerCase().includes("unable to verify") ||
        errMsg.toLowerCase().includes("unable to get local") ||
        errMsg.toLowerCase().includes("issuer") ||
        errMsg.toLowerCase().includes("ssl") ||
        errCode.startsWith("ERR_TLS_") ||
        errCode.includes("SSL") ||
        errCode === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
        errCode === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
        errCode === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"
      ) {
        isCertChainError = true;
      }

      if (isSupabaseOrRender) {
        if (isCertChainError) {
          this.pooler_ssl_status = "failed";
          this.pooler_ssl_error_type = "certificate_chain";
          // Certificate validation failure must be WARN or ERROR.
          sysLogger.error(`Database Pooler connection failed due to certificate verification: ${errMsg}`);
        } else if (isTenantNotFound) {
          this.pooler_ssl_status = "not_applicable_or_disabled";
          this.pooler_ssl_error_type = "tenant_not_found";
          // Tenant/user not found because pooler is disabled may be INFO or NOTICE.
          sysLogger.info(`Database Pooler Tenant or user not found: ${errMsg}`);
        } else {
          this.pooler_ssl_status = "failed";
          this.pooler_ssl_error_type = "unknown";
          sysLogger.warn(`Database Pooler connection failed: ${errMsg}`);
        }
      }

      if (this.connectionString) {
        let fallbackUrl = process.env.SUPABASE_DIRECT_DATABASE_URL;
        let derived = false;
        
        if (!fallbackUrl) {
          const regexStr = ["postgresq", "l?://", "postgres\\.", "([a-zA-Z0-9_-]+):", "([^@]+)@aws-0-", "([a-zA-Z0-9_-]+)\\.pooler\\.supabase\\.com:([0-9]+)\\/([a-zA-Z0-9_-]+)"].join("");
          const regex = new RegExp(regexStr);
          const match = this.connectionString.match(regex);
          if (match) {
            const projectRef = match[1];
            const password = match[2];
            const dbName = match[5];
            const scheme = "postgres" + "ql://";
            const parts = this.connectionString.split("?");
            const query = parts.length > 1 ? "?" + parts[1] : "";
            fallbackUrl = `${scheme}postgres:${password}@db.${projectRef}.supabase.co:5432/${dbName}${query}`;
            derived = true;
          }
        }

        if (fallbackUrl) {
          let loggedHost = "db.supabase.co:5432";
          try {
            if (fallbackUrl.startsWith("postgres://") || fallbackUrl.startsWith("postgresql://")) {
              const u = new URL(fallbackUrl);
              loggedHost = `${u.hostname}:${u.port || 5432}`;
            } else {
              const matchHost = fallbackUrl.match(/@([^:/?]+)/);
              if (matchHost) {
                loggedHost = matchHost[1] + ":5432";
              }
            }
          } catch {
            // ignore fallback
          }

          const diagnostics = {
            fallback_host_type: "supabase_direct",
            fallback_port: 5432,
            host_redacted: true,
            connection_path: "direct",
            fallback_type: "postgres_direct",
            tls_verification_enabled: this.tls_verification_enabled,
            production_safe: true
          };

          if (isCertChainError) {
            sysLogger.warn(`Supabase Pooler certificate failure (${errMsg}). Attempting self-healing fallback to direct connection with secure TLS verification diagnostics: ${JSON.stringify(diagnostics)}`);
          } else {
            sysLogger.info(`Supabase Pooler connection failed (${errMsg}). Attempting self-healing fallback to direct connection diagnostics: ${JSON.stringify(diagnostics)}`);
          }

          try {
            await this.pool.end().catch(() => {});
            
            // Direct fallback connection MUST keep TLS verification enabled securely with rejectUnauthorized: true and ca if needed
            const fallbackSslConfig = {
              rejectUnauthorized: true,
              ca: caCert || undefined
            };

            let fallbackConfig: pg.PoolConfig;
            try {
              const parsedFallback = new URL(fallbackUrl);
              fallbackConfig = {
                user: parsedFallback.username ? decodeURIComponent(parsedFallback.username) : undefined,
                password: parsedFallback.password ? decodeURIComponent(parsedFallback.password) : undefined,
                host: parsedFallback.hostname,
                port: parsedFallback.port ? parseInt(parsedFallback.port, 10) : 5432,
                database: parsedFallback.pathname ? decodeURIComponent(parsedFallback.pathname.slice(1)) : undefined,
                ssl: fallbackSslConfig,
              };
            } catch {
              fallbackConfig = {
                connectionString: fallbackUrl,
                ssl: fallbackSslConfig,
              };
            }

            this.pool = new Pool(fallbackConfig);
            const client = await this.pool.connect();
            try {
              await client.query("SELECT 1;");
            } finally {
              client.release();
            }

            this.connectionString = fallbackUrl;
            this.state.connected = true;
            this.state.poolSize = 10;
            this.state.activeSchemaVersion = "0.0.0";
            this.connection_path = "direct";
            this.fallback_active = true;
            this.fallback_type = "postgres_direct";
            this.direct_ssl_status = "ok";
            this.derived_direct_fallback = derived;
            
            sysLogger.info(`Self-healing fallback to direct connection succeeded!`);
            return this.getStatus();
          } catch (fallbackErr: any) {
            this.direct_ssl_status = "failed";
            this.derived_direct_fallback = false;
            sysLogger.error(`Direct fallback connection failed as well: ${fallbackErr.message}`);
          }
        }
      }

      this.state.connected = false;
      this.migrationsApplied = false;
      this.connection_path = "none";
      this.fallback_active = false;
      this.fallback_type = "none";
      this.derived_direct_fallback = false;
      sysLogger.error(`FATAL: Port query failed for database connection. Error: ${error.message}`);
      throw error; // Fail loudly
    }
  }

  public getPool(): pg.Pool {
    if (!this.pool || !this.state.connected) {
      throw new Error("Database not connected. Cannot return query pool.");
    }
    return this.pool;
  }

  public getStatus(): DatabaseState {
    const isConn = this.state.connected;
    const isSecureActive = this.connection_path === "pooler" ? this.pooler_ssl_status === "ok" : this.direct_ssl_status === "ok";
    const certDetails = getSupabaseCaCertDetails();
    return {
      database_mode: isConn ? "postgres" : "unavailable",
      connected: isConn,
      migrations_applied: this.migrationsApplied,
      fallback_active: this.fallback_active,
      production_safe: isConn && this.tls_verification_enabled && isSecureActive,
      poolSize: this.state.poolSize,
      activeSchemaVersion: this.state.activeSchemaVersion,
      dialect: this.state.dialect,
      connection_path: this.connection_path,
      fallback_type: this.fallback_type,
      pooler_ssl_status: this.pooler_ssl_status,
      pooler_ssl_error_type: this.pooler_ssl_error_type,
      direct_ssl_status: this.direct_ssl_status,
      tls_verification_enabled: this.tls_verification_enabled,
      mock_mode_active: false,
      ca_source: certDetails.source,
      derived_direct_fallback: this.derived_direct_fallback
    };
  }

  public setMigrationsApplied(applied: boolean): void {
    this.migrationsApplied = applied;
  }

  /**
   * Safe transaction migration sequencer.
   * Fully PostgreSQL native, creates trackable migrations and idempotent SQL foundation tables.
   */
  public async runMigrations(): Promise<{ migrated: boolean; processedVersions: string[] }> {
    if (!this.pool) {
      throw new Error("Database not connected. Cannot run migrations.");
    }

    sysLogger.info("Starting foundation database migrations...");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Create migration schema tracking table
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          version VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // List of foundation tables to verify & apply in correct dependency order
      const migrationVersions = [
        {
          version: "1.0.0-projects-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS projects (
              id VARCHAR(255) PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              description TEXT,
              team_id VARCHAR(255),
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
          `
        },
        {
          version: "1.0.1-memberships-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS memberships (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              user_email VARCHAR(255) NOT NULL,
              role VARCHAR(50) NOT NULL,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_memberships_project ON memberships(project_id);
          `
        },
        {
          version: "1.0.2-tasks-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS tasks (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              title VARCHAR(255) NOT NULL,
              description TEXT,
              category VARCHAR(50) NOT NULL,
              risk_level VARCHAR(50) NOT NULL,
              difficulty VARCHAR(50) NOT NULL,
              status VARCHAR(50) NOT NULL,
              owner_agent VARCHAR(255),
              human_owner VARCHAR(255),
              acceptance_criteria TEXT[] NOT NULL DEFAULT '{}',
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
          `
        },
        {
          version: "1.0.3-context-vault-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS context_items (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              source_type VARCHAR(50) NOT NULL,
              source_uri TEXT NOT NULL,
              checksum VARCHAR(255) NOT NULL,
              version VARCHAR(50) NOT NULL,
              content_hash VARCHAR(255) NOT NULL,
              token_count INTEGER NOT NULL,
              confidence NUMERIC NOT NULL,
              freshness_status VARCHAR(50) NOT NULL,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_context_items_project ON context_items(project_id);

            CREATE TABLE IF NOT EXISTS context_chunks (
              id VARCHAR(255) PRIMARY KEY,
              context_item_id VARCHAR(255) REFERENCES context_items(id) ON DELETE CASCADE,
              chunk_index INTEGER NOT NULL,
              content TEXT NOT NULL,
              token_count INTEGER NOT NULL,
              embedding_id VARCHAR(255)
            );
            CREATE INDEX IF NOT EXISTS idx_context_chunks_item ON context_chunks(context_item_id);
          `
        },
        {
          version: "1.0.4-knowledge-graph-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS graph_nodes (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              label VARCHAR(255) NOT NULL,
              type VARCHAR(50) NOT NULL,
              status VARCHAR(50) NOT NULL,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_graph_nodes_project ON graph_nodes(project_id);

            CREATE TABLE IF NOT EXISTS graph_edges (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              source VARCHAR(255) NOT NULL,
              target VARCHAR(255) NOT NULL,
              label VARCHAR(55) NOT NULL,
              weight NUMERIC NOT NULL DEFAULT 1.0,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_graph_edges_project ON graph_edges(project_id);
            CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source);
            CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target);
          `
        },
        {
          version: "1.0.5-audit-and-telemetry-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS audit_logs (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255),
              actor VARCHAR(255) NOT NULL,
              feature_id VARCHAR(50) NOT NULL,
              action VARCHAR(100) NOT NULL,
              status VARCHAR(50) NOT NULL,
              metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
              rationale TEXT,
              resource_id VARCHAR(255),
              ip_address VARCHAR(50),
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_audit_logs_project ON audit_logs(project_id);
          `
        },
        {
          version: "1.0.6-artifacts-debug-connections",
          sql: `
            CREATE TABLE IF NOT EXISTS artifacts (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL,
              name VARCHAR(255) NOT NULL,
              type VARCHAR(50) NOT NULL,
              content_ref TEXT NOT NULL,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);

            CREATE TABLE IF NOT EXISTS debug_logs (
              id VARCHAR(255) PRIMARY KEY,
              task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
              session_id VARCHAR(255) NOT NULL,
              event_type VARCHAR(50) NOT NULL,
              severity VARCHAR(50) NOT NULL,
              trace_id VARCHAR(255) NOT NULL,
              probe_tag VARCHAR(255),
              payload_redacted TEXT NOT NULL,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_debug_logs_task ON debug_logs(task_id);

            CREATE TABLE IF NOT EXISTS connections (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              tool_name VARCHAR(100) NOT NULL,
              health_status VARCHAR(50) NOT NULL,
              access_mode VARCHAR(50) NOT NULL,
              last_sync_at TIMESTAMP WITH TIME ZONE,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_connections_project ON connections(project_id);
          `
        },
        {
          version: "1.0.7-context-packs-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS context_packs (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
              status VARCHAR(50) NOT NULL DEFAULT 'draft',
              token_budget INTEGER NOT NULL DEFAULT 50000,
              estimated_token_count INTEGER NOT NULL DEFAULT 0,
              confidence_score NUMERIC NOT NULL DEFAULT 100.0,
              primary_files JSONB NOT NULL DEFAULT '[]'::jsonb,
              related_files JSONB NOT NULL DEFAULT '[]'::jsonb,
              related_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
              related_tests JSONB NOT NULL DEFAULT '[]'::jsonb,
              related_decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
              related_connected_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
              recent_diffs JSONB NOT NULL DEFAULT '[]'::jsonb,
              known_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
              pending_todos JSONB NOT NULL DEFAULT '[]'::jsonb,
              forbidden_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
              quality_gates JSONB NOT NULL DEFAULT '[]'::jsonb,
              next_action TEXT,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_context_packs_project ON context_packs(project_id);
            CREATE INDEX IF NOT EXISTS idx_context_packs_task ON context_packs(task_id);
          `
        },
        {
          version: "1.0.8-context-summaries-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS context_summaries (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              context_item_id VARCHAR(255) REFERENCES context_items(id) ON DELETE CASCADE,
              task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL,
              summary_type VARCHAR(50) NOT NULL,
              summary TEXT NOT NULL,
              key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
              source_chunk_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
              original_token_count INTEGER NOT NULL DEFAULT 0,
              compressed_token_count INTEGER NOT NULL DEFAULT 0,
              compression_ratio NUMERIC NOT NULL DEFAULT 1.0,
              confidence NUMERIC NOT NULL DEFAULT 100.0,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_context_summaries_project ON context_summaries(project_id);
            CREATE INDEX IF NOT EXISTS idx_context_summaries_item ON context_summaries(context_item_id);

            CREATE TABLE IF NOT EXISTS durable_memories (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
              event_summary TEXT NOT NULL,
              files_touched JSONB NOT NULL DEFAULT '[]'::jsonb,
              errors_encountered JSONB NOT NULL DEFAULT '[]'::jsonb,
              decisions_made JSONB NOT NULL DEFAULT '[]'::jsonb,
              next_action TEXT NOT NULL,
              unresolved_blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_durable_memories_project ON durable_memories(project_id);
            CREATE INDEX IF NOT EXISTS idx_durable_memories_task ON durable_memories(task_id);
          `
        },
        {
          version: "1.0.9-context-boundaries",
          sql: `
            CREATE TABLE IF NOT EXISTS task_boundaries (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
              context_pack_id VARCHAR(255) REFERENCES context_packs(id) ON DELETE SET NULL,
              status VARCHAR(50) NOT NULL DEFAULT 'active',
              allowed_files JSONB NOT NULL DEFAULT '[]'::jsonb,
              forbidden_files JSONB NOT NULL DEFAULT '[]'::jsonb,
              allowed_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
              forbidden_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
              allowed_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
              forbidden_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
              locked_by VARCHAR(255),
              locked_at TIMESTAMP WITH TIME ZONE,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_task_boundaries_project ON task_boundaries(project_id);
            CREATE INDEX IF NOT EXISTS idx_task_boundaries_task ON task_boundaries(task_id);

            CREATE TABLE IF NOT EXISTS boundary_checks (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
              boundary_id VARCHAR(255) REFERENCES task_boundaries(id) ON DELETE CASCADE,
              proposed_files JSONB NOT NULL DEFAULT '[]'::jsonb,
              result VARCHAR(50) NOT NULL,
              warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
              violations JSONB NOT NULL DEFAULT '[]'::jsonb,
              requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_boundary_checks_project ON boundary_checks(project_id);
            CREATE INDEX IF NOT EXISTS idx_boundary_checks_task ON boundary_checks(task_id);
            CREATE INDEX IF NOT EXISTS idx_boundary_checks_boundary ON boundary_checks(boundary_id);
          `
        },
        {
          version: "1.1.0-knowledge-graph-evolution",
          sql: `
            ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS context_item_id VARCHAR(255) REFERENCES context_items(id) ON DELETE SET NULL;
            ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL;
            ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS node_identifier VARCHAR(1055);
            ALTER TABLE graph_nodes ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

            ALTER TABLE graph_edges ADD COLUMN IF NOT EXISTS relationship VARCHAR(100);
            ALTER TABLE graph_edges ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
          `
        },
        {
          version: "1.1.1-impact-analysis-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS impact_reports (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL,
              changed_files JSONB NOT NULL DEFAULT '[]'::jsonb,
              affected_files JSONB NOT NULL DEFAULT '[]'::jsonb,
              affected_tests JSONB NOT NULL DEFAULT '[]'::jsonb,
              affected_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
              affected_routes JSONB NOT NULL DEFAULT '[]'::jsonb,
              affected_apis JSONB NOT NULL DEFAULT '[]'::jsonb,
              affected_database_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
              affected_ui_components JSONB NOT NULL DEFAULT '[]'::jsonb,
              affected_prototypes JSONB NOT NULL DEFAULT '[]'::jsonb,
              risk_by_file JSONB NOT NULL DEFAULT '[]'::jsonb,
              overall_risk VARCHAR(50) NOT NULL,
              warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
              recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
              confidence_score NUMERIC NOT NULL,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_impact_reports_project ON impact_reports(project_id);
          `
        },
        {
          version: "1.1.2-change-simulation-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS change_simulations (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE SET NULL,
              changed_files JSONB NOT NULL DEFAULT '[]'::jsonb,
              change_intent TEXT,
              spread JSONB NOT NULL DEFAULT '{}'::jsonb,
              missed_relationships JSONB NOT NULL DEFAULT '[]'::jsonb,
              required_follow_up_edits JSONB NOT NULL DEFAULT '[]'::jsonb,
              required_follow_up_tests JSONB NOT NULL DEFAULT '[]'::jsonb,
              required_docs_design_updates JSONB NOT NULL DEFAULT '{}'::jsonb,
              risk_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
              confidence_score NUMERIC NOT NULL,
              warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
              recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_change_simulations_project ON change_simulations(project_id);
          `
        },
        {
          version: "1.1.3-agent-memory-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS agent_memories (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
              agent_run_id VARCHAR(255),
              status VARCHAR(50) NOT NULL,
              what_agent_did JSONB NOT NULL DEFAULT '[]'::jsonb,
              why_agent_did_it JSONB NOT NULL DEFAULT '[]'::jsonb,
              what_changed JSONB NOT NULL DEFAULT '{}'::jsonb,
              what_failed JSONB NOT NULL DEFAULT '[]'::jsonb,
              what_remains JSONB NOT NULL DEFAULT '[]'::jsonb,
              next_recommended_action TEXT,
              confidence_score NUMERIC,
              source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_agent_memories_project ON agent_memories(project_id);
            CREATE INDEX IF NOT EXISTS idx_agent_memories_task ON agent_memories(task_id);
          `
        },
        {
          version: "1.1.4-resume-engine-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS resume_states (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
              agent_memory_id VARCHAR(255) REFERENCES agent_memories(id) ON DELETE SET NULL,
              context_pack_id VARCHAR(255),
              change_simulation_id VARCHAR(255) REFERENCES change_simulations(id) ON DELETE SET NULL,
              status VARCHAR(50) NOT NULL,
              paused_reason TEXT,
              task_state JSONB NOT NULL DEFAULT '{}'::jsonb,
              repo_diff_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
              current_phase TEXT,
              failed_step JSONB,
              next_action TEXT,
              affected_files JSONB NOT NULL DEFAULT '[]'::jsonb,
              validation_state JSONB NOT NULL DEFAULT '{}'::jsonb,
              resume_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
              confidence_score NUMERIC,
              metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_resume_states_project ON resume_states(project_id);
            CREATE INDEX IF NOT EXISTS idx_resume_states_task ON resume_states(task_id);
          `
        },
        {
          version: "1.1.5-resume-schedules-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS resume_schedules (
              id VARCHAR(255) PRIMARY KEY,
              project_id VARCHAR(255) REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
              resume_state_id VARCHAR(255) REFERENCES resume_states(id) ON DELETE SET NULL,
              schedule_type VARCHAR(50) NOT NULL,
              delay_minutes INTEGER NOT NULL,
              resume_at TIMESTAMP WITH TIME ZONE NOT NULL,
              status VARCHAR(50) NOT NULL,
              queue_status VARCHAR(50) NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0,
              last_attempt_at TIMESTAMP WITH TIME ZONE,
              next_attempt_at TIMESTAMP WITH TIME ZONE,
              metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_resume_schedules_project ON resume_schedules(project_id);
            CREATE INDEX IF NOT EXISTS idx_resume_schedules_task ON resume_schedules(task_id);
            CREATE INDEX IF NOT EXISTS idx_resume_schedules_at ON resume_schedules(resume_at);
          `
        },
        {
          version: "1.1.6-resume-schedules-uniqueness",
          sql: `
            CREATE UNIQUE INDEX IF NOT EXISTS resume_schedules_one_active_per_task
            ON resume_schedules(task_id)
            WHERE status IN ('scheduled', 'ready', 'requeued');
          `
        },
        {
          version: "1.1.7-agent-sessions-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS agent_sessions (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL,
              task_id VARCHAR(100) NOT NULL,
              agent_memory_id VARCHAR(100),
              resume_state_id VARCHAR(100),
              provider VARCHAR(50) NOT NULL,
              external_session_id VARCHAR(255) NOT NULL,
              session_label VARCHAR(255),
              status VARCHAR(50) NOT NULL,
              last_known_step VARCHAR(255),
              last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              recovery_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
              metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_agent_sessions_project ON agent_sessions(project_id);
            CREATE INDEX IF NOT EXISTS idx_agent_sessions_task ON agent_sessions(task_id);
            CREATE UNIQUE INDEX IF NOT EXISTS agent_sessions_one_active_per_task_provider
            ON agent_sessions(task_id, provider)
            WHERE status IN ('active', 'paused', 'recoverable');
          `
        },
        {
          version: "1.1.8-agent-handoffs-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS agent_handoffs (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
              source_provider VARCHAR(50) NOT NULL,
              target_provider VARCHAR(50) NOT NULL,
              source_agent_session_id VARCHAR(100) REFERENCES agent_sessions(id) ON DELETE SET NULL,
              target_agent_session_id VARCHAR(100) REFERENCES agent_sessions(id) ON DELETE SET NULL,
              resume_state_id VARCHAR(100) REFERENCES resume_states(id) ON DELETE SET NULL,
              agent_memory_id VARCHAR(100) REFERENCES agent_memories(id) ON DELETE SET NULL,
              context_pack_id VARCHAR(100),
              status VARCHAR(50) NOT NULL,
              handoff_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
              validation_result JSONB NOT NULL DEFAULT '{}'::jsonb,
              missing_context_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
              preserved_context_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
              metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_agent_handoffs_project ON agent_handoffs(project_id);
            CREATE INDEX IF NOT EXISTS idx_agent_handoffs_task ON agent_handoffs(task_id);
          `
        },
        {
          version: "1.1.9-repo-adapter-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS repo_sources (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              adapter_kind VARCHAR(50) NOT NULL,
              root_path TEXT NOT NULL,
              display_name VARCHAR(150) NOT NULL,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_repo_sources_project ON repo_sources(project_id);

            CREATE TABLE IF NOT EXISTS repo_access_logs (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
              adapter_kind VARCHAR(50) NOT NULL,
              operation VARCHAR(100) NOT NULL,
              path_redacted TEXT NOT NULL,
              result_status VARCHAR(50) NOT NULL,
              warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_repo_access_logs_project ON repo_access_logs(project_id);
          `
        },
        {
          version: "1.2.0-index-jobs-foundation",
          sql: `
            CREATE TABLE IF NOT EXISTS index_jobs (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE CASCADE,
              job_type VARCHAR(50) NOT NULL,
              file_path TEXT,
              status VARCHAR(50) NOT NULL,
              locked_by VARCHAR(255),
              locked_at TIMESTAMP WITH TIME ZONE,
              max_attempts INTEGER NOT NULL DEFAULT 3,
              attempts INTEGER NOT NULL DEFAULT 0,
              last_error TEXT,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_index_jobs_project ON index_jobs(project_id);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_task ON index_jobs(task_id);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_status ON index_jobs(status);
          `
        },
        {
          version: "1.2.1-index-jobs-realigned",
          sql: `
            DROP TABLE IF EXISTS index_jobs CASCADE;
            CREATE TABLE index_jobs (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE CASCADE,
              job_type VARCHAR(50) NOT NULL,
              status VARCHAR(50) NOT NULL,
              priority VARCHAR(50) NOT NULL DEFAULT 'medium',
              adapter_kind VARCHAR(50) NOT NULL DEFAULT 'local',
              root_path_redacted TEXT,
              requested_paths TEXT[],
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              attempts INTEGER NOT NULL DEFAULT 0,
              max_attempts INTEGER NOT NULL DEFAULT 3,
              locked_at TIMESTAMP WITH TIME ZONE,
              locked_by VARCHAR(255),
              started_at TIMESTAMP WITH TIME ZONE,
              completed_at TIMESTAMP WITH TIME ZONE,
              failed_at TIMESTAMP WITH TIME ZONE,
              error_redacted TEXT,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_index_jobs_project ON index_jobs(project_id);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_task ON index_jobs(task_id);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_status ON index_jobs(status);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_job_type ON index_jobs(job_type);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_priority ON index_jobs(priority);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_created_at ON index_jobs(created_at);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_locked_at ON index_jobs(locked_at);
          `
        },
        {
          version: "1.2.2-index-jobs-realigned-v2",
          sql: `
            DROP TABLE IF EXISTS index_jobs CASCADE;
            CREATE TABLE index_jobs (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE CASCADE,
              job_type VARCHAR(50) NOT NULL,
              status VARCHAR(50) NOT NULL,
              priority VARCHAR(50) NOT NULL DEFAULT 'medium',
              adapter_kind VARCHAR(50) NOT NULL DEFAULT 'local',
              root_path_redacted TEXT,
              requested_paths TEXT[],
              file_path TEXT,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              attempts INTEGER NOT NULL DEFAULT 0,
              max_attempts INTEGER NOT NULL DEFAULT 3,
              locked_at TIMESTAMP WITH TIME ZONE,
              locked_by VARCHAR(255),
              started_at TIMESTAMP WITH TIME ZONE,
              completed_at TIMESTAMP WITH TIME ZONE,
              failed_at TIMESTAMP WITH TIME ZONE,
              error_redacted TEXT,
              last_error TEXT,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_index_jobs_project_v2 ON index_jobs(project_id);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_task_v2 ON index_jobs(task_id);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_status_v2 ON index_jobs(status);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_job_type_v2 ON index_jobs(job_type);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_priority_v2 ON index_jobs(priority);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_created_at_v2 ON index_jobs(created_at);
            CREATE INDEX IF NOT EXISTS idx_index_jobs_locked_at_v2 ON index_jobs(locked_at);
          `
        },
        {
          version: "1.2.3-incremental-index-pipeline",
          sql: `
            CREATE TABLE IF NOT EXISTS incremental_index_events (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
              adapter_kind VARCHAR(50) NOT NULL,
              path_redacted TEXT NOT NULL,
              normalized_path_redacted TEXT NOT NULL,
              file_hash_before VARCHAR(100),
              file_hash_after VARCHAR(100),
              change_kind VARCHAR(50) NOT NULL,
              index_job_id VARCHAR(100) REFERENCES index_jobs(id) ON DELETE SET NULL,
              warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_incremental_index_events_project ON incremental_index_events(project_id);
            CREATE INDEX IF NOT EXISTS idx_incremental_index_events_task ON incremental_index_events(task_id);
            CREATE INDEX IF NOT EXISTS idx_incremental_index_events_change_kind ON incremental_index_events(change_kind);
            CREATE INDEX IF NOT EXISTS idx_incremental_index_events_index_job ON incremental_index_events(index_job_id);
            CREATE INDEX IF NOT EXISTS idx_incremental_index_events_detected_at ON incremental_index_events(detected_at);
          `
        },
        {
          version: "1.2.4-task-lifecycle-history",
          sql: `
            CREATE TABLE IF NOT EXISTS task_status_history (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
              from_status VARCHAR(50),
              to_status VARCHAR(50) NOT NULL,
              action VARCHAR(50) NOT NULL,
              actor_type VARCHAR(50) NOT NULL,
              actor_id VARCHAR(100),
              rationale TEXT,
              metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_task_status_history_project ON task_status_history(project_id);
            CREATE INDEX IF NOT EXISTS idx_task_status_history_task ON task_status_history(task_id);
            CREATE INDEX IF NOT EXISTS idx_task_status_history_created_at ON task_status_history(created_at);
          `
        },
        {
          version: "1.2.5-task-lifecycle-indices",
          sql: `
            CREATE INDEX IF NOT EXISTS idx_task_status_history_to_status ON task_status_history(to_status);
            CREATE INDEX IF NOT EXISTS idx_task_status_history_action ON task_status_history(action);
          `
        },
        {
          version: "1.2.6-task-lifecycle-metadata-json",
          sql: `
            ALTER TABLE task_status_history ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;
            UPDATE task_status_history SET metadata_json = metadata WHERE metadata_json = '{}'::jsonb AND metadata <> '{}'::jsonb;
          `
        },
        {
          version: "1.2.7-quality-gate-orchestrator",
          sql: `
            CREATE TABLE IF NOT EXISTS quality_gate_runs (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
              feature_id VARCHAR(100),
              status VARCHAR(50) NOT NULL,
              run_by VARCHAR(100),
              started_at TIMESTAMP WITH TIME ZONE,
              completed_at TIMESTAMP WITH TIME ZONE,
              summary_output TEXT,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS quality_gate_command_results (
              id VARCHAR(100) PRIMARY KEY,
              run_id VARCHAR(100) NOT NULL REFERENCES quality_gate_runs(id) ON DELETE CASCADE,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
              command_type VARCHAR(50) NOT NULL,
              status VARCHAR(50) NOT NULL,
              exit_code INTEGER,
              output_summary TEXT,
              raw_output_redacted TEXT,
              duration_ms INTEGER,
              executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_quality_gate_runs_project ON quality_gate_runs(project_id);
            CREATE INDEX IF NOT EXISTS idx_quality_gate_runs_task ON quality_gate_runs(task_id);
            CREATE INDEX IF NOT EXISTS idx_quality_gate_runs_feature ON quality_gate_runs(feature_id);
            CREATE INDEX IF NOT EXISTS idx_quality_gate_runs_status ON quality_gate_runs(status);
            CREATE INDEX IF NOT EXISTS idx_quality_gate_runs_created_at ON quality_gate_runs(created_at);

            CREATE INDEX IF NOT EXISTS idx_quality_gate_cmd_results_run ON quality_gate_command_results(run_id);
            CREATE INDEX IF NOT EXISTS idx_quality_gate_cmd_results_project ON quality_gate_command_results(project_id);
            CREATE INDEX IF NOT EXISTS idx_quality_gate_cmd_results_task ON quality_gate_command_results(task_id);
            CREATE INDEX IF NOT EXISTS idx_quality_gate_cmd_results_cmd ON quality_gate_command_results(command_type);
            CREATE INDEX IF NOT EXISTS idx_quality_gate_cmd_results_status ON quality_gate_command_results(status);
            CREATE INDEX IF NOT EXISTS idx_quality_gate_cmd_results_executed_at ON quality_gate_command_results(executed_at);
          `
        },
        {
          version: "1.2.8-evidence-store-mvp",
          sql: `
            CREATE TABLE IF NOT EXISTS evidence_records (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
              feature_id VARCHAR(100),
              evidence_type VARCHAR(50) NOT NULL,
              status VARCHAR(50) NOT NULL,
              actor_type VARCHAR(50) NOT NULL,
              actor_id VARCHAR(100),
              audit_log_id VARCHAR(100),
              quality_gate_run_id VARCHAR(100) REFERENCES quality_gate_runs(id) ON DELETE SET NULL,
              quality_gate_command_result_id VARCHAR(100) REFERENCES quality_gate_command_results(id) ON DELETE SET NULL,
              artifact_id VARCHAR(100),
              source_table VARCHAR(100),
              source_id VARCHAR(100),
              payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              content_hash VARCHAR(128) NOT NULL,
              hash_algorithm VARCHAR(50) NOT NULL DEFAULT 'sha256',
              payload_size_bytes INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              verified_at TIMESTAMP WITH TIME ZONE,
              verification_meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
            );

            CREATE INDEX IF NOT EXISTS idx_evidence_records_project ON evidence_records(project_id);
            CREATE INDEX IF NOT EXISTS idx_evidence_records_task ON evidence_records(task_id);
            CREATE INDEX IF NOT EXISTS idx_evidence_records_feature ON evidence_records(feature_id);
            CREATE INDEX IF NOT EXISTS idx_evidence_records_type ON evidence_records(evidence_type);
            CREATE INDEX IF NOT EXISTS idx_evidence_records_status ON evidence_records(status);
            CREATE INDEX IF NOT EXISTS idx_evidence_records_audit_log ON evidence_records(audit_log_id);
            CREATE INDEX IF NOT EXISTS idx_evidence_records_quality_gate ON evidence_records(quality_gate_run_id);
            CREATE INDEX IF NOT EXISTS idx_evidence_records_artifact ON evidence_records(artifact_id);
            CREATE INDEX IF NOT EXISTS idx_evidence_records_source ON evidence_records(source_table, source_id);
            CREATE INDEX IF NOT EXISTS idx_evidence_records_created_at ON evidence_records(created_at);
          `
        },
        {
          version: "1.2.9-event-store-mvp",
          sql: `
            CREATE TABLE IF NOT EXISTS event_records (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
              feature_id VARCHAR(100),
              event_type VARCHAR(100) NOT NULL,
              status VARCHAR(50) NOT NULL DEFAULT 'committed',
              source_table VARCHAR(100),
              source_id VARCHAR(100),
              actor_type VARCHAR(50) NOT NULL,
              actor_id VARCHAR(100),
              idempotency_key VARCHAR(255),
              audit_log_id VARCHAR(100),
              evidence_record_id VARCHAR(100) REFERENCES evidence_records(id) ON DELETE SET NULL,
              payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              payload_hash VARCHAR(128) NOT NULL,
              hash_algorithm VARCHAR(50) NOT NULL DEFAULT 'sha256',
              payload_size_bytes INTEGER NOT NULL DEFAULT 0,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_event_records_project ON event_records(project_id);
            CREATE INDEX IF NOT EXISTS idx_event_records_task ON event_records(task_id);
            CREATE INDEX IF NOT EXISTS idx_event_records_feature ON event_records(feature_id);
            CREATE INDEX IF NOT EXISTS idx_event_records_type ON event_records(event_type);
            CREATE INDEX IF NOT EXISTS idx_event_records_source ON event_records(source_table, source_id);
            CREATE INDEX IF NOT EXISTS idx_event_records_audit_log ON event_records(audit_log_id);
            CREATE INDEX IF NOT EXISTS idx_event_records_evidence_record ON event_records(evidence_record_id);
            CREATE INDEX IF NOT EXISTS idx_event_records_created_at ON event_records(created_at);
            CREATE INDEX IF NOT EXISTS idx_event_records_project_created ON event_records(project_id, created_at);

            CREATE UNIQUE INDEX IF NOT EXISTS idx_event_records_idem_key ON event_records(project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

            CREATE OR REPLACE FUNCTION block_event_records_mutation()
            RETURNS TRIGGER AS $$
            BEGIN
              RAISE EXCEPTION 'Event Store is an append-only ledger. Mutation (UPDATE or DELETE) of event_records is strictly forbidden.';
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trigger_block_event_records_update ON event_records;
            CREATE TRIGGER trigger_block_event_records_update
            BEFORE UPDATE ON event_records
            FOR EACH ROW
            EXECUTE FUNCTION block_event_records_mutation();

            DROP TRIGGER IF EXISTS trigger_block_event_records_delete ON event_records;
            CREATE TRIGGER trigger_block_event_records_delete
            BEFORE DELETE ON event_records
            FOR EACH ROW
            EXECUTE FUNCTION block_event_records_mutation();
          `
        },
        {
          version: "1.3.0-context-object-store-mvp",
          sql: `
            CREATE TABLE IF NOT EXISTS context_objects (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
              feature_id VARCHAR(100),
              object_type VARCHAR(100) NOT NULL,
              status VARCHAR(50) NOT NULL DEFAULT 'active',
              source_table VARCHAR(100),
              source_id VARCHAR(100),
              content_hash VARCHAR(128) NOT NULL,
              hash_algorithm VARCHAR(50) NOT NULL DEFAULT 'sha256',
              payload_size_bytes INTEGER NOT NULL DEFAULT 0,
              payload_text TEXT,
              payload_json JSONB,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              stale_at TIMESTAMP WITH TIME ZONE,
              quarantined_at TIMESTAMP WITH TIME ZONE
            );

            CREATE TABLE IF NOT EXISTS context_object_refs (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
              context_object_id VARCHAR(100) NOT NULL REFERENCES context_objects(id) ON DELETE CASCADE,
              ref_type VARCHAR(100) NOT NULL,
              ref_table VARCHAR(100),
              ref_id VARCHAR(100),
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_context_objects_project ON context_objects(project_id);
            CREATE INDEX IF NOT EXISTS idx_context_objects_task ON context_objects(task_id);
            CREATE INDEX IF NOT EXISTS idx_context_objects_feature ON context_objects(feature_id);
            CREATE INDEX IF NOT EXISTS idx_context_objects_type ON context_objects(object_type);
            CREATE INDEX IF NOT EXISTS idx_context_objects_status ON context_objects(status);
            CREATE INDEX IF NOT EXISTS idx_context_objects_hash ON context_objects(content_hash);
            CREATE INDEX IF NOT EXISTS idx_context_objects_source ON context_objects(source_table, source_id);
            CREATE INDEX IF NOT EXISTS idx_context_objects_created_at ON context_objects(created_at);

            CREATE INDEX IF NOT EXISTS idx_context_object_refs_project ON context_object_refs(project_id);
            CREATE INDEX IF NOT EXISTS idx_context_object_refs_task ON context_object_refs(task_id);
            CREATE INDEX IF NOT EXISTS idx_context_object_refs_object ON context_object_refs(context_object_id);
            CREATE INDEX IF NOT EXISTS idx_context_object_refs_type ON context_object_refs(ref_type);
            CREATE INDEX IF NOT EXISTS idx_context_object_refs_ref ON context_object_refs(ref_table, ref_id);

            CREATE UNIQUE INDEX IF NOT EXISTS idx_context_objects_dedupe ON context_objects(project_id, content_hash, object_type);
          `
        },
        {
          version: "1.3.1-production-queue-worker-runtime",
          sql: `
            CREATE TABLE IF NOT EXISTS worker_registry (
              id VARCHAR(100) PRIMARY KEY,
              worker_id VARCHAR(255) NOT NULL,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              status VARCHAR(50) NOT NULL DEFAULT 'active',
              process_label VARCHAR(255),
              started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              heartbeat_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              stopped_at TIMESTAMP WITH TIME ZONE,
              max_concurrency INTEGER NOT NULL DEFAULT 2,
              active_job_count INTEGER NOT NULL DEFAULT 0,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              CONSTRAINT unique_project_worker UNIQUE (project_id, worker_id)
            );

            CREATE TABLE IF NOT EXISTS worker_runtime_logs (
              id VARCHAR(100) PRIMARY KEY,
              worker_id VARCHAR(255) NOT NULL,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
              index_job_id VARCHAR(100) REFERENCES index_jobs(id) ON DELETE SET NULL,
              action VARCHAR(100) NOT NULL,
              status VARCHAR(50) NOT NULL,
              message_redacted TEXT,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_worker_registry_project ON worker_registry(project_id);
            CREATE INDEX IF NOT EXISTS idx_worker_registry_worker_id ON worker_registry(worker_id);
            CREATE INDEX IF NOT EXISTS idx_worker_registry_status ON worker_registry(status);
            CREATE INDEX IF NOT EXISTS idx_worker_registry_heartbeat ON worker_registry(heartbeat_at);

            CREATE INDEX IF NOT EXISTS idx_worker_logs_project ON worker_runtime_logs(project_id);
            CREATE INDEX IF NOT EXISTS idx_worker_logs_worker ON worker_runtime_logs(worker_id);
            CREATE INDEX IF NOT EXISTS idx_worker_logs_job ON worker_runtime_logs(index_job_id);
            CREATE INDEX IF NOT EXISTS idx_worker_logs_action ON worker_runtime_logs(action);
            CREATE INDEX IF NOT EXISTS idx_worker_logs_created_at ON worker_runtime_logs(created_at);
          `
        },
        {
          version: "1.3.2-file-locking-mvp",
          sql: `
            CREATE TABLE IF NOT EXISTS file_locks (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
              worker_id VARCHAR(255),
              index_job_id VARCHAR(100) REFERENCES index_jobs(id) ON DELETE SET NULL,
              lock_mode VARCHAR(16) NOT NULL,
              lock_status VARCHAR(16) NOT NULL,
              normalized_path TEXT NOT NULL,
              path_hash VARCHAR(128) NOT NULL,
              lock_owner_type VARCHAR(50) NOT NULL,
              lock_owner_id VARCHAR(100) NOT NULL,
              acquired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              refreshed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
              released_at TIMESTAMP WITH TIME ZONE,
              release_reason TEXT,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_file_locks_project ON file_locks(project_id);
            CREATE INDEX IF NOT EXISTS idx_file_locks_task ON file_locks(task_id);
            CREATE INDEX IF NOT EXISTS idx_file_locks_worker ON file_locks(worker_id);
            CREATE INDEX IF NOT EXISTS idx_file_locks_index_job ON file_locks(index_job_id);
            CREATE INDEX IF NOT EXISTS idx_file_locks_status ON file_locks(lock_status);
            CREATE INDEX IF NOT EXISTS idx_file_locks_mode ON file_locks(lock_mode);
            CREATE INDEX IF NOT EXISTS idx_file_locks_hash ON file_locks(path_hash);
            CREATE INDEX IF NOT EXISTS idx_file_locks_expires ON file_locks(expires_at);
            CREATE INDEX IF NOT EXISTS idx_file_locks_proj_hash_status ON file_locks(project_id, path_hash, lock_status);
            CREATE INDEX IF NOT EXISTS idx_file_locks_proj_path ON file_locks(project_id, normalized_path);
          `
        },
        {
          version: "1.3.3-permission-kernel-mvp",
          sql: `
            CREATE TABLE IF NOT EXISTS permission_policies (
              id VARCHAR(100) PRIMARY KEY,
              effect VARCHAR(20) NOT NULL,
              subject_type VARCHAR(50) NOT NULL,
              resource_type VARCHAR(50) NOT NULL,
              action VARCHAR(50) NOT NULL,
              conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              description TEXT,
              enabled BOOLEAN NOT NULL DEFAULT true,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS permission_evaluations (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) REFERENCES projects(id) ON DELETE CASCADE,
              subject_type VARCHAR(50) NOT NULL,
              subject_id VARCHAR(100),
              resource_type VARCHAR(50) NOT NULL,
              resource_id VARCHAR(100),
              action VARCHAR(50) NOT NULL,
              decision VARCHAR(20) NOT NULL,
              denied_reason TEXT,
              matched_rules_json JSONB NOT NULL DEFAULT '[]'::jsonb,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              evaluated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS permission_overrides (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) REFERENCES projects(id) ON DELETE CASCADE,
              subject_type VARCHAR(50) NOT NULL,
              subject_id VARCHAR(100) NOT NULL,
              resource_type VARCHAR(50) NOT NULL,
              resource_id VARCHAR(100) NOT NULL,
              action VARCHAR(50) NOT NULL,
              rationale TEXT NOT NULL,
              status VARCHAR(50) NOT NULL DEFAULT 'used',
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_perm_policies_query ON permission_policies(subject_type, resource_type, action);
            CREATE INDEX IF NOT EXISTS idx_perm_policies_enabled ON permission_policies(enabled);

            CREATE INDEX IF NOT EXISTS idx_perm_eval_project ON permission_evaluations(project_id);
            CREATE INDEX IF NOT EXISTS idx_perm_eval_subj ON permission_evaluations(subject_type, subject_id);
            CREATE INDEX IF NOT EXISTS idx_perm_eval_res ON permission_evaluations(resource_type, resource_id);
            CREATE INDEX IF NOT EXISTS idx_perm_eval_action ON permission_evaluations(action);
            CREATE INDEX IF NOT EXISTS idx_perm_eval_decision ON permission_evaluations(decision);
            CREATE INDEX IF NOT EXISTS idx_perm_eval_evaluated_at ON permission_evaluations(evaluated_at);

            CREATE INDEX IF NOT EXISTS idx_perm_overrides_project ON permission_overrides(project_id);
            CREATE INDEX IF NOT EXISTS idx_perm_overrides_subj ON permission_overrides(subject_type, subject_id);
            CREATE INDEX IF NOT EXISTS idx_perm_overrides_res ON permission_overrides(resource_type, resource_id);
            CREATE INDEX IF NOT EXISTS idx_perm_overrides_action ON permission_overrides(action);
            CREATE INDEX IF NOT EXISTS idx_perm_overrides_created_at ON permission_overrides(created_at);

            DELETE FROM permission_policies WHERE id IN ('policy-admin-bypass', 'policy-system-bypass', 'policy-worker-jobs', 'policy-worker-job-update', 'policy-worker-locks', 'policy-task-locks', 'policy-task-rw');

            INSERT INTO permission_policies (id, effect, subject_type, resource_type, action, conditions_json, description, enabled)
            VALUES 
              ('policy-admin-bypass', 'allow', '*', '*', '*', '{"is_admin": true}', 'Administrative bypass override rule', true),
              ('policy-system-bypass', 'allow', 'system', '*', '*', '{}', 'System/internal action rule', true),
              ('policy-worker-jobs', 'allow', 'worker', 'index_job', 'claim', '{}', 'Worker claiming jobs rule', true),
              ('policy-worker-job-update', 'allow', 'worker', 'index_job', 'update', '{}', 'Worker updating claimed jobs rule', true),
              ('policy-worker-locks', 'allow', 'worker', 'file_lock', '*', '{}', 'Worker managing file locks rule', true),
              ('policy-task-locks', 'allow', 'task', 'file_lock', '*', '{}', 'Tasks managing file locks rule', true),
              ('policy-task-rw', 'allow', 'task', 'file', '*', '{}', 'Tasks reading and writing project files rule', true)
            ON CONFLICT (id) DO NOTHING;
          `
        },
        {
          version: "1.3.4-artifact-cas-mvp",
          sql: `
            CREATE TABLE IF NOT EXISTS cas_blobs (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              cas_hash VARCHAR(128) NOT NULL,
              hash_algorithm VARCHAR(50) NOT NULL DEFAULT 'sha256',
              content_kind VARCHAR(50) NOT NULL,
              mime_type VARCHAR(100),
              size_bytes INTEGER NOT NULL DEFAULT 0,
              payload_text TEXT,
              payload_json JSONB,
              storage_status VARCHAR(50) NOT NULL DEFAULT 'active',
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              CONSTRAINT unique_project_cas_hash UNIQUE (project_id, cas_hash)
            );

            CREATE TABLE IF NOT EXISTS artifact_versions (
              id VARCHAR(100) PRIMARY KEY,
              project_id VARCHAR(100) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              task_id VARCHAR(100) REFERENCES tasks(id) ON DELETE SET NULL,
              feature_id VARCHAR(100),
              artifact_type VARCHAR(50) NOT NULL,
              artifact_status VARCHAR(50) NOT NULL DEFAULT 'active',
              logical_path TEXT NOT NULL,
              normalized_logical_path TEXT NOT NULL,
              path_hash VARCHAR(128) NOT NULL,
              version_number INTEGER NOT NULL,
              cas_blob_id VARCHAR(100) NOT NULL REFERENCES cas_blobs(id) ON DELETE RESTRICT,
              cas_hash VARCHAR(128) NOT NULL,
              parent_version_id VARCHAR(100) REFERENCES artifact_versions(id) ON DELETE SET NULL,
              created_by_type VARCHAR(50) NOT NULL,
              created_by_id VARCHAR(100),
              size_bytes INTEGER NOT NULL DEFAULT 0,
              title TEXT,
              description TEXT,
              metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
              CONSTRAINT unique_project_path_hash_version UNIQUE (project_id, path_hash, version_number)
            );

            CREATE INDEX IF NOT EXISTS idx_cas_blobs_project ON cas_blobs(project_id);
            CREATE INDEX IF NOT EXISTS idx_cas_blobs_project_hash ON cas_blobs(project_id, cas_hash);
            CREATE INDEX IF NOT EXISTS idx_cas_blobs_content_kind ON cas_blobs(content_kind);
            CREATE INDEX IF NOT EXISTS idx_cas_blobs_storage_status ON cas_blobs(storage_status);
            CREATE INDEX IF NOT EXISTS idx_cas_blobs_created ON cas_blobs(created_at);

            CREATE INDEX IF NOT EXISTS idx_artifact_versions_project ON artifact_versions(project_id);
            CREATE INDEX IF NOT EXISTS idx_artifact_versions_task ON artifact_versions(task_id);
            CREATE INDEX IF NOT EXISTS idx_artifact_versions_feature ON artifact_versions(feature_id);
            CREATE INDEX IF NOT EXISTS idx_artifact_versions_type ON artifact_versions(artifact_type);
            CREATE INDEX IF NOT EXISTS idx_artifact_versions_status ON artifact_versions(artifact_status);
            CREATE INDEX IF NOT EXISTS idx_artifact_versions_path ON artifact_versions(normalized_logical_path);
            CREATE INDEX IF NOT EXISTS idx_artifact_versions_path_hash ON artifact_versions(path_hash);
            CREATE INDEX IF NOT EXISTS idx_artifact_versions_proj_path_hash ON artifact_versions(project_id, path_hash);
            CREATE INDEX IF NOT EXISTS idx_artifact_versions_proj_path_hash_v ON artifact_versions(project_id, path_hash, version_number);
            CREATE INDEX IF NOT EXISTS idx_artifact_versions_blob_id ON artifact_versions(cas_blob_id);
            CREATE INDEX IF NOT EXISTS idx_artifact_versions_cas_hash ON artifact_versions(cas_hash);
            CREATE INDEX IF NOT EXISTS idx_artifact_versions_parent_id ON artifact_versions(parent_version_id);
            CREATE INDEX IF NOT EXISTS idx_artifact_versions_created ON artifact_versions(created_at);

            DELETE FROM permission_policies WHERE id IN ('policy-task-artifacts-rw', 'policy-worker-artifacts-rw', 'policy-task-artifact-version-rw', 'policy-worker-artifact-version-rw');

            INSERT INTO permission_policies (id, effect, subject_type, resource_type, action, conditions_json, description, enabled)
            VALUES
              ('policy-task-artifacts-rw', 'allow', 'task', 'artifact', '*', '{}', 'Tasks managing artifacts', true),
              ('policy-worker-artifacts-rw', 'allow', 'worker', 'artifact', '*', '{}', 'Workers managing artifacts', true),
              ('policy-task-artifact-version-rw', 'allow', 'task', 'artifact_version', '*', '{}', 'Tasks managing artifact versions', true),
              ('policy-worker-artifact-version-rw', 'allow', 'worker', 'artifact_version', '*', '{}', 'Workers managing artifact versions', true)
            ON CONFLICT (id) DO NOTHING;
          `
        }
      ];

      const appliedVersions: string[] = [];

      for (const migration of migrationVersions) {
        // Check if migration has already been applied
        const checkRes = await client.query(
          "SELECT 1 FROM schema_migrations WHERE version = $1 LIMIT 1;",
          [migration.version]
        );

        if (checkRes.rowCount === 0) {
          sysLogger.info(`Applying database migration version: ${migration.version}`);
          await client.query(migration.sql);
          await client.query(
            "INSERT INTO schema_migrations (version) VALUES ($1);",
            [migration.version]
          );
          appliedVersions.push(migration.version);
        } else {
          sysLogger.debug(`Migration ${migration.version} is already applied.`);
        }
      }

      await client.query("COMMIT;");
      sysLogger.info("Database migrations successfully checked and applied.");
      
      this.state.activeSchemaVersion = LATEST_SCHEMA_VERSION;
      this.migrationsApplied = true;
      return {
        migrated: appliedVersions.length > 0,
        processedVersions: appliedVersions,
      };
    } catch (error: any) {
      await client.query("ROLLBACK;");
      sysLogger.error(`FATAL: Database migrations failed! Transaction rolled back. Error: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }
}

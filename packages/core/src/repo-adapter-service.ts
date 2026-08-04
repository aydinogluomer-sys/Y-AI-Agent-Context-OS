import { RepoAdapter, LocalFilesystemRepoAdapter, ReadOnlyGitHubRepoAdapter, VirtualMemoryRepoAdapter } from "./repo-adapter";
import { RepoAdapterResult, RepoFileRef } from "@y/shared";
import crypto from "crypto";

export interface RepoDbClient {
  query(sql: string, params?: any[]): Promise<{ rows: any[]; rowCount: number }>;
}

export class RepoAdapterService {
  private readonly dbClient: RepoDbClient;
  private permissionKernel?: any;

  constructor(dbClient: RepoDbClient) {
    this.dbClient = dbClient;
  }

  public setPermissionKernel(kernel: any) {
    this.permissionKernel = kernel;
  }

  // Get configured adapter
  async getAdapterForProject(projectId: string): Promise<RepoAdapter> {
    // 1. Fetch from repo_sources
    const res = await this.dbClient.query(
      "SELECT * FROM repo_sources WHERE project_id = $1 LIMIT 1;",
      [projectId]
    );

    if (res.rowCount === 0) {
      // Default to LocalFilesystemRepoAdapter targeting project root
      return new LocalFilesystemRepoAdapter(".");
    }

    const row = res.rows[0];
    const kind = row.adapter_kind;
    const rootPath = row.root_path;

    if (kind === "readonly_github_stub") {
      const url = row.metadata_json?.repo_url || "https://github.com/example/repo";
      return new ReadOnlyGitHubRepoAdapter(projectId, url);
    } else if (kind === "virtual_memory_stub") {
      return new VirtualMemoryRepoAdapter();
    } else {
      return new LocalFilesystemRepoAdapter(rootPath);
    }
  }

  // Helper to log access/operations
  async logAccess(params: {
    projectId: string;
    taskId: string | null;
    adapterKind: string;
    operation: string;
    path: string;
    status: string;
    warnings: string[];
  }): Promise<void> {
    const logId = `repo_access_log_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
    await this.dbClient.query(
      `INSERT INTO repo_access_logs (
        id, project_id, task_id, adapter_kind, operation, path_redacted, result_status, warnings_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
      [
        logId,
        params.projectId,
        params.taskId,
        params.adapterKind,
        params.operation,
        params.path,
        params.status,
        JSON.stringify(params.warnings)
      ]
    );

    // Emits Audit logging event
    const auditId = `audit_log_${crypto.randomUUID().replace(/-/g, "").substring(0, 16)}`;
    let auditAction = "";
    if (params.operation === "read") {
      auditAction = params.status === "allowed" ? "REPO_FILE_READ" : "REPO_FORBIDDEN_PATH_BLOCKED";
    } else if (params.operation === "read_blocked") {
      auditAction = "REPO_FORBIDDEN_PATH_BLOCKED";
    } else if (params.operation === "write") {
      auditAction = params.status === "allowed" ? "REPO_FILE_WRITE" : "REPO_FILE_WRITE_BLOCKED";
    } else if (params.operation === "write_blocked") {
      auditAction = "REPO_FILE_WRITE_BLOCKED";
    } else if (params.operation === "list") {
      auditAction = "REPO_FILE_LISTED";
    } else if (params.operation === "list_blocked") {
      auditAction = "REPO_FORBIDDEN_PATH_BLOCKED";
    } else if (params.operation === "traversal_attempt") {
      auditAction = "REPO_PATH_TRAVERSAL_BLOCKED";
    } else if (params.operation === "cross_project") {
      auditAction = "REPO_CROSS_PROJECT_ACCESS_BLOCKED";
    } else if (params.operation === "boundary_blocked") {
      auditAction = "REPO_FORBIDDEN_PATH_BLOCKED";
    }

    if (auditAction) {
      await this.dbClient.query(
        `INSERT INTO audit_logs (
          id, project_id, rationale, action, category, status, actor_role, is_approved_by_human, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
        [
          auditId,
          params.projectId,
          `RepoAdapter action ${params.operation} executed on ${params.path}`,
          auditAction,
          "SECURITY",
          params.status === "allowed" ? "authorized" : "denied",
          "developer",
          true,
          JSON.stringify({
            adapter_kind: params.adapterKind,
            path: params.path,
            warnings: params.warnings
          })
        ]
      );
    }
  }

  // Safe file loader wrapping validations and audits
  async safeReadFile(projectId: string, taskId: string | null, p: string): Promise<RepoAdapterResult<string>> {
    // 0. Project boundary check
    if (!projectId) {
      throw new Error("Project ID is required.");
    }

    if (this.permissionKernel) {
      await this.permissionKernel.enforce({
        subject: {
          subject_type: "system",
          subject_id: "system",
          project_id: projectId,
          task_id: taskId || undefined
        },
        resource: {
          resource_type: "file",
          resource_id: p,
          project_id: projectId,
          task_id: taskId || undefined,
          normalized_path: p
        },
        action: "read"
      });
    }

    const adapter = await this.getAdapterForProject(projectId);
    
    // Check path traversal or file blocks first
    const val = adapter.validatePath(p);
    if (!val.valid) {
      const isTraversal = val.error?.includes("traversal");
      await this.logAccess({
        projectId,
        taskId,
        adapterKind: (adapter as any).constructor.name,
        operation: isTraversal ? "traversal_attempt" : "read_blocked",
        path: p,
        status: "blocked",
        warnings: [val.error || "Path validation failed"]
      });

      return {
        ok: false,
        data: null,
        warnings: [val.error || "Blocked"],
        errors: [val.error || "Blocked"],
        redacted: false
      };
    }

    // Now if a task boundary is provided, we can validate against task boundaries (Task allowed/forbidden lists)
    if (taskId) {
      const boundaryRes = await this.dbClient.query(
        "SELECT * FROM task_boundaries WHERE task_id = $1 LIMIT 1;",
        [taskId]
      );
      if (boundaryRes.rowCount > 0) {
        const bounds = boundaryRes.rows[0];
        const forbiddenFiles: string[] = bounds.forbidden_files || [];
        const allowedFiles: string[] = bounds.allowed_files || [];

        const normalizedRequested = adapter.normalizePath(p);
        
        // If forbidden, block
        if (forbiddenFiles.some(f => adapter.normalizePath(f) === normalizedRequested)) {
          const warn = `Access denied: File '${p}' is explicitly prohibited by task boundaries.`;
          await this.logAccess({
            projectId,
            taskId,
            adapterKind: (adapter as any).constructor.name,
            operation: "boundary_blocked",
            path: p,
            status: "blocked",
            warnings: [warn]
          });
          return { ok: false, data: null, warnings: [warn], errors: [warn], redacted: false };
        }

        // If allowed array exists, and is non-empty, and requested file is not in list
        if (allowedFiles.length > 0 && !allowedFiles.some(f => adapter.normalizePath(f) === normalizedRequested)) {
          const warn = `Access warning: File '${p}' is not registered under standard task allowed list.`;
          const result = await adapter.readFile(p);
          result.warnings.push(warn);
          await this.logAccess({
            projectId,
            taskId,
            adapterKind: (adapter as any).constructor.name,
            operation: "read",
            path: p,
            status: "allowed",
            warnings: result.warnings
          });
          return result;
        }
      }
    }

    const result = await adapter.readFile(p);
    await this.logAccess({
      projectId,
      taskId,
      adapterKind: (adapter as any).constructor.name,
      operation: "read",
      path: p,
      status: result.ok ? "allowed" : "failed",
      warnings: result.warnings
    });

    return result;
  }

  // Safe file writer wrapping validations and audits
  async safeWriteFile(projectId: string, taskId: string | null, p: string, content: string): Promise<RepoAdapterResult<void>> {
    if (this.permissionKernel) {
      await this.permissionKernel.enforce({
        subject: {
          subject_type: "system",
          subject_id: "system",
          project_id: projectId,
          task_id: taskId || undefined
        },
        resource: {
          resource_type: "file",
          resource_id: p,
          project_id: projectId,
          task_id: taskId || undefined,
          normalized_path: p
        },
        action: "write"
      });
    }

    const adapter = await this.getAdapterForProject(projectId);
    
    // Check path traversal or file blocks first
    const val = adapter.validatePath(p);
    if (!val.valid) {
      const isTraversal = val.error?.includes("traversal");
      await this.logAccess({
        projectId,
        taskId,
        adapterKind: (adapter as any).constructor.name,
        operation: isTraversal ? "traversal_attempt" : "write_blocked",
        path: p,
        status: "blocked",
        warnings: [val.error || ""]
      });
      return { ok: false, data: null, warnings: [val.error || ""], errors: [val.error || ""], redacted: false };
    }

    if (taskId) {
      const boundaryRes = await this.dbClient.query(
        "SELECT * FROM task_boundaries WHERE task_id = $1 LIMIT 1;",
        [taskId]
      );
      if (boundaryRes.rowCount > 0) {
        const bounds = boundaryRes.rows[0];
        const forbiddenFiles: string[] = bounds.forbidden_files || [];
        const normalizedRequested = adapter.normalizePath(p);

        if (forbiddenFiles.some(f => adapter.normalizePath(f) === normalizedRequested)) {
          const warn = `Access denied: File '${p}' writing is prohibited by task boundaries.`;
          await this.logAccess({
            projectId,
            taskId,
            adapterKind: (adapter as any).constructor.name,
            operation: "write_blocked",
            path: p,
            status: "blocked",
            warnings: [warn]
          });
          return { ok: false, data: null, warnings: [warn], errors: [warn], redacted: false };
        }
      }
    }

    const result = await adapter.writeFile(p, content);
    await this.logAccess({
      projectId,
      taskId,
      adapterKind: (adapter as any).constructor.name,
      operation: "write",
      path: p,
      status: result.ok ? "allowed" : "failed",
      warnings: result.warnings
    });

    return result;
  }

  // Safe file lister wrapping validations and audits
  async safeListFiles(projectId: string, taskId: string | null, root: string, options?: { recursive?: boolean; limit?: number }): Promise<RepoAdapterResult<RepoFileRef[]>> {
    if (this.permissionKernel) {
      await this.permissionKernel.enforce({
        subject: {
          subject_type: "system",
          subject_id: "system",
          project_id: projectId,
          task_id: taskId || undefined
        },
        resource: {
          resource_type: "file",
          resource_id: root,
          project_id: projectId,
          task_id: taskId || undefined,
          normalized_path: root
        },
        action: "read"
      });
    }

    const adapter = await this.getAdapterForProject(projectId);
    
    const val = adapter.validatePath(root);
    if (!val.valid) {
      await this.logAccess({
        projectId,
        taskId,
        adapterKind: (adapter as any).constructor.name,
        operation: "list_blocked",
        path: root,
        status: "blocked",
        warnings: [val.error || ""]
      });
      return { ok: false, data: [], warnings: [val.error || ""], errors: [val.error || ""], redacted: false };
    }

    const result = await adapter.listFiles(root, options);
    if (result.ok && result.data) {
      result.data.forEach(file => {
        file.project_id = projectId;
      });
    }

    await this.logAccess({
      projectId,
      taskId,
      adapterKind: (adapter as any).constructor.name,
      operation: "list",
      path: root,
      status: result.ok ? "allowed" : "failed",
      warnings: result.warnings
    });

    return result;
  }
}

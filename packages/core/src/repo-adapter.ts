import path from "path";
import fs from "fs";
import crypto from "crypto";
import { RepoAdapterResult, RepoFileRef } from "@y/shared";
import { redactSecretLeaks } from "@y/security";

export interface RepoAdapterCapabilities {
  adapterKind: "local_filesystem" | "readonly_github_stub" | "virtual_memory";
  accessMode: "read_write" | "read_only" | "unavailable";
  remote: boolean;
  operations: {
    readFile: boolean;
    writeFile: boolean;
    listFiles: boolean;
    contentDiff: boolean;
    changedFiles: boolean;
    createBranch: boolean;
    commit: boolean;
    openPullRequest: boolean;
  };
  notes: string[];
}

export interface RepoDiffRequest {
  path: string;
  baseContent: string;
  targetContent: string;
}

export interface RepoAdapter {
  getCapabilities(): RepoAdapterCapabilities;
  readFile(p: string): Promise<RepoAdapterResult<string>>;
  writeFile(p: string, content: string, options?: { encoding?: string }): Promise<RepoAdapterResult<void>>;
  listFiles(root: string, options?: { recursive?: boolean; limit?: number }): Promise<RepoAdapterResult<RepoFileRef[]>>;
  fileExists(p: string): Promise<RepoAdapterResult<boolean>>;
  statFile(p: string): Promise<RepoAdapterResult<{ size: number; mtime: Date; isDirectory: boolean }>>;
  getFileHash(p: string): Promise<RepoAdapterResult<string>>;
  getChangedFiles(options?: any): Promise<RepoAdapterResult<string[]>>;
  getDiff(request: RepoDiffRequest): Promise<RepoAdapterResult<string>>;
  normalizePath(p: string): string;
  validatePath(p: string): { valid: boolean; error?: string };
  resolveProjectRoot(projectId: string): string;
}

export function createSafeTextDiff(request: RepoDiffRequest): string {
  const safePath = request.path.replace(/[\r\n]/g, "");
  const before = redactSecretLeaks(request.baseContent).split(/\r?\n/);
  const after = redactSecretLeaks(request.targetContent).split(/\r?\n/);
  const output = [`--- a/${safePath}`, `+++ b/${safePath}`];
  const maxLength = Math.max(before.length, after.length);

  for (let index = 0; index < maxLength; index += 1) {
    if (before[index] === after[index]) {
      if (before[index] !== undefined) output.push(` ${before[index]}`);
      continue;
    }
    if (before[index] !== undefined) output.push(`-${before[index]}`);
    if (after[index] !== undefined) output.push(`+${after[index]}`);
  }

  return output.join("\n");
}

// Utility to check for typical binary file signatures
export function isBinaryBuffer(buf: Buffer): boolean {
  const end = Math.min(buf.length, 512);
  for (let i = 0; i < end; i++) {
    if (buf[i] === 0) {
      return true;
    }
  }
  return false;
}

// Local filesystem adapter
export class LocalFilesystemRepoAdapter implements RepoAdapter {
  private readonly rootPath: string;
  private readonly maxFileSize: number; // in bytes, default 5MB

  constructor(rootPath: string, maxFileSize = 5 * 1024 * 1024) {
    this.rootPath = path.resolve(rootPath);
    this.maxFileSize = maxFileSize;
  }

  getCapabilities(): RepoAdapterCapabilities {
    return {
      adapterKind: "local_filesystem",
      accessMode: "read_write",
      remote: false,
      operations: {
        readFile: true,
        writeFile: true,
        listFiles: true,
        contentDiff: true,
        changedFiles: false,
        createBranch: false,
        commit: false,
        openPullRequest: false,
      },
      notes: [
        "Diff support compares caller-supplied text safely; Git history is not queried.",
        "Branch, commit and pull-request operations are not implemented.",
      ],
    };
  }

  normalizePath(p: string): string {
    const clean = p.replace(/\\/g, "/");
    return path.normalize(clean).replace(/\\/g, "/");
  }

  validatePath(p: string): { valid: boolean; error?: string } {
    try {
      const normTarget = path.resolve(this.rootPath, p);
      if (!normTarget.startsWith(this.rootPath)) {
        return { valid: false, error: "Access denied: Path traversal attempt blocked." };
      }

      const basename = path.basename(normTarget).toLowerCase();
      const forbiddenNames = [".env", "secrets.json", "credentials.json"];
      if (forbiddenNames.includes(basename)) {
        return { valid: false, error: `Access denied: Reading forbidden file '${basename}' is strictly blocked.` };
      }

      const forbiddenEndings = [".pem", ".key"];
      if (forbiddenEndings.some(ext => basename.endsWith(ext))) {
        return { valid: false, error: `Access denied: Reading certificate/key files with extension '${basename}' is strictly blocked.` };
      }

      const relativeFromRoot = path.relative(this.rootPath, normTarget);
      const parts = relativeFromRoot.split(path.sep);

      if (parts.includes("node_modules")) {
        return { valid: false, error: "Access denied: node_modules directory access is blocked by security boundaries." };
      }

      const skippedArtifacts = ["dist", "build", ".next", "out", "target"];
      if (parts.some(part => skippedArtifacts.includes(part))) {
        return { valid: false, error: "Access denied: build/distribution artifacts are skipped by security boundaries." };
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: `Invalid path: ${err.message}` };
    }
  }

  async readFile(p: string): Promise<RepoAdapterResult<string>> {
    const check = this.validatePath(p);
    if (!check.valid) {
      return { ok: false, data: null, warnings: [check.error || "Path validation failed"], errors: [check.error || "Path validation failed"], redacted: false };
    }

    try {
      const fullPath = path.resolve(this.rootPath, p);
      if (!fs.existsSync(fullPath)) {
        return { ok: false, data: null, warnings: ["File does not exist."], errors: ["ENOENT: File not found"], redacted: false };
      }

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        return { ok: false, data: null, warnings: ["Path is a directory."], errors: ["EISDIR: Path is a directory"], redacted: false };
      }

      if (stat.size > this.maxFileSize) {
        return { ok: false, data: null, warnings: [`File size ${stat.size} exceeds maximum limit of ${this.maxFileSize} bytes.`], errors: ["EBUDGET: File size limit exceeded"], redacted: false };
      }

      const buffer = fs.readFileSync(fullPath);
      if (isBinaryBuffer(buffer)) {
        return { ok: false, data: null, warnings: ["Binary file format. Skipping read payload."], errors: ["EBINARY: Binary file access skipped"], redacted: false };
      }

      const rawContent = buffer.toString("utf8");
      const redactedContent = redactSecretLeaks(rawContent);
      const isRedacted = redactedContent !== rawContent;

      return {
        ok: true,
        data: redactedContent,
        warnings: isRedacted ? ["Credential/secret patterns were automatically redacted during read operation."] : [],
        errors: [],
        redacted: isRedacted
      };
    } catch (err: any) {
      return { ok: false, data: null, warnings: [], errors: [err.message], redacted: false };
    }
  }

  async writeFile(p: string, content: string, options?: { encoding?: string }): Promise<RepoAdapterResult<void>> {
    const check = this.validatePath(p);
    if (!check.valid) {
      return { ok: false, data: null, warnings: [check.error || "Path validation failed"], errors: [check.error || "Path validation failed"], redacted: false };
    }

    try {
      const redactedContent = redactSecretLeaks(content);
      const fullPath = path.resolve(this.rootPath, p);
      
      // Ensure enclosing directories exist
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, redactedContent, { encoding: (options?.encoding as any) || "utf8" });

      const isRedacted = redactedContent !== content;

      return {
        ok: true,
        data: null,
        warnings: isRedacted ? ["Credential/secret patterns were automatically redacted during write operation."] : [],
        errors: [],
        redacted: isRedacted
      };
    } catch (err: any) {
      return { ok: false, data: null, warnings: [], errors: [err.message], redacted: false };
    }
  }

  async listFiles(root: string, options?: { recursive?: boolean; limit?: number }): Promise<RepoAdapterResult<RepoFileRef[]>> {
    const check = this.validatePath(root);
    if (!check.valid) {
      return { ok: false, data: null, warnings: [check.error || "Path validation failed"], errors: [check.error || "Path validation failed"], redacted: false };
    }

    const recursive = options?.recursive !== false;
    const limit = options?.limit || 1000;
    const files: RepoFileRef[] = [];
    const warnings: string[] = [];

    try {
      const fullRoot = path.resolve(this.rootPath, root);
      if (!fs.existsSync(fullRoot)) {
        return { ok: false, data: [], warnings: ["Directory does not exist."], errors: ["ENOENT"], redacted: false };
      }

      const scanDir = (dir: string) => {
        if (files.length >= limit) return;

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (files.length >= limit) break;

          const entryPath = path.join(dir, entry.name);
          const relativePath = path.relative(this.rootPath, entryPath);

          // Validate path before adding
          const val = this.validatePath(relativePath);
          if (!val.valid) {
            continue;
          }

          let file_type: "file" | "directory" | "symlink" | "unknown" = "unknown";
          if (entry.isFile()) file_type = "file";
          else if (entry.isDirectory()) file_type = "directory";
          else if (entry.isSymbolicLink()) file_type = "symlink";

          let size_bytes: number | null = null;
          let last_modified: string | null = null;
          let hash: string | null = null;

          if (file_type === "file") {
            try {
              const stat = fs.statSync(entryPath);
              size_bytes = stat.size;
              last_modified = stat.mtime.toISOString();

              // Compute hash if file size is small
              if (size_bytes < 1024 * 1024) {
                const content = fs.readFileSync(entryPath);
                hash = crypto.createHash("sha256").update(content).digest("hex");
              }
            } catch {
              // ignore stat errors
            }
          }

          files.push({
            project_id: "", // filled by service
            repo_id: null,
            path: relativePath.replace(/\\/g, "/"),
            normalized_path: this.normalizePath(relativePath),
            file_type,
            hash,
            size_bytes,
            last_modified,
            source_type: "local_filesystem"
          });

          if (recursive && file_type === "directory") {
            scanDir(entryPath);
          }
        }
      };

      scanDir(fullRoot);

      return {
        ok: true,
        data: files,
        warnings,
        errors: [],
        redacted: false
      };
    } catch (err: any) {
      return { ok: false, data: [], warnings: [], errors: [err.message], redacted: false };
    }
  }

  async fileExists(p: string): Promise<RepoAdapterResult<boolean>> {
    const check = this.validatePath(p);
    if (!check.valid) {
      return { ok: false, data: false, warnings: [check.error || ""], errors: [], redacted: false };
    }
    const fullPath = path.resolve(this.rootPath, p);
    return { ok: true, data: fs.existsSync(fullPath), warnings: [], errors: [], redacted: false };
  }

  async statFile(p: string): Promise<RepoAdapterResult<{ size: number; mtime: Date; isDirectory: boolean }>> {
    const check = this.validatePath(p);
    if (!check.valid) {
      return { ok: false, data: null, warnings: [check.error || ""], errors: [check.error || ""], redacted: false };
    }
    try {
      const fullPath = path.resolve(this.rootPath, p);
      const stat = fs.statSync(fullPath);
      return {
        ok: true,
        data: {
          size: stat.size,
          mtime: stat.mtime,
          isDirectory: stat.isDirectory()
        },
        warnings: [],
        errors: [],
        redacted: false
      };
    } catch (err: any) {
      return { ok: false, data: null, warnings: [], errors: [err.message], redacted: false };
    }
  }

  async getFileHash(p: string): Promise<RepoAdapterResult<string>> {
    const check = this.validatePath(p);
    if (!check.valid) {
      return { ok: false, data: null, warnings: [check.error || ""], errors: [check.error || ""], redacted: false };
    }
    try {
      const fullPath = path.resolve(this.rootPath, p);
      const content = fs.readFileSync(fullPath);
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      return { ok: true, data: hash, warnings: [], errors: [], redacted: false };
    } catch (err: any) {
      return { ok: false, data: null, warnings: [], errors: [err.message], redacted: false };
    }
  }

  async getChangedFiles(options?: any): Promise<RepoAdapterResult<string[]>> {
    return {
      ok: false,
      data: [],
      warnings: ["Changed-file discovery requires a version-control adapter."],
      errors: ["E_UNSUPPORTED"],
      redacted: false,
    };
  }

  async getDiff(request: RepoDiffRequest): Promise<RepoAdapterResult<string>> {
    const check = this.validatePath(request.path);
    if (!check.valid) {
      return {
        ok: false,
        data: null,
        warnings: [check.error || "Path validation failed."],
        errors: [check.error || "Path validation failed."],
        redacted: false,
      };
    }
    const data = createSafeTextDiff(request);
    return {
      ok: true,
      data,
      warnings: [
        "Content-pair diff only; no Git base, branch or working-tree state was inspected.",
      ],
      errors: [],
      redacted:
        data.includes("[REDACTED") ||
        data.includes("***REDACTED***"),
    };
  }

  resolveProjectRoot(projectId: string): string {
    return this.rootPath;
  }
}

// Read-only GitHub repo adapter (stub)
export class ReadOnlyGitHubRepoAdapter implements RepoAdapter {
  private readonly projectId: string;
  private readonly repoUrl: string;

  constructor(projectId: string, repoUrl: string) {
    this.projectId = projectId;
    this.repoUrl = repoUrl;
  }

  getCapabilities(): RepoAdapterCapabilities {
    return {
      adapterKind: "readonly_github_stub",
      accessMode: "unavailable",
      remote: true,
      operations: {
        readFile: false,
        writeFile: false,
        listFiles: false,
        contentDiff: false,
        changedFiles: false,
        createBranch: false,
        commit: false,
        openPullRequest: false,
      },
      notes: [
        "This adapter is a configuration placeholder; no GitHub connector is attached.",
        "Remote read, write, branch, commit and pull-request operations are unsupported.",
      ],
    };
  }

  normalizePath(p: string): string {
    const clean = p.replace(/\\/g, "/");
    return path.normalize(clean).replace(/\\/g, "/");
  }

  validatePath(p: string): { valid: boolean; error?: string } {
    return { valid: true };
  }

  async readFile(p: string): Promise<RepoAdapterResult<string>> {
    return {
      ok: false,
      data: null,
      warnings: ["GitHub integration requires remote connector setup. Using ReadOnly GitHub adapter stub."],
      errors: ["E_コネクター未設定: GitHub Remote Connector requires authentication credentials. Remote fetching is strictly blocked until configured."],
      redacted: false
    };
  }

  async writeFile(p: string, content: string, options?: { encoding?: string }): Promise<RepoAdapterResult<void>> {
    return {
      ok: false,
      data: null,
      warnings: ["Writing to remote GitHub repo is not supported."],
      errors: ["E_READONLY: Remote write operation is not supported by the ReadOnly GitHub adapter stub."],
      redacted: false
    };
  }

  async listFiles(root: string, options?: { recursive?: boolean; limit?: number }): Promise<RepoAdapterResult<RepoFileRef[]>> {
    return {
      ok: false,
      data: [],
      warnings: ["GitHub remote listing requires connector setup."],
      errors: ["E_コネクター未設定: GitHub Remote listFiles blocked."],
      redacted: false
    };
  }

  async fileExists(p: string): Promise<RepoAdapterResult<boolean>> {
    return { ok: true, data: false, warnings: ["GitHub stub always returns false for existence check."], errors: [], redacted: false };
  }

  async statFile(p: string): Promise<RepoAdapterResult<{ size: number; mtime: Date; isDirectory: boolean }>> {
    return { ok: false, data: null, warnings: ["GitHub remote stat blocked."], errors: ["E_UNSUPPORTED"], redacted: false };
  }

  async getFileHash(p: string): Promise<RepoAdapterResult<string>> {
    return { ok: false, data: null, warnings: ["GitHub remote hashing blocked."], errors: ["E_UNSUPPORTED"], redacted: false };
  }

  async getChangedFiles(options?: any): Promise<RepoAdapterResult<string[]>> {
    return { ok: false, data: [], warnings: ["GitHub changed-file discovery is unavailable."], errors: ["E_UNSUPPORTED"], redacted: false };
  }

  async getDiff(request: RepoDiffRequest): Promise<RepoAdapterResult<string>> {
    return {
      ok: false,
      data: null,
      warnings: ["GitHub diff retrieval is unavailable until a remote connector is configured."],
      errors: ["E_UNSUPPORTED"],
      redacted: false,
    };
  }

  resolveProjectRoot(projectId: string): string {
    return this.repoUrl;
  }
}

// Virtual memory adapter (for safe testing)
export class VirtualMemoryRepoAdapter implements RepoAdapter {
  private files: Map<string, string> = new Map();
  private mtimes: Map<string, Date> = new Map();

  getCapabilities(): RepoAdapterCapabilities {
    return {
      adapterKind: "virtual_memory",
      accessMode: "read_write",
      remote: false,
      operations: {
        readFile: true,
        writeFile: true,
        listFiles: true,
        contentDiff: true,
        changedFiles: false,
        createBranch: false,
        commit: false,
        openPullRequest: false,
      },
      notes: [
        "Volatile test adapter; content is lost when the process exits.",
        "Version-control operations are not implemented.",
      ],
    };
  }

  normalizePath(p: string): string {
    const clean = p.replace(/\\/g, "/");
    return path.normalize(clean).replace(/\\/g, "/");
  }

  validatePath(p: string): { valid: boolean; error?: string } {
    const clean = this.normalizePath(p);
    if (clean.includes("../") || clean.startsWith("../")) {
      return { valid: false, error: "Access denied: Path traversal attempt blocked." };
    }
    const basename = path.basename(clean).toLowerCase();
    if (basename === ".env" || basename === "secrets.json") {
      return { valid: false, error: "Access denied: Reading forbidden file is blocked." };
    }
    return { valid: true };
  }

  async readFile(p: string): Promise<RepoAdapterResult<string>> {
    const check = this.validatePath(p);
    if (!check.valid) {
      return { ok: false, data: null, warnings: [check.error || ""], errors: [check.error || ""], redacted: false };
    }
    const clean = this.normalizePath(p);
    if (!this.files.has(clean)) {
      return { ok: false, data: null, warnings: ["File not found."], errors: ["ENOENT"], redacted: false };
    }
    const raw = this.files.get(clean) || "";
    const redacted = redactSecretLeaks(raw);
    const isRedacted = redacted !== raw;
    return { ok: true, data: redacted, warnings: isRedacted ? ["Credentials redacted."] : [], errors: [], redacted: isRedacted };
  }

  async writeFile(p: string, content: string, options?: { encoding?: string }): Promise<RepoAdapterResult<void>> {
    const check = this.validatePath(p);
    if (!check.valid) {
      return { ok: false, data: null, warnings: [check.error || ""], errors: [check.error || ""], redacted: false };
    }
    const clean = this.normalizePath(p);
    const redacted = redactSecretLeaks(content);
    const isRedacted = redacted !== content;
    this.files.set(clean, redacted);
    this.mtimes.set(clean, new Date());
    return { ok: true, data: null, warnings: isRedacted ? ["Credentials redacted."] : [], errors: [], redacted: isRedacted };
  }

  async listFiles(root: string, options?: { recursive?: boolean; limit?: number }): Promise<RepoAdapterResult<RepoFileRef[]>> {
    const list: RepoFileRef[] = [];
    const cleanRoot = this.normalizePath(root);
    for (const [p, content] of this.files.entries()) {
      if (p.startsWith(cleanRoot)) {
        list.push({
          project_id: "",
          repo_id: null,
          path: p,
          normalized_path: p,
          file_type: "file",
          hash: crypto.createHash("sha256").update(content).digest("hex"),
          size_bytes: content.length,
          last_modified: (this.mtimes.get(p) || new Date()).toISOString(),
          source_type: "virtual_memory"
        });
      }
    }
    return { ok: true, data: list, warnings: [], errors: [], redacted: false };
  }

  async fileExists(p: string): Promise<RepoAdapterResult<boolean>> {
    const check = this.validatePath(p);
    if (!check.valid) {
      return { ok: false, data: false, warnings: [check.error || ""], errors: [], redacted: false };
    }
    const clean = this.normalizePath(p);
    return { ok: true, data: this.files.has(clean), warnings: [], errors: [], redacted: false };
  }

  async statFile(p: string): Promise<RepoAdapterResult<{ size: number; mtime: Date; isDirectory: boolean }>> {
    const check = this.validatePath(p);
    if (!check.valid) {
      return { ok: false, data: null, warnings: [check.error || ""], errors: [check.error || ""], redacted: false };
    }
    const clean = this.normalizePath(p);
    if (!this.files.has(clean)) {
      return { ok: false, data: null, warnings: ["File not found."], errors: ["ENOENT"], redacted: false };
    }
    return {
      ok: true,
      data: {
        size: this.files.get(clean)!.length,
        mtime: this.mtimes.get(clean) || new Date(),
        isDirectory: false
      },
      warnings: [],
      errors: [],
      redacted: false
    };
  }

  async getFileHash(p: string): Promise<RepoAdapterResult<string>> {
    const check = this.validatePath(p);
    if (!check.valid) {
      return { ok: false, data: null, warnings: [check.error || ""], errors: [check.error || ""], redacted: false };
    }
    const clean = this.normalizePath(p);
    if (!this.files.has(clean)) {
      return { ok: false, data: null, warnings: ["File not found."], errors: ["ENOENT"], redacted: false };
    }
    const hash = crypto.createHash("sha256").update(this.files.get(clean)!).digest("hex");
    return { ok: true, data: hash, warnings: [], errors: [], redacted: false };
  }

  async getChangedFiles(options?: any): Promise<RepoAdapterResult<string[]>> {
    return {
      ok: false,
      data: [],
      warnings: ["Virtual memory adapter does not track a version-control baseline."],
      errors: ["E_UNSUPPORTED"],
      redacted: false,
    };
  }

  async getDiff(request: RepoDiffRequest): Promise<RepoAdapterResult<string>> {
    const check = this.validatePath(request.path);
    if (!check.valid) {
      return {
        ok: false,
        data: null,
        warnings: [check.error || "Path validation failed."],
        errors: [check.error || "Path validation failed."],
        redacted: false,
      };
    }
    const data = createSafeTextDiff(request);
    return {
      ok: true,
      data,
      warnings: ["Content-pair diff only; no version-control baseline exists."],
      errors: [],
      redacted:
        data.includes("[REDACTED") ||
        data.includes("***REDACTED***"),
    };
  }

  resolveProjectRoot(projectId: string): string {
    return "memory://";
  }
}

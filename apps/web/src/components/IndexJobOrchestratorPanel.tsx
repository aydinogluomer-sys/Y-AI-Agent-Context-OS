/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { useIndexOrchestration } from "../hooks/useIndexOrchestration";
import { Card } from "./primitives/Card";
import { Button } from "./primitives/Button";
import { Badge } from "./primitives/Badge";
import { 
  FolderOpen, 
  RefreshCw, 
  AlertTriangle, 
  Play, 
  CheckCircle2,
  Database,
  Search,
  Activity,
  Plus,
  Trash2,
  Unlock,
  FileCode,
  FileText,
  Terminal,
  Layers,
  Sparkles,
  Zap,
  Lock
} from "lucide-react";

interface IndexJobOrchestratorPanelProps {
  projectId: string;
}

export function IndexJobOrchestratorPanel({ projectId }: IndexJobOrchestratorPanelProps) {
  const o = useIndexOrchestration(projectId);

  // Form states for manual triggering
  const [scanPathInput, setScanPathInput] = useState("");
  const [newJobType, setNewJobType] = useState("file_delta_scan");
  const [newJobPath, setNewJobPath] = useState("");
  const [newJobPriority, setNewJobPriority] = useState("medium");

  const getJobStatusBadge = (status: string) => {
    switch (status) {
      case "queued":
        return <Badge tone="neutral" variant="low">KUYRUKTA</Badge>;
      case "running":
        return <Badge tone="warning" variant="low">ÇALIŞIYOR</Badge>;
      case "completed":
        return <Badge tone="success" variant="low">TAMAMLANDI</Badge>;
      case "failed":
        return <Badge tone="danger" variant="low">HATALI</Badge>;
      case "cancelled":
        return <Badge tone="neutral" variant="low">İPTAL EDİLDİ</Badge>;
      default:
        return <Badge tone="neutral" variant="low">{status.toUpperCase()}</Badge>;
    }
  };

  const getChangeKindBadge = (kind: string) => {
    switch (kind) {
      case "added":
        return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[8px] font-mono">EKLENDİ</span>;
      case "modified":
        return <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded text-[8px] font-mono">GÜNCELLENDİ</span>;
      case "deleted":
        return <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded text-[8px] font-mono">SİLİNDİ</span>;
      default:
        return <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[8px] font-mono">{kind.toUpperCase()}</span>;
    }
  };

  return (
    <div id="index-orchestrator-panel-container" className="space-y-6 font-sans">
      
      {/* Upper header section */}
      <div className="bg-slate-900/60 rounded-xl p-6 border border-glass-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-optic-cyan/5 via-transparent to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center space-x-3.5 text-left">
            <div className="p-2.5 bg-optic-cyan/10 rounded-lg border border-optic-cyan/20 text-optic-cyan shadow-[0_0_8px_rgba(0,213,255,0.15)]">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100 tracking-tight flex items-center space-x-2">
                <span>Dizin İşlemleri Kuyruk Defteri</span>
                <span className="text-[10px] font-mono bg-optic-cyan/15 text-optic-cyan border border-optic-cyan/25 px-1.5 py-0.5 rounded uppercase">
                  Faz 20 Tamamlandı
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                RepoAdapter (KDEBT-003) aracılığıyla güvenli dosya sistemi yolları okuma ve işlem korumalı IndexJob kuyruğu taraması içeren artımlı yeniden dizinleme sırası.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <Button 
              variant="command" 
              size="sm"
              loading={o.releasingLocksLoading}
              onClick={o.handleReleaseStaleLocks}
            >
              <Unlock className="w-3.5 h-3.5 mr-1.5" />
              Sıkışan Görev Kilidini Aç
            </Button>
            <Button 
              variant="primary" 
              size="sm"
              loading={o.rebuildingDelta}
              onClick={o.handleRebuildDelta}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Tüm Bağlamı Yeniden Derle
            </Button>
          </div>
        </div>
      </div>

      {/* Watcher Status and controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Watcher parameters card */}
        <Card glow className="p-5 bg-graphite-dark/60 border border-glass-border space-y-4">
          <div className="flex justify-between items-center border-b border-glass-border/40 pb-2.5">
            <span className="text-xs font-semibold text-slate-200 tracking-tight flex items-center space-x-1.5">
              <Activity className="w-3.5 h-3.5 text-optic-cyan" />
              <span>Artımlı Dizin Durumu</span>
            </span>
            {o.incrementalStatus?.enabled ? (
              <Badge tone="success" variant="low">İZLEME AKTİF</Badge>
            ) : (
              <Badge tone="neutral" variant="low">BEKLEMEDE</Badge>
            )}
          </div>

          {o.incrementalStatus ? (
            <div className="space-y-2.5 font-mono text-[10px] text-slate-350 text-left">
              <div className="flex justify-between py-1 border-b border-glass-border/10">
                <span className="text-steel-muted">İZLENEN DİZİNLER</span>
                <span className="text-slate-100">{o.incrementalStatus.watched_roots?.join(", ")}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-glass-border/10">
                <span className="text-steel-muted">DEBOUNCE SÜRESİ</span>
                <span className="text-slate-100">{o.incrementalStatus.debounce_ms} ms</span>
              </div>
              <div className="flex justify-between py-1 border-b border-glass-border/10">
                <span className="text-steel-muted">KUYRUKTA BEKLEYEN</span>
                <span className="text-glow-cyan text-slate-100 font-bold">{o.incrementalStatus.pending_events} olay</span>
              </div>
              <div className="flex justify-between py-1 border-b border-glass-border/10">
                <span className="text-steel-muted">SON TESPİT EDİLEN</span>
                <span className="text-slate-100">
                  {o.incrementalStatus.last_event_at 
                    ? new Date(o.incrementalStatus.last_event_at).toLocaleTimeString() 
                    : "hiçbir zaman"}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-steel-muted">DAEMON DURUMU</span>
                <span className="text-evidence-green">{o.incrementalStatus.healthy ? "SAĞLIKLI" : "HATA"}</span>
              </div>

              {o.incrementalStatus.warnings?.length > 0 && (
                <div className="mt-3 p-2 bg-amber-500/5 text-amber-400 border border-amber-500/15 rounded text-[9px] flex items-start space-x-1 font-sans">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{o.incrementalStatus.warnings[0]}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-steel-muted font-mono">İzleyici durumu yükleniyor...</div>
          )}
        </Card>

        {/* Manual Path Register Card */}
        <Card glow className="p-5 bg-graphite-dark/60 border border-glass-border space-y-3.5">
          <span className="text-xs font-semibold text-slate-200 tracking-tight flex items-center space-x-1.5 border-b border-glass-border/40 pb-2.5 text-left">
            <Plus className="w-3.5 h-3.5 text-optic-cyan" />
            <span>Manuel Dizin Tarama Kaydı</span>
          </span>

          <div className="space-y-3 text-xs text-left">
            <div className="space-y-1">
              <label className="text-[9px] font-mono text-steel-muted uppercase">Hedef bağıl dosya yolu</label>
              <input
                type="text"
                value={scanPathInput}
                onChange={(e) => setScanPathInput(e.target.value)}
                placeholder="örn. apps/api/src/config.ts"
                className="w-full text-xs text-slate-200 p-2 rounded-lg bg-slate-950 border border-glass-border focus:border-optic-cyan/50 focus:outline-none"
              />
            </div>
            <Button 
              variant="command" 
              size="sm"
              className="w-full"
              loading={o.scanningPath}
              disabled={!scanPathInput.trim()}
              onClick={() => { o.handleScanPath(scanPathInput); setScanPathInput(""); }}
            >
              Artımlı dosya taramasını sıraya ekle
            </Button>
          </div>
        </Card>

        {/* Manual Job Dispatcher */}
        <Card glow className="p-5 bg-graphite-dark/60 border border-glass-border space-y-3.5">
          <span className="text-xs font-semibold text-slate-200 tracking-tight flex items-center space-x-1.5 border-b border-glass-border/40 pb-2.5 text-left">
            <Zap className="w-3.5 h-3.5 text-optic-cyan" />
            <span>Özel Dizin Görevi Ekle</span>
          </span>

          <div className="space-y-2.5 text-xs text-left">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-steel-muted uppercase">Görev Türü</label>
                <select
                  value={newJobType}
                  onChange={(e) => setNewJobType(e.target.value)}
                  className="w-full text-xs text-slate-200 p-1.5 bg-slate-950 border border-glass-border rounded focus:outline-none cursor-pointer"
                >
                  <option value="file_delta_scan">Artımlı Tarama</option>
                  <option value="context_reindex">Tümünü Yeniden Tara</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono text-steel-muted uppercase">Öncelik</label>
                <select
                  value={newJobPriority}
                  onChange={(e) => setNewJobPriority(e.target.value)}
                  className="w-full text-xs text-slate-200 p-1.5 bg-slate-950 border border-glass-border rounded focus:outline-none cursor-pointer"
                >
                  <option value="low">Düşük</option>
                  <option value="medium">Orta</option>
                  <option value="high">Yüksek</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-mono text-steel-muted uppercase">Dosya Yolu</label>
              <input
                type="text"
                value={newJobPath}
                onChange={(e) => setNewJobPath(e.target.value)}
                placeholder="örn. apps/api/* (Tümü için boş bırakın)"
                className="w-full text-xs text-slate-200 p-1.5 bg-slate-950 border border-glass-border rounded focus:outline-none font-mono"
              />
            </div>

            <Button 
              variant="primary" 
              size="sm"
              className="w-full"
              loading={o.creatingIndexJob}
              onClick={async () => {
                await o.handleCreateIndexJob(newJobType, newJobPath, newJobPriority);
                setNewJobPath("");
              }}
            >
              Görevi Başlat (Dispatch)
            </Button>
          </div>
        </Card>

      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
        
        {/* Left Side: Jobs Queue and Incremental Logs */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Index Jobs Queue */}
          <Card glow className="p-6 bg-graphite-dark/65 backdrop-blur-xl border border-glass-border space-y-4">
            <div className="flex justify-between items-center border-b border-glass-border/40 pb-3">
              <h3 className="text-sm font-semibold text-slate-200 tracking-tight flex items-center space-x-2">
                <Layers className="w-4 h-4 text-optic-cyan" />
                <span>Dizin İşleri Kuyruk Sicili</span>
              </h3>

              <div className="flex items-center space-x-2">
                <Button 
                  variant="command" 
                  size="sm"
                  loading={o.claimingNextJob}
                  onClick={o.handleClaimNextJob}
                >
                  Sıradakini Al (Claim)
                </Button>
                <button
                  onClick={o.loadIndexJobs}
                  disabled={o.indexJobsLoading}
                  className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-900 border border-glass-border text-steel-muted hover:text-slate-200 transition-all cursor-pointer shadow-soft"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${o.indexJobsLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {o.indexJobsLoading && o.indexJobs.length === 0 ? (
              <div className="py-12 text-center text-xs text-steel-muted font-mono animate-pulse">Kuyruk yükleniyor...</div>
            ) : o.indexJobsError ? (
              <div className="py-12 text-center text-xs text-rose-400 font-mono">{o.indexJobsError}</div>
            ) : o.indexJobs.length === 0 ? (
              <div className="py-12 text-center text-xs text-steel-muted italic font-mono bg-void-black/20 rounded-xl border border-glass-border/40">Tüm çalışma alanları senkronize edildi. Kuyruk boş.</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-glass-border scrollbar-thin">
                <table className="w-full text-[11px] font-mono text-slate-400 border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-500 uppercase tracking-wider text-left border-b border-glass-border">
                      <th className="p-3">Görev ID</th>
                      <th className="p-3">Tür</th>
                      <th className="p-3">Öncelik</th>
                      <th className="p-3">Deneme</th>
                      <th className="p-3">Durum</th>
                      <th className="p-3 text-right">Eylemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.indexJobs.map((j) => (
                      <tr key={j.id} className="border-b border-glass-border/30 hover:bg-void-black/20 bg-slate-950/20">
                        <td className="p-3 font-bold text-slate-200">{j.id}</td>
                        <td className="p-3 uppercase text-[10px]">{j.job_type === "file_delta_scan" ? "Artımlı Tarama" : "Yeniden Dizinle"}</td>
                        <td className="p-3 uppercase text-[10px] text-optic-cyan">{j.priority === "low" ? "düşük" : j.priority === "medium" ? "orta" : "yüksek"}</td>
                        <td className="p-3">{j.attempts} / {j.max_attempts}</td>
                        <td className="p-3">{getJobStatusBadge(j.status)}</td>
                        <td className="p-3 text-right space-x-1.5">
                          {(j.status === "queued" || j.status === "running") && (
                            <button
                              disabled={o.cancellingJobIds[j.id]}
                              onClick={() => o.handleCancelIndexJob(j.id)}
                              className="text-[9px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded transition-all cursor-pointer"
                            >
                              İptal Et
                            </button>
                          )}
                          {j.status === "failed" && (
                            <button
                              disabled={o.retryingJobIds[j.id]}
                              onClick={() => o.handleRetryIndexJob(j.id)}
                              className="text-[9px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded transition-all cursor-pointer"
                            >
                              Yeniden Dene
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Incremental Events list */}
          <Card glow className="p-6 bg-graphite-dark/65 backdrop-blur-xl border border-glass-border space-y-4">
            <div className="flex justify-between items-center border-b border-glass-border/40 pb-3">
              <h3 className="text-sm font-semibold text-slate-200 tracking-tight flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-optic-cyan" />
                <span>Artımlı İzleyici Günlükleri</span>
              </h3>

              <button
                onClick={o.loadIncrementalData}
                disabled={o.incrementalLoading}
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-900 border border-glass-border text-steel-muted hover:text-slate-200 transition-all cursor-pointer shadow-soft"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${o.incrementalLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {o.incrementalLoading && o.incrementalEvents.length === 0 ? (
              <div className="py-12 text-center text-xs text-steel-muted font-mono animate-pulse">Olaylar yükleniyor...</div>
            ) : o.incrementalError ? (
              <div className="py-12 text-center text-xs text-rose-400 font-mono">{o.incrementalError}</div>
            ) : o.incrementalEvents.length === 0 ? (
              <div className="py-12 text-center text-xs text-steel-muted italic font-mono bg-void-black/20 rounded-xl border border-glass-border/40">Dosya değişikliği saptanmadı.</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-glass-border max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                <table className="w-full text-[11px] font-mono text-slate-400 border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-500 uppercase tracking-wider text-left border-b border-glass-border">
                      <th className="p-3">Zaman</th>
                      <th className="p-3">Dosya Yolu</th>
                      <th className="p-3">Değişiklik</th>
                      <th className="p-3">Adaptör Türü</th>
                      <th className="p-3">İlişkili Görev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.incrementalEvents.map((ev) => (
                      <tr key={ev.id} className="border-b border-glass-border/30 hover:bg-void-black/20 bg-slate-950/20">
                        <td className="p-3 text-slate-500 text-[10px]">
                          {ev.detected_at ? new Date(ev.detected_at).toLocaleTimeString() : ""}
                        </td>
                        <td className="p-3 font-bold text-slate-200 max-w-[200px] truncate animate-none" title={ev.path}>
                          {ev.path}
                        </td>
                        <td className="p-3">{getChangeKindBadge(ev.change_kind)}</td>
                        <td className="p-3 text-[10px]">{ev.adapter_kind}</td>
                        <td className="p-3 text-indigo-400 text-[10px]">
                          {ev.index_job_id || "yok"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

        </div>

        {/* Right Side: Safe Repo Files Explorer (RepoAdapter) */}
        <div className="lg:col-span-4 space-y-6">
          <Card glow className="p-6 bg-graphite-dark/65 backdrop-blur-xl border border-glass-border space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 tracking-tight flex items-center space-x-2">
              <FolderOpen className="w-4 h-4 text-optic-cyan" />
              <span>Güvenli Depo Gezgini</span>
            </h3>

            {/* List of files */}
            {o.repoFilesLoading ? (
              <div className="py-12 text-center text-xs text-steel-muted font-mono">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-optic-cyan" />
                <span>Dizin yapısı okunuyor...</span>
              </div>
            ) : o.repoFiles.length === 0 ? (
              <div className="py-12 text-center text-xs text-steel-muted border border-dashed border-glass-border rounded-lg font-mono">
                Taranmış veya yapılandırılmış yerel depo yolu bulunmuyor.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                {o.repoFiles.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => o.loadRepoFileContent(file.path)}
                    className={`w-full text-left p-2.5 rounded-lg border text-xs font-mono transition-all flex items-center justify-between cursor-pointer ${
                      o.selectedRepoFilePath === file.path
                        ? "bg-optic-cyan/10 border-optic-cyan/35 text-optic-cyan font-bold"
                        : "bg-slate-950/60 border-glass-border hover:bg-slate-900/60 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center space-x-2 max-w-[80%] truncate">
                      <FileCode className="w-3.5 h-3.5 shrink-0 text-slate-450" />
                      <span className="truncate">{file.path}</span>
                    </div>
                    <span className="text-[9px] text-steel-muted shrink-0">{(file.size / 1024).toFixed(1)} KB</span>
                  </button>
                ))}
              </div>
            )}

            {/* Warnings/Errors from RepoAdapter */}
            {o.repoWarnings.length > 0 && (
              <div className="p-2.5 bg-amber-500/5 text-amber-400 border border-amber-500/15 rounded text-[9px] flex items-start space-x-1.5 font-sans leading-normal">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>{o.repoWarnings[0]}</span>
              </div>
            )}
          </Card>

          {/* Repo File Content Viewer (with automatic secret redaction status) */}
          {o.selectedRepoFilePath && (
            <Card glow className="p-6 bg-graphite-dark/65 backdrop-blur-xl border border-glass-border space-y-3.5">
              <div className="flex items-center justify-between border-b border-glass-border/30 pb-2.5">
                <div className="flex items-center space-x-2 max-w-[70%] truncate">
                  <FileText className="w-4 h-4 text-optic-cyan" />
                  <span className="text-xs font-bold text-slate-200 font-mono truncate">{o.selectedRepoFilePath.split("/").pop()}</span>
                </div>
                
                {o.selectedRepoFileRedacted && (
                  <Badge tone="danger" variant="low" className="text-[8px] font-mono font-bold tracking-wider">SIRLAR MASKELEDİ</Badge>
                )}
              </div>

              {o.selectedRepoFileLoading ? (
                <div className="py-12 text-center text-xs text-steel-muted font-mono">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-optic-cyan" />
                  <span>Dosya içeriği taranıyor...</span>
                </div>
              ) : o.selectedRepoFileErrors.length > 0 ? (
                <div className="p-3 bg-rose-500/10 border border-rose-500/35 text-rose-400 rounded-lg text-xs font-mono">
                  {o.selectedRepoFileErrors[0]}
                </div>
              ) : (
                <div className="space-y-3 text-left">
                  <pre className="text-[10px] font-mono text-slate-300 leading-relaxed overflow-x-auto bg-void-black/85 p-3 rounded-lg border border-glass-border max-h-[260px] overflow-y-auto whitespace-pre-wrap select-text scrollbar-thin">
                    {o.selectedRepoFileContent}
                  </pre>
                  
                  {o.selectedRepoFileWarnings.length > 0 && (
                    <div className="p-2 bg-amber-500/5 text-amber-400 border border-amber-500/15 rounded text-[8px] flex items-center space-x-1.5 font-sans">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      <span>{o.selectedRepoFileWarnings[0]}</span>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

        </div>

      </div>

    </div>
  );
}

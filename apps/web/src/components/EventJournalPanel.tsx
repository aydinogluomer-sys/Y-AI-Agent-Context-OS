/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { useTaskLifecycle } from "../hooks/useTaskLifecycle";
import { Card } from "./primitives/Card";
import { Button } from "./primitives/Button";
import { Badge } from "./primitives/Badge";
import { 
  History, 
  RefreshCw, 
  AlertTriangle, 
  HelpCircle, 
  Play, 
  ShieldCheck, 
  ShieldAlert, 
  Cpu, 
  Activity, 
  Terminal, 
  Database, 
  Zap, 
  Lock, 
  ChevronDown, 
  ChevronUp, 
  FileText,
  Search,
  CheckCircle2
} from "lucide-react";

interface EventJournalPanelProps {
  projectId: string;
}

export function EventJournalPanel({ projectId }: EventJournalPanelProps) {
  const taskLifecycle = useTaskLifecycle(projectId);
  
  // Local task selection state
  const [activeTaskId, setActiveTaskId] = useState<string>("");

  useEffect(() => {
    // If we have tasks and no active task is selected yet, select the first one
    if (taskLifecycle.searchResults.length > 0 && !activeTaskId) {
      const firstTask = taskLifecycle.searchResults[0];
      setActiveTaskId(firstTask.id);
      taskLifecycle.fetchBoundaryForTask(firstTask);
    }
  }, [taskLifecycle.searchResults, activeTaskId]);

  const handleTaskChange = (taskId: string) => {
    setActiveTaskId(taskId);
    const task = taskLifecycle.searchResults.find(t => t.id === taskId);
    if (task) {
      taskLifecycle.fetchBoundaryForTask(task);
    }
  };

  const getEventIcon = (sourceType: string) => {
    switch (sourceType) {
      case "task":
        return <Activity className="w-4 h-4 text-optic-cyan" />;
      case "audit_log":
        return <ShieldCheck className="w-4 h-4 text-evidence-green" />;
      case "agent_memory":
        return <Cpu className="w-4 h-4 text-purple-400" />;
      case "resume_state":
        return <Lock className="w-4 h-4 text-signal-amber" />;
      case "resume_schedule":
        return <Zap className="w-4 h-4 text-yellow-400" />;
      case "agent_session":
        return <Terminal className="w-4 h-4 text-blue-400" />;
      case "agent_handoff":
        return <Database className="w-4 h-4 text-indigo-400" />;
      default:
        return <HelpCircle className="w-4 h-4 text-steel-muted" />;
    }
  };

  const getEventColor = (sourceType: string) => {
    switch (sourceType) {
      case "task":
        return "border-optic-cyan/30 bg-optic-cyan/5";
      case "audit_log":
        return "border-evidence-green/30 bg-evidence-green/5";
      case "agent_memory":
        return "border-purple-500/30 bg-purple-500/5";
      case "resume_state":
        return "border-signal-amber/30 bg-signal-amber/5";
      case "resume_schedule":
        return "border-yellow-500/30 bg-yellow-500/5";
      case "agent_session":
        return "border-blue-500/30 bg-blue-500/5";
      case "agent_handoff":
        return "border-indigo-500/30 bg-indigo-500/5";
      default:
        return "border-glass-border bg-void-black/40";
    }
  };

  return (
    <div id="event-journal-panel-container" className="space-y-6">
      
      {/* High-fidelity header banner */}
      <div className="bg-slate-900/60 rounded-xl p-6 border border-glass-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-optic-cyan/5 via-transparent to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center space-x-3.5 text-left">
            <div className="p-2.5 bg-optic-cyan/10 rounded-lg border border-optic-cyan/20 text-optic-cyan shadow-[0_0_8px_rgba(0,213,255,0.15)]">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100 tracking-tight flex items-center space-x-2">
                <span>Ajan Olay Günlüğü</span>
                <span className="text-[10px] font-mono bg-optic-cyan/15 text-optic-cyan border border-optic-cyan/25 px-1.5 py-0.5 rounded uppercase">
                  Faz 16 Başlangıcı (Baseline)
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                Kontrol noktalarını, bellekleri, devir teslimleri ve zamanlayıcı durumlarını yapılandırılmış bir adli telemetri izinde birleştiren kronolojik izleme paneli.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative">
              <select
                value={activeTaskId}
                onChange={(e) => handleTaskChange(e.target.value)}
                className="bg-slate-950 text-xs text-slate-200 pl-3 pr-8 py-2 rounded-lg border border-glass-border focus:border-optic-cyan/50 focus:outline-none appearance-none cursor-pointer w-48 font-mono truncate"
              >
                <option value="">-- Görev Seçin --</option>
                {taskLifecycle.searchResults.map(t => (
                  <option key={t.id} value={t.id}>{t.id} : {t.title}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-steel-muted absolute right-2.5 top-3 pointer-events-none" />
            </div>

            <Button 
              variant="command" 
              size="sm"
              loading={taskLifecycle.rebuildingTimeline}
              disabled={!activeTaskId}
              onClick={() => activeTaskId && taskLifecycle.handleRebuildTimeline(activeTaskId)}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Defteri Yeniden Derle
            </Button>
          </div>
        </div>
      </div>

      {/* Main interface split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Timeline Feed */}
        <div className="lg:col-span-8 space-y-4">
          <Card glow className="p-6 bg-graphite-dark/65 backdrop-blur-xl border border-glass-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-glass-border pb-4 gap-3 text-left">
              <h3 className="text-sm font-semibold text-slate-200 tracking-tight flex items-center space-x-2">
                <History className="w-4 h-4 text-optic-cyan" />
                <span>Kronolojik Adli Sicil Defteri</span>
              </h3>

              {/* Timeline Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={taskLifecycle.timelineFilterSource}
                  onChange={(e) => {
                    taskLifecycle.setTimelineFilterSource(e.target.value);
                    if (activeTaskId) taskLifecycle.fetchTimelineForTask(activeTaskId, taskLifecycle.timelineOrder, e.target.value, taskLifecycle.timelineFilterStatus);
                  }}
                  className="bg-slate-950 text-[10px] text-slate-300 px-2 py-1.5 rounded border border-glass-border focus:outline-none font-mono"
                >
                  <option value="">Tüm Kaynaklar</option>
                  <option value="task">Görevler</option>
                  <option value="audit_log">Denetim Günlükleri</option>
                  <option value="agent_memory">Bellek Kayıtları</option>
                  <option value="resume_state">Kurtarma Durumları</option>
                  <option value="resume_schedule">Zamanlamalar</option>
                  <option value="agent_session">Oturumlar</option>
                  <option value="agent_handoff">Devir Teslimler</option>
                </select>

                <select
                  value={taskLifecycle.timelineFilterStatus}
                  onChange={(e) => {
                    taskLifecycle.setTimelineFilterStatus(e.target.value);
                    if (activeTaskId) taskLifecycle.fetchTimelineForTask(activeTaskId, taskLifecycle.timelineOrder, taskLifecycle.timelineFilterSource, e.target.value);
                  }}
                  className="bg-slate-950 text-[10px] text-slate-300 px-2 py-1.5 rounded border border-glass-border focus:outline-none font-mono"
                >
                  <option value="">Tüm Durumlar</option>
                  <option value="active">Aktif</option>
                  <option value="completed">Tamamlandı</option>
                  <option value="failed">Hatalı</option>
                  <option value="paused">Durduruldu</option>
                  <option value="scheduled">Zamanlandı</option>
                  <option value="requeued">Yeniden Sıralandı</option>
                </select>

                <button
                  onClick={() => {
                    const nextOrder = taskLifecycle.timelineOrder === "asc" ? "desc" : "asc";
                    taskLifecycle.setTimelineOrder(nextOrder);
                    if (activeTaskId) taskLifecycle.fetchTimelineForTask(activeTaskId, nextOrder);
                  }}
                  className="bg-slate-950 hover:bg-slate-900 border border-glass-border px-2 py-1.5 rounded text-[10px] text-slate-300 font-mono transition-all cursor-pointer"
                >
                  {taskLifecycle.timelineOrder === "asc" ? "ARTAN" : "AZALAN"}
                </button>
              </div>
            </div>

            {taskLifecycle.timelineLoading ? (
              <div className="py-24 text-center text-xs text-steel-muted">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-optic-cyan" />
                <span>Aktif VM zaman çizelgeleri derleniyor...</span>
              </div>
            ) : taskLifecycle.timelineError ? (
              <div className="py-24 text-center text-xs text-rose-400">
                <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-rose-400" />
                <span>{taskLifecycle.timelineError}</span>
              </div>
            ) : taskLifecycle.timelineEvents.length === 0 ? (
              <div className="py-24 text-center text-xs text-steel-muted border border-dashed border-glass-border rounded-lg mt-4">
                <span>Bu bağlam bölümü için kayıtlı kronolojik olay bulunamadı.</span>
              </div>
            ) : (
              <div className="mt-6 relative pl-6 border-l border-glass-border space-y-6 text-left">
                {taskLifecycle.timelineEvents.map((evt, idx) => {
                  const isExpanded = taskLifecycle.expandedEventId === evt.id;
                  return (
                    <div key={evt.id || idx} className="relative group">
                       {/* Left circular marker icon badge */}
                      <div className={`absolute -left-[38px] top-1.5 w-6 h-6 rounded-full border flex items-center justify-center transition-all z-10 bg-slate-950 ${getEventColor(evt.source_type)}`}>
                        {getEventIcon(evt.source_type)}
                      </div>

                      {/* Event container body */}
                      <div className="bg-void-black/50 hover:bg-void-black/75 border border-glass-border rounded-xl p-4 transition-all duration-300 hover:border-optic-cyan/25">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-mono text-steel-muted uppercase tracking-wider bg-slate-950 px-2 py-0.5 rounded border border-glass-border">
                              {evt.source_type === "task" ? "görev" : evt.source_type === "audit_log" ? "denetim" : evt.source_type === "agent_memory" ? "bellek" : evt.source_type === "resume_state" ? "kurtarma" : evt.source_type === "resume_schedule" ? "zamanlama" : evt.source_type === "agent_session" ? "oturum" : evt.source_type === "agent_handoff" ? "devir teslim" : evt.source_type}
                            </span>
                            <span className="text-xs font-semibold text-slate-200">
                              {evt.title}
                            </span>
                          </div>

                          <div className="flex items-center space-x-2">
                            {evt.confidence !== null && (
                              <Badge tone="cyan" variant="low">
                                %{Math.round(evt.confidence * 100)} Güven
                              </Badge>
                            )}
                            <span className="text-[9px] font-mono text-steel-muted">
                              {new Date(evt.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-300 mt-2.5 leading-relaxed font-sans font-light">
                          {evt.summary}
                        </p>

                        {/* Expandable details segment */}
                        <div className="mt-3 flex justify-between items-center border-t border-glass-border/30 pt-2.5">
                          <span className="text-[9px] font-mono text-steel-muted">
                            KAYNAK ID: {evt.source_id}
                          </span>
                          
                          {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                            <button
                              onClick={() => {
                                if (taskLifecycle.expandedEventId === evt.id) {
                                  (taskLifecycle as any).setExpandedEventId?.(null);
                                } else {
                                  (taskLifecycle as any).setExpandedEventId?.(evt.id);
                                }
                              }}
                              className="text-[9px] font-mono text-optic-cyan hover:underline flex items-center space-x-1 cursor-pointer bg-transparent border-none"
                            >
                              <span>{isExpanded ? "Telemetri DTO'sunu Gizle" : "Telemetri DTO'sunu İncele"}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          )}
                        </div>

                        {/* Collapsible raw metadata box */}
                        {isExpanded && evt.metadata && (
                          <div className="mt-3 p-3 bg-slate-950 rounded-lg border border-glass-border/40 overflow-x-auto text-[10px] font-mono text-slate-400 max-h-[220px] select-text">
                            <pre>{JSON.stringify(evt.metadata, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right Side: Projections Summary / Forensics analysis */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Timeline Summary & Resolution Path */}
          <Card glow className="p-6 bg-graphite-dark/65 backdrop-blur-xl border border-glass-border space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 tracking-tight flex items-center space-x-2 text-left">
              <Activity className="w-4 h-4 text-optic-cyan" />
              <span>Adli Projeksiyon Özeti</span>
            </h3>

            {taskLifecycle.timelineSummary ? (
              <div className="space-y-4 text-xs text-left">
                
                {/* State Seal */}
                <div className="p-4 rounded-lg bg-slate-950 border border-glass-border flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Durum Mührü Projeksiyonu</span>
                  <Badge 
                    tone={taskLifecycle.timelineSummary.final_or_current_state === "final_resolution_path" ? "success" : "warning"}
                    variant="low"
                    className="font-mono text-[9px] tracking-wider uppercase"
                  >
                    {taskLifecycle.timelineSummary.final_or_current_state === "final_resolution_path" ? "Kalıcı Çözüm Yolu" : taskLifecycle.timelineSummary.final_or_current_state.replace(/_/g, " ")}
                  </Badge>
                </div>

                {/* Time Limits */}
                <div className="grid grid-cols-2 gap-3 font-mono text-[10px] text-steel-muted">
                  <div className="p-2.5 bg-slate-950 rounded border border-glass-border">
                    <span className="block text-[8px] uppercase font-semibold text-slate-500 mb-0.5">İlk Olay</span>
                    <span className="text-slate-300">
                      {taskLifecycle.timelineSummary.first_known_action 
                        ? new Date(taskLifecycle.timelineSummary.first_known_action).toLocaleDateString("tr-TR")
                        : "N/A"}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded border border-glass-border">
                    <span className="block text-[8px] uppercase font-semibold text-slate-500 mb-0.5">Son Eylem</span>
                    <span className="text-slate-300">
                      {taskLifecycle.timelineSummary.latest_known_action 
                        ? new Date(taskLifecycle.timelineSummary.latest_known_action).toLocaleDateString("tr-TR")
                        : "N/A"}
                    </span>
                  </div>
                </div>

                {/* Next Recommended Action */}
                {taskLifecycle.timelineSummary.next_recommended_action && (
                  <div className="p-3 bg-optic-cyan/5 border border-optic-cyan/20 rounded-lg space-y-1">
                    <span className="text-[9px] font-mono text-optic-cyan font-bold tracking-wider uppercase">Önerilen Sonraki Yönerge</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed font-sans">
                      {taskLifecycle.timelineSummary.next_recommended_action}
                    </p>
                  </div>
                )}

                {/* Remaining Work */}
                {taskLifecycle.timelineSummary.remaining_work && (
                  <div className="p-3 bg-void-black border border-glass-border rounded-lg space-y-1">
                    <span className="text-[9px] font-mono text-steel-muted font-bold tracking-wider uppercase">Kalan Kapsam Çalışması</span>
                    <p className="text-slate-400 text-[11px] leading-relaxed font-sans">
                      {taskLifecycle.timelineSummary.remaining_work}
                    </p>
                  </div>
                )}

              </div>
            ) : (
              <div className="py-8 text-center text-xs text-steel-muted font-light">
                Henüz derlenmiş telemetri özeti bulunmuyor. Aktif bir görev seçin.
              </div>
            )}
          </Card>

          {/* Decisions Log & Rejection list inside Task */}
          <Card glow className="p-6 bg-graphite-dark/65 backdrop-blur-xl border border-glass-border space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 tracking-tight flex items-center space-x-2 text-left">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span>Kararlar ve Reddedilenler</span>
            </h3>

            {taskLifecycle.timelineSummary ? (
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1 text-left scrollbar-thin">
                
                {/* Major Decisions list */}
                <div className="space-y-2">
                  <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider block">
                    Kalıcı Kararlar ({taskLifecycle.timelineSummary.major_decisions?.length || 0})
                  </span>
                  
                  {taskLifecycle.timelineSummary.major_decisions?.length === 0 ? (
                    <div className="text-[10px] text-steel-muted font-light italic">Henüz kayıtlı karar bulunmuyor.</div>
                  ) : (
                    taskLifecycle.timelineSummary.major_decisions.map((dec: any) => (
                      <div key={dec.id} className="p-2.5 bg-slate-950 rounded border border-glass-border space-y-1">
                        <div className="flex justify-between items-center text-[8px] font-mono text-steel-muted">
                          <span className="text-purple-400">{dec.title || "Karar"}</span>
                          <span>{new Date(dec.timestamp).toLocaleDateString("tr-TR")}</span>
                        </div>
                        <p className="text-[10px] text-slate-300 font-sans leading-relaxed">{dec.decision}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Failed/Rejected attempts */}
                <div className="space-y-2 pt-2 border-t border-glass-border/30">
                  <span className="text-[10px] font-mono text-rose-400 font-bold uppercase tracking-wider block">
                    Hatalar ve Reddedilenler ({taskLifecycle.timelineSummary.failed_attempts?.length || 0})
                  </span>

                  {taskLifecycle.timelineSummary.failed_attempts?.length === 0 ? (
                    <div className="text-[10px] text-steel-muted font-light italic">Yürütme reddi veya hatası saptanmadı.</div>
                  ) : (
                    taskLifecycle.timelineSummary.failed_attempts.map((fail: any) => (
                      <div key={fail.id} className="p-2.5 bg-rose-950/10 border border-rose-500/20 rounded space-y-1">
                        <div className="flex justify-between items-center text-[8px] font-mono">
                          <span className="text-rose-400">{fail.failure_type}</span>
                          <span className={`px-1 rounded text-[7px] ${fail.resolved ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                            {fail.resolved ? "ÇÖZÜLDÜ" : "ÇÖZÜLMEDİ"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-300 font-mono leading-relaxed">{fail.message}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Warnings Ledger */}
                {taskLifecycle.timelineSummary.warnings?.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-glass-border/30">
                    <span className="text-[10px] font-mono text-yellow-400 font-bold uppercase tracking-wider block">
                      Bütünlük Uyarıları ({taskLifecycle.timelineSummary.warnings.length})
                    </span>
                    <div className="space-y-1.5">
                      {taskLifecycle.timelineSummary.warnings.map((warn: string, wIdx: number) => (
                        <div key={wIdx} className="text-[9px] text-amber-400/80 bg-amber-500/5 p-2 rounded border border-amber-500/15 flex items-start space-x-1.5 font-sans leading-normal">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                          <span>{warn}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="py-8 text-center text-xs text-steel-muted font-light">
                Adli istatistikler için görev odak bağlamı bekleniyor.
              </div>
            )}
          </Card>
          
        </div>

      </div>

    </div>
  );
}

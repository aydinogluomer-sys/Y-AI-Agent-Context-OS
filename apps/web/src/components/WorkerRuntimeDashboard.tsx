/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Cpu, 
  RefreshCw, 
  Plus, 
  Play, 
  Pause, 
  StopCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Activity, 
  Terminal, 
  ShieldAlert, 
  Heart,
  FileText
} from "lucide-react";

interface WorkerRuntimeDashboardProps {
  projectId: string;
}

export function WorkerRuntimeDashboard({ projectId }: WorkerRuntimeDashboardProps) {
  // Telemetry metric state
  const [telemetry, setTelemetry] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Create Worker Form states
  const [newWorkerId, setNewWorkerId] = useState("");
  const [maxConcurrency, setMaxConcurrency] = useState(2);
  const [processLabel, setProcessLabel] = useState("ajan-işçi-ipliği-1");
  const [registering, setRegistering] = useState(false);

  // Selected Worker for Log Inspection
  const [selectedWorkerIdForLogs, setSelectedWorkerIdForLogs] = useState<string | null>(null);
  const [workerLogs, setWorkerLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Failure simulation inputs
  const [failureErrorText, setFailureErrorText] = useState("Kritik model zaman aşımı veya veri tabanı kimlik bilgileri reddedildi.");

  // General Status Actions
  const [actionProcessing, setActionProcessing] = useState<string | null>(null);

  // Load telemetry metrics
  const fetchTelemetry = async () => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/workers/telemetry`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "İşçi telemetrisi yüklenemedi.");
      }
      setTelemetry(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load worker logs
  const fetchWorkerLogs = async (wId: string) => {
    setSelectedWorkerIdForLogs(wId);
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/workers/${wId}/logs`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Loglar yüklenemedi.");
      }
      setWorkerLogs(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLogsLoading(false);
    }
  };

  // Register simulated worker
  const handleRegisterWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerId) return;
    setRegistering(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/workers/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_id: newWorkerId,
          max_concurrency: maxConcurrency,
          process_label: processLabel,
          metadata_json: { simulator: "web-dashboard", platform: "v-kubernetes-node" }
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "İşçi kaydedilemedi.");
      }
      setNewWorkerId("");
      await fetchTelemetry();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRegistering(false);
    }
  };

  // Send Heartbeat
  const handleHeartbeat = async (wId: string) => {
    setActionProcessing(`heartbeat-${wId}`);
    try {
      const res = await fetch(`/api/projects/${projectId}/workers/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: wId })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Başarısız.");
      }
      await fetchTelemetry();
      if (selectedWorkerIdForLogs === wId) {
        fetchWorkerLogs(wId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionProcessing(null);
    }
  };

  // Pause Worker
  const handlePause = async (wId: string) => {
    setActionProcessing(`pause-${wId}`);
    try {
      const res = await fetch(`/api/projects/${projectId}/workers/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: wId })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Durdurma başarısız.");
      }
      await fetchTelemetry();
      if (selectedWorkerIdForLogs === wId) {
        fetchWorkerLogs(wId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionProcessing(null);
    }
  };

  // Activate / Resume Worker
  const handleActivate = async (wId: string, conc: number, label: string) => {
    setActionProcessing(`activate-${wId}`);
    try {
      const res = await fetch(`/api/projects/${projectId}/workers/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: wId, max_concurrency: conc, process_label: label })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Etkinleştirme başarısız.");
      }
      await fetchTelemetry();
      if (selectedWorkerIdForLogs === wId) {
        fetchWorkerLogs(wId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionProcessing(null);
    }
  };

  // Stop Worker
  const handleStop = async (wId: string) => {
    setActionProcessing(`stop-${wId}`);
    try {
      const res = await fetch(`/api/projects/${projectId}/workers/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: wId })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Durdurma başarısız.");
      }
      await fetchTelemetry();
      if (selectedWorkerIdForLogs === wId) {
        fetchWorkerLogs(wId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionProcessing(null);
    }
  };

  // Claim Job
  const handleClaimJob = async (wId: string) => {
    setActionProcessing(`claim-${wId}`);
    try {
      const res = await fetch(`/api/projects/${projectId}/workers/claim-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: wId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Herhangi bir boşta iş bulunamadı.");
      }
      setError(`İş başarıyla yakalandı! Dizin Görev ID: ${data.jobId}`);
      await fetchTelemetry();
      if (selectedWorkerIdForLogs === wId) {
        fetchWorkerLogs(wId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionProcessing(null);
    }
  };

  // Complete Job
  const handleCompleteJob = async (wId: string, jobId: string) => {
    setActionProcessing(`complete-${wId}-${jobId}`);
    try {
      const res = await fetch(`/api/projects/${projectId}/workers/complete-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: wId, job_id: jobId })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Tamamlama işlemi başarısız.");
      }
      setError(`Kilitli görev başarıyla tamamlandı: ${jobId}`);
      await fetchTelemetry();
      if (selectedWorkerIdForLogs === wId) {
        fetchWorkerLogs(wId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionProcessing(null);
    }
  };

  // Fail Job
  const handleFailJob = async (wId: string, jobId: string) => {
    setActionProcessing(`fail-${wId}-${jobId}`);
    try {
      const res = await fetch(`/api/projects/${projectId}/workers/fail-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: wId, job_id: jobId, error_payload: failureErrorText })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Başarısız yapma işlemi hatası.");
      }
      setError(`Görev bilerek başarısız yapıldı: ${jobId}`);
      await fetchTelemetry();
      if (selectedWorkerIdForLogs === wId) {
        fetchWorkerLogs(wId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionProcessing(null);
    }
  };

  // Recover Workers
  const handleReleaseStaleWorkers = async () => {
    setActionProcessing("lease-workers");
    try {
      const res = await fetch(`/api/projects/${projectId}/workers/lease-release/workers`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kurtarma işlemi başarısız.");
      setError(`Pasif işçiler evden atıldı ve kilitledikleri görevler serbest bırakıldı. Atılan: ${data.evictedCount}`);
      await fetchTelemetry();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionProcessing(null);
    }
  };

  // Recover Jobs
  const handleReleaseStaleJobs = async () => {
    setActionProcessing("lease-jobs");
    try {
      const res = await fetch(`/api/projects/${projectId}/workers/lease-release/jobs`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kurtarma işlemi başarısız.");
      setError(`Süresi dolan görev kilitleri kaldırıldı. Serbest kalan: ${data.releasedCount}`);
      await fetchTelemetry();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionProcessing(null);
    }
  };

  const exportWorkersToCSV = () => {
    if (!telemetry?.workers || telemetry.workers.length === 0) return;
    
    const headers = ["Worker ID", "Status", "Process Label", "Max Concurrency", "Active Jobs", "Heartbeat At"];
    const rows = telemetry.workers.map((w: any) => [
      w.worker_id,
      w.status,
      w.process_label || "",
      w.max_concurrency,
      w.active_job_count,
      new Date(w.heartbeat_at).toISOString()
    ]);
    
    const csvContent = [headers.join(","), ...rows.map((r: any) => r.map((val: any) => `"${val}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `isçi_runtime_${projectId}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchTelemetry();
  }, [projectId]);

  return (
    <div className="space-y-6">
      {/* Platform Title Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-905 to-slate-950 border border-slate-850 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3 text-left">
          <span className="p-2 bg-emerald-950/40 text-emerald-400 border border-emerald-900/50 rounded-lg">
            <Cpu className="w-5 h-5" />
          </span>
          <div>
            <span className="text-[10px] font-bold text-emerald-450 uppercase tracking-widest font-mono">
              KDEBT-011 / Faz 28 — Üretim Kuyruğu ve Pasif İşçi Çalışma Zamanı
            </span>
            <h3 className="text-xl font-bold text-white mt-0.5">Çalışma Zamanı İzleme (Runtime)</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Veri tabanı tabanlı yerelleştirilmiş kuyruk tüketici düğüm simülasyonu. İşlemsel kiralama (leasing), eşzamanlılık sınırı limitleri, sır maskeleme ve manuel kurtarma sweeps protokollerini barındırır.
            </p>
          </div>
        </div>
      </div>

      {/* Operation Notice / Error Console */}
      {error && (
        <div className="bg-slate-900 border-l-4 border-rose-500 rounded p-4 text-xs font-mono text-slate-300 flex items-start justify-between gap-2 text-left">
          <div className="flex gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-[10px] text-slate-550 hover:text-slate-350 bg-transparent border-none cursor-pointer">Kapat</button>
        </div>
      )}

      {/* Summary Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { 
            label: "Aktif Kayıtlı İşçiler", 
            value: telemetry?.workers?.filter((w: any) => w.status === "active").length ?? 0, 
            sub: `Toplam ${telemetry?.workers?.length ?? 0} düğüm`,
            color: "text-emerald-400"
          },
          { 
            label: "İşlenen Aktif Görevler", 
            value: telemetry?.active_processing_jobs ?? 0, 
            sub: `Kuyrukta bekleyen: ${telemetry?.queue_counts?.pending ?? 0}`,
            color: "text-blue-400"
          },
          { 
            label: "Hatalı / Yeniden Denenecek", 
            value: telemetry?.retryable_jobs ?? 0, 
            sub: `Toplam ${telemetry?.queue_counts?.failed ?? 0} başarısız durum`,
            color: "text-yellow-400"
          },
          { 
            label: "Tamamlanan Görev Sayısı", 
            value: telemetry?.queue_counts?.completed ?? 0, 
            sub: "değiştirilemez dizin çalışması",
            color: "text-emerald-500"
          }
        ].map((stat, i) => (
          <div key={i} className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl text-left">
            <span className="text-[10px] text-slate-550 font-mono block uppercase tracking-wider">{stat.label}</span>
            <span className={`text-2xl font-bold ${stat.color} block mt-1.5`}>{stat.value}</span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{stat.sub}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-6 text-left">
        {/* Left Side: Worker Manager & Queue Simulation controls */}
        <div className="col-span-12 lg:col-span-6 space-y-6">
          
          {/* Section: Register Simulated Worker */}
          <form onSubmit={handleRegisterWorker} className="bg-slate-900/60 border border-slate-855 p-5 rounded-xl space-y-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider border-b border-slate-800 pb-2 flex justify-between items-center">
              <span>🔌 Simüle Edilmiş Yerel İşçi Oluştur</span>
              <span className="text-[9px] px-1.5 py-0.5 bg-emerald-950/40 text-emerald-450 border border-emerald-900/30 rounded font-mono uppercase">AKTİF DURUM</span>
            </h4>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="space-y-1 col-span-3 md:col-span-1">
                <label className="text-[10px] text-slate-400 font-mono block">Simüle İşçi ID</label>
                <input
                  type="text"
                  required
                  placeholder="örn. isci_node_1"
                  value={newWorkerId}
                  onChange={(e) => setNewWorkerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 text-[11px] py-1.5 text-slate-200 focus:outline-none"
                />
              </div>
              <div className="space-y-1 col-span-3 md:col-span-1">
                <label className="text-[10px] text-slate-400 font-mono block">Maks. Eşzamanlılık</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={maxConcurrency}
                  onChange={(e) => setMaxConcurrency(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 text-[11px] py-1.5 text-slate-200 focus:outline-none font-mono"
                />
              </div>
              <div className="space-y-1 col-span-3 md:col-span-1">
                <label className="text-[10px] text-slate-400 font-mono block">Süreç Etiketi / Label</label>
                <input
                  type="text"
                  value={processLabel}
                  onChange={(e) => setProcessLabel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 text-[11px] py-1.5 text-slate-200 focus:outline-none"
                />
              </div>
            </div>
            
            <button
              type="submit"
              disabled={registering}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-550 border border-emerald-500/30 active:bg-emerald-700 disabled:opacity-50 font-mono font-bold text-white text-xs rounded tracking-wider uppercase transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {registering ? "Düğüm Konuşlandırılıyor..." : "İşçi Düğümünü Kaydet"}
            </button>
          </form>

          {/* Section: Active Worker Grid and Interactive Controls */}
          <div className="bg-slate-900/60 border border-slate-855 p-5 rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-450" />
                Kayıtlı Çalışan Düğümler (Nodes)
              </h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={exportWorkersToCSV}
                  disabled={!telemetry?.workers || telemetry.workers.length === 0}
                  className="px-2 py-1 text-[10px] font-mono bg-slate-950 border border-slate-800 rounded text-slate-350 hover:text-white cursor-pointer hover:bg-slate-900 transition flex items-center gap-1"
                  title="CSV dosyası olarak dışa aktar"
                >
                  Dışa Aktar (CSV)
                </button>
                <button
                  type="button"
                  onClick={fetchTelemetry}
                  disabled={loading}
                  className="p-1.5 hover:bg-slate-850 rounded bg-slate-950 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
                  title="Yenile"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-emerald-400" : ""}`} />
                </button>
              </div>
            </div>

            {telemetry?.workers?.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 font-mono bg-slate-950/40 rounded border border-slate-850/50">
                Oluşturulmuş aktif işçi yok. Dizin oluşturma sırasını başlatmak için yukarıdan yeni bir işçi düğümü kaydedin.
              </div>
            ) : (
              <div className="space-y-4">
                {telemetry?.workers?.map((worker: any) => {
                  const isLogsInspected = selectedWorkerIdForLogs === worker.worker_id;
                  const isProcessing = actionProcessing?.includes(worker.worker_id);
                  const isHeartbeatStale = new Date(worker.heartbeat_at).getTime() < Date.now() - 30000;

                  return (
                    <div 
                      key={worker.id}
                      className={`p-4 rounded-xl border transition-all text-xs ${
                        isLogsInspected 
                          ? "bg-slate-900/80 border-emerald-500/40 shadow-emerald-500/5 shadow-md"
                          : "bg-slate-950/70 border-slate-850 hover:bg-slate-900/40"
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2 text-left">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-200 text-sm">{worker.worker_id}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 font-mono font-bold rounded uppercase ${
                              worker.status === "active" && !isHeartbeatStale
                                ? "bg-emerald-950/30 text-emerald-400 border border-emerald-900/40"
                                : worker.status === "paused"
                                  ? "bg-amber-950/30 text-amber-500 border border-amber-900/40"
                                  : isHeartbeatStale || worker.status === "stale"
                                    ? "bg-purple-950/30 text-purple-400 border border-purple-900/40 animate-pulse"
                                    : "bg-rose-950/30 text-rose-400 border border-rose-900/40"
                            }`}>
                              {isHeartbeatStale && worker.status === "active" ? "PASIF_DURUM" : worker.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-550 font-mono">
                            Etiket: <span className="text-slate-400">{worker.process_label || "Etiketsiz"}</span> | Eşzamanlılık Sınırı: <span className="text-slate-400 font-bold">{worker.max_concurrency}</span>
                          </div>
                        </div>

                        {/* Node claim index status indicator */}
                        <div className="text-right text-[11px] font-mono">
                          <div className="text-slate-400">
                            Aktif işler: <span className="text-emerald-400 font-bold">{worker.active_job_count}</span> / {worker.max_concurrency}
                          </div>
                          <div className="text-[9px] text-slate-550 mt-0.5">
                            Son Sinyal: {new Date(worker.heartbeat_at).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>

                      {/* Interactive Execution Controls */}
                      <div className="mt-4 pt-3 border-t border-slate-900 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          {/* Heartbeat button */}
                          <button
                            onClick={() => handleHeartbeat(worker.worker_id)}
                            disabled={isProcessing || worker.status === "stopped"}
                            className="px-2 py-1 bg-slate-900 hover:bg-slate-850 text-[10px] text-slate-300 font-mono rounded border border-slate-800 cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"
                            title="Sinyal gönder"
                          >
                            <Heart className="w-3 h-3 text-rose-500 fill-rose-550 shrink-0" />
                            Sinyal (Heartbeat)
                          </button>

                          {/* Pause/Resume controls */}
                          {worker.status === "active" ? (
                            <button
                              onClick={() => handlePause(worker.worker_id)}
                              disabled={isProcessing}
                              className="px-2 py-1 bg-amber-950/20 hover:bg-amber-950/40 border border-amber-900/50 text-[10px] text-amber-500 font-mono rounded cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"
                            >
                              <Pause className="w-3 h-3 shrink-0" />
                              Durdur
                            </button>
                          ) : worker.status === "paused" ? (
                            <button
                              onClick={() => handleActivate(worker.worker_id, worker.max_concurrency, worker.process_label)}
                              disabled={isProcessing}
                              className="px-2 py-1 bg-emerald-950/20 hover:bg-emerald-950/40 border border-emerald-900/50 text-[10px] text-emerald-400 font-mono rounded cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"
                            >
                              <Play className="w-3 h-3 shrink-0" />
                              Sürdür
                            </button>
                          ) : null}

                          {/* Stop control */}
                          {worker.status !== "stopped" && (
                            <button
                              onClick={() => handleStop(worker.worker_id)}
                              disabled={isProcessing}
                              className="px-2 py-1 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/60 text-[10px] text-rose-450 font-mono rounded cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"
                            >
                              <StopCircle className="w-3 h-3 shrink-0" />
                              Kapat
                            </button>
                          )}

                          {/* Reactivate stopped worker */}
                          {worker.status === "stopped" && (
                            <button
                              onClick={() => handleActivate(worker.worker_id, worker.max_concurrency, worker.process_label)}
                              disabled={isProcessing}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-[10px] text-white font-mono rounded border border-emerald-500/30 cursor-pointer disabled:opacity-40 inline-flex items-center gap-1"
                            >
                              <Play className="w-3 h-3 shrink-0" />
                              Etkinleştir
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 ml-auto">
                          {/* Claim pending job trigger */}
                          <button
                            onClick={() => handleClaimJob(worker.worker_id)}
                            disabled={isProcessing || worker.status !== "active" || worker.active_job_count >= worker.max_concurrency}
                            className="px-2 py-1 bg-sky-950/40 hover:bg-sky-900/30 border border-sky-800/40 text-[10px] text-sky-400 font-mono rounded active:bg-sky-900/50 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed inline-flex items-center gap-1"
                            title="Bekleyen sıradaki işi üstlen"
                          >
                            <Layers className="w-3 h-3 shrink-0" />
                            Görev Üstlen
                          </button>

                          {/* Inspect Logs */}
                          <button
                            onClick={() => fetchWorkerLogs(worker.worker_id)}
                            className="px-2 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[10px] text-emerald-450 font-mono rounded cursor-pointer shrink-0 inline-flex items-center gap-1"
                          >
                            <Terminal className="w-3 h-3 shrink-0" />
                            Loglar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section: Manual Recovery of Stale Leases */}
          <div className="bg-slate-900/60 border border-slate-855 p-5 rounded-xl space-y-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider border-b border-slate-800 pb-2">
              🛡️ Güvenli Kira Temizleme ve Kurtarma Döngüleri
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Veri tabanı tabanlı çalışan çalışma zamanında, kayıp veya çökmüş düğüm istisnaları planlanmış taramalarla çözülür. Ölü çalışanları temizlemek veya sıkışan görevleri serbest bırakmak için bir kurtarma taraması seçin:
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleReleaseStaleWorkers}
                disabled={actionProcessing === "lease-workers"}
                className="py-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-300 hover:text-white hover:bg-slate-900/60 transition cursor-pointer disabled:opacity-45"
              >
                ♻️ Atıl İşçileri Temizle
              </button>
              <button
                onClick={handleReleaseStaleJobs}
                disabled={actionProcessing === "lease-jobs"}
                className="py-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-300 hover:text-white hover:bg-slate-900/60 transition cursor-pointer disabled:opacity-45"
              >
                🔓 Süresi Dolan Görev Kilitlerini Aç
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Execution Logs and Job Processing Simulators */}
        <div className="col-span-12 lg:col-span-6 space-y-6">
          
          {/* Active Processing Tasks list */}
          <div className="bg-slate-900/60 border border-slate-855 p-5 rounded-xl space-y-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider border-b border-slate-800 pb-2 flex justify-between items-center">
              <span>🗄️ Aktif Kiralanmış Dizin İşleri</span>
              <span className="text-[9.5px] font-mono text-slate-550">Kilitli Görevler Sicili</span>
            </h4>

            {telemetry?.workers?.filter((w: any) => w.active_job_count > 0).length === 0 ? (
              <div className="text-center py-10 text-slate-550 font-mono text-xs">
                Şu anda simüle işçiler tarafından kilitlenen veya işlenen aktif bir görev yok.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Find workers carrying claimed jobs and fetch the raw db jobs */}
                {telemetry?.workers?.map((w: any) => {
                  if (w.active_job_count === 0) return null;
                  
                  return (
                    <div key={w.id} className="space-y-2">
                      <div className="text-[10.5px] font-bold text-slate-400 font-mono flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-emerald-450" />
                        Simüle İşçi: {w.worker_id} ({w.active_job_count} görev kilitli)
                      </div>

                      {/* Complete / Fail control card */}
                      <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl space-y-3">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-blue-400 font-bold block">Simülasyon Konsolu:</span>
                          <span className="text-slate-550">Tür: index_pipeline_run</span>
                        </div>

                        <div className="space-y-1.5 text-xs text-left">
                          <label className="text-[10.5px] text-slate-450 font-mono block">Simülasyon Hata Girdisi (Maskeleme Testi İçin)</label>
                          <textarea
                            value={failureErrorText}
                            onChange={(e) => setFailureErrorText(e.target.value)}
                            rows={2}
                            className="w-full text-xs font-mono bg-slate-950 border border-slate-850 rounded p-2 text-rose-350 focus:outline-none"
                          />
                        </div>

                        {/* Execute finishing simulator endpoints */}
                        <div className="flex items-center gap-2 pt-2">
                          <button
                            onClick={() => {
                              fetch(`/api/projects/${projectId}/workers/telemetry`)
                                .then(res => res.json())
                                .then(async (telData) => {
                                  // Find job locked by worker
                                  const dbRes = await fetch(`/api/projects/${projectId}/workers/${w.worker_id}/logs`);
                                  const logs = await dbRes.json();
                                  const claimLog = logs.find((l: any) => l.action === "claim_job" && l.status === "success");
                                  if (claimLog && claimLog.index_job_id) {
                                    handleCompleteJob(w.worker_id, claimLog.index_job_id);
                                  } else {
                                    setError("Geçmiş günlükleri inceleyin veya parametreleri yüklemek için önce bir görev üstlenin.");
                                  }
                                });
                            }}
                            className="flex-1 py-1 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-900/50 text-emerald-400 font-mono text-[11px] rounded transition cursor-pointer"
                          >
                            ✔️ Görevi Başarıyla Tamamla
                          </button>
                          <button
                            onClick={() => {
                              fetch(`/api/projects/${projectId}/workers/telemetry`)
                                    .then(res => res.json())
                                    .then(async (telData) => {
                                      const dbRes = await fetch(`/api/projects/${projectId}/workers/${w.worker_id}/logs`);
                                      const logs = await dbRes.json();
                                      const claimLog = logs.find((l: any) => l.action === "claim_job" && l.status === "success");
                                      if (claimLog && claimLog.index_job_id) {
                                        handleFailJob(w.worker_id, claimLog.index_job_id);
                                      } else {
                                        setError("Geçmiş günlükleri inceleyin veya parametreleri yüklemek için önce bir görev üstlenin.");
                                      }
                                    });
                            }}
                            className="flex-1 py-1 px-3 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-900/50 text-rose-400 font-mono text-[11px] rounded transition cursor-pointer"
                          >
                            ❌ Görevi Başarısız Yap
                          </button>
                        </div>
                        <span className="text-[9.5px] text-slate-550 font-mono text-center block leading-relaxed">
                          (Tıklama, işçinin aktif görev takibini veritabanındaki index_job tablosundan otomatik tespit eder)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Log inspector visualizer */}
          <div className="bg-slate-900/60 border border-slate-855 p-5 rounded-xl space-y-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider border-b border-slate-800 pb-2 flex justify-between items-center mr-2">
              <span>📋 Çalışan Logları Müfettişi</span>
              {selectedWorkerIdForLogs && (
                <span className="text-[10px] text-emerald-400 font-mono font-bold">Düğüm: {selectedWorkerIdForLogs}</span>
              )}
            </h4>

            {selectedWorkerIdForLogs === null ? (
              <div className="text-center py-12 text-slate-550 font-mono text-xs">
                İşlem geçmişini, talep loglarını, hata akışlarını ve maskelenmiş ortam çıktılarını görmek için yukarıdan bir işçinin "Loglar" butonuna basın.
              </div>
            ) : (
              <div className="flex flex-col space-y-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-slate-550 font-mono font-medium">Maskelenmiş son 150 işlem kaydı gösteriliyor</span>
                  <button
                    onClick={() => fetchWorkerLogs(selectedWorkerIdForLogs)}
                    className="text-[10px] text-emerald-450 hover:text-emerald-350 cursor-pointer flex items-center gap-1 font-mono bg-transparent border-none"
                  >
                    <RefreshCw className="w-3 h-3" /> Logları Yenile
                  </button>
                </div>

                {logsLoading ? (
                  <div className="text-center py-10 font-mono text-xs text-slate-500 animate-pulse">
                    worker_runtime_logs sorgulanıyor...
                  </div>
                ) : workerLogs.length === 0 ? (
                  <div className="text-center py-10 font-mono text-xs text-slate-550 border rounded border-slate-850/60 bg-slate-950/40">
                    {selectedWorkerIdForLogs} için henüz çalışma zamanı log kaydı alınmadı. Veri akışı oluşturmak için bir işçi kaydedin.
                  </div>
                ) : (
                  <div className="bg-slate-950 rounded-xl border border-slate-855 max-h-[300px] overflow-y-auto p-4 space-y-4 text-left font-mono">
                    {workerLogs.map((log) => (
                      <div key={log.id} className="text-xs space-y-1.5 border-b border-slate-900/65 pb-3 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between text-[11px] font-semibold gap-2">
                          <span className="text-emerald-450">{log.action.toUpperCase()}</span>
                          <span className={`text-[9.5px] px-1.5 font-bold rounded uppercase ${
                            log.status === "success" 
                              ? "bg-emerald-950/30 text-emerald-400 border border-emerald-900/40" 
                              : "bg-rose-950/30 text-rose-450 border border-rose-900/40"
                          }`}>
                            {log.status === "success" ? "başarılı" : "başarısız"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-350 break-words font-mono leading-relaxed bg-slate-950 text-slate-300 border border-transparent select-text">
                          {log.message_redacted}
                        </p>
                        <div className="flex justify-between text-[9.5px] text-slate-500 font-medium">
                          <span>ID: {log.id} {log.index_job_id ? `| Görev: ${log.index_job_id}` : ""}</span>
                          <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

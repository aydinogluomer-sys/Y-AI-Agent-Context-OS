/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Lock, 
  Unlock, 
  RefreshCw, 
  Plus, 
  AlertTriangle, 
  CheckCircle2, 
  Search, 
  Clock, 
  FileText, 
  ShieldAlert, 
  Trash2,
  Sliders
} from "lucide-react";
import { FileLockDTO, FileLockMode, FileLockStatus } from "@y/shared";

interface FileLockingPanelProps {
  projectId: string;
}

export function FileLockingPanel({ projectId }: FileLockingPanelProps) {
  // Lists and loading/error states
  const [locks, setLocks] = useState<FileLockDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Acquire Lock Form States
  const [filePath, setFilePath] = useState("");
  const [lockMode, setLockMode] = useState<FileLockMode>(FileLockMode.WRITE);
  const [ownerType, setOwnerType] = useState("worker");
  const [ownerId, setOwnerId] = useState("worker-1");
  const [ttl, setTtl] = useState(30);
  const [customMetadata, setCustomMetadata] = useState("{\n  \"description\": \"Çalışan tarafından kilitlenen kod bloğu\"\n}");
  const [acquiring, setAcquiring] = useState(false);

  // Path Status Check Input
  const [checkPathInput, setCheckPathInput] = useState("");
  const [pathStatusResult, setPathStatusResult] = useState<FileLockDTO | null | undefined>(undefined);
  const [checkingPath, setCheckingPath] = useState(false);

  // Filter state for locks listing
  const [statusFilter, setStatusFilter] = useState("");

  // Action state indicator
  const [actionProcessingId, setActionProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchLocks();
  }, [projectId, statusFilter]);

  const fetchLocks = async () => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      const url = statusFilter 
        ? `/api/projects/${projectId}/file-locks?lock_status=${statusFilter}`
        : `/api/projects/${projectId}/file-locks`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Dosya kilitleri yüklenemedi.");
      }
      setLocks(data);
    } catch (err: any) {
      setError(err.message);
    }
    finally {
      setLoading(false);
    }
  };

  const handleAcquireLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filePath) return;
    setAcquiring(true);
    setError("");
    setSuccessMsg("");
    try {
      let parsedMeta = {};
      try {
        parsedMeta = JSON.parse(customMetadata);
      } catch (pErr) {
        throw new Error("Geçersiz meta veri JSON sözdizimi.");
      }

      const res = await fetch(`/api/projects/${projectId}/file-locks/acquire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: filePath,
          lock_mode: lockMode,
          lock_owner_type: ownerType,
          lock_owner_id: ownerId,
          ttl_seconds: ttl,
          metadata_json: parsedMeta
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Kilit edinilemedi (Çakışma mevcut).");
      }

      setFilePath("");
      setSuccessMsg(`'${data.normalized_path}' üzerindeki dosya kilidi başarıyla edinildi (ID: ${data.id})!`);
      await fetchLocks();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAcquiring(false);
    }
  };

  const handleRefreshLock = async (lockId: string) => {
    setActionProcessingId(`refresh-${lockId}`);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/projects/${projectId}/file-locks/${lockId}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttl_seconds: 30 })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Kilit süresi uzatılamadı.");
      }
      setSuccessMsg(`'${data.normalized_path}' kilidinin süresi başarıyla uzatıldı!`);
      await fetchLocks();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionProcessingId(null);
    }
  };

  const handleReleaseLock = async (lockId: string) => {
    setActionProcessingId(`release-${lockId}`);
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/projects/${projectId}/file-locks/${lockId}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "released_manually" })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Kilit kaldırılamadı.");
      }
      setSuccessMsg(`'${data.normalized_path}' üzerindeki dosya kilidi manuel olarak kaldırıldı.`);
      await fetchLocks();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionProcessingId(null);
    }
  };

  const handleReleaseStale = async () => {
    setActionProcessingId("release-stale");
    setError("");
    setSuccessMsg("");
    try {
      const res = await fetch(`/api/projects/${projectId}/file-locks/release-stale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Zaman aşımına uğramış kilitler temizlenemedi.");
      }
      setSuccessMsg(`Zaman aşımına uğrayan ${data.releasedCount} adet kilit kaydı kaldırıldı.`);
      await fetchLocks();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionProcessingId(null);
    }
  };

  const handleCheckPathStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkPathInput) return;
    setCheckingPath(true);
    setPathStatusResult(undefined);
    try {
      const res = await fetch(`/api/projects/${projectId}/file-locks/status?path=${encodeURIComponent(checkPathInput)}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Yol kilit durumu denetlenemedi.");
      }
      const data = await res.json();
      setPathStatusResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCheckingPath(false);
    }
  };

  const exportLocksToCSV = () => {
    if (locks.length === 0) return;
    
    const headers = ["Lock ID", "File Path", "Mode", "Owner Type", "Owner ID", "Status", "Expires At", "Created At"];
    const rows = locks.map((l: any) => [
      l.id,
      l.normalized_path,
      l.lock_mode,
      l.lock_owner_type,
      l.lock_owner_id,
      l.lock_status,
      new Date(l.expires_at).toISOString(),
      new Date(l.created_at).toISOString()
    ]);
    
    const csvContent = [headers.join(","), ...rows.map((r: any) => r.map((val: any) => `"${val}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dosya_kilitleri_${projectId}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 text-slate-100 p-1 font-sans">
      {/* Header Panel */}
      <div className="bg-slate-900/80 rounded-xl p-6 border border-slate-800/80 relative overflow-hidden backdrop-blur-md text-left">
        <div className="absolute top-0 right-0 p-8 scale-150 rotate-12 opacity-5 pointer-events-none">
          <Lock className="w-24 h-24 text-emerald-400" />
        </div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-400" />
              Kötümser Dosya Kilitleme (File Locking)
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl">
              Veri tabanı işlemlerinde paralel süreçlerin, eşzamanlı çalışan işçilerin ve ajan akışlarının aynı dosya kaynaklarının üzerine yazmasını engeller. RepoAdapter güvenlik doğrulamalarıyla tam entegredir.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={exportLocksToCSV}
              disabled={locks.length === 0}
              className="px-3.5 py-1.5 text-xs font-mono rounded-lg bg-slate-950 border border-slate-800 text-slate-350 hover:text-white cursor-pointer hover:bg-slate-900 transition flex items-center gap-1 disabled:opacity-40"
              title="Kilitleri dışa aktar"
            >
              CSV Dışa Aktar
            </button>
            <button
              onClick={fetchLocks}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer hover:bg-slate-900 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-emerald-400" : ""}`} />
              Listeyi Yenile
            </button>
            <button
              onClick={handleReleaseStale}
              disabled={actionProcessingId === "release-stale"}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/15 border border-amber-500/25 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Zaman Aşımına Uğrayanları Evict Et
            </button>
          </div>
        </div>

        {/* Global Alert messages */}
        {error && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs flex items-center gap-2 animate-pulse">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-left">
        {/* Left column: Actions & status checking */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Path Safety Check */}
          <div className="bg-slate-900/60 rounded-xl p-5 border border-slate-800/60 backdrop-blur-sm space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Search className="w-4 h-4 text-emerald-400" />
              Dosya Kilidi Durumunu Sorgula
            </h3>
            <form onSubmit={handleCheckPathStatus} className="flex gap-2">
              <input
                type="text"
                placeholder="örn. src/App.tsx"
                value={checkPathInput}
                onChange={(e) => setCheckPathInput(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white font-mono placeholder:text-slate-600"
              />
              <button 
                type="submit" 
                disabled={checkingPath}
                className="px-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold rounded-lg text-xs flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
              >
                Sorgula
              </button>
            </form>

            {pathStatusResult === null && (
              <div className="p-3 bg-slate-950 border border-slate-850 rounded-lg space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-emerald-500 font-bold block">Çakışma Yok</span>
                <p className="text-xs text-slate-400 font-sans">Dosya şu anda kilitli değil. İşlem için uygun.</p>
              </div>
            )}

            {pathStatusResult && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">KİLİTLİ ({pathStatusResult.lock_mode === "write" ? "YAZMA" : "OKUMA"})</span>
                  <span className="text-[10px] text-slate-500 font-mono font-medium">ID: {pathStatusResult.id.substring(0, 10)}...</span>
                </div>
                <div className="text-xs space-y-1 text-slate-300">
                  <div>Sahip: <span className="font-mono text-white">[{pathStatusResult.lock_owner_type === "worker" ? "işçi" : pathStatusResult.lock_owner_type === "task" ? "görev" : pathStatusResult.lock_owner_type}:{pathStatusResult.lock_owner_id}]</span></div>
                  <div>Süre Bitişi: <span className="font-mono text-white text-[11px]">{new Date(pathStatusResult.expires_at).toLocaleString()}</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Acquire Lock Simulation */}
          <div className="bg-slate-900/60 rounded-xl p-5 border border-slate-800/60 backdrop-blur-sm space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-emerald-400" />
              Dosya Kilitleme Simülatörü
            </h3>
            <form onSubmit={handleAcquireLock} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10.5px] text-slate-400 block uppercase font-mono tracking-wider font-semibold">Dosya Yolu (Proje İçi Bağıl)</label>
                <input
                  type="text"
                  placeholder="örn. src/utils/helper.ts"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white font-mono placeholder:text-slate-600"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10.5px] text-slate-400 block uppercase font-mono tracking-wider font-semibold">Kilit Modu</label>
                  <select
                    value={lockMode}
                    onChange={(e) => setLockMode(e.target.value as FileLockMode)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs focus:ring-1 focus:ring-emerald-500 text-white cursor-pointer"
                  >
                    <option value={FileLockMode.WRITE}>YAZMA (Özel / WRITE)</option>
                    <option value={FileLockMode.READ}>OKUMA (Paylaşımlı / READ)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] text-slate-400 block uppercase font-mono tracking-wider font-semibold">TTL (Saniye)</label>
                  <input
                    type="number"
                    value={ttl}
                    onChange={(e) => setTtl(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 text-white"
                    min="1"
                    max="3600"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10.5px] text-slate-400 block uppercase font-mono tracking-wider font-semibold">Sahip Türü</label>
                  <select
                    value={ownerType}
                    onChange={(e) => setOwnerType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs focus:ring-1 focus:ring-emerald-500 text-white cursor-pointer"
                  >
                    <option value="worker">İşçi (Worker Node)</option>
                    <option value="task">Görev (Task Workflow)</option>
                    <option value="index_job">Dizin Sırası (Index Job)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] text-slate-400 block uppercase font-mono tracking-wider font-semibold">Sahip ID (Owner ID)</label>
                  <input
                    type="text"
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10.5px] text-slate-400 block uppercase font-mono tracking-wider font-semibold">Meta Veri JSON</label>
                <textarea
                  value={customMetadata}
                  onChange={(e) => setCustomMetadata(e.target.value)}
                  className="w-full h-16 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 text-slate-300 font-mono resize-none leading-relaxed"
                />
              </div>

              <button
                type="submit"
                disabled={acquiring}
                className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-lg hover:shadow-emerald-500/5 transition-all"
              >
                <Lock className="w-3.5 h-3.5" />
                {acquiring ? "Kilitleniyor..." : "Kilitlemeyi Simüle Et"}
              </button>
            </form>
          </div>
        </div>

        {/* Right column: Locks Registry Table view */}
        <div className="lg:col-span-8 bg-slate-900/60 rounded-xl border border-slate-800/60 backdrop-blur-sm p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-emerald-400" />
              Dosya Kilitleri Sicili ve Talepler
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Durum filtresi:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-850 rounded px-2.5 py-1 text-[11px] text-slate-300 focus:outline-none cursor-pointer"
              >
                <option value="">Tüm Kilitler</option>
                <option value="active">Aktif Kilitler</option>
                <option value="blocked">Engellenen Girişimler</option>
                <option value="released">Kaldırılanlar (Manuel)</option>
                <option value="expired">Zamanı Dolan Kilitler</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-850 bg-slate-950/40 scrollbar-thin">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-850 bg-slate-950/80 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="p-3.5 pl-4">Kilitli Kaynak Yolu</th>
                  <th className="p-3.5">Mod</th>
                  <th className="p-3.5">Durum</th>
                  <th className="p-3.5">Talep Sahibi</th>
                  <th className="p-3.5">Kilit Bitiş Süresi</th>
                  <th className="p-3.5 pr-4 text-right">Eylemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-xs">
                {locks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 font-sans italic text-xs">
                      Sicilde eşleşen dosya kilidi bulunamadı.
                    </td>
                  </tr>
                ) : (
                  locks.map((lock) => {
                    const isExpired = new Date(lock.expires_at).getTime() < Date.now();
                    const activeLocked = lock.lock_status === "active" && !isExpired;
                    return (
                      <tr key={lock.id} className="hover:bg-slate-900/35 transition-colors group">
                        <td className="p-3.5 pl-4 max-w-[200px]">
                          <div className="flex items-center gap-2">
                            {activeLocked ? (
                              <Lock className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            ) : (
                              <Unlock className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                            )}
                            <div className="truncate">
                              <span className="font-semibold text-slate-200 font-mono" title={lock.normalized_path}>
                                {lock.normalized_path}
                              </span>
                              <span className="block text-[9px] text-slate-500 font-mono truncate">
                                hash: {lock.path_hash.substring(0, 12)}...
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            lock.lock_mode === "write" 
                              ? "bg-rose-500/10 text-rose-400 border border-rose-500/15" 
                              : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/15"
                          }`}>
                            {lock.lock_mode === "write" ? "YAZMA" : "OKUMA"}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            lock.lock_status === "active"
                              ? isExpired
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/15"
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                              : lock.lock_status === "blocked"
                                ? "bg-red-500/10 text-red-400 border border-red-500/15"
                                : "bg-slate-800 text-slate-400 border border-slate-700/50"
                          }`}>
                            {lock.lock_status === "active" && isExpired ? "Süresi Doldu" : lock.lock_status === "active" ? "aktif" : lock.lock_status === "blocked" ? "engellendi" : "serbest"}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="space-y-0.5 text-slate-400 text-[11px]">
                            <div>Tür: <span className="text-white font-medium">{lock.lock_owner_type === "worker" ? "işçi" : lock.lock_owner_type === "task" ? "görev" : lock.lock_owner_type}</span></div>
                            <div className="font-mono text-[10px]">ID: {lock.lock_owner_id}</div>
                          </div>
                        </td>
                        <td className="p-3.5 font-mono text-[10px] max-w-[150px]">
                          {lock.lock_status === "active" ? (
                            <div className="space-y-0.5" title={new Date(lock.expires_at).toLocaleString()}>
                              <div className="flex items-center gap-1 text-slate-400">
                                <Clock className="w-3 h-3 text-slate-500" />
                                {isExpired ? "Süresi Doldu" : "Aktif"}
                              </div>
                              <div className="text-[9.5px] text-slate-400 truncate">
                                {new Date(lock.expires_at).toLocaleTimeString()}
                              </div>
                            </div>
                          ) : (
                            <div className="text-slate-500">
                              {lock.released_at ? (
                                <div className="text-[10px]">Kaldırıldı: {new Date(lock.released_at).toLocaleTimeString()}</div>
                              ) : (
                                "—"
                              )}
                              {lock.release_reason && (
                                <span className="block text-[9px] text-slate-550 italic max-w-[120px] truncate" title={lock.release_reason}>
                                  {lock.release_reason}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 pr-4 text-right">
                          {lock.lock_status === "active" && !isExpired && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleRefreshLock(lock.id)}
                                disabled={actionProcessingId !== null}
                                className="p-1 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                                title="Kilidi Yenile / TTL +30s"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${actionProcessingId === `refresh-${lock.id}` ? "animate-spin text-emerald-400" : ""}`} />
                              </button>
                              <button
                                onClick={() => handleReleaseLock(lock.id)}
                                disabled={actionProcessingId !== null}
                                className="p-1 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                                title="Manuel Kaldır"
                              >
                                <Unlock className={`w-3.5 h-3.5 ${actionProcessingId === `release-${lock.id}` ? "animate-pulse text-rose-500" : ""}`} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

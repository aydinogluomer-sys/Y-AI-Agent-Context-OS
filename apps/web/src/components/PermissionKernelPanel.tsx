/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  User, 
  Cpu, 
  FileCode, 
  HelpCircle, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle,
  Play,
  FileText
} from "lucide-react";

interface PermissionKernelPanelProps {
  projectId: string;
}

export function PermissionKernelPanel({ projectId }: PermissionKernelPanelProps) {
  // States
  const [policies, setPolicies] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [loadingEvals, setLoadingEvals] = useState(false);
  const [errorText, setErrorText] = useState("");

  // Test Form States
  const [subjectType, setSubjectType] = useState("user");
  const [subjectId, setSubjectId] = useState("admin-user");
  const [resourceType, setResourceType] = useState("file");
  const [resourceId, setResourceId] = useState("secrets.env");
  const [actionVal, setActionVal] = useState("read");
  const [adminOverride, setAdminOverride] = useState(false);
  const [adminRationale, setAdminRationale] = useState("");
  
  // Evaluation Result State
  const [evalResult, setEvalResult] = useState<any | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState("");

  // Load Policies
  const fetchPolicies = async () => {
    setLoadingPolicies(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/permission-policies`);
      if (!res.ok) throw new Error("Yetkilendirme politikaları yüklenemedi.");
      const data = await res.json();
      setPolicies(data.policies || []);
    } catch (err: any) {
      setErrorText(err.message || "Kurallar çekilirken hata oluştu.");
    } finally {
      setLoadingPolicies(false);
    }
  };

  // Load Evaluations Log
  const fetchEvaluations = async () => {
    setLoadingEvals(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/permissions/evaluations`);
      if (!res.ok) throw new Error("Yetki değerlendirme geçmişi yüklenemedi.");
      const data = await res.json();
      setEvaluations(data.evaluations || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingEvals(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
    fetchEvaluations();
  }, [projectId]);

  // Handle evaluation execution
  const handleTestEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    setEvaluating(true);
    setEvalError("");
    setEvalResult(null);

    try {
      const payload = {
        subject: {
          subject_type: subjectType,
          subject_id: subjectId
        },
        resource: {
          resource_type: resourceType,
          resource_id: resourceId
        },
        action: actionVal,
        context_json: adminOverride ? {
          admin_override_requested: true,
          admin_override_rationale: adminRationale || "Acil debug operasyonel test yetkilendirmesi"
        } : {}
      };

      const res = await fetch(`/api/projects/${projectId}/permissions/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Hata ${res.status}: Yetki değerlendirilemedi.`);
      }

      const data = await res.json();
      setEvalResult(data.evaluation);
      
      // Refresh evaluations history
      fetchEvaluations();
    } catch (err: any) {
      setEvalError(err.message || "Değerlendirme hatası.");
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div id="permission-kernel-panel-container" className="space-y-6 font-sans">
      
      {/* Upper header section */}
      <div className="bg-void-black/90 rounded-xl p-6 border border-glass-border relative overflow-hidden backdrop-blur-md text-left shadow-[0_4px_24px_rgba(0,213,255,0.05)]">
        <div className="absolute inset-0 bg-gradient-to-r from-optic-cyan/5 via-transparent to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 bg-optic-cyan/10 rounded-lg border border-optic-cyan/20 text-optic-cyan shadow-[0_0_8px_rgba(0,213,255,0.15)]">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
                <span>Yetki Politikaları Matrisi</span>
                <span className="text-[9px] font-mono font-semibold tracking-widest bg-optic-cyan/15 text-optic-cyan border border-optic-cyan/25 px-1.5 py-0.5 rounded uppercase">
                  ABAC Çekirdeği Aktif
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                Merkezi belirleyici Yerel Öznitelik Tabanlı Erişim Kontrolü (ABAC) çekirdek motoru. Öğe, kaynak ve eylem üçlülerini değerlendirir. Anahtarlar ve sırlar denetim zincirlerinde otomatik maskelenir.
              </p>
            </div>
          </div>
          <button 
            onClick={() => { fetchPolicies(); fetchEvaluations(); }}
            className="flex items-center space-x-2 text-xs bg-void-black hover:bg-slate-900 border border-glass-border text-slate-300 hover:text-white px-3.5 py-2 rounded-lg font-mono transition-all cursor-pointer shadow-soft hover:border-optic-cyan/40"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Yapılandırmayı Yenile</span>
          </button>
        </div>
      </div>

      {errorText && (
        <div className="p-4 bg-corruption-red/10 border border-corruption-red/35 text-corruption-red rounded-xl text-xs flex items-center space-x-2 text-left font-sans">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorText}</span>
        </div>
      )}

      {/* Main split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Policies display */}
        <div className="lg:col-span-7 bg-void-black/80 border border-glass-border rounded-xl p-6 space-y-4 backdrop-blur-md text-left shadow-sm">
          <div className="flex items-center justify-between border-b border-glass-border/40 pb-3">
            <h3 className="text-sm font-bold text-slate-200 tracking-tight flex items-center space-x-2">
              <span>Tanımlı ABAC Güvenlik Politikaları</span>
              <span className="text-[10px] font-mono bg-optic-cyan/15 text-optic-cyan border border-optic-cyan/20 px-2 py-0.5 rounded font-bold">
                {policies.length} Aktif Kural
              </span>
            </h3>
          </div>

          {loadingPolicies ? (
            <div className="py-24 text-center text-xs text-steel-muted font-mono">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-optic-cyan" />
              <span>Kayıtlı yetkilendirme kuralları yükleniyor...</span>
            </div>
          ) : policies.length === 0 ? (
            <div className="py-24 text-center text-xs text-steel-muted border border-dashed border-glass-border rounded-lg bg-void-black/20 font-mono">
              <span>Aktif veya tanımlı yetki kuralı bulunmuyor.</span>
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
              {policies.map((p) => {
                const isAllow = p.effect === "allow";
                const isSystem = p.is_system;
                return (
                  <div key={p.id} className="p-4.5 bg-graphite-dark/50 hover:bg-graphite-dark border border-glass-border rounded-xl flex flex-col space-y-3 transition-all duration-300 hover:border-optic-cyan/35 shadow-sm hover:shadow-[0_4px_16px_rgba(0,213,255,0.02)]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-mono text-slate-200 font-bold tracking-wider">{p.id}</span>
                        {isSystem && (
                          <span className="text-[9px] uppercase tracking-widest bg-purple-500/10 text-purple-400 font-mono px-1.5 py-0.5 rounded border border-purple-500/20 font-bold">
                            Genel Sistem Kuralı
                          </span>
                        )}
                      </div>
                      <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                        isAllow 
                          ? "bg-evidence-green/10 text-evidence-green border-evidence-green/20" 
                          : "bg-corruption-red/10 text-corruption-red border-corruption-red/20"
                      }`}>
                        {isAllow ? "ONAYLA" : "REDDET"}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5 text-[10.5px] bg-void-black p-3 rounded-lg border border-glass-border/60 font-mono text-slate-355">
                      <div>
                        <span className="text-steel-muted text-[8px] uppercase tracking-wider font-semibold block mb-0.5">ÖĞE (SUBJECT)</span>
                        <span className="text-slate-100 select-all truncate font-medium block">{p.subject_type}:{p.subject_id}</span>
                      </div>
                      <div>
                        <span className="text-steel-muted text-[8px] uppercase tracking-wider font-semibold block mb-0.5">KAYNAK (RESOURCE)</span>
                        <span className="text-slate-100 select-all truncate font-medium block">{p.resource_type}:{p.resource_id}</span>
                      </div>
                      <div>
                        <span className="text-steel-muted text-[8px] uppercase tracking-wider font-semibold block mb-0.5">EYLEM (ACTION)</span>
                        <span className="text-optic-cyan select-all truncate font-medium block">{p.action}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Policy Tester Console */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          <div className="bg-void-black/80 rounded-xl border border-glass-border p-6 space-y-5 shadow-sm text-left">
            <h3 className="text-sm font-bold text-slate-200 tracking-tight flex items-center space-x-1.5">
              <Play className="w-3.5 h-3.5 text-emerald-450 animate-pulse" />
              <span>Gerçek Zamanlı Yetki Test Edici</span>
            </h3>

            <form onSubmit={handleTestEvaluate} className="space-y-4 font-sans">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 block tracking-wider uppercase font-mono">Öğe Türü</label>
                  <select 
                    value={subjectType} 
                    onChange={(e) => setSubjectType(e.target.value)}
                    className="w-full text-xs text-slate-200 bg-graphite-dark border border-glass-border rounded-lg p-2.5 focus:border-optic-cyan/50 font-mono focus:outline-none cursor-pointer"
                  >
                    <option value="user">Kullanıcı (User)</option>
                    <option value="worker">Çalışan (Worker)</option>
                    <option value="system">Sistem Admin / VM</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 block tracking-wider uppercase font-mono">Öğe Belirteci (Subject ID)</label>
                  <input 
                    type="text" 
                    value={subjectId} 
                    onChange={(e) => setSubjectId(e.target.value)}
                    className="w-full text-xs text-slate-200 bg-graphite-dark border border-glass-border rounded-lg p-2 px-2.5 focus:border-optic-cyan/50 font-mono focus:outline-none"
                    placeholder="örn. admin-user"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 block tracking-wider uppercase font-mono">Kaynak Türü</label>
                  <select 
                    value={resourceType} 
                    onChange={(e) => setResourceType(e.target.value)}
                    className="w-full text-xs text-slate-200 bg-graphite-dark border border-glass-border rounded-lg p-2.5 focus:border-optic-cyan/50 font-mono focus:outline-none cursor-pointer"
                  >
                    <option value="file">Dosya Kaynağı (RepoAdapter)</option>
                    <option value="file_lock">Kötümser Dosya Kilidi</option>
                    <option value="evidence">Kanıt Kasası (Evidence Vault)</option>
                    <option value="event_record">Olay Günlüğü Defteri</option>
                    <option value="worker_job">Çalışan Sicili / CPU</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 block tracking-wider uppercase font-mono">Kaynak Belirteci (Resource ID)</label>
                  <input 
                    type="text" 
                    value={resourceId} 
                    onChange={(e) => setResourceId(e.target.value)}
                    className="w-full text-xs text-slate-200 bg-graphite-dark border border-glass-border rounded-lg p-2 px-2.5 focus:border-optic-cyan/50 font-mono focus:outline-none"
                    placeholder="örn. secrets.env, lock-92f"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 block tracking-wider uppercase font-mono">Eylem Türü</label>
                <select 
                  value={actionVal} 
                  onChange={(e) => setActionVal(e.target.value)}
                  className="w-full text-xs text-slate-200 bg-graphite-dark border border-glass-border rounded-lg p-2.5 focus:border-optic-cyan/50 font-mono focus:outline-none cursor-pointer"
                >
                  <option value="read">Okuma (indirme, getirme, listeleme)</option>
                  <option value="write">Yazma (güncelleme, ekleme, gönderme)</option>
                  <option value="verify">Bütünlük Doğrulama (hash değerleri)</option>
                  <option value="lock">Kilit Edinme (dosya kilitleme)</option>
                </select>
              </div>

              {/* Admin Override Section */}
              <div className="bg-graphite-dark p-3.5 rounded-lg border border-glass-border space-y-2.5">
                <div className="flex items-center space-x-2.5 cursor-pointer">
                  <input 
                    id="override-checkbox"
                    type="checkbox" 
                    checked={adminOverride} 
                    onChange={(e) => setAdminOverride(e.target.checked)}
                    className="rounded border-glass-border text-optic-cyan focus:ring-optic-cyan/40 bg-void-black shrink-0"
                  />
                  <label htmlFor="override-checkbox" className="text-xs font-semibold text-slate-350 select-none">
                    Acil Durum Yönetici Yetkisini Kullan (Admin Override)
                  </label>
                </div>

                {adminOverride && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[8px] font-bold text-slate-550 block tracking-wider uppercase font-mono">
                      Yönetici Gerekçesi (Sistem tarafından denetlenebilir açıklama gerektirir)
                    </label>
                    <input 
                      type="text" 
                      value={adminRationale} 
                      onChange={(e) => setAdminRationale(e.target.value)}
                      className="w-full text-xs text-slate-200 bg-void-black border border-glass-border rounded-lg p-2 px-2.5 focus:border-optic-cyan/50 font-sans focus:outline-none"
                      placeholder="Acil durum nedenini açıkça yazın"
                      required
                    />
                  </div>
                )}
              </div>

              <button 
                type="submit"
                disabled={evaluating}
                className="w-full bg-optic-cyan hover:bg-cyan-400 disabled:bg-slate-800 text-void-black disabled:text-slate-500 font-bold text-xs py-2.5 rounded-lg transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-md hover:shadow-cyan-950/20"
              >
                {evaluating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sistem Durumu Değerlendiriliyor...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Yetki Değerlendirmesini Başlat</span>
                  </>
                )}
              </button>
            </form>

            {evalError && (
              <div className="p-3 bg-corruption-red/10 border border-corruption-red/30 text-corruption-red rounded-lg text-xs font-mono">
                {evalError}
              </div>
            )}

            {/* Evaluation Result Output Frame */}
            {evalResult && (
              <div className={`p-4 rounded-lg border flex flex-col space-y-3 transition-opacity ${
                evalResult.decision === "allow" 
                  ? "bg-evidence-green/5 border-evidence-green/30" 
                  : "bg-corruption-red/5 border-corruption-red/30"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {evalResult.decision === "allow" ? (
                      <ShieldCheck className="w-5 h-5 text-evidence-green" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-corruption-red" />
                    )}
                    <span className="text-xs font-bold text-white tracking-wider">
                      {evalResult.decision === "allow" ? "ERİŞİM YETKİLENDİRİLDİ" : "ERİŞİM ENGELLENDİ"}
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded shrink-0 uppercase ${
                    evalResult.decision === "allow" 
                      ? "bg-evidence-green/10 text-evidence-green" 
                      : "bg-corruption-red/10 text-corruption-red"
                  }`}>
                    {evalResult.decision === "allow" ? "ONAYLANDI" : "REDDEDİLDİ"}
                  </span>
                </div>

                <div className="text-xs text-slate-300 font-sans">
                  <span className="text-slate-500 font-mono text-[10px] uppercase font-bold mr-1.5">Gerekçe:</span>
                  <span className="font-mono text-[11px] text-slate-100">{evalResult.reason}</span>
                </div>

                {evalResult.matched_policy_id && (
                  <div className="text-xs text-slate-300 font-sans">
                    <span className="text-slate-500 font-mono text-[10px] uppercase font-bold mr-1.5">Kural ID:</span>
                    <code className="text-[10px] font-mono bg-void-black px-1.5 py-0.5 rounded text-purple-400 border border-glass-border">{evalResult.matched_policy_id}</code>
                  </div>
                )}

                {evalResult.audit_metadata && (
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block font-mono">Denetim İzleme Meta Verileri</span>
                    <pre className="text-[10px] font-mono p-2.5 bg-void-black rounded text-slate-300 overflow-x-auto border border-glass-border max-h-[140px] leading-relaxed select-text">
                      {JSON.stringify(evalResult.audit_metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Bottom Panel: Recent Evaluations Log */}
      <div className="bg-void-black/80 rounded-xl border border-glass-border p-6 space-y-4 text-left shadow-sm">
        <h3 className="text-sm font-bold text-slate-200 tracking-tight flex items-center space-x-2">
          <FileText className="w-4 h-4 text-optic-cyan" />
          <span>Merkezi Yetki Değerlendirme Defteri (Denetim İzi)</span>
        </h3>

        {loadingEvals ? (
          <div className="py-10 text-center text-xs text-slate-500 font-mono">
            <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-slate-400" />
            <span>Denetim geçmişi günlüğü alınıyor...</span>
          </div>
        ) : evaluations.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-glass-border rounded-lg font-mono">
            <span>Mevcut proje kapsamında kayıtlı değerlendirme bulunmuyor. Bir yetki testi çalıştırmayı deneyin!</span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-glass-border scrollbar-thin">
            <table className="w-full text-[11px] font-mono text-slate-350 border-collapse">
              <thead>
                <tr className="bg-graphite-dark text-slate-400 uppercase tracking-wider text-left border-b border-glass-border">
                  <th className="p-3.5 font-bold">Değerlendirme Zamanı</th>
                  <th className="p-3.5 font-bold">Öğe</th>
                  <th className="p-3.5 font-bold">Hedef Kaynak</th>
                  <th className="p-3.5 font-bold">Eylem</th>
                  <th className="p-3.5 font-bold">Karar</th>
                  <th className="p-3.5 font-bold">Eşleşen Politika</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((ev) => {
                  const allowed = ev.decision === "allow";
                  return (
                    <tr key={ev.id} className="border-b border-glass-border/30 hover:bg-white/[0.015] bg-void-black/40">
                      <td className="p-3 text-slate-500">{new Date(ev.evaluated_at).toLocaleString()}</td>
                      <td className="p-3 text-slate-200 font-semibold">{ev.subject_type}:{ev.subject_id}</td>
                      <td className="p-3 text-slate-200 select-all">{ev.resource_type}:{ev.resource_id}</td>
                      <td className="p-3 text-optic-cyan font-bold">{ev.action}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                          allowed 
                            ? "bg-evidence-green/10 text-evidence-green border-evidence-green/20" 
                            : "bg-corruption-red/10 text-corruption-red border-corruption-red/20"
                        }`}>
                          {allowed ? "ONAY" : "RED"}
                        </span>
                      </td>
                      <td className="p-3 text-purple-400 text-[10.5px] font-semibold">{ev.matched_policy_id || "default_deny"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

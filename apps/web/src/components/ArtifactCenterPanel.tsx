/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { 
  Layers, 
  Eye, 
  CheckCircle2, 
  ShieldCheck, 
  Network, 
  RefreshCw, 
  AlertCircle, 
  Search,
  SlidersHorizontal,
  Plus,
  Lock,
  Archive,
  AlertTriangle,
  History,
  FileText,
  FileCode,
  ArrowRight,
  Download,
  ShieldAlert
} from "lucide-react";
import { Badge } from "./primitives/Badge";

interface ArtifactCenterPanelProps {
  projectId: string;
}

export function ArtifactCenterPanel({ projectId }: ArtifactCenterPanelProps) {
  // Stats
  const [stats, setStats] = useState<any | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Artifact list
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  // Filters
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchPath, setSearchPath] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  // Sub-tabs for Left Column Registry Index
  const [activeListTab, setActiveListTab] = useState<"versions" | "cas" | "quarantine">("versions");

  // Selected details
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [selectedArtifactDetail, setSelectedArtifactDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);

  // Compare states
  const [compareArtifactId, setCompareArtifactId] = useState<string | null>(null);
  const [comparePayload, setComparePayload] = useState<any | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // Register Form States
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [formLogicalPath, setFormLogicalPath] = useState("");
  const [formType, setFormType] = useState("context_pack");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContentKind, setFormContentKind] = useState("json");
  const [formPayloadText, setFormPayloadText] = useState("");
  const [formPayloadJson, setFormPayloadJson] = useState("{\n  \"status\": \"success\",\n  \"features\": []\n}");
  const [formMimeType, setFormMimeType] = useState("application/json");
  const [formCreatedByType, setFormCreatedByType] = useState("system");
  const [formCreatedById, setFormCreatedById] = useState("ui-operator");
  const [formMetadata, setFormMetadata] = useState("{\n  \"commit\": \"a98f102\"\n}");
  
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Path warning pre-validation
  const [pathWarning, setPathWarning] = useState("");

  // Check path traversal and system scopes dynamically
  useEffect(() => {
    if (!formLogicalPath) {
      setPathWarning("");
      return;
    }
    if (formLogicalPath.includes("..")) {
      setPathWarning("DİZİN AŞMA GÜVENLİK UYARISI: Yol, üst dizine geçiş elemanları (..) içeriyor ve güvenlik kapıları tarafından bloke edilecektir!");
      return;
    }
    if (formLogicalPath.startsWith("/") || /^[a-zA-Z]:/.test(formLogicalPath)) {
      setPathWarning("MUTLAK YOL TESPİT EDİLDİ: Sürücü harfi veya mutlak yol belirteçleri çalışma alanı köküne göre otomatik kırpılacaktır.");
      return;
    }
    if (/^(app|Users|home|var|tmp|opt|etc)\//i.test(formLogicalPath)) {
      setPathWarning("SİSTEM KÖK DİZİNİ TESPİT EDİLDİ: Sunucu ortamındaki kritik sistem dizinlerine yazım kısıtlanmıştır.");
      return;
    }
    setPathWarning("");
  }, [formLogicalPath]);

  // Load stats and list
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchArtifacts = async () => {
    setArtifactsLoading(true);
    setErrorText("");
    try {
      let url = `/api/projects/${projectId}/artifacts`;
      const params = new URLSearchParams();
      if (filterType) params.append("artifact_type", filterType);
      if (filterStatus) params.append("artifact_status", filterStatus);
      if (searchPath) params.append("logical_path", searchPath);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || "Artefaktlar yüklenirken bir hata oluştu.");
      }
      const data = await res.json();
      setArtifacts(data || []);
    } catch (err: any) {
      setErrorText(err.message || "Sicil listesi çekilemedi.");
    } finally {
      setArtifactsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchArtifacts();
  }, [projectId, filterType, filterStatus, searchPath]);

  // Handle detailed fetch
  const handleOpenDetail = async (artifactId: string) => {
    setSelectedArtifactId(artifactId);
    setDetailLoading(true);
    setSelectedArtifactDetail(null);
    setHistoryList([]);
    setCompareArtifactId(null);
    setComparePayload(null);
    try {
      const [detailRes, historyRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/artifacts/${artifactId}`),
        fetch(`/api/projects/${projectId}/artifacts/${artifactId}/history`)
      ]);

      if (detailRes.ok) {
        const detailData = await detailRes.json();
        setSelectedArtifactDetail(detailData);
      }
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistoryList(historyData || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCompareSelect = async (artifactId: string) => {
    setCompareArtifactId(artifactId);
    setCompareLoading(true);
    setComparePayload(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/${artifactId}`);
      if (res.ok) {
        const data = await res.json();
        setComparePayload(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCompareLoading(false);
    }
  };

  // Submit Handler for new artifact registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess(false);

    try {
      let finalPayload: any = null;
      if (formContentKind === "json") {
        try {
          finalPayload = JSON.parse(formPayloadJson);
        } catch {
          throw new Error("Hatalı format: Veri metni geçerli bir ayrıştırılabilir JSON nesnesi değil.");
        }
      }

      let parsedMeta: any = {};
      if (formMetadata) {
        try {
          parsedMeta = JSON.parse(formMetadata);
        } catch {
          throw new Error("Hatalı biçim: Meta veriler geçerli bir JSON formatında değil.");
        }
      }

      const payload = {
        logical_path: formLogicalPath,
        artifact_type: formType,
        content_kind: formContentKind,
        payload_text: formContentKind !== "json" ? formPayloadText : null,
        payload_json: formContentKind === "json" ? finalPayload : null,
        mime_type: formMimeType,
        created_by_type: formCreatedByType,
        created_by_id: formCreatedById,
        title: formTitle || undefined,
        description: formDescription || undefined,
        metadata_json: parsedMeta
      };

      const res = await fetch(`/api/projects/${projectId}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Hata ${res.status}: Kayıt isteği reddedildi.`);
      }

      setSubmitSuccess(true);
      setFormLogicalPath("");
      setFormTitle("");
      setFormDescription("");
      setFormPayloadText("");
      
      // Refresh views
      fetchStats();
      fetchArtifacts();

      // Close panel after short delay
      setTimeout(() => {
        setShowRegisterForm(false);
        setSubmitSuccess(false);
      }, 1500);

    } catch (err: any) {
      setSubmitError(err.message || "Artefakt kayıt isteği gönderilemedi.");
    } finally {
      setSubmitting(false);
    }
  };

  // Archive Handler
  const handleArchive = async (versionId: string) => {
    if (!confirm("Bu artefakt sürümünü arşivlemek istediğinize emin misiniz? Aktif durumunu değiştirecektir.")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/${versionId}/archive`, {
        method: "POST"
      });
      if (res.ok) {
        fetchArtifacts();
        if (selectedArtifactId === versionId) {
          handleOpenDetail(versionId);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData?.error?.message || "Arşivleme isteği reddedildi.");
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Quarantine Handler
  const handleQuarantine = async (versionId: string) => {
    if (!confirm("Bu artefakt sürümünü karantinaya almak istediğinize emin misiniz? Varsayılan erişimi engelleyecektir.")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts/${versionId}/quarantine`, {
        method: "POST"
      });
      if (res.ok) {
        fetchArtifacts();
        if (selectedArtifactId === versionId) {
          handleOpenDetail(versionId);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData?.error?.message || "Karantina eylemi reddedildi.");
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Download logic for payloads
  const downloadPayload = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Extract unique CAS blobs from current artifacts list
  const uniqueCasBlobs = useMemo(() => {
    const blobMap = new Map();
    artifacts.forEach((a) => {
      if (a.cas_blob_id && !blobMap.has(a.cas_blob_id)) {
        blobMap.set(a.cas_blob_id, {
          id: a.cas_blob_id,
          cas_hash: a.cas_hash,
          size_bytes: a.size_bytes,
          metadata_json: a.metadata_json,
          artifact_type: a.artifact_type,
          logical_path: a.logical_path
        });
      }
    });
    return Array.from(blobMap.values());
  }, [artifacts]);

  // Filter CAS Blobs by tag matches in browser memory
  const filteredCasBlobs = useMemo(() => {
    if (!tagFilter.trim()) return uniqueCasBlobs;
    return uniqueCasBlobs.filter((b) => {
      const metaStr = typeof b.metadata_json === "string"
        ? b.metadata_json.toLowerCase()
        : JSON.stringify(b.metadata_json).toLowerCase();
      return metaStr.includes(tagFilter.toLowerCase());
    });
  }, [uniqueCasBlobs, tagFilter]);

  // Filter regular artifact versions
  const filteredArtifacts = useMemo(() => {
    const base = artifacts.filter((a) => a.artifact_status !== "quarantined");
    if (!tagFilter.trim()) return base;
    return base.filter((a) => {
      const metaStr = typeof a.metadata_json === "string"
        ? a.metadata_json.toLowerCase()
        : JSON.stringify(a.metadata_json).toLowerCase();
      return metaStr.includes(tagFilter.toLowerCase());
    });
  }, [artifacts, tagFilter]);

  // Filter quarantined items
  const quarantinedArtifacts = useMemo(() => {
    const base = artifacts.filter((a) => a.artifact_status === "quarantined");
    if (!tagFilter.trim()) return base;
    return base.filter((a) => {
      const metaStr = typeof a.metadata_json === "string"
        ? a.metadata_json.toLowerCase()
        : JSON.stringify(a.metadata_json).toLowerCase();
      return metaStr.includes(tagFilter.toLowerCase());
    });
  }, [artifacts, tagFilter]);

  return (
    <div id="artifact-intelligence-center-container" className="space-y-6 font-sans">
      
      {/* 1. Header Hero section */}
      <div className="bg-void-black border border-glass-border rounded-xl p-6 relative overflow-hidden shadow-xl text-left">
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#00d5ff_1px,transparent_1px)] [background-size:16px_16px]" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-optic-cyan/15 border border-optic-cyan/25 text-optic-cyan font-mono text-[9px] font-bold rounded">
                GÜVENLİ CAS SİCİLİ
              </span>
              <span className="text-slate-500 text-[10px] font-mono">BELİRLEYİCİ KRİPTOGRAFİK ÇEKİRDEK</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-optic-cyan animate-pulse" />
              Y-OS Artefakt Merkezi (CAS)
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Üretilen kod değişikliklerini, formel mimari tasarımlarını, yürütme günlüklerini ve bağlam paketlerini; otomatik proje bazlı tekilleştirme yeteneğine sahip PostgreSQL tabanlı İçerik Adreslemeli Depolama (CAS) sisteminde güvenle saklar.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { fetchStats(); fetchArtifacts(); }}
              className="px-3 py-2 bg-graphite-dark hover:bg-slate-900 border border-glass-border text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:text-white transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tabloyu Senkronize Et
            </button>
            <button
              onClick={() => setShowRegisterForm(!showRegisterForm)}
              className="px-3 py-2 bg-optic-cyan hover:bg-cyan-400 text-void-black rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg transition"
            >
              <Plus className="w-4 h-4" />
              Artefakt Kaydet
            </button>
          </div>
        </div>
      </div>

      {/* 2. Interactive CAS Deduplication Stats Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="bg-void-black p-4 border border-glass-border rounded-xl text-left">
          <span className="text-[10px] text-slate-550 font-mono block uppercase font-bold">Toplam Sürüm</span>
          {statsLoading ? (
            <span className="text-sm font-semibold text-slate-400 font-mono">Yükleniyor...</span>
          ) : (
            <span className="text-lg font-black text-slate-100">{stats?.total_versions || 0}</span>
          )}
        </div>
        <div className="bg-void-black p-4 border border-glass-border rounded-xl text-left">
          <span className="text-[10px] text-slate-550 font-mono block uppercase font-bold">Benzersiz CAS Blobu</span>
          {statsLoading ? (
            <span className="text-sm font-semibold text-slate-400 font-mono">Yükleniyor...</span>
          ) : (
            <span className="text-lg font-black text-slate-100">{stats?.unique_blobs || 0}</span>
          )}
        </div>
        <div className="bg-void-black p-4 border border-glass-border rounded-xl text-left">
          <span className="text-[10px] text-slate-550 font-mono block uppercase font-bold">Tekilleştirilen Referanslar</span>
          {statsLoading ? (
            <span className="text-sm font-semibold text-slate-400 font-mono">Yükleniyor...</span>
          ) : (
            <span className="text-lg font-black text-emerald-400 font-mono">
              ✓ {stats?.deduplicated_references || 0}
            </span>
          )}
        </div>
        <div className="bg-void-black p-4 border border-glass-border rounded-xl text-left">
          <span className="text-[10px] text-slate-550 font-mono block uppercase font-bold">Tekil Depolanan Bayt</span>
          {statsLoading ? (
            <span className="text-sm font-semibold text-slate-400 font-mono">Yükleniyor...</span>
          ) : (
            <span className="text-lg font-black text-slate-200">
              {stats?.total_cas_bytes ? (stats.total_cas_bytes / 1024).toFixed(1) : 0} KB
            </span>
          )}
        </div>
        <div className="bg-emerald-950/15 p-4 border border-emerald-900/30 rounded-xl transition col-span-2 md:col-span-1 text-left">
          <span className="text-[10px] text-emerald-450 font-mono block uppercase font-bold">Tekilleştirme Tasarrufu</span>
          {statsLoading ? (
            <span className="text-sm font-semibold text-emerald-400 font-mono">Yükleniyor...</span>
          ) : (
            <span className="text-lg font-black text-emerald-450 font-mono">
              +{(stats?.savings_bytes ? stats.savings_bytes / 1024 : 0).toFixed(1)} KB
            </span>
          )}
        </div>
      </div>

      {/* Error Output block */}
      {errorText && (
        <div className="p-4 bg-corruption-red/10 border border-corruption-red/35 text-corruption-red rounded-xl text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorText}</span>
        </div>
      )}

      {/* 3. Dropdown Register form overlay panel */}
      {showRegisterForm && (
        <form onSubmit={handleRegister} className="bg-void-black border border-glass-border p-6 rounded-xl space-y-4 text-left shadow-2xl relative">
          <div className="flex items-center justify-between pb-3 border-b border-glass-border">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-optic-cyan" />
              Yeni Güvenli Bağlam Paketi / Artefakt Sürümü Kaydet
            </h3>
            <button
              onClick={() => setShowRegisterForm(false)}
              className="text-xs text-slate-500 hover:text-white font-bold cursor-pointer bg-transparent border-none"
              type="button"
            >
              ✕ Paneli Kapat
            </button>
          </div>

          {submitError && (
            <div className="p-3.5 bg-corruption-red/10 border border-corruption-red/35 text-corruption-red rounded-lg text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {submitSuccess && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/35 text-emerald-400 rounded-lg text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Artefakt sürümü analiz edildi ve PostgreSQL CAS deposuna başarıyla yazıldı!</span>
            </div>
          )}

          {pathWarning && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-lg text-[11px] font-mono flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 animate-bounce" />
              <span>{pathWarning}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 block uppercase font-bold font-mono">Mantıksal Dosya Yolu (Bağıl)</label>
              <input
                type="text"
                value={formLogicalPath}
                onChange={(e) => setFormLogicalPath(e.target.value)}
                placeholder="src/components/MyWidget.tsx"
                className="w-full px-3 py-1.5 bg-graphite-dark border border-glass-border rounded font-mono text-xs text-white focus:border-optic-cyan/50 focus:outline-none"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 block uppercase font-bold font-mono">Artefakt Türü</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full px-3 py-1.5 bg-graphite-dark border border-glass-border rounded text-xs text-white focus:border-optic-cyan/50 focus:outline-none cursor-pointer"
              >
                <option value="code_diff">Kod Değişikliği (e.g. diff_v3)</option>
                <option value="context_pack">Bağlam Paketi (Context Pack)</option>
                <option value="quality_report">Kalite Geçidi Raporu</option>
                <option value="architecture_topology">Mimari Topoloji Yapısı</option>
                <option value="execution_log">Sistem Yürütme Logları</option>
                <option value="other">Diğer İndirilebilir Metin / JSON Arşivleri</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 block uppercase font-bold font-mono">Başlık</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Opsiyonel Artefakt Başlığı"
                className="w-full px-3 py-1.5 bg-graphite-dark border border-glass-border rounded text-xs text-white focus:border-optic-cyan/50 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 block uppercase font-bold font-mono">Oluşturan Rolü (Subject Persona)</label>
              <div className="flex gap-2">
                <select
                  value={formCreatedByType}
                  onChange={(e) => setFormCreatedByType(e.target.value)}
                  className="px-2 py-1.5 bg-graphite-dark border border-glass-border rounded text-xs text-white font-mono focus:border-optic-cyan/50 focus:outline-none cursor-pointer"
                >
                  <option value="system">sistem</option>
                  <option value="task">görev (task)</option>
                  <option value="worker">işçi (worker)</option>
                  <option value="user">kullanıcı (user)</option>
                </select>
                <input
                  type="text"
                  value={formCreatedById}
                  onChange={(e) => setFormCreatedById(e.target.value)}
                  placeholder="ID Belirteci"
                  className="w-full px-3 py-1.5 bg-graphite-dark border border-glass-border rounded font-mono text-xs text-white focus:border-optic-cyan/50 focus:outline-none"
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 block uppercase font-bold font-mono">Açıklama / Notlar</label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Artefakt özet açıklaması"
              className="w-full px-3 py-1.5 bg-graphite-dark border border-glass-border rounded text-xs text-white focus:border-optic-cyan/50 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-1">
            <div className="md:col-span-3 space-y-2">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 block uppercase font-bold font-mono">Veri Biçimi (Content Kind)</label>
                <select
                  value={formContentKind}
                  onChange={(e) => {
                    setFormContentKind(e.target.value);
                    setFormMimeType(e.target.value === "json" ? "application/json" : "text/plain");
                  }}
                  className="w-full px-3 py-1.5 bg-graphite-dark border border-glass-border rounded text-xs text-white focus:border-optic-cyan/50 focus:outline-none cursor-pointer"
                >
                  <option value="json">JSON Nesnesi/Dizisi</option>
                  <option value="text">UTF-8 Düz Metin Dosyası</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 block uppercase font-bold font-mono">Mime Tipi</label>
                <input
                  type="text"
                  value={formMimeType}
                  onChange={(e) => setFormMimeType(e.target.value)}
                  className="w-full px-3 py-1.5 bg-graphite-dark border border-glass-border rounded font-mono text-xs text-white focus:border-optic-cyan/50 focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 block uppercase font-bold font-mono">Meta Veri JSON</label>
                <textarea
                  value={formMetadata}
                  onChange={(e) => setFormMetadata(e.target.value)}
                  rows={2}
                  className="w-full p-2 bg-graphite-dark border border-glass-border rounded font-mono text-[11px] text-white focus:border-optic-cyan/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="md:col-span-9 space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-optic-cyan block uppercase font-bold font-mono">
                  Artefakt İçeriği (Güvenli Kapsam Kontrol Sınırı: 512KB)
                </label>
                <span className="text-[10.5px] text-slate-500 font-mono">
                  Uyarı: Düz metin kimlik bilgisi (şifre, anahtar) saptanırsa sistem otomatik reddedecektir!
                </span>
              </div>
              {formContentKind === "json" ? (
                <textarea
                  value={formPayloadJson}
                  onChange={(e) => setFormPayloadJson(e.target.value)}
                  rows={6}
                  className="w-full p-3 bg-graphite-dark border border-glass-border rounded font-mono text-xs text-slate-200 focus:border-optic-cyan/50 focus:outline-none"
                  required
                />
              ) : (
                <textarea
                  value={formPayloadText}
                  onChange={(e) => setFormPayloadText(e.target.value)}
                  placeholder="Ham metin içeriğini girin..."
                  rows={6}
                  className="w-full p-3 bg-graphite-dark border border-glass-border rounded font-mono text-xs text-slate-200 focus:border-optic-cyan/50 focus:outline-none"
                  required
                />
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowRegisterForm(false)}
              className="px-4 py-2 bg-void-black border border-glass-border rounded text-slate-400 text-xs hover:text-white transition cursor-pointer"
              type="button"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-optic-cyan hover:bg-cyan-400 rounded text-void-black text-xs font-bold shadow-lg transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Analiz Ediliyor...</span>
                </>
              ) : (
                <span>CAS Kaydını Yayınla</span>
              )}
            </button>
          </div>
        </form>
      )}

      {/* 4. Filter actions */}
      <div className="bg-void-black p-4 border border-glass-border rounded-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-left">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-350">
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            <span>Kapsam Filtreleri</span>
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 bg-graphite-dark border border-glass-border rounded-lg text-xs font-medium text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="">Tüm Artefakt Türleri</option>
            <option value="code_diff">Kod Değişiklikleri (Diff)</option>
            <option value="context_pack">Bağlam Paketleri (Context Packs)</option>
            <option value="quality_report">Kalite Geçidi Raporları</option>
            <option value="architecture_topology">Sistem Topolojileri</option>
            <option value="execution_log">Yürütme Günlükleri</option>
            <option value="other">Diğer Varlıklar</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 bg-graphite-dark border border-glass-border rounded-lg text-xs font-medium text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="">Tüm Durumlar</option>
            <option value="active">Sadece Aktif Sürümler</option>
            <option value="superseded">Sadece Aşılmış Sürümler</option>
            <option value="archived">Sadece Arşivlenmiş Sürümler</option>
            <option value="quarantined">Sadece Karantinaya Alınanlar</option>
          </select>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-48">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchPath}
              onChange={(e) => setSearchPath(e.target.value)}
              placeholder="Dosya yolu ara..."
              className="w-full px-3 py-1.5 pl-9 bg-graphite-dark border border-glass-border rounded-lg text-xs font-medium text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
          <div className="relative w-full sm:w-48">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="Meta etiketine göre filtrele..."
              className="w-full px-3 py-1.5 pl-9 bg-graphite-dark border border-glass-border rounded-lg text-xs font-medium text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 5. Main Content split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Registry list */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Sub-tabs toggler */}
          <div className="flex border-b border-glass-border/40 pb-px gap-1">
            <button
              onClick={() => setActiveListTab("versions")}
              className={`px-4 py-2 text-xs font-bold tracking-wide border-b-2 transition-all cursor-pointer ${
                activeListTab === "versions"
                  ? "border-optic-cyan text-optic-cyan font-bold"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              Mantıksal Sürümler ({filteredArtifacts.length})
            </button>
            <button
              onClick={() => setActiveListTab("cas")}
              className={`px-4 py-2 text-xs font-bold tracking-wide border-b-2 transition-all cursor-pointer ${
                activeListTab === "cas"
                  ? "border-optic-cyan text-optic-cyan font-bold"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              CAS İkili Bloklar ({filteredCasBlobs.length})
            </button>
            <button
              onClick={() => setActiveListTab("quarantine")}
              className={`px-4 py-2 text-xs font-bold tracking-wide border-b-2 transition-all cursor-pointer ${
                activeListTab === "quarantine"
                  ? "border-corruption-red text-corruption-red font-bold"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              Karantina Kayıtları ({quarantinedArtifacts.length})
            </button>
          </div>

          {artifactsLoading ? (
            <div className="py-24 text-center text-xs text-slate-500 bg-void-black border border-glass-border rounded-xl">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
              <span>Veri tabanı CAS kayıtları taranıyor...</span>
            </div>
          ) : (
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1 scrollbar-thin">
              
              {/* Tab 1: Regular Versions */}
              {activeListTab === "versions" && (
                filteredArtifacts.length === 0 ? (
                  <div className="py-24 text-center text-xs text-slate-555 border border-dashed border-glass-border rounded-xl bg-void-black">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                    <span>Proje kapsamında eşleşen aktif sürüm bulunamadı.</span>
                  </div>
                ) : (
                  filteredArtifacts.map((a) => {
                    const isActive = a.artifact_status === "active";
                    const isSuperseded = a.artifact_status === "superseded";
                    const isArchived = a.artifact_status === "archived";
                    const isSelected = selectedArtifactId === a.id;

                    return (
                      <div 
                        key={a.id} 
                        className={`p-4 bg-void-black text-left rounded-xl border transition-all ${
                          isSelected ? "border-optic-cyan/60 bg-graphite-dark/60 shadow-lg" : "border-glass-border hover:border-slate-800"
                        }`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase ${
                                isActive ? "bg-emerald-500/10 text-emerald-450 border border-emerald-500/20" :
                                isSuperseded ? "bg-amber-500/10 text-amber-550 border border-amber-500/20" :
                                "bg-slate-800 text-slate-400 border border-slate-700"
                              }`}>
                                {isActive ? "aktif" : isSuperseded ? "aşılmış" : a.artifact_status}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {a.id} • Sürüm v{a.version_number}
                              </span>
                              <span className="text-[10px] text-slate-550 font-mono">
                                {(a.size_bytes / 1024).toFixed(1)} KB
                              </span>
                            </div>

                            <h4 
                              onClick={() => handleOpenDetail(a.id)}
                              className="text-xs font-bold font-mono text-slate-100 hover:text-optic-cyan cursor-pointer flex items-center gap-1.5 pt-0.5"
                            >
                              <FileCode className="w-3.5 h-3.5 text-slate-450" />
                              {a.logical_path}
                            </h4>
                            {a.title && <p className="text-[11px] text-slate-350">{a.title}</p>}
                            
                            {a.metadata_json && Object.keys(a.metadata_json).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {Object.entries(a.metadata_json).map(([k, v]) => (
                                  <span key={k} className="text-[8px] font-mono bg-white/[0.03] border border-glass-border px-1.5 py-0.2 rounded text-slate-400">
                                    {k}: {String(v)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleOpenDetail(a.id)}
                              className="px-2.5 py-1.5 bg-graphite-dark border border-glass-border hover:border-optic-cyan/40 text-slate-300 hover:text-white rounded text-[11px] font-semibold cursor-pointer transition flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5 text-optic-cyan" />
                              Detayları İncele
                            </button>
                            <button
                              disabled={isArchived}
                              onClick={() => handleArchive(a.id)}
                              className="p-1.5 bg-graphite-dark hover:bg-slate-900 border border-glass-border rounded text-slate-400 hover:text-amber-400 disabled:opacity-20 transition cursor-pointer"
                              title="Sürümü arşivle"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleQuarantine(a.id)}
                              className="p-1.5 bg-graphite-dark hover:bg-slate-900 border border-glass-border rounded text-slate-400 hover:text-corruption-red transition cursor-pointer"
                              title="Şüpheli sürümü karantinaya al"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )
              )}

              {/* Tab 2: Unique CAS Blobs */}
              {activeListTab === "cas" && (
                filteredCasBlobs.length === 0 ? (
                  <div className="py-24 text-center text-xs text-slate-555 border border-dashed border-glass-border rounded-xl bg-void-black">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                    <span>Arama kriterlerine uyan benzersiz CAS ikili verisi bulunamadı.</span>
                  </div>
                ) : (
                  filteredCasBlobs.map((b) => (
                    <div 
                      key={b.id}
                      className="p-4 bg-void-black text-left rounded-xl border border-glass-border hover:border-optic-cyan/35 transition-all"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 font-mono">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.2 bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[9px] rounded font-bold uppercase">
                              CAS BLOB
                            </span>
                            <span className="text-[10px] text-slate-500 select-all">{b.id}</span>
                            <span className="text-[10px] text-slate-555">{(b.size_bytes / 1024).toFixed(1)} KB</span>
                          </div>
                          
                          <div className="text-xs text-slate-200 truncate select-all font-sans" title={b.cas_hash}>
                            Hash: <span className="text-optic-cyan font-mono">{b.cas_hash.substring(0, 16)}...</span>
                          </div>
                          <div className="text-[10px] text-slate-450 font-sans">
                            Referans Yol Örneği: <span className="text-slate-350">{b.logical_path}</span>
                          </div>

                          {b.metadata_json && Object.keys(b.metadata_json).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {Object.entries(b.metadata_json).map(([k, v]) => (
                                <span key={k} className="text-[8px] bg-white/[0.03] border border-glass-border px-1.5 py-0.2 rounded text-slate-400">
                                  {k}: {String(v)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => {
                            const matchingVer = artifacts.find(a => a.cas_blob_id === b.id);
                            if (matchingVer) handleOpenDetail(matchingVer.id);
                          }}
                          className="px-2.5 py-1.5 bg-graphite-dark border border-glass-border hover:border-optic-cyan/40 text-slate-300 hover:text-white rounded text-[11px] font-semibold cursor-pointer transition"
                        >
                          Ana Sürümü Görüntüle
                        </button>
                      </div>
                    </div>
                  ))
                )
              )}

              {/* Tab 3: Quarantine Registry (Read-only Panel) */}
              {activeListTab === "quarantine" && (
                quarantinedArtifacts.length === 0 ? (
                  <div className="py-24 text-center text-xs text-slate-555 border border-dashed border-glass-border rounded-xl bg-void-black">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                    <span>Karantina kaydı temiz. Güvenlik sınırları kusursuz çalışıyor!</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-corruption-red/10 border border-corruption-red/20 text-corruption-red rounded-lg text-xs flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>SALT OKUNUR PANEL: Güvenlik sızıntısı veya şifre verileri içeren bu kısımlar otomatik olarak karantinaya alınmıştır.</span>
                    </div>

                    {quarantinedArtifacts.map((a) => (
                      <div 
                        key={a.id}
                        className="p-4 bg-void-black text-left rounded-xl border border-corruption-red/40 hover:border-corruption-red transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-1 text-left">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-corruption-red/20 text-corruption-red border border-corruption-red/30 text-[9px] font-mono font-bold rounded uppercase">
                                KARANTİNADA
                              </span>
                              <span className="text-[10px] text-slate-550 font-mono">v{a.version_number}</span>
                              <span className="text-[10px] text-slate-555 font-mono">{(a.size_bytes / 1024).toFixed(1)} KB</span>
                            </div>
                            <h4 className="text-xs font-bold font-mono text-slate-100">{a.logical_path}</h4>
                            <p className="text-[10.5px] text-slate-400 font-mono">CAS SHA256: {a.cas_hash}</p>
                            {a.description && <p className="text-xs text-slate-350 mt-1">{a.description}</p>}
                          </div>
                          
                          <button
                            onClick={() => handleOpenDetail(a.id)}
                            className="px-2.5 py-1.5 bg-graphite-dark border border-glass-border hover:border-corruption-red text-slate-300 hover:text-white rounded text-[11px] font-semibold cursor-pointer transition shrink-0"
                          >
                            Meta Verileri Denetle
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

            </div>
          )}
        </div>

        {/* Right column: Dynamic selected artifact inspector */}
        <div className="lg:col-span-4 bg-void-black rounded-xl border border-glass-border p-5 space-y-4 text-left shadow-sm">
          <h3 className="text-sm font-bold text-slate-200 pb-2 border-b border-glass-border/30 flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-optic-cyan" />
            Artefakt Denetim ve Bütünlük İzleme
          </h3>

          {!selectedArtifactId ? (
            <div className="py-24 text-center text-xs text-slate-555 select-none font-mono">
              <Layers className="w-8 h-8 mx-auto mb-2 text-slate-700 opacity-60" />
              <span>Veri tabanı kayıtlarını ve kriptografik geçmişi görmek için listeden bir dosyaya tıklayın.</span>
            </div>
          ) : detailLoading ? (
            <div className="py-24 text-center text-xs text-slate-500 font-mono">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
              <span>Veri paketleri ve bütünlük logları çekiliyor...</span>
            </div>
          ) : !selectedArtifactDetail ? (
            <div className="py-24 text-center text-xs text-corruption-red font-mono">
              <span>Sürüm bilgileri yüklenirken bir sorunla karşılaşıldı.</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Micro specs */}
              <div className="p-3.5 bg-graphite-dark border border-glass-border rounded-xl space-y-2.5 font-mono text-xs">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block font-bold">Bağıl Dosya Yolu</span>
                  <span className="text-slate-200 font-bold">{selectedArtifactDetail.artifact?.logical_path}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block font-bold">Normalize Edilmiş Yol</span>
                  <span className="text-slate-400 select-all">{selectedArtifactDetail.artifact?.logical_path}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block font-bold">Sürüm Durumu</span>
                    <span className={`font-bold uppercase ${
                      selectedArtifactDetail.artifact?.artifact_status === "quarantined" ? "text-corruption-red" : "text-emerald-450"
                    }`}>{selectedArtifactDetail.artifact?.artifact_status === "quarantined" ? "karantinada" : selectedArtifactDetail.artifact?.artifact_status === "active" ? "aktif" : selectedArtifactDetail.artifact?.artifact_status}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block font-bold">Sürüm Sırası</span>
                    <span className="text-slate-200">v{selectedArtifactDetail.artifact?.version_number}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block font-bold">PostgreSQL CAS Blob ID</span>
                  <span className="text-slate-400 text-[11px] block select-all">{selectedArtifactDetail.artifact?.cas_blob_id}</span>
                </div>
                <div>
                  <span className="text-[9px] text-optic-cyan uppercase block font-bold">Kriptografik İçerik SHA-256 Hash</span>
                  <span className="text-optic-cyan text-[10.5px] font-bold block select-all break-all leading-normal">
                    {selectedArtifactDetail.artifact?.cas_hash}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block font-bold">Üst Sürüm Hash Kodu (Parent)</span>
                  <span className="text-slate-400 block break-all">
                    {selectedArtifactDetail.artifact?.parent_version_id || "Bulunmuyor (Kök Sürüm)"}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 uppercase block font-bold">Oluşturan</span>
                  <span className="text-slate-350">
                    {selectedArtifactDetail.artifact?.created_by_type} ({selectedArtifactDetail.artifact?.created_by_id})
                  </span>
                </div>
              </div>

              {/* Version History Lineage Walk */}
              {historyList.length > 1 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 uppercase font-mono font-bold block">
                    Sürüm Soy Ağacı Geçmişi
                  </span>
                  <div className="bg-graphite-dark p-3.5 border border-glass-border rounded-xl space-y-2">
                    {historyList.map((h: any, idx: number) => {
                      const isSelf = h.id === selectedArtifactId;
                      const isComparing = h.id === compareArtifactId;
                      return (
                        <div 
                          key={h.id}
                          className={`flex items-center justify-between p-1.5 rounded border transition-all ${
                            isSelf ? "bg-emerald-950/25 border-emerald-900/35 text-white" : 
                            isComparing ? "bg-amber-950/25 border-amber-900/35 text-white" :
                            "hover:bg-slate-900 text-slate-400 border-transparent"
                          }`}
                        >
                          <span 
                            className="text-xs font-mono font-bold cursor-pointer hover:underline"
                            onClick={() => handleOpenDetail(h.id)}
                          >
                            v{h.version_number}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono">{(h.size_bytes / 1024).toFixed(1)} KB</span>
                            {!isSelf && (
                              <button
                                onClick={() => handleCompareSelect(h.id)}
                                className="px-1.5 py-0.5 bg-void-black border border-glass-border hover:border-optic-cyan/40 hover:text-white rounded text-[9px] font-mono cursor-pointer"
                              >
                                {isComparing ? "Karşılaştırılıyor" : "Karşılaştır"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Diff comparison results panel (Side-by-Side) */}
              {compareArtifactId && comparePayload && (
                <div className="space-y-2 pt-2 border-t border-glass-border/30">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-amber-400 uppercase font-mono font-bold flex items-center gap-1">
                      Değişiklik Analizi (v{comparePayload.artifact?.version_number} ile v{selectedArtifactDetail.artifact?.version_number} karşılaştırması)
                    </span>
                    <button
                      onClick={() => { setCompareArtifactId(null); setComparePayload(null); }}
                      className="text-[9px] text-slate-500 hover:text-white font-mono cursor-pointer bg-transparent border-none"
                    >
                      Temizle
                    </button>
                  </div>
                  {compareLoading ? (
                    <div className="text-center text-xs text-slate-500 py-6 font-mono">Veri yükleniyor...</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 font-mono text-[10px] h-64 overflow-auto border border-glass-border rounded-xl p-2 bg-void-black text-left leading-relaxed">
                      {(() => {
                        const oldText = comparePayload.blob?.content_kind === "json" 
                          ? JSON.stringify(comparePayload.blob?.payload_json, null, 2)
                          : (comparePayload.blob?.payload_text || "");
                        const newText = selectedArtifactDetail.blob?.content_kind === "json" 
                          ? JSON.stringify(selectedArtifactDetail.blob?.payload_json, null, 2)
                          : (selectedArtifactDetail.blob?.payload_text || "");
                        
                        const oldLines = oldText.split("\n");
                        const newLines = newText.split("\n");
                        
                        // Line-by-line alignment algorithm for side-by-side display
                        const diffLines: Array<{ oldLine?: string; newLine?: string; type: "added" | "removed" | "unchanged" }> = [];
                        let i = 0, j = 0;
                        while (i < oldLines.length || j < newLines.length) {
                          if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
                            diffLines.push({ oldLine: oldLines[i], newLine: newLines[j], type: "unchanged" });
                            i++;
                            j++;
                          } else if (j < newLines.length && (i >= oldLines.length || !oldLines.slice(i).includes(newLines[j]))) {
                            diffLines.push({ newLine: newLines[j], type: "added" });
                            j++;
                          } else {
                            diffLines.push({ oldLine: oldLines[i], type: "removed" });
                            i++;
                          }
                        }
                        
                        return (
                          <>
                            {/* Left Column: Old version */}
                            <div className="border-r border-glass-border/30 pr-2 space-y-0.5 overflow-x-auto">
                              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold border-b border-glass-border/20 pb-1 mb-1 font-sans">
                                Önceki (v{comparePayload.artifact?.version_number})
                              </div>
                              {diffLines.map((line, idx) => (
                                <div 
                                  key={`old-${idx}`} 
                                  className={`whitespace-pre min-h-[16px] ${
                                    line.type === "removed" ? "bg-corruption-red/15 text-corruption-red pl-1 border-l-2 border-corruption-red" : 
                                    line.type === "added" ? "bg-white/[0.01] text-transparent select-none" : "text-slate-500 opacity-60"
                                  }`}
                                >
                                  {line.oldLine || " "}
                                </div>
                              ))}
                            </div>

                            {/* Right Column: New version */}
                            <div className="pl-2 space-y-0.5 overflow-x-auto">
                              <div className="text-[9px] uppercase tracking-wider text-optic-cyan font-bold border-b border-glass-border/20 pb-1 mb-1 font-sans">
                                Güncel (v{selectedArtifactDetail.artifact?.version_number})
                              </div>
                              {diffLines.map((line, idx) => (
                                <div 
                                  key={`new-${idx}`} 
                                  className={`whitespace-pre min-h-[16px] ${
                                    line.type === "added" ? "bg-emerald-950/25 text-emerald-400 pl-1 border-l-2 border-emerald-500" : 
                                    line.type === "removed" ? "bg-white/[0.01] text-transparent select-none" : "text-slate-300"
                                  }`}
                                >
                                  {line.newLine || " "}
                                </div>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Secure content text viewer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-optic-cyan uppercase font-mono font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-optic-cyan" />
                    Maskelenmiş Güvenli Çıktı
                  </span>

                  <button
                    onClick={() => {
                      const c = selectedArtifactDetail.blob?.content_kind === "json" 
                        ? JSON.stringify(selectedArtifactDetail.blob?.payload_json, null, 2)
                        : (selectedArtifactDetail.blob?.payload_text || "");
                      downloadPayload(
                        selectedArtifactDetail.artifact?.logical_path.split("/").pop() || "dosya_icerigi",
                        c,
                        selectedArtifactDetail.blob?.mime_type || "text/plain"
                      );
                    }}
                    className="p-1 px-2 border border-glass-border hover:border-optic-cyan/40 bg-graphite-dark hover:bg-slate-900 text-slate-300 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                    İndir
                  </button>
                </div>

                <div className="bg-void-black font-mono text-xs rounded-xl border border-glass-border p-3 h-52 overflow-auto text-slate-300 text-left select-all">
                  {selectedArtifactDetail.blob?.content_kind === "json" ? (
                    <pre className="whitespace-pre-wrap leading-relaxed text-[11px]">
                      {JSON.stringify(selectedArtifactDetail.blob?.payload_json, null, 2)}
                    </pre>
                  ) : (
                    <pre className="whitespace-pre-wrap leading-relaxed text-[11px]">
                      {selectedArtifactDetail.blob?.payload_text || "Boş metin içeriği saklanıyor."}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

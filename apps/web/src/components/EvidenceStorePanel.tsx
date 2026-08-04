import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileCheck2, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import type { EvidenceRecordDTO } from "@y/shared";
import {
  fetchEvidenceRecords,
  verifyEvidenceBatch,
  verifyEvidenceRecord,
} from "../lib/api/trust";
import { Badge } from "./primitives/Badge";
import { Button } from "./primitives/Button";
import { Card } from "./primitives/Card";

interface EvidenceStorePanelProps {
  projectId: string;
}

type BadgeTone = "success" | "warning" | "danger" | "info" | "cyan" | "neutral";

function statusTone(status: string): BadgeTone {
  if (status === "verified" || status === "doğrulandı") return "success";
  if (status === "corrupted" || status === "failed" || status === "bozuldu") return "danger";
  if (status === "pending") return "warning";
  return "neutral";
}

export function EvidenceStorePanel({ projectId }: EvidenceStorePanelProps) {
  const [records, setRecords] = useState<EvidenceRecordDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      setRecords(await fetchEvidenceRecords(projectId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kanıt kayıtları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const verifiedCount = useMemo(
    () => records.filter((record) => record.status === "verified").length,
    [records],
  );

  const corruptedCount = useMemo(
    () => records.filter((record) => record.status === "corrupted" || record.status === "failed").length,
    [records],
  );

  const verifyOne = async (id: string) => {
    setVerifyingId(id);
    setError("");
    try {
      await verifyEvidenceRecord(projectId, id);
      await load();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Kanıt bütünlük doğrulaması başarısız oldu.");
    } finally {
      setVerifyingId("");
    }
  };

  const verifyAll = async () => {
    setVerifyingId("batch");
    setError("");
    try {
      await verifyEvidenceBatch(projectId);
      await load();
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Toplu bütünlük doğrulaması başarısız oldu.");
    } finally {
      setVerifyingId("");
    }
  };

  // Integrity Percentage
  const integrityPercent = useMemo(() => {
    if (records.length === 0) return 100;
    return Math.round((verifiedCount / records.length) * 100);
  }, [records, verifiedCount]);

  // Animated Gauge SVG Params
  const radius = 40;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius; // ~251.3
  const strokeDashoffset = useMemo(() => {
    return circumference - (circumference * integrityPercent) / 100;
  }, [integrityPercent, circumference]);

  return (
    <div id="evidence-store-panel" className="space-y-6 font-sans">
      
      {/* Main card panel */}
      <Card glow className="p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3.5 text-left">
            <div className="p-2.5 bg-optic-cyan/10 rounded-lg border border-optic-cyan/20 text-optic-cyan shadow-[0_0_8px_rgba(0,213,255,0.15)]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Kanıt Bütünlüğü İzleme Paneli</h2>
                <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-450 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold uppercase">
                  SHA-256 DOĞRULANDI
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400 max-w-xl">
                Kriptografik adli kanıt kayıt defteri. Denetim sınırları genelinde içeriğin kurcalanmasını saptamak için sha256 bütünlük kontrolü (checksum) kullanır.
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" loading={loading} onClick={() => void load()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Güncelle
            </Button>
            <Button size="sm" loading={verifyingId === "batch"} onClick={() => void verifyAll()}>
              <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Tümünü Doğrula
            </Button>
          </div>
        </div>
      </Card>

      {/* Row: Stats breakdown & Animated Cryptographic Gauge */}
      <div className="grid gap-6 md:grid-cols-12">
        
        {/* Animated Circular Gauge widget */}
        <Card className="md:col-span-4 p-5 flex flex-col items-center justify-center relative overflow-hidden bg-void-black text-center border-glass-border">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,213,255,0.02)_0%,transparent_100%)] pointer-events-none" />
          <span className="text-[10px] text-slate-500 font-mono font-bold tracking-widest uppercase mb-4 text-center">
            KRİPTOGRAFİK SAĞLIK GÖSTERGESİ
          </span>
          
          {/* Radial progress circle */}
          <div className="relative w-36 h-36 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              {/* Outer Glow filter */}
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              
              {/* Background circle track */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-slate-900 fill-transparent"
                strokeWidth={strokeWidth}
              />
              
              {/* Colored progress indicator */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="fill-transparent transition-all duration-1000 ease-out"
                stroke={corruptedCount > 0 ? "#ef4444" : "#10b981"}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                filter={integrityPercent === 100 ? "url(#glow)" : undefined}
                style={{
                  transition: "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)"
                }}
              />
            </svg>
            
            {/* Center percentage output */}
            <div className="absolute flex flex-col items-center justify-center">
              <span className={`text-3xl font-black tracking-tighter font-mono text-glow-${corruptedCount > 0 ? "red" : "green"}`}>
                {integrityPercent}%
              </span>
              <span className="text-[8px] text-slate-550 font-bold uppercase tracking-wider font-mono">
                {corruptedCount > 0 ? "BOZULMUŞ VERİ" : "MÜHÜRLÜ GÜVENLİ"}
              </span>
            </div>
          </div>

          <div className="mt-4 flex gap-4 text-[10px] font-mono text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>{verifiedCount} Doğrulandı</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span>{corruptedCount} Hatalı</span>
            </div>
          </div>
        </Card>

        {/* Detailed counts */}
        <div className="md:col-span-8 grid gap-4 grid-cols-2 lg:grid-cols-3 h-full align-middle">
          <Card className="p-5 flex flex-col justify-center bg-void-black border-glass-border">
            <span className="text-[10px] text-slate-550 font-mono tracking-widest block uppercase font-bold text-left">Kayıt İndeks Sayısı</span>
            <strong className="mt-2 block text-3xl font-black text-white text-left font-mono">{records.length}</strong>
            <span className="text-[9px] text-slate-500 block text-left font-mono mt-1">Toplam aktif mantıksal blok</span>
          </Card>
          
          <Card className="p-5 flex flex-col justify-center bg-void-black border-glass-border">
            <span className="text-[10px] text-slate-550 font-mono tracking-widest block uppercase font-bold text-left">Doğrulanan Kanıtlar</span>
            <strong className="mt-2 block text-3xl font-black text-evidence-green text-left font-mono">{verifiedCount}</strong>
            <span className="text-[9px] text-slate-500 block text-left font-mono mt-1">Doğrulanmış sha256 checksum'ları</span>
          </Card>
          
          <Card className="p-5 flex flex-col justify-center bg-void-black border-glass-border col-span-2 lg:col-span-1">
            <span className="text-[10px] text-slate-550 font-mono tracking-widest block uppercase font-bold text-left">Özet Algoritması</span>
            <strong className="mt-2 block text-lg font-bold text-optic-cyan text-left font-mono">SHA-256 RFC6234</strong>
            <span className="text-[9px] text-slate-550 block text-left font-mono mt-1">Kriptografik bütünlük doğrulaması</span>
          </Card>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-corruption-red/30 bg-corruption-red/10 p-3 text-xs text-corruption-red flex items-center gap-2 font-mono text-left">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Records List ledger */}
      <Card className="p-0 overflow-hidden border-glass-border bg-void-black">
        <div className="divide-y divide-glass-border">
          {!loading && records.length === 0 && (
            <div className="p-10 text-center text-xs text-slate-400 font-mono">
              Bu proje kapsamında kayıtlı kanıt bulunmamaktadır.
            </div>
          )}
          {records.map((record) => (
            <div key={record.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between text-left">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <FileCheck2 className="h-4 w-4 text-optic-cyan" />
                  <span className="text-sm font-semibold text-slate-200 font-mono">{record.evidence_type}</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                    record.status === "verified"
                      ? "bg-evidence-green/10 text-evidence-green border-evidence-green/20"
                      : "bg-corruption-red/10 text-corruption-red border-corruption-red/20"
                  }`}>
                    {record.status === "verified" ? "DOĞRULANDI" : "HATA"}
                  </span>
                </div>
                <div className="mt-2 truncate font-mono text-[10px] text-slate-400 select-all" title={record.content_hash}>
                  CAS İçerik Hash Değeri: <span className="text-slate-200">{record.content_hash}</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500 font-mono">{new Date(record.created_at).toLocaleString()}</div>
              </div>
              <Button variant="command" size="sm" loading={verifyingId === record.id} onClick={() => void verifyOne(record.id)}>
                Özeti Doğrula
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

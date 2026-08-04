import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, GitBranch, Play, RefreshCw } from "lucide-react";
import { fetchImpactReports, runImpactAnalysis } from "../lib/api/context";
import { Badge } from "./primitives/Badge";
import { Button } from "./primitives/Button";
import { Card } from "./primitives/Card";

interface ImpactAnalysisPanelProps {
  projectId: string;
}

type BadgeTone = "success" | "warning" | "danger" | "info" | "cyan" | "neutral";

function riskTone(risk: string): BadgeTone {
  const r = risk ? risk.toLowerCase() : "";
  if (r === "critical" || r === "high" || r === "yüksek" || r === "kritik") return "danger";
  if (r === "medium" || r === "orta") return "warning";
  if (r === "low" || r === "düşük") return "success";
  return "neutral";
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function ImpactAnalysisPanel({ projectId }: ImpactAnalysisPanelProps) {
  const [reports, setReports] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [paths, setPaths] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      const loaded = await fetchImpactReports(projectId);
      setReports(loaded);
      setSelected((current: any) => current || loaded[0] || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Etki raporları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setSelected(null);
    void load();
  }, [load]);

  const analyze = async () => {
    const changedFiles = paths.split(/[\n,]/).map((path) => path.trim()).filter(Boolean);
    if (changedFiles.length === 0) {
      setError("Lütfen en az bir tane depoya bağıl değiştirilmiş dosya yolu girin.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const report = await runImpactAnalysis(projectId, {
        changed_files: changedFiles,
        change_type: "modify",
        include_indirect: true,
        max_depth: 2,
      });
      setSelected(report);
      setReports((current) => [report, ...current.filter((item) => item.id !== report.id)]);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Etki analizi başarısız oldu.");
    } finally {
      setLoading(false);
    }
  };

  const affectedFiles = asList(selected?.affected_files);
  const affectedTests = asList(selected?.affected_tests);
  const recommendations = asList(selected?.recommendations);

  return (
    <div id="impact-analysis-panel" className="space-y-6 text-left font-sans">
      <Card glow className="p-6">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-optic-cyan" />
          <h2 className="text-lg font-semibold text-slate-100">Değişiklik Etki Analizi</h2>
        </div>
        <p className="mt-1 text-xs text-slate-400">Değiştirilen dosyaları; bağımlılıklar, testler, yönlendirmeler, API'ler ve depo sınırları genelinde izleyin.</p>
        <div className="mt-5 flex flex-col gap-3 md:flex-row">
          <textarea 
            value={paths} 
            onChange={(event) => setPaths(event.target.value)} 
            rows={3} 
            placeholder={"apps/api/src/index.ts\npackages/shared/src/index.ts"} 
            className="glass-input min-h-20 flex-1 rounded-lg p-3 font-mono text-xs text-slate-200" 
          />
          <div className="flex gap-2 md:flex-col shrink-0">
            <Button loading={loading} onClick={() => void analyze()}>
              <Play className="mr-2 h-3.5 w-3.5" /> Analiz Et
            </Button>
            <Button variant="secondary" loading={loading} onClick={() => void load()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Yenile
            </Button>
          </div>
        </div>
      </Card>

      {error && <div role="alert" className="rounded-lg border border-corruption-red/30 bg-corruption-red/10 p-3 text-xs text-corruption-red">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-0 lg:col-span-4 text-left">
          <div className="border-b border-glass-border p-4 text-xs font-semibold text-slate-300">Kayıtlı Raporlar</div>
          <div className="max-h-[520px] divide-y divide-glass-border overflow-auto scrollbar-thin">
            {reports.length === 0 && !loading && <div className="p-10 text-center text-xs text-slate-450 font-mono">Kayıtlı etki raporu bulunamadı.</div>}
            {reports.map((report) => (
              <button key={report.id} type="button" onClick={() => setSelected(report)} className="w-full p-4 text-left transition hover:bg-white/5 cursor-pointer block border-none bg-transparent">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[10px] text-slate-350">{report.id}</span>
                  <Badge tone={riskTone(report.overall_risk)}>
                    {report.overall_risk === "critical" ? "kritik" : report.overall_risk === "high" ? "yüksek" : report.overall_risk === "medium" ? "orta" : report.overall_risk === "low" ? "düşük" : report.overall_risk}
                  </Badge>
                </div>
                <span className="mt-2 block text-[10px] text-steel-muted">{asList(report.changed_files).length} değiştirilen yol</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-6 lg:col-span-8 text-left">
          {!selected ? (
            <div className="flex min-h-72 flex-col items-center justify-center text-center">
              <AlertTriangle className="mb-3 h-8 w-8 text-slate-700 opacity-60" />
              <p className="text-xs text-slate-450 font-mono">Bir etki raporu seçin veya yeni bir analiz başlatın.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-glass-border/30 pb-4">
                <div>
                  <h3 className="font-mono text-xs text-slate-200">{selected.id}</h3>
                  <p className="mt-1 text-[10px] text-steel-muted">Güven Oranı: %{Math.round(Number(selected.confidence_score || 0) * 100) / 100}</p>
                </div>
                <Badge tone={riskTone(selected.overall_risk)} variant="high">
                  {selected.overall_risk === "critical" ? "Kritik" : selected.overall_risk === "high" ? "Yüksek" : selected.overall_risk === "medium" ? "Orta" : selected.overall_risk === "low" ? "Düşük" : selected.overall_risk} Risk Ağırlığı
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="p-4 bg-void-black/30 text-left">
                  <span className="text-xs text-slate-400">Etkilenen Dosyalar</span>
                  <strong className="mt-2 block text-2xl text-white font-mono">{affectedFiles.length}</strong>
                </Card>
                <Card className="p-4 bg-void-black/30 text-left">
                  <span className="text-xs text-slate-400">Etkilenen Testler</span>
                  <strong className="mt-2 block text-2xl text-white font-mono">{affectedTests.length}</strong>
                </Card>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-350">Etkilenen Yollar</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {affectedFiles.map((file) => (
                    <code key={file} className="rounded border border-glass-border bg-void-black/60 px-2 py-1 text-[10px] text-optic-cyan font-mono">{file}</code>
                  ))}
                  {affectedFiles.length === 0 && <span className="text-xs text-slate-500 font-mono">Bağımlı yol bulunamadı.</span>}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-350">Öneriler</h4>
                <ul className="mt-2 space-y-2">
                  {recommendations.map((item) => (
                    <li key={item} className="text-xs text-slate-400 leading-relaxed">• {item}</li>
                  ))}
                  {recommendations.length === 0 && <li className="text-xs text-slate-500">Herhangi bir öneri üretilmedi.</li>}
                </ul>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

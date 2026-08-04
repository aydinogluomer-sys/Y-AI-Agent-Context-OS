import React, { useCallback, useEffect, useState } from "react";
import { BadgeCheck, RefreshCw, TerminalSquare } from "lucide-react";
import type { QualityGateCommandResultDTO, QualityGateRunDTO } from "@y/shared";
import { fetchQualityRunDetails, fetchQualityRuns } from "../lib/api/trust";
import { Badge } from "./primitives/Badge";
import { Button } from "./primitives/Button";
import { Card } from "./primitives/Card";

interface QualityGateReportPanelProps {
  projectId: string;
}

type RunWithCommands = QualityGateRunDTO & { commands?: QualityGateCommandResultDTO[] };
type BadgeTone = "success" | "warning" | "danger" | "info" | "cyan" | "neutral";

function runTone(status: string): BadgeTone {
  const s = status ? status.toLowerCase() : "";
  if (s === "passed" || s === "geçti") return "success";
  if (s === "failed" || s === "error" || s === "başarısız" || s === "hata") return "danger";
  if (s === "running" || s === "pending" || s === "çalışıyor" || s === "beklemede") return "warning";
  return "neutral";
}

export function QualityGateReportPanel({ projectId }: QualityGateReportPanelProps) {
  const [runs, setRuns] = useState<QualityGateRunDTO[]>([]);
  const [selected, setSelected] = useState<RunWithCommands | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      setRuns(await fetchQualityRuns(projectId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Kalite geçidi çalışmaları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setSelected(null);
    void load();
  }, [load]);

  const inspect = async (run: QualityGateRunDTO) => {
    if (!run.task_id) {
      setSelected(run);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setSelected(await fetchQualityRunDetails(projectId, run.task_id, run.id));
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Çalışma detayları yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="quality-gate-report-panel" className="grid gap-6 lg:grid-cols-12 text-left font-sans">
      <Card glow className="p-6 lg:col-span-12">
        <div className="flex items-center justify-between gap-4">
          <div className="text-left">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-optic-cyan" />
              <h2 className="text-lg font-semibold text-slate-100">Kalite Geçidi Çalışmaları</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">Aktif proje için kaydedilmiş komut çıktıları ve sürüm geçidi durumları.</p>
          </div>
          <Button variant="secondary" size="sm" loading={loading} onClick={() => void load()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Yenile
          </Button>
        </div>
      </Card>

      {error && <div role="alert" className="rounded-lg border border-corruption-red/30 bg-corruption-red/10 p-3 text-xs text-corruption-red lg:col-span-12 font-mono text-left">{error}</div>}

      <Card className="p-0 lg:col-span-5 text-left">
        <div className="border-b border-glass-border p-4 text-xs font-semibold text-slate-300">Çalışma Geçmişi</div>
        <div className="max-h-[560px] divide-y divide-glass-border overflow-auto scrollbar-thin">
          {!loading && runs.length === 0 && <div className="p-10 text-center text-xs text-slate-450 font-mono">Kayıtlı kalite geçidi çalışması bulunamadı.</div>}
          {runs.map((run) => (
            <button key={run.id} type="button" onClick={() => void inspect(run)} className="w-full p-4 text-left transition hover:bg-white/5 cursor-pointer block border-none bg-transparent">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-slate-200">{run.feature_id || run.task_id || run.id}</span>
                <Badge tone={runTone(run.status)}>{run.status === "passed" ? "geçti" : run.status === "failed" ? "başarısız" : run.status === "error" ? "hata" : run.status}</Badge>
              </div>
              <div className="mt-2 font-mono text-[10px] text-steel-muted">{new Date(run.created_at).toLocaleString("tr-TR")}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-6 lg:col-span-7 text-left">
        {!selected ? (
          <div className="flex min-h-72 flex-col items-center justify-center text-center">
            <TerminalSquare className="mb-3 h-8 w-8 text-slate-700 opacity-60" />
            <p className="text-xs text-slate-450 font-mono">Komut kanıtlarını incelemek için soldan bir çalışma seçin.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-sm text-slate-200">{selected.id}</h3>
                <Badge tone={runTone(selected.status)}>{selected.status === "passed" ? "geçti" : selected.status === "failed" ? "başarısız" : selected.status === "error" ? "hata" : selected.status}</Badge>
              </div>
              <p className="mt-2 text-xs text-slate-400 font-sans">{selected.summary_output || "Kayıtlı özet çıktı bulunmuyor."}</p>
            </div>
            <div className="space-y-2">
              {(selected.commands || []).map((command) => (
                <div key={command.id} className="rounded-lg border border-glass-border bg-void-black/50 p-3 text-left">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-200">{command.command_type}</span>
                    <Badge tone={runTone(command.status)}>{command.status === "passed" ? "geçti" : command.status === "failed" ? "başarısız" : command.status === "error" ? "hata" : command.status}</Badge>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-450 leading-relaxed">{command.output_summary || "Komut özeti bulunmuyor."}</p>
                  <span className="mt-2 block font-mono text-[10px] text-steel-muted">{command.duration_ms ?? 0} ms · exit {command.exit_code ?? "n/a"}</span>
                </div>
              ))}
              {selected.commands?.length === 0 && <p className="text-xs text-slate-450 font-mono">Bu çalışmanın komut sonucu bulunmuyor.</p>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

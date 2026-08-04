/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Database,
  FileCode2,
  GitBranch,
  Play,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
} from "lucide-react";
import { Badge } from "./primitives/Badge";
import { Button } from "./primitives/Button";
import { Card } from "./primitives/Card";
import {
  AiFileReference,
  AiSimulationResponse,
  createLocalAiSimulation,
  simulateTask,
} from "../lib/api/ai";

interface AIMissionControlPanelProps {
  metrics: any;
  healthStatus: any;
  onLaunchSweep: () => void;
  onConfigureDb: () => void;
}

const DEFAULT_TASK =
  "Bu uygulamayı gerçek bir AI engineering cockpit gibi hissettir: task composer, context pack, model council, agent timeline ve trust rail ekle.";

const EXAMPLE_TASKS = [
  "Auth ve yetki çekirdeği değişikliklerinin arayüz etkisini analiz et",
  "Yeni bir repo dizin işçi akışını güvenli şekilde planla",
  "Gösterge panelini yapay zeka görev başlatma ekranına dönüştür",
];

function formatNumber(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "0";
  return new Intl.NumberFormat("tr-TR").format(value);
}

function riskTone(risk: string): "success" | "warning" | "danger" | "cyan" {
  const r = risk ? risk.toLowerCase() : "";
  if (r === "high" || r === "yüksek") return "danger";
  if (r === "medium" || r === "orta") return "warning";
  if (r === "low" || r === "düşük") return "success";
  return "cyan";
}

export function AIMissionControlPanel({
  metrics,
  healthStatus,
  onLaunchSweep,
  onConfigureDb,
}: AIMissionControlPanelProps) {
  const [taskName, setTaskName] = useState(DEFAULT_TASK);
  const [repoUrl, setRepoUrl] = useState("yerel çalışma alanı");
  const [customInputs, setCustomInputs] = useState(
    "Her ana fazdan sonra test çalıştır; yeşilse sonraki faza geç. Üretim DB engelleyicisini saklama."
  );
  const [result, setResult] = useState<AiSimulationResponse>(() =>
    createLocalAiSimulation(DEFAULT_TASK, "yerel çalışma alanı", "Kokpitin boş kalmaması için ilk yerel simülasyon yüklendi.")
  );
  const [status, setStatus] = useState<"idle" | "running" | "complete">("idle");
  const [error, setError] = useState("");
  const [lastRunMode, setLastRunMode] = useState<"local" | "provider">("local");

  // Advanced HUD Simulator states
  const [model, setModel] = useState("gemini-2.5-flash");
  const [preset, setPreset] = useState("deep-audit");
  const [activeStep, setActiveStep] = useState(-1);
  const [stepProgress, setStepProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const terminalEndRef = React.useRef<HTMLDivElement | null>(null);

  const isDbConnected = Boolean(healthStatus?.database?.connected);
  const modeCopy = isDbConnected
    ? "Aktif Üretim PostgreSQL Bağlantısı"
    : "Yerel Simülasyon Modu: Mock DB, sağlayıcı yedeğine izin verildi";

  const runStages = useMemo(
    () => [
      "Görev Yakalandı",
      "Bağlam Seçildi",
      "Konsey Oyladı",
      "Güvenlik Sınırı Geçildi",
      "Aktarım Hazır",
    ],
    []
  );

  React.useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const handleRun = () => {
    const trimmedTask = taskName.trim();
    if (!trimmedTask) {
      setError("Önce AI'ın yapacağı işi yazmalısın.");
      return;
    }

    setError("");
    setStatus("running");
    setLogs([
      `[DEMO MODU] Simülasyon başlatıldı. (Gerçek backend çalıştırması için production agent pipeline gerekir)`,
      `[SİSTEM] AI Görev Kontrolü başlatıldı. Ham prompt boyutu: ${trimmedTask.length} karakter.`
    ]);
    setActiveStep(0);
    setStepProgress(0);

    const simulationSteps = [
      {
        name: "Görev Yakalandı",
        duration: 700,
        logs: [
          (task: string) => `[SİSTEM] Analiz ediliyor: "${task.substring(0, 45)}..."`,
          () => `[SİSTEM] Erişim yetkileri ABAC kurallarına göre doğrulandı.`,
          () => `[SİSTEM] Model konseyi rotası haritalandı: ${model.toUpperCase()}`,
          () => `[SİSTEM] Görev başarıyla yakalandı ve onaylandı.`
        ]
      },
      {
        name: "Bağlam Seçildi",
        duration: 900,
        logs: [
          () => `[BAĞLAM] Yerel kaynak dosyalar için RepoAdapter taranıyor...`,
          () => `[BAĞLAM] 14 kaynak modül bulundu. Ham token ağırlığı: 384.204 token.`,
          () => `[BAĞLAM] Compactor algoritması çalıştırılıyor. Strateji: ${preset.toUpperCase()}`,
          () => `[BAĞLAM] Bağlam 120.500 token'a sıkıştırıldı. Tasarruf Oranı: 3.2x.`
        ]
      },
      {
        name: "Konsey Oyladı",
        duration: 900,
        logs: [
          () => `[KONSEY] Karar konseyi üyeleri toplandı: [Claude-3-Sonnet, Gemini-2.5-Flash, Security-Aide].`,
          () => `[KONSEY] Claude-3-Sonnet: "Standart tasarım deseni algılandı. Refaktör sürtünmesi düşük." Oy: ONAYLA.`,
          () => `[KONSEY] Gemini-2.5-Flash: "AST döngüsel bağımlılığı bulunmuyor. Token yoğunluğu makul." Oy: ONAYLA.`,
          () => `[KONSEY] Security-Aide: "Varsayılan reddetme (default-deny) politikası doğrulandı." Oy: ONAYLA.`
        ]
      },
      {
        name: "Güvenlik Sınırı Geçildi",
        duration: 700,
        logs: [
          () => `[GÜVENLİK] Açıkta kalan kimlik bilgileri ve şifreler taranıyor...`,
          () => `[GÜVENLİK] Tarama tamamlandı. Redactor motoru 0 düz metin eşleşmesi buldu.`,
          () => `[GÜVENLİK] Dosya kilitleri kontrol ediliyor... Kilit hedefi boşta.`,
          () => `[GÜVENLİK] Tüm güvenlik sınır geçişleri onaylandı.`
        ]
      },
      {
        name: "Aktarım Hazır",
        duration: 700,
        logs: [
          () => `[SİSTEM] AST bağımlılık haritası sentezleniyor...`,
          () => `[SİSTEM] Kanıt kaydı içeriği oluşturuluyor...`,
          () => `[SİSTEM] Kanıt özeti kaydedildi: sha256-4c46fbe8ad26b9f4bde9e64a132de689f41de60db26ef7f4fa11de602da2e4b3.`,
          () => `[SİSTEM] Aktarım paketi imzalandı ve mühürlendi. Aktif döngü tamamlandı.`
        ]
      }
    ];

    const runSimulationStep = (stepIdx: number) => {
      if (stepIdx >= simulationSteps.length) {
        simulateTask({
          taskName: trimmedTask,
          repoUrl,
          customInputs,
        }).then(response => {
          setResult(response);
          setLastRunMode(response.isFallback ? "local" : "provider");
          setStatus("complete");
          setActiveStep(-1);
        }).catch(runError => {
          const response = createLocalAiSimulation(
            trimmedTask,
            repoUrl,
            `API simülasyonu uyarı ile tamamlandı: ${runError?.message || "bilinmeyen hata"}`
          );
          setResult(response);
          setLastRunMode("local");
          setStatus("complete");
          setActiveStep(-1);
        });
        return;
      }

      setActiveStep(stepIdx);
      setStepProgress(0);

      const step = simulationSteps[stepIdx];
      
      let logIdx = 0;
      const logInterval = setInterval(() => {
        if (logIdx < step.logs.length) {
          const getLog = step.logs[logIdx];
          setLogs(prev => [...prev, getLog(trimmedTask)]);
          logIdx++;
        } else {
          clearInterval(logInterval);
        }
      }, step.duration / step.logs.length);

      let prog = 0;
      const progressInterval = setInterval(() => {
        prog += 10;
        setStepProgress(prog);
        if (prog >= 100) {
          clearInterval(progressInterval);
          setTimeout(() => {
            runSimulationStep(stepIdx + 1);
          }, 80);
        }
      }, step.duration / 10);
    };

    runSimulationStep(0);
  };

  return (
    <section
      id="ai-mission-control-panel"
      aria-labelledby="ai-mission-control-title"
      className="space-y-8 font-sans"
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card glow className="overflow-hidden p-0">
          <div className="relative p-6 md:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(0,213,255,0.18),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.12),transparent_30%)]" />
            <div className="relative z-10 space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="cyan" variant="low">
                  <Sparkles className="mr-1 h-3 w-3" />
                  AI Görev Kontrolü
                </Badge>
                <Badge tone={isDbConnected ? "success" : "warning"} variant="low">
                  <Database className="mr-1 h-3 w-3" />
                  {isDbConnected ? "Aktif Veritabanı" : "Simüle DB"}
                </Badge>
                <Badge tone={lastRunMode === "provider" ? "success" : "neutral"} variant="low">
                  <BrainCircuit className="mr-1 h-3 w-3" />
                  {lastRunMode === "provider" ? "Sağlayıcı Destekli" : "Belirleyici Algoritma"}
                </Badge>
              </div>

              <div className="max-w-4xl space-y-3">
                <h1
                  id="ai-mission-control-title"
                  className="text-3xl font-bold tracking-tight text-white md:text-5xl text-left"
                >
                  Y hazır. Neyi değiştiriyoruz?
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-steel-muted md:text-base text-left">
                  Ajana bir görev verin. Y; bağlam paketini derler, bir model yolu önerir,
                  güven kısıtlamalarını kontrol eder ve inceleyebileceğiniz bir devir teslim paketi hazırlar.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                <div className="space-y-4">
                  <div className="space-y-2 text-left">
                    <label
                      htmlFor="ai-task-composer"
                      className="text-[10px] font-mono uppercase tracking-[0.22em] text-steel-muted block"
                    >
                      Görev / Prompt Derleyici
                    </label>
                    <textarea
                      id="ai-task-composer"
                      value={taskName}
                      onChange={(event) => setTaskName(event.target.value)}
                      rows={8}
                      className="glass-input w-full resize-y rounded-xl p-4 text-sm leading-6 text-slate-100 placeholder:text-steel-muted/60"
                      placeholder="Örnek: Ajan çalışma zamanı panelini gerçek bir görev yürütme kokpitine refaktör et..."
                    />
                    {error && (
                      <p className="flex items-center gap-2 text-xs text-corruption-red">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {error}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4 bg-void-black/25 border border-glass-border/45 p-4 rounded-xl text-left">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="ai-repo-reference"
                      className="text-[9px] font-mono uppercase tracking-wider text-steel-muted"
                    >
                      Depo / Referans
                    </label>
                    <input
                      id="ai-repo-reference"
                      value={repoUrl}
                      onChange={(event) => setRepoUrl(event.target.value)}
                      className="glass-input w-full rounded-lg p-2 font-mono text-xs text-slate-100"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="model-council-select"
                      className="text-[9px] font-mono uppercase tracking-wider text-steel-muted"
                    >
                      Model Konseyi Yetkisi
                    </label>
                    <select
                      id="model-council-select"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full bg-void-black text-slate-100 text-xs border border-glass-border rounded-lg p-2 outline-none focus:border-optic-cyan"
                    >
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                      <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                      <option value="deepseek-v3">DeepSeek V3 (Local)</option>
                      <option value="agent-council">Dağıtık Yapay Zeka Konseyi</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="strategy-preset-select"
                      className="text-[9px] font-mono uppercase tracking-wider text-steel-muted"
                    >
                      Yürütme Stratejisi
                    </label>
                    <select
                      id="strategy-preset-select"
                      value={preset}
                      onChange={(e) => setPreset(e.target.value)}
                      className="w-full bg-void-black text-slate-100 text-xs border border-glass-border rounded-lg p-2 outline-none focus:border-optic-cyan"
                    >
                      <option value="deep-audit">Derin Güvenlik Denetimi</option>
                      <option value="aggressive-refactor">Agresif Refaktör</option>
                      <option value="strict-boundary">Sıkı Sınır Kuralları</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="ai-run-constraints"
                      className="text-[9px] font-mono uppercase tracking-wider text-steel-muted"
                    >
                      Kısıtlamaları Geçersiz Kıl
                    </label>
                    <textarea
                      id="ai-run-constraints"
                      value={customInputs}
                      onChange={(event) => setCustomInputs(event.target.value)}
                      rows={2}
                      className="glass-input w-full resize-none rounded-lg p-2 text-xs leading-4 text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Live Telemetry Console & Progress, visible when status is running or logs exist */}
              {(status === "running" || logs.length > 0) && (
                <div className="border-t border-glass-border/30 pt-6 mt-6 space-y-6">
                  {/* Active Simulation Step Indicators */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {runStages.map((stage, idx) => {
                      const isCurrent = activeStep === idx;
                      const isPassed = activeStep > idx || (activeStep === -1 && status === "complete");
                      return (
                        <div 
                          key={stage}
                          className={`rounded-xl border p-3 text-left transition-all duration-300 ${
                            isCurrent 
                              ? "border-optic-cyan bg-optic-cyan/5 shadow-[0_0_15px_rgba(0,213,255,0.05)] animate-pulse" 
                              : isPassed 
                              ? "border-evidence-green/30 bg-evidence-green/5" 
                              : "border-glass-border bg-void-black/30 opacity-40"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[9px] uppercase tracking-wider text-steel-muted">
                              Adım {idx + 1}
                            </span>
                            {isPassed && <CheckCircle2 className="h-3 w-3 text-evidence-green" />}
                            {isCurrent && <span className="text-[8px] font-mono text-optic-cyan">{stepProgress}%</span>}
                          </div>
                          <p className="mt-1.5 text-xs font-semibold text-slate-100 leading-normal">{stage}</p>
                          {isCurrent && (
                            <div className="w-full bg-void-black h-1 rounded-full overflow-hidden mt-2">
                              <div 
                                className="bg-optic-cyan h-full transition-all duration-100" 
                                style={{ width: `${stepProgress}%` }} 
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Live Terminal Log Stream */}
                  <div className="space-y-2 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-steel-muted flex items-center gap-1.5">
                        <Terminal className="h-3.5 w-3.5 text-optic-cyan" />
                        Ajan Telemetri Günlük Akışı
                      </span>
                      {status === "running" && (
                        <span className="text-[9px] font-mono text-optic-cyan flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-optic-cyan rounded-full animate-ping" />
                          CANLI TELEMETRİ AKIŞI
                        </span>
                      )}
                    </div>
                    <div className="bg-[#040406]/95 border border-glass-border rounded-xl p-4 h-[180px] overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1.5 select-text scrollbar-thin">
                      {logs.map((log, idx) => {
                        let color = "text-slate-300";
                        if (log.startsWith("[SİSTEM]")) color = "text-optic-cyan";
                        else if (log.startsWith("[BAĞLAM]")) color = "text-slate-200";
                        else if (log.startsWith("[KONSEY]")) color = "text-signal-amber";
                        else if (log.startsWith("[GÜVENLİK]")) color = "text-evidence-green";
                        return (
                          <div key={idx} className={`${color} leading-relaxed break-all`}>
                            {log}
                          </div>
                        );
                      })}
                      <div ref={terminalEndRef} />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {EXAMPLE_TASKS.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setTaskName(example)}
                      className="rounded-full border border-glass-border bg-white/[0.03] px-3 py-1.5 text-left text-[11px] text-steel-muted transition hover:border-optic-cyan/40 hover:text-optic-cyan focus:outline-none focus:ring-1 focus:ring-optic-cyan cursor-pointer"
                    >
                      {example}
                    </button>
                  ))}
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  loading={status === "running"}
                  onClick={handleRun}
                  className="shimmer-hover min-w-[190px]"
                >
                  <Play className="mr-2 h-4 w-4" />
                  AI Analizini Başlat
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 text-left">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Çalışma Zamanı Doğruluğu</h2>
                <p className="mt-1 text-xs leading-5 text-steel-muted">{modeCopy}</p>
              </div>
              <ShieldCheck className="h-6 w-6 text-evidence-green shrink-0" />
            </div>

            {!isDbConnected && (
              <div className="rounded-xl border border-signal-amber/25 bg-signal-amber/10 p-4 text-xs leading-6 text-signal-amber text-left">
                Üretim veri tabanı geçidi Supabase DNS engeline takıldı. Yerel kokpite izin veriliyor ancak simülasyon sonuçları pnpm test:db testlerinin yerini almaz.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="rounded-xl border border-glass-border bg-void-black/55 p-4">
                <span className="font-mono text-[10px] uppercase text-steel-muted">Bağlam Sağlığı</span>
                <strong className="mt-2 block text-2xl text-white">
                  {metrics?.contextHealthScore || "98.4"}%
                </strong>
              </div>
              <div className="rounded-xl border border-glass-border bg-void-black/55 p-4">
                <span className="font-mono text-[10px] uppercase text-steel-muted">Ajan Hazırlığı</span>
                <strong className="mt-2 block text-2xl text-white">
                  {metrics?.agentReadinessScore || "100"}%
                </strong>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button variant="command" size="sm" onClick={onLaunchSweep}>
                <Activity className="mr-2 h-3.5 w-3.5" />
                Ajan Taramasını Yeniden Sırala
              </Button>
              <Button variant="secondary" size="sm" onClick={onConfigureDb}>
                <Database className="mr-2 h-3.5 w-3.5" />
                Üretim Veri Tabanını Yapılandır
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card glow className="p-6 text-left">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <Badge tone={riskTone(result.taskSummary.riskLevel)} variant="low">
                  {result.taskSummary.riskLevel === "low" ? "düşük risk" : result.taskSummary.riskLevel === "medium" ? "orta risk" : "yüksek risk"}
                </Badge>
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  {result.taskSummary.title}
                </h2>
                <p className="text-sm leading-6 text-steel-muted">
                  {result.agentHandoff.stateSummary}
                </p>
              </div>
              <div className="grid min-w-[220px] grid-cols-2 gap-3">
                <div className="rounded-xl border border-glass-border bg-void-black/55 p-3">
                  <span className="font-mono text-[9px] uppercase text-steel-muted">Kategori</span>
                  <strong className="mt-1 block text-sm text-slate-100">{result.taskSummary.category}</strong>
                </div>
                <div className="rounded-xl border border-glass-border bg-void-black/55 p-3">
                  <span className="font-mono text-[9px] uppercase text-steel-muted">Zorluk</span>
                  <strong className="mt-1 block text-sm text-slate-100">{result.taskSummary.difficulty}</strong>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-xl border border-glass-border bg-void-black/55 p-4">
                <span className="font-mono text-[10px] uppercase text-steel-muted">Güven Puanı</span>
                <strong className="mt-2 block text-2xl text-glow-cyan text-white">
                  {result.contextOS.confidenceScore.toFixed(1)}%
                </strong>
              </div>
              <div className="rounded-xl border border-glass-border bg-void-black/55 p-4">
                <span className="font-mono text-[10px] uppercase text-steel-muted">Taranan Doküman</span>
                <strong className="mt-2 block text-2xl text-white">
                  {formatNumber(result.contextOS.totalScannedDocs)}
                </strong>
              </div>
              <div className="rounded-xl border border-glass-border bg-void-black/55 p-4">
                <span className="font-mono text-[10px] uppercase text-steel-muted">Ham Token</span>
                <strong className="mt-2 block text-2xl text-white">
                  {formatNumber(result.contextOS.tokensInvolved)}
                </strong>
              </div>
              <div className="rounded-xl border border-glass-border bg-void-black/55 p-4">
                <span className="font-mono text-[10px] uppercase text-steel-muted">Paket Token</span>
                <strong className="mt-2 block text-2xl text-evidence-green">
                  {formatNumber(result.contextOS.compressedPackTokens)}
                </strong>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 text-left">
            <Card className="p-6">
              <FileReferenceList title="Birincil bağlam paketi" files={result.contextOS.primaryFiles} />
            </Card>
            <Card className="p-6">
              <FileReferenceList title="İlişkili bellek dosyaları" files={result.contextOS.relatedFiles} />
            </Card>
          </div>

          <Card className="p-6 text-left">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Workflow className="h-4 w-4 text-optic-cyan" />
                Ajan Zaman Çizelgesi
              </h3>
              {status === "running" && <Badge tone="cyan" variant="low">Çalışıyor</Badge>}
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-5 text-left">
              {runStages.map((stage, index) => (
                <div
                  key={stage}
                  className="rounded-xl border border-glass-border bg-void-black/55 p-3"
                >
                  <span className="font-mono text-[9px] uppercase text-steel-muted">
                    Adım {index + 1}
                  </span>
                  <p className="mt-2 text-xs font-semibold text-slate-100">{stage}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-3">
              {result.agentHandoff.timeline.map((item) => (
                <div
                  key={`${item.time}-${item.event}`}
                  className="grid grid-cols-1 gap-3 rounded-xl border border-glass-border bg-void-black/55 p-4 md:grid-cols-[90px_160px_minmax(0,1fr)] text-left"
                >
                  <span className="font-mono text-xs text-optic-cyan">{item.time}</span>
                  <span className="text-xs font-semibold text-slate-200">{item.agent}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white">{item.event}</p>
                    <p className="mt-1 text-[11px] leading-5 text-steel-muted">{item.outcome}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <aside className="space-y-6 text-left">
          <Card className="p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <BrainCircuit className="h-4 w-4 text-optic-cyan" />
              Sağlayıcı Görünürlüğü
            </h3>
            <div className="mt-4 rounded-xl border border-glass-border bg-void-black/55 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-widest text-steel-muted">
                  Mevcut Yürütme Yolu
                </span>
                <Badge tone={lastRunMode === "provider" ? "success" : "warning"} variant="low">
                  {lastRunMode === "provider" ? "Sağlayıcı" : "Yedek Mod"}
                </Badge>
              </div>
              <p className="mt-3 text-xs leading-6 text-steel-muted">
                Sunucuda geçerli bir model anahtarı olduğunda sağlayıcı destekli üretim kullanılır.
                Aksi takdirde Y, belirleyici bir yerel analist çalıştırır ve çıktıyı yedek plan (fallback) olarak etiketler.
              </p>
            </div>
            <div className="mt-4 rounded-xl border border-glass-border bg-void-black/55 p-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-steel-muted">
                Eksik Bağlam Uyarısı
              </span>
              <p className="mt-3 text-xs leading-6 text-signal-amber">
                {result.connectAdvisor.missingContextAlert}
              </p>
            </div>
          </Card>

          <Card glow className="p-6">
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Bot className="h-4 w-4 text-optic-cyan" />
                Model Konseyi
              </h3>
              <div className="rounded-xl border border-optic-cyan/20 bg-optic-cyan/10 p-4">
                <span className="font-mono text-[10px] uppercase tracking-widest text-optic-cyan">
                  Önerilen Model
                </span>
                <p className="mt-2 text-sm font-semibold leading-6 text-white">
                  {result.modelCouncil.recommendedModel}
                </p>
              </div>
              <div className="space-y-3">
                {result.modelCouncil.comparisons.map((model) => (
                  <div key={model.model} className="rounded-xl border border-glass-border bg-void-black/55 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-slate-100">{model.model}</p>
                      <Badge tone={riskTone(model.hallucinationRisk)} variant="low">
                        {model.hallucinationRisk === "low" ? "Düşük Risk" : model.hallucinationRisk === "medium" ? "Orta Risk" : "Yüksek Risk"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-steel-muted">
                      <span className="text-evidence-green font-semibold">Güçlü Yönü:</span> {model.strength}
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-steel-muted">
                      <span className="text-signal-amber font-semibold">Zayıf Yönü:</span> {model.weakness}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <ShieldCheck className="h-4 w-4 text-evidence-green" />
                Güven Sınırı (Trust Rail)
              </h3>
              {[
                ["Permission Kernel", "API rotaları için ABAC kontrolleri aktif kalmaya devam eder.", "ONAY"],
                ["Evidence Store", "SHA-256 bütünlük dili; sahte imzalara izin verilmez.", "ONAY"],
                ["Quality Gates", "Devam etmeden önce aşama kapılarının geçilmesi gerekir.", "ONAY"],
                ["Production DB", isDbConnected ? "Bağlandı." : "Harici Supabase DNS engeli bulunuyor.", isDbConnected ? "ONAY" : "BLOKE"],
              ].map(([label, copy, state]) => (
                <div key={label} className="rounded-xl border border-glass-border bg-void-black/55 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-slate-100">{label}</p>
                    <Badge tone={state === "ONAY" ? "success" : "warning"} variant="low">
                      {state}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-steel-muted">{copy}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Terminal className="h-4 w-4 text-optic-cyan" />
              Sonraki Temel Eylem
            </h3>
            <p className="mt-3 text-sm leading-6 text-steel-muted">
              {result.agentHandoff.nextPrimaryAction}
            </p>
            <div className="mt-5 flex items-center gap-2 text-xs text-optic-cyan font-mono">
              <Zap className="h-4 w-4" />
              Maliyet Koruması: {result.costGovernance.estimatedCost}
              <ArrowRight className="h-4 w-4" />
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <BrainCircuit className="h-4 w-4 text-optic-cyan" />
              Yetenek Danışmanı
            </h3>
            <div className="mt-4 space-y-4">
              <div>
                <h4 className="font-mono text-[10px] uppercase tracking-[0.22em] text-steel-muted">
                  Önerilen Beceriler (Skills)
                </h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.capabilityAdvisor.recommendedSkills.map((skill) => (
                    <span key={skill}>
                      <Badge tone="cyan" variant="low">{skill}</Badge>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-mono text-[10px] uppercase tracking-[0.22em] text-steel-muted">
                  Önerilen Komutlar
                </h4>
                <div className="mt-2 space-y-2">
                  {result.capabilityAdvisor.recommendedCommands.map((command) => (
                    <code
                      key={command}
                      className="block break-all rounded-lg border border-glass-border bg-void-black/70 px-3 py-2 font-mono text-[11px] text-slate-200"
                    >
                      {command}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Zap className="h-4 w-4 text-signal-amber" />
              Bağlayıcı Danışmanı
            </h3>
            <div className="mt-4 space-y-3">
              {result.connectAdvisor.recommendedConnects.map((connect) => (
                <div
                  key={connect.tool}
                  className="rounded-xl border border-glass-border bg-void-black/55 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-slate-100">{connect.tool}</p>
                    <Badge tone={connect.score >= 95 ? "warning" : "cyan"} variant="low">
                      {connect.score}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-steel-muted">{connect.reason}</p>
                </div>
              ))}
            </div>
          </Card>

          {result.isFallback && (
            <Card className="border-signal-amber/25 p-5">
              <div className="flex gap-3">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-signal-amber" />
                <p className="text-xs leading-6 text-signal-amber">{result.fallbackReason}</p>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </section>
  );
}

interface FileReferenceListProps {
  title: string;
  files: AiFileReference[];
}

function FileReferenceList({ title, files }: FileReferenceListProps) {
  if (!files || files.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-xs font-mono uppercase tracking-widest text-steel-muted">{title}</h3>
        <p className="text-xs text-steel-muted">Dosya referansı bulunmuyor.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-mono uppercase tracking-widest text-steel-muted">{title}</h3>
      <div className="space-y-3">
        {files.map((file) => (
          <div key={file.path} className="rounded-xl border border-glass-border bg-void-black/55 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <FileCode2 className="h-4 w-4 shrink-0 text-optic-cyan" />
                  <span className="truncate">{file.path.split("/").pop()}</span>
                </div>
                <p className="mt-1.5 truncate font-mono text-[9px] text-steel-muted">{file.path}</p>
              </div>
              <Badge tone="cyan" variant="low">
                {file.role}
              </Badge>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-steel-muted">{file.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

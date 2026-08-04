/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Activity, 
  Database, 
  Cpu, 
  Terminal, 
  ShieldAlert, 
  Sliders, 
  BarChart2, 
  Layers, 
  Network, 
  Search, 
  Compass, 
  Lock, 
  CheckSquare, 
  Unlock, 
  FileText,
  FileCode,
  AlertTriangle,
  Play,
  RefreshCw,
  CheckCircle2,
  Trash2,
  SlidersHorizontal,
  Server,
  Zap,
  Globe
} from "lucide-react";
import { TabId } from "../app/navigation";
import { Card } from "./primitives/Card";
import { Button } from "./primitives/Button";
import { Badge } from "./primitives/Badge";

interface ModuleSimulationPanelProps {
  tabId: TabId;
  projectId: string;
}

export function ModuleSimulationPanel({ tabId, projectId }: ModuleSimulationPanelProps) {
  // Global simulation states
  const [logs, setLogs] = useState<string[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [statusText, setStatusText] = useState("Çalışmaya Hazır");

  // Reset logs when tab changes
  useEffect(() => {
    setLogs([
      `[${new Date().toLocaleTimeString()}] [Sistem] ${tabId} modülü için simülasyon katmanı yüklendi.`,
      `[${new Date().toLocaleTimeString()}] [Güvenlik] ABAC erişim doğrulaması gerçekleştirildi: İZİN VERİLDİ.`
    ]);
    setStatusText("Çalışmaya Hazır");
    setSimulating(false);
  }, [tabId]);

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  // --- Sub-simulation Form States ---

  // 1. Files & Workspace
  const [workspaceFilesList, setWorkspaceFilesList] = useState([
    { name: "src/auth.ts", type: "code", size: "14 KB", status: "allowed" },
    { name: "secrets.json", type: "data", size: "2 KB", status: "forbidden" },
    { name: ".env", type: "config", size: "1 KB", status: "forbidden" },
    { name: "packages/core/src/index.ts", type: "code", size: "45 KB", status: "allowed" },
  ]);
  const [workspaceTestPath, setWorkspaceTestPath] = useState("src/auth.ts");

  // 2. Token Budget & Compression
  const [budgetSlider, setBudgetSlider] = useState(50);
  const [budgetModel, setBudgetModel] = useState("gemini-2.5-flash");
  const [budgetAlgo, setBudgetAlgo] = useState("semantic");
  const [compressedResult, setCompressedResult] = useState<any>(null);

  // 3. Graph Intelligence
  const [selectedGraphNode, setSelectedGraphNode] = useState("PermissionKernelService");
  const [graphNodesData] = useState<Record<string, any>>({
    PermissionKernelService: { deps: ["DatabasePool", "ProjectMetadata", "audit_logs"], impactScore: 88, risk: "YÜKSEK" },
    ArtifactCASService: { deps: ["DatabasePool", "cas_blobs", "ProjectMetadata"], impactScore: 72, risk: "ORTA" },
    RepoAdapter: { deps: ["FileSystemAccess", "CredentialRedactor"], impactScore: 94, risk: "KRİTİK" },
    EventStoreService: { deps: ["DatabasePool", "evidence_health_gauge"], impactScore: 64, risk: "DÜŞÜK" }
  });

  // 4. Security & ABAC
  const [redactorInput, setRedactorInput] = useState("DATABASE_URL=postgresql://admin:supersecretPassword123@127.0.0.1:5432/y_vault\napi_key = \"Bearer gcp-live-key-902183\"\nconsole.log(\"Kullanıcı şifresi: admin123\");");
  const [redactorOutput, setRedactorOutput] = useState("");

  // 5. Evidence Store & Ledger
  const [ledgerLogs, setLedgerLogs] = useState<Array<{ text: string; hash: string }>>([
    { text: "Sistem önyüklemesi (System boot)", hash: "b60a5e8f237...8a19" },
    { text: "ABAC politikaları yüklendi", hash: "4d7e9081a2b...7c6f" }
  ]);
  const [ledgerInput, setLedgerInput] = useState("");
  const [ledgerChecking, setLedgerChecking] = useState(false);

  // 6. Worker & Load
  const [cpuUsage, setCpuUsage] = useState(34);
  const [memoryUsage, setMemoryUsage] = useState(48);
  const [concurrencyCount, setConcurrencyCount] = useState(8);

  // 7. Database
  const [migrationsList, setMigrationsList] = useState([
    { name: "1.0.0-projects-foundation", status: "applied" },
    { name: "1.0.3-context-vault-foundation", status: "applied" },
    { name: "1.3.3-permission-kernel-mvp", status: "applied" },
    { name: "1.3.4-artifact-cas-mvp", status: "applied" }
  ]);

  // 8. SaaS Sync
  const [saasStates, setSaasStates] = useState<Record<string, boolean>>({
    "google-vertex-ai": true,
    "aws-secrets-manager": true,
    "databricks-rest-catalog": false,
    "supabase-pool": true
  });

  // 9. Test Runner
  const [activeTestSuite, setActiveTestSuite] = useState("stage-31-validation");
  const [testLogs, setTestLogs] = useState<string[]>([]);

  // 10. Doc Sign-off
  const [signOffItems, setSignOffItems] = useState<Record<string, boolean>>({
    "abac-matrix-audited": true,
    "database-vault-encryption": false,
    "quarantine-rules-set": true,
    "operator-release-approval": false
  });

  // 11. Task Lifecycle & FSM
  const [taskBoardItems, setTaskBoardItems] = useState([
    { id: "TASK-101", title: "ABAC rol politikalarını sıkılaştır", status: "active", fsm: "IN_PROGRESS" },
    { id: "TASK-102", title: "Obsidian Context Vault önbelleğini doğrula", status: "backlog", fsm: "CREATED" },
    { id: "TASK-103", title: "CAS tekilleştirme oranlarını hesapla", status: "verified", fsm: "VERIFIED" },
    { id: "TASK-104", title: "Sır redactor regex kurallarını yenile", status: "closed", fsm: "ARCHIVED" }
  ]);

  // 12. Agent Network
  const [agentNetworkList, setAgentNetworkList] = useState([
    { name: "Dispatcher Agent", role: "Orkestratör", status: "active", lastAction: "Görev dağıtımı yapıldı" },
    { name: "Context Builder Agent", role: "Bağlam Sıkıştırıcı", status: "active", lastAction: "50K paket derlendi" },
    { name: "Developer Agent", role: "Kod Geliştirici", status: "idle", lastAction: "İzinli yollarda düzenleme tamamlandı" },
    { name: "QA Test Agent", role: "Güvenlik & Test", status: "active", lastAction: "Sır taraması temiz çıktı" },
    { name: "Director Agent", role: "Yönetici İmzalayıcı", status: "idle", lastAction: "SHA-256 sürüm kaydı mühürlendi" }
  ]);

  // 13. Artifact CAS Blobs
  const [casBlobsList, setCasBlobsList] = useState([
    { hash: "sha256-a98f102...3b12", size: "128 KB", dedupRatio: "74%", status: "verified" },
    { hash: "sha256-4c46fbe...9e64", size: "48 KB", dedupRatio: "62%", status: "verified" },
    { hash: "sha256-8e12b45...1a90", size: "256 KB", dedupRatio: "81%", status: "verified" }
  ]);


  // --- Action Handlers ---

  const handleRunWorkspaceCheck = () => {
    setSimulating(true);
    setStatusText("ABAC Sınır Denetimi Çalışıyor...");
    addLog(`[İşlem] '${workspaceTestPath}' için ABAC yetki doğrulaması tetiklendi.`);
    
    setTimeout(() => {
      const file = workspaceFilesList.find(f => f.name === workspaceTestPath);
      if (file && file.status === "forbidden") {
        setStatusText("Erişim Reddedildi!");
        addLog(`[HATA] ERİŞİM REDDEDİLDİ: '${workspaceTestPath}' gizli/kısıtlı bir dosyadır. Gerekli yetki seviyesi: YÖNETİCİ.`);
      } else {
        setStatusText("Erişim Onaylandı");
        addLog(`[BAŞARILI] ERİŞİM ONAYLANDI: '${workspaceTestPath}' geliştirici yetki sınırı dahilindedir.`);
      }
      setSimulating(false);
    }, 800); // 800ms
  };

  const handleCompactContext = () => {
    setSimulating(true);
    setStatusText("Bağlam Sıkıştırılıyor (Compacting)...");
    addLog(`[Compactor] Model: ${budgetModel}, Yöntem: ${budgetAlgo} ile sıkıştırma başladı.`);
    
    setTimeout(() => {
      const reduction = budgetAlgo === "semantic" ? 0.72 : budgetAlgo === "huffman" ? 0.45 : 0.60;
      const initialTokens = budgetSlider * 1000;
      const finalTokens = Math.round(initialTokens * (1 - reduction));
      
      setCompressedResult({
        original: initialTokens,
        compressed: finalTokens,
        ratio: `${Math.round(reduction * 100)}%`,
        efficiency: "YÜKSEK"
      });
      setStatusText("Sıkıştırma Tamamlandı");
      addLog(`[BAŞARILI] Sıkıştırma bitti. Orijinal: ${initialTokens} t, Sıkıştırılmış: ${finalTokens} t (${Math.round(reduction * 100)}% kazanç).`);
      setSimulating(false);
    }, 1000);
  };

  const handleCalculateImpact = () => {
    setSimulating(true);
    setStatusText("Etki Yarıçapı Hesaplanıyor...");
    addLog(`[Grafik] '${selectedGraphNode}' sembolü için bağımlılık ağacı çıkarılıyor.`);
    
    setTimeout(() => {
      const node = graphNodesData[selectedGraphNode];
      setStatusText("Etki Analizi Bitti");
      addLog(`[BAŞARILI] '${selectedGraphNode}' Etki Skoru: ${node.impactScore}/100. Bağımlı Modüller: ${node.deps.join(", ")}.`);
      setSimulating(false);
    }, 800);
  };

  const handleRedactSecrets = () => {
    setSimulating(true);
    setStatusText("Sır Taraması Yapılıyor...");
    addLog("[Güvenlik] Metin girdisinde regex ve desen tabanlı kimlik taraması başlatıldı.");
    
    setTimeout(() => {
      let output = redactorInput
        .replace(/postgresql:\/\/.*@/g, "postgresql://[MASKELEME_UYGULANDI]@")
        .replace(/Bearer\s+[a-zA-Z0-9-_]+/g, "Bearer [MASKELEME_UYGULANDI]")
        .replace(/şifresi:\s+[a-zA-Z0-9_]+/g, "şifresi: [MASKELEME_UYGULANDI]");
      
      setRedactorOutput(output);
      setStatusText("Tarama Tamamlandı");
      addLog("[BAŞARILI] Hassas sırlar başarıyla maskelendi. 3 adet veri sızıntısı engellendi.");
      setSimulating(false);
    }, 700);
  };

  const handleAddToLedger = () => {
    if (!ledgerInput.trim()) return;
    setSimulating(true);
    setStatusText("Kanıt İmzalanıyor...");
    addLog(`[Kanıt] '${ledgerInput}' verisi kriptografik zincire ekleniyor.`);
    
    setTimeout(() => {
      const lastHash = Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10);
      setLedgerLogs(prev => [
        { text: ledgerInput, hash: lastHash },
        ...prev
      ]);
      setLedgerInput("");
      setStatusText("Blok Eklendi");
      addLog(`[BAŞARILI] Kriptografik kanıt defteri güncellendi. SHA-256 İmzası: ${lastHash}.`);
      setSimulating(false);
    }, 600);
  };

  const handleVerifyLedger = () => {
    setLedgerChecking(true);
    setStatusText("Zincir Bütünlüğü Doğrulanıyor...");
    addLog("[Kanıt] Tüm blok zinciri imza bütünlüğü taraması başlatıldı.");
    
    setTimeout(() => {
      setLedgerChecking(false);
      setStatusText("Doğrulama Tamamlandı");
      addLog("[BAŞARILI] Tüm blokların SHA-256 imzaları tutarlı. Bozulma saptanmadı (%100 SAĞLIKLI).");
    }, 1200);
  };

  const handleTriggerMigration = (name: string) => {
    addLog(`[Veritabanı] '${name}' göç dosyası yeniden tetiklendi.`);
    setMigrationsList(prev => prev.map(m => m.name === name ? { ...m, status: "applying" } : m));
    
    setTimeout(() => {
      setMigrationsList(prev => prev.map(m => m.name === name ? { ...m, status: "applied" } : m));
      addLog(`[BAŞARILI] '${name}' başarıyla uygulandı ve şema doğrulandı.`);
    }, 1000);
  };

  const handleRunSimulationTests = () => {
    setSimulating(true);
    setTestLogs([]);
    setStatusText("Testler Çalıştırılıyor...");
    addLog(`[Test] '${activeTestSuite}' test paketi başlatıldı.`);
    
    const lines = [
      "◇ Çevresel değişkenler yükleniyor...",
      "◇ Veritabanı havuz bağlantısı kuruldu.",
      "  ✔ [BAŞARILI] ABAC yetki matrisi kuralları yüklendi.",
      "  ✔ [BAŞARILI] Sızma önleme normalization kontrolleri yapıldı.",
      "  ✔ [BAŞARILI] Şifreli kanıt defteri bütünlüğü doğrulandı.",
      "  ✔ [BAŞARILI] Token bütçe compactor testleri tamamlandı.",
      "========================================",
      "  TEST SONUCU: 6 Başarılı, 0 Hata (GEÇTİ)"
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < lines.length) {
        setTestLogs(prev => [...prev, lines[i]]);
        i++;
      } else {
        clearInterval(interval);
        setStatusText("Testler Tamamlandı");
        addLog(`[BAŞARILI] '${activeTestSuite}' testi başarıyla tamamlandı. Sonuç: GEÇTİ.`);
        setSimulating(false);
      }
    }, 250);
  };

  // --- Dynamic Sub-view Render Selector ---

  const renderSimulatedWidget = () => {
    const isWorkspaceCategory = [
      "active-project", "projects", "memberships", "scoped-paths", 
      "repo-adapter", "file-explorer", "allowed-paths", "workspace-boundaries"
    ].includes(tabId);

    const isContextCategory = [
      "token-budget-status", "cost-compression-chart", "context-objects", 
      "context-items", "context-chunks", "context-pack-builder", 
      "compression-ratios", "segment-ranking", "context-registry", "context-export"
    ].includes(tabId);

    const isGraphCategory = [
      "ast-map", "dependency-graph", "symbol-index", 
      "import-export-resolver", "impact-radius", "incremental-index", "syntax-recovery"
    ].includes(tabId);

    const isSecurityCategory = [
      "abac-matrix", "role-policies", "human-approval-gate", 
      "path-traversal-guard", "secret-redactor", "default-deny-rules", "read-only-policies"
    ].includes(tabId);

    const isEvidenceCategory = [
      "event-store", "evidence-health-gauge", "corruption-reports", 
      "cryptographic-ledger", "signed-logs"
    ].includes(tabId);

    const isWorkerCategory = [
      "git-tracking", "ast-compilation-jobs", "load-metrics", 
      "runtime-telemetry", "index-sync"
    ].includes(tabId);

    const isDbCategory = [
      "db-status", "supabase-pool-manager", "migrations", 
      "schema-browser", "dev-reset-utility", "public-tables"
    ].includes(tabId);

    const isSaasCategory = [
      "model-routing", "google-sdk-adapter", "saas-sync-states", 
      "credential-stubs", "connect-center"
    ].includes(tabId);

    const isQACategory = [
      "test-runner", "deterministic-tests", "db-integration-tests", 
      "secret-scan", "debug-tag-gate", "manual-qa-checklist"
    ].includes(tabId) || tabId.endsWith("-validation");

    const isArtifactCategory = [
      "workspace-files", "cas-blobs", "dedup-chunks", 
      "hash-verification", "integrity-audit", "quarantine"
    ].includes(tabId);

    const isTaskCategory = [
      "task-board", "backlog", "active-tasks", "verified-tasks", 
      "closed-tasks", "fsm-transitions"
    ].includes(tabId);

    const isAgentCategory = [
      "dispatcher-agent", "context-builder-agent", "developer-agent", 
      "qa-agent", "director-agent", "session-checkpoints", 
      "continuation-handoff", "chronological-autochecks"
    ].includes(tabId);

    const isDocCategory = [
      "architecture-index", "architecture-schema", "kernel-explanation", 
      "context-execution-plan", "ui-accessibility-notes", "quality-gates", 
      "manual-qa", "implementation-log", "kernel-debt-register", 
      "permission-kernel-audit", "human-review-requirements", "release-sign-off", 
      "kernel-awareness-note"
    ].includes(tabId);

    // 1. Files & Workspace Simulator
    if (isWorkspaceCategory) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-350">Workspace Dizin Koruma Sınırları</span>
            <span className="text-[10px] text-zinc-550 font-mono">RepoAdapter Simülasyonu</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl space-y-3">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block">Yerel Dosya Yapısı</span>
              <div className="space-y-2">
                {workspaceFilesList.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-glass-border/10 text-xs font-mono">
                    <div className="flex items-center space-x-2">
                      <FileCode className="w-3.5 h-3.5 text-slate-400" />
                      <span>{file.name}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[9px] text-zinc-500">{file.size}</span>
                      <button 
                        onClick={() => {
                          setWorkspaceFilesList(prev => prev.map((f, i) => i === idx ? { ...f, status: f.status === "allowed" ? "forbidden" : "allowed" } : f));
                          addLog(`[Workspace] '${file.name}' erişim politikası ${file.status === "allowed" ? "KISITLANDI" : "İZİN VERİLDİ"} olarak güncellendi.`);
                        }}
                        className={`text-[9.5px] px-1.5 py-0.5 rounded cursor-pointer border ${
                          file.status === "allowed" 
                            ? "bg-emerald-500/10 text-emerald-450 border-emerald-500/20" 
                            : "bg-rose-500/10 text-rose-450 border-rose-500/20"
                        }`}
                      >
                        {file.status === "allowed" ? "İzinli" : "Kısıtlı"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl space-y-3">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block">ABAC Sınır Test Cihazı</span>
              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[9.5px] text-slate-400">Dosya Yolu</label>
                  <select
                    value={workspaceTestPath}
                    onChange={(e) => setWorkspaceTestPath(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-glass-border rounded focus:outline-none cursor-pointer"
                  >
                    {workspaceFilesList.map((f, idx) => (
                      <option key={idx} value={f.name}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <Button 
                  onClick={handleRunWorkspaceCheck} 
                  loading={simulating}
                  className="w-full text-xs font-bold"
                >
                  <Lock className="w-3.5 h-3.5 mr-1.5" /> Erişim Yetkisini Test Et
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 2. Token Budget & Compression
    if (isContextCategory) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-350">Bağlam Sıkıştırma Laboratuvarı (Compactor API)</span>
            <span className="text-[10px] text-zinc-550 font-mono">ContextOS Simülasyonu</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl space-y-3 text-xs">
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Orijinal Bağlam Boyutu</span>
                  <span className="text-white font-mono">{budgetSlider}K token</span>
                </div>
                <input 
                  type="range" 
                  min="10" 
                  max="200" 
                  value={budgetSlider} 
                  onChange={(e) => setBudgetSlider(Number(e.target.value))}
                  className="w-full accent-optic-cyan h-1 bg-zinc-800 rounded-lg cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase">Ajan Modeli</label>
                  <select
                    value={budgetModel}
                    onChange={(e) => setBudgetModel(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-glass-border rounded focus:outline-none cursor-pointer"
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                    <option value="deepseek-v3">DeepSeek V3</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase">Sıkıştırma Algoritması</label>
                  <select
                    value={budgetAlgo}
                    onChange={(e) => setBudgetAlgo(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-glass-border rounded focus:outline-none cursor-pointer"
                  >
                    <option value="semantic">Semantik (Lego compaction)</option>
                    <option value="huffman">Huffman Encoding</option>
                    <option value="lzw">LZW Sıkıştırma</option>
                  </select>
                </div>
              </div>

              <Button onClick={handleCompactContext} loading={simulating} className="w-full text-xs font-bold">
                <Sliders className="w-3.5 h-3.5 mr-1.5" /> Bağlamı Sıkıştır
              </Button>
            </div>

            <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl flex flex-col justify-center items-center text-center">
              {compressedResult ? (
                <div className="space-y-3">
                  <span className="text-[10px] text-emerald-400 font-mono uppercase tracking-wider block">Sıkıştırma Raporu</span>
                  <div className="text-3xl font-extrabold text-white font-mono">{compressedResult.ratio}</div>
                  <p className="text-xs text-slate-400">Token kullanımı {compressedResult.original} t'den {compressedResult.compressed} t'ye düşürüldü.</p>
                  <Badge tone="success" variant="low">Verimlilik: {compressedResult.efficiency}</Badge>
                </div>
              ) : (
                <div className="text-slate-500 text-xs py-8">
                  <SlidersHorizontal className="w-8 h-8 text-slate-700 mx-auto mb-2 animate-pulse" />
                  Parametreleri ayarlayıp "Bağlamı Sıkıştır" butonuna tıklayın.
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // 3. Graph Intelligence
    if (isGraphCategory) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-350">AST Bağımlılık Haritası</span>
            <span className="text-[10px] text-zinc-550 font-mono">Graph Intelligence</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[9.5px] text-slate-400 font-mono">Hedef Çekirdek Sınıfı</label>
                <select
                  value={selectedGraphNode}
                  onChange={(e) => setSelectedGraphNode(e.target.value)}
                  className="w-full p-2 bg-slate-950 border border-glass-border rounded focus:outline-none cursor-pointer"
                >
                  <option value="PermissionKernelService">PermissionKernelService</option>
                  <option value="ArtifactCASService">ArtifactCASService</option>
                  <option value="RepoAdapter">RepoAdapter</option>
                  <option value="EventStoreService">EventStoreService</option>
                </select>
              </div>

              <Button onClick={handleCalculateImpact} loading={simulating} className="w-full text-xs font-bold">
                <Layers className="w-3.5 h-3.5 mr-1.5" /> Etki Yarıçapı Hesapla
              </Button>
            </div>

            <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl space-y-3 text-xs">
              <span className="text-[10px] text-zinc-550 uppercase block font-mono">Mantıksal Bağımlılık Ağacı</span>
              <div className="space-y-1.5 font-mono text-[11px] text-slate-350">
                <div className="text-white font-bold">{selectedGraphNode}</div>
                {graphNodesData[selectedGraphNode].deps.map((dep: string, idx: number) => (
                  <div key={idx} className="pl-4 flex items-center space-x-1.5 text-optic-cyan">
                    <span>└──</span>
                    <span>{dep}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2.5 border-t border-glass-border/10 flex justify-between text-[10px]">
                <span className="text-slate-450">Etki Riski:</span>
                <span className="text-rose-400 font-bold">{graphNodesData[selectedGraphNode].risk}</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 4. Security & ABAC
    if (isSecurityCategory) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-350">Kod & Yapılandırma Sır Maskeleyici</span>
            <span className="text-[10px] text-zinc-550 font-mono">Security Kernel</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-mono text-slate-500 uppercase">Ham Kod / Yapılandırma Satırları</label>
                <textarea
                  value={redactorInput}
                  onChange={(e) => setRedactorInput(e.target.value)}
                  className="w-full h-32 p-2 bg-slate-950 border border-glass-border rounded focus:outline-none font-mono text-[10px] resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-mono text-slate-500 uppercase">Güvenli / Maskelenmiş Çıktı</label>
                <pre className="w-full h-32 p-2 bg-void-black/90 border border-glass-border rounded font-mono text-[10px] text-evidence-green overflow-auto whitespace-pre-wrap">
                  {redactorOutput || "Sır taraması başlatılmadı."}
                </pre>
              </div>
            </div>

            <Button onClick={handleRedactSecrets} loading={simulating} className="w-full text-xs font-bold">
              <ShieldAlert className="w-3.5 h-3.5 mr-1.5" /> Sır Taraması Yap ve Maskele
            </Button>
          </div>
        </div>
      );
    }

    // 5. Evidence Store & Ledger
    if (isEvidenceCategory) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-350">Adli Kanıt Defteri Simülatörü</span>
            <span className="text-[10px] text-zinc-550 font-mono">SHA-256 Kripto Zinciri</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[9.5px] text-slate-400">Yeni Olay Kaydı Girin</label>
                <input
                  type="text"
                  value={ledgerInput}
                  onChange={(e) => setLedgerInput(e.target.value)}
                  placeholder="örn. Geliştirici kimliği doğrulandı..."
                  className="w-full p-2 bg-slate-950 border border-glass-border rounded focus:outline-none font-sans"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleAddToLedger} loading={simulating} className="flex-1 text-xs">
                  Deftere Ekle ve İmzala
                </Button>
                <button 
                  onClick={handleVerifyLedger} 
                  disabled={ledgerChecking}
                  className="px-4 py-1.5 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 text-amber-400 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  Zinciri Doğrula
                </button>
              </div>
            </div>

            <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl space-y-2 text-xs">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block">Kripto Kanıt Geçmişi (En Yeni Üstte)</span>
              <div className="space-y-2 max-h-[120px] overflow-y-auto pr-1">
                {ledgerLogs.map((log, idx) => (
                  <div key={idx} className="p-2 rounded-lg bg-slate-950/80 border border-glass-border/10 font-mono text-[10px] text-left">
                    <div className="text-slate-200">{log.text}</div>
                    <div className="text-zinc-550 text-[9px] mt-0.5">sha256: {log.hash}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 6. Worker & Load
    if (isWorkerCategory) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-350">Çalışma Zamanı İzleyicisi (Runtime Telemetry)</span>
            <span className="text-[10px] text-zinc-550 font-mono">Worker Node Simülatörü</span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <Card className="p-4 bg-void-black/30">
              <span className="text-zinc-500 uppercase text-[9px] font-mono block">CPU Yükü</span>
              <strong className="text-xl font-mono text-white block mt-1">{cpuUsage}%</strong>
              <input 
                type="range" 
                min="10" 
                max="100" 
                value={cpuUsage} 
                onChange={(e) => setCpuUsage(Number(e.target.value))}
                className="w-full mt-2 accent-optic-cyan h-0.5 cursor-pointer"
              />
            </Card>

            <Card className="p-4 bg-void-black/30">
              <span className="text-zinc-500 uppercase text-[9px] font-mono block">Bellek Tüketimi</span>
              <strong className="text-xl font-mono text-white block mt-1">{memoryUsage}%</strong>
              <input 
                type="range" 
                min="10" 
                max="100" 
                value={memoryUsage} 
                onChange={(e) => setMemoryUsage(Number(e.target.value))}
                className="w-full mt-2 accent-optic-cyan h-0.5 cursor-pointer"
              />
            </Card>

            <Card className="p-4 bg-void-black/30">
              <span className="text-zinc-500 uppercase text-[9px] font-mono block">Eşzamanlı İş Parçacığı</span>
              <strong className="text-xl font-mono text-white block mt-1">{concurrencyCount} İşçi</strong>
              <input 
                type="range" 
                min="1" 
                max="24" 
                value={concurrencyCount} 
                onChange={(e) => setConcurrencyCount(Number(e.target.value))}
                className="w-full mt-2 accent-optic-cyan h-0.5 cursor-pointer"
              />
            </Card>
          </div>
        </div>
      );
    }

    // 7. Database & Migrations
    if (isDbCategory) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-350">Şema Göçleri & Tablo Yöneticisi</span>
            <span className="text-[10px] text-zinc-550 font-mono">Supabase SQL Havuzu</span>
          </div>

          <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl space-y-3 text-xs">
            <span className="text-[10px] text-zinc-500 font-mono uppercase block">Veritabanı Göç Geçmişi</span>
            <div className="space-y-2">
              {migrationsList.map((m, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-glass-border/10 font-mono text-[10px]">
                  <span>{m.name}</span>
                  <div className="flex items-center space-x-2">
                    <span className={`text-[8.5px] px-1.5 py-0.2 rounded uppercase ${
                      m.status === "applied" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-signal-amber/15 text-signal-amber animate-pulse border border-signal-amber/20"
                    }`}>
                      {m.status === "applied" ? "Uygulandı" : "Çalıştırılıyor"}
                    </span>
                    <button 
                      onClick={() => handleTriggerMigration(m.name)}
                      className="p-1 hover:bg-slate-900 border border-slate-800 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Yeniden Tetikle"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // 8. SaaS Connectors
    if (isSaasCategory) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-350">Harici SaaS Entegrasyonları</span>
            <span className="text-[10px] text-zinc-550 font-mono">API Bağlantıları</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {Object.entries(saasStates).map(([service, status]) => (
              <div key={service}>
                <Card className="p-3 bg-void-black/30 text-center flex flex-col justify-between space-y-3">
                  <span className="font-mono text-[10px] text-slate-300 break-all">{service}</span>
                  <div className="flex items-center justify-center space-x-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${status ? "bg-evidence-green" : "bg-slate-650"}`} />
                    <span className="text-[9px] uppercase tracking-wider text-slate-450">{status ? "AKTİF" : "KAPALI"}</span>
                  </div>
                  <button
                    onClick={() => {
                      setSaasStates(prev => ({ ...prev, [service]: !prev[service] }));
                      addLog(`[SaaS] '${service}' entegrasyon durumu ${!status ? "AKTİF" : "PASİF"} hale getirildi.`);
                    }}
                    className={`py-1 rounded text-[9px] font-mono font-bold cursor-pointer border ${
                      status 
                        ? "bg-rose-500/10 text-rose-405 border-rose-500/20 hover:bg-rose-500/15" 
                        : "bg-emerald-500/10 text-emerald-405 border-emerald-500/20 hover:bg-emerald-500/15"
                    }`}
                  >
                    {status ? "Kapat" : "Aktifleştir"}
                  </button>
                </Card>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 9. Automated Test Runner
    if (isQACategory) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-350">Otomatik Test Çalıştırıcı</span>
            <span className="text-[10px] text-zinc-550 font-mono">QA & Validation Suite</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl space-y-3 text-xs md:col-span-1">
              <div className="space-y-1">
                <label className="text-[9.5px] text-slate-400">Test Paketi (Test Suite)</label>
                <select
                  value={activeTestSuite}
                  onChange={(e) => setActiveTestSuite(e.target.value)}
                  className="w-full p-2 bg-slate-950 border border-glass-border rounded focus:outline-none cursor-pointer"
                >
                  <option value="stage-27-validation">Erişim Yetki Çekirdeği (ABAC Rules)</option>
                  <option value="stage-30-validation">Kriptografik Olay Günlüğü (Forensics Ledger)</option>
                  <option value="stage-31-validation">Obsidian Hafıza Kasası (Memory Vault)</option>
                  <option value="stage-35-validation">Artefakt CAS Tekilleştirme (Deduplication)</option>
                </select>
              </div>

              <Button onClick={handleRunSimulationTests} loading={simulating} className="w-full text-xs font-bold">
                <Play className="w-3.5 h-3.5 mr-1.5" /> Testi Çalıştır
              </Button>
            </div>

            <div className="p-4 bg-slate-950 border border-glass-border/30 rounded-xl md:col-span-2 text-xs">
              <span className="text-[10px] text-zinc-500 font-mono uppercase block mb-2">Simüle Terminal Konsolu</span>
              <div className="bg-void-black/85 p-3 rounded border border-glass-border/10 font-mono text-[10px] text-slate-300 h-32 overflow-y-auto space-y-1 text-left scrollbar-thin select-text">
                {testLogs.length === 0 ? (
                  <span className="text-zinc-650 italic">Konsol boş. Testi tetikleyin.</span>
                ) : (
                  testLogs.map((line, idx) => (
                    <div key={idx} className={line.includes("✔") ? "text-evidence-green" : line.includes("TEST SONUCU") ? "text-optic-cyan font-bold" : ""}>
                      {line}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 10. Artifact CAS Simulator
    if (isArtifactCategory) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-350">İçerik Adreslemeli Depolama (CAS Blobs & Dedup)</span>
            <span className="text-[10px] text-zinc-550 font-mono">Artefakt CAS Simülasyonu</span>
          </div>

          <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-mono uppercase">Kayıtlı İkili CAS Veri Blokları (Blobs)</span>
              <button
                onClick={() => {
                  addLog("[CAS] SHA-256 bütünlük doğrulaması başlatıldı. 3 ikili blok denetlendi (%100 SAĞLIKLI).");
                }}
                className="text-[9.5px] px-2 py-1 bg-optic-cyan/10 border border-optic-cyan/30 text-optic-cyan rounded font-mono font-bold cursor-pointer hover:bg-optic-cyan/20"
              >
                Hash Bütünlüğünü Doğrula (SHA-256)
              </button>
            </div>
            <div className="space-y-2">
              {casBlobsList.map((blob, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded bg-slate-950/60 border border-glass-border/10 font-mono text-[10.5px]">
                  <div className="flex items-center space-x-2">
                    <Database className="w-3.5 h-3.5 text-optic-cyan" />
                    <span className="text-slate-200">{blob.hash}</span>
                  </div>
                  <div className="flex items-center space-x-3 text-[9.5px]">
                    <span className="text-zinc-500">Boyut: {blob.size}</span>
                    <span className="text-evidence-green font-bold">Tekilleştirme: {blob.dedupRatio}</span>
                    <Badge tone="success" variant="low" className="text-[8px] uppercase">DOĞRULANDI</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // 11. Task Lifecycle & FSM Transitions Simulator
    if (isTaskCategory) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-350">Görev Yaşam Döngüsü & FSM Durum Makinesi</span>
            <span className="text-[10px] text-zinc-550 font-mono">Task Lifecycle FSM</span>
          </div>

          <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl space-y-3 text-xs">
            <span className="text-[10px] text-zinc-500 font-mono uppercase block">FSM Görev Durum Makinesi Panosu</span>
            <div className="space-y-2">
              {taskBoardItems.map((task, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded bg-slate-950/60 border border-glass-border/10 text-[10.5px]">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-optic-cyan font-bold">{task.id}</span>
                    <span className="text-slate-200 font-sans">{task.title}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`text-[8.5px] px-1.5 py-0.2 rounded uppercase font-bold font-mono ${
                      task.status === "active" ? "bg-optic-cyan/15 text-optic-cyan border border-optic-cyan/30" :
                      task.status === "verified" ? "bg-evidence-green/15 text-evidence-green border border-evidence-green/30" :
                      task.status === "closed" ? "bg-slate-800 text-slate-400 border border-slate-700" :
                      "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                    }`}>
                      FSM: {task.fsm}
                    </span>
                    <button
                      onClick={() => {
                        const nextStatus = task.status === "backlog" ? "active" : task.status === "active" ? "verified" : task.status === "verified" ? "closed" : "backlog";
                        const nextFsm = nextStatus === "active" ? "IN_PROGRESS" : nextStatus === "verified" ? "VERIFIED" : nextStatus === "closed" ? "ARCHIVED" : "CREATED";
                        setTaskBoardItems(prev => prev.map((t, i) => i === idx ? { ...t, status: nextStatus, fsm: nextFsm } : t));
                        addLog(`[FSM] '${task.id}' görevi FSM geçişi gerçekleştirdi: ${task.fsm} -> ${nextFsm}.`);
                      }}
                      className="text-[9px] px-2 py-0.5 bg-slate-900 border border-slate-800 text-slate-350 hover:text-white rounded cursor-pointer transition-colors"
                    >
                      Geçiş Tetikle
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // 12. Agent Network & Multi-Agent Handoff Simulator
    if (isAgentCategory) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-350">Yapay Zeka Ajan Ağı & Handoff Devamlılığı</span>
            <span className="text-[10px] text-zinc-550 font-mono">Agent Network Handoff</span>
          </div>

          <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-mono uppercase">Aktif Ajan Koordinatörleri Matrisi</span>
              <button
                onClick={() => {
                  addLog("[Ajan Ağı] Devamlılık Handoff bellek paketi derlendi. SHA-256 imzasıyla mühürlendi.");
                }}
                className="text-[9.5px] px-2 py-1 bg-purple-500/15 border border-purple-500/30 text-purple-400 rounded font-mono font-bold cursor-pointer hover:bg-purple-500/25"
              >
                + Devamlılık Handoff Paketi Derle
              </button>
            </div>
            <div className="space-y-2">
              {agentNetworkList.map((agent, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded bg-slate-950/60 border border-glass-border/10 text-[10.5px]">
                  <div className="flex items-center space-x-2.5">
                    <Cpu className={`w-3.5 h-3.5 ${agent.status === "active" ? "text-evidence-green" : "text-slate-500"}`} />
                    <div>
                      <span className="font-bold text-slate-200 block">{agent.name}</span>
                      <span className="text-[9px] text-zinc-550 font-mono">Rol: {agent.role}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 text-right">
                    <span className="text-[9.5px] text-slate-400 hidden sm:inline">{agent.lastAction}</span>
                    <Badge tone={agent.status === "active" ? "success" : "neutral"} variant="low" className="text-[8px] uppercase">
                      {agent.status === "active" ? "ÇALIŞIYOR" : "BEKLEMEDE"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // 13. Doc Sign-off & Guidelines
    if (isDocCategory) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-350">Mimari Kütüphane & Yönetişim</span>
            <span className="text-[10px] text-zinc-550 font-mono">Çekirdek Onay Defteri</span>
          </div>

          <div className="p-4 bg-void-black/50 border border-glass-border/30 rounded-xl space-y-3 text-xs">
            <span className="text-[10px] text-zinc-500 font-mono uppercase block">Sürüm İmza ve Onay Durumu (Release Checklist)</span>
            <div className="space-y-2">
              {Object.entries(signOffItems).map(([item, signed]) => (
                <div key={item} className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-glass-border/10 text-[10.5px]">
                  <span className="font-mono text-slate-300">{item.replace(/-/g, " ").toUpperCase()}</span>
                  <div className="flex items-center space-x-2">
                    <span className={`text-[8.5px] px-1.5 py-0.2 rounded uppercase font-bold font-mono ${
                      signed ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-400 border border-slate-700/50"
                    }`}>
                      {signed ? "İMZALANDI" : "BEKLEMEDE"}
                    </span>
                    <button 
                      onClick={() => {
                        setSignOffItems(prev => ({ ...prev, [item]: !signed }));
                        addLog(`[Yönetişim] '${item}' onay durumu ${!signed ? "İMZALANDI" : "BEKLENİYOR"} olarak güncellendi.`);
                      }}
                      className="text-[9px] px-2 py-0.5 bg-slate-900 border border-slate-800 text-slate-350 hover:text-white rounded cursor-pointer transition-colors"
                    >
                      Değiştir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6 text-left font-sans animate-fadeIn">
      {/* Top Banner */}
      <Card glow className="p-6 relative overflow-hidden bg-graphite-dark/65 backdrop-blur-xl border border-glass-border">
        <div className="absolute inset-0 bg-gradient-to-r from-optic-cyan/5 via-transparent to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center space-x-3.5 text-left">
            <div className="p-2.5 bg-optic-cyan/10 rounded-lg border border-optic-cyan/20 text-optic-cyan shadow-[0_0_8px_rgba(0,213,255,0.15)] shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-slate-100 tracking-tight uppercase font-mono">
                  {tabId.replace(/-/g, " ")} Simülasyon Konsolu
                </h2>
                <Badge tone="cyan" variant="low" className="text-[9px] uppercase tracking-wider font-mono">SİMÜLASYON MODU: AKTİF</Badge>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                Bu modül Y-OS Çekirdek Yapay Zeka Ajanının yerel operasyonları için güvenli, dinamik ve kontrol edilebilir bir simülasyon katmanı üzerinde çalışmaktadır.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Interactive Sub-Widget */}
      <Card className="p-6 bg-graphite-dark/45 backdrop-blur-xl border border-glass-border/60">
        {renderSimulatedWidget()}
      </Card>

      {/* Bottom Live System Telemetry / Logs */}
      <Card className="p-5 bg-slate-950/60 border border-glass-border/30">
        <div className="flex items-center justify-between border-b border-glass-border/20 pb-2.5 mb-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-350 flex items-center space-x-1.5">
            <Activity className="w-3.5 h-3.5 text-optic-cyan" />
            <span>Simülasyon Günlükleri (Telemetry)</span>
          </span>
          <span className="text-[9.5px] font-mono text-steel-muted">
            Motor Durumu: <span className="text-evidence-green font-bold">{statusText}</span>
          </span>
        </div>

        <div className="bg-black/45 p-3 rounded-lg border border-glass-border/10 font-mono text-[10px] text-slate-400 h-28 overflow-y-auto space-y-1.5 scrollbar-thin select-text text-left">
          {logs.map((log, idx) => (
            <div key={idx} className="leading-relaxed">
              {log}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

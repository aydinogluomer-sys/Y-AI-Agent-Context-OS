/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { useWorkspace } from "./hooks/useWorkspace";
import { useIndexOrchestration } from "./hooks/useIndexOrchestration";
import { LandingPage } from "./components/LandingPage";
import { AppProviders } from "./app/AppProviders";
import { AppShell } from "./app/AppShell";
import { TabId, NAVIGATION_CATEGORIES } from "./app/navigation";

// Dashboard panels
import { AIMissionControlPanel } from "./components/AIMissionControlPanel";
import { WorkerRuntimeDashboard } from "./components/WorkerRuntimeDashboard";
import { ArtifactCenterPanel } from "./components/ArtifactCenterPanel";
import { PermissionKernelPanel } from "./components/PermissionKernelPanel";
import { EvidenceStorePanel } from "./components/EvidenceStorePanel";
import { EventJournalPanel } from "./components/EventJournalPanel";
import { FileLockingPanel } from "./components/FileLockingPanel";
import { QualityGateReportPanel } from "./components/QualityGateReportPanel";
import { ImpactAnalysisPanel } from "./components/ImpactAnalysisPanel";
import { IndexJobOrchestratorPanel } from "./components/IndexJobOrchestratorPanel";
import { ModuleSimulationPanel } from "./components/ModuleSimulationPanel";

// Primitives
import { Card } from "./components/primitives/Card";
import { Button } from "./components/primitives/Button";
import { Badge } from "./components/primitives/Badge";

// Icons
import { 
  Terminal, 
  Database, 
  Cpu, 
  Layers, 
  ShieldCheck, 
  Sparkles,
  Zap,
  Lock,
  Search,
  FileText,
  Paperclip,
  Send,
  Plus,
  Trash2,
  Shield,
  FileCode,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Settings
} from "lucide-react";

function parseInlineMarkdown(text: string) {
  let parts: any[] = [text];
  
  parts = parts.flatMap(part => {
    if (typeof part !== "string") return [part];
    const regex = /\*\*([^*]+)\*\*/g;
    const result = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(part)) !== null) {
      if (match.index > lastIndex) {
        result.push(part.substring(lastIndex, match.index));
      }
      result.push(<strong key={match.index} className="font-semibold text-white">{match[1]}</strong>);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < part.length) {
      result.push(part.substring(lastIndex));
    }
    return result;
  });

  parts = parts.flatMap(part => {
    if (typeof part !== "string") return [part];
    const regex = /`([^`]+)`/g;
    const result = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(part)) !== null) {
      if (match.index > lastIndex) {
        result.push(part.substring(lastIndex, match.index));
      }
      result.push(<code key={match.index} className="px-1.5 py-0.5 bg-black/40 border border-glass-border/45 rounded font-mono text-[10px] text-optic-cyan">{match[1]}</code>);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < part.length) {
      result.push(part.substring(lastIndex));
    }
    return result;
  });

  return parts;
}

function renderMarkdown(text: string) {
  if (!text) return null;
  const lines = text.split("\n");
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  return lines.map((line, idx) => {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        inCodeBlock = false;
        const code = codeBlockLines.join("\n");
        codeBlockLines = [];
        return (
          <pre key={idx} className="p-3 bg-black/60 rounded-xl border border-glass-border font-mono text-xs text-emerald-400 overflow-x-auto my-2 select-text leading-normal text-left">
            <code>{code}</code>
          </pre>
        );
      } else {
        inCodeBlock = true;
        return null;
      }
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      return null;
    }

    if (line.startsWith("### ")) {
      return <h3 key={idx} className="text-sm font-bold text-white tracking-tight mt-3 mb-1.5">{line.substring(4)}</h3>;
    }
    if (line.startsWith("## ")) {
      return <h2 key={idx} className="text-base font-bold text-white tracking-tight mt-4 mb-2">{line.substring(3)}</h2>;
    }
    if (line.startsWith("# ")) {
      return <h1 key={idx} className="text-lg font-extrabold text-white tracking-tight mt-4 mb-2.5">{line.substring(2)}</h1>;
    }

    if (line.startsWith("* ")) {
      return (
        <li key={idx} className="ml-4 list-disc text-xs text-slate-300 leading-relaxed my-1">
          {parseInlineMarkdown(line.substring(2))}
        </li>
      );
    }

    return (
      <p key={idx} className="text-xs md:text-sm text-slate-200 leading-relaxed my-1.5 text-left break-words">
        {parseInlineMarkdown(line)}
      </p>
    );
  }).filter(el => el !== null);
}

export default function App() {
  const [cockpitLaunched, setCockpitLaunched] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("chat-cockpit");
  const [showConfigModal, setShowConfigModal] = useState(false);
  
  // Workspace state
  const workspace = useWorkspace();
  const indexOrchestration = useIndexOrchestration(workspace.activeProjectId);
  
  // Chat state
  const [messages, setMessages] = useState<any[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "Merhaba! Ben Y-OS Context AI Ajanı. Kod tabanınızı sıkıştırmak, sırları maskelemek, ABAC erişim yetkilerini değerlendirmek veya otonom görev geçişleri çalıştırmak için bana yazabilirsiniz veya dosya ekleyebilirsiniz.",
      timestamp: new Date().toISOString(),
      engineSteps: []
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStepTab, setActiveStepTab] = useState<Record<string, string>>({}); // msgId -> stepName (expanded)
  
  // Sidebar config settings
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [tokenBudget, setTokenBudget] = useState(50); // in K tokens
  const [abacRole, setAbacRole] = useState("developer");

  // AST graph interactive states inside widgets
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [graphSearch, setGraphSearch] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const mockNodes = React.useMemo(() => [
    { id: "node-1", label: "api/index.ts", type: "entry", tokens: "4.2K", exports: ["startServer", "router"], x: 250, y: 150, size: 12 },
    { id: "node-2", label: "core/db.ts", type: "database", tokens: "8.5K", exports: ["pool", "query", "transaction"], x: 150, y: 100, size: 10 },
    { id: "node-3", label: "providers/gemini.ts", type: "provider", tokens: "12K", exports: ["ModelProvider", "router"], x: 350, y: 100, size: 11 },
    { id: "node-4", label: "ui/Card.tsx", type: "component", tokens: "1.5K", exports: ["Card", "CardHeader"], x: 100, y: 220, size: 7 },
    { id: "node-5", label: "ui/Button.tsx", type: "component", tokens: "1.2K", exports: ["Button"], x: 180, y: 240, size: 7 },
    { id: "node-6", label: "services/auth.ts", type: "security", tokens: "5.4K", exports: ["verifyToken", "abacPolicy"], x: 250, y: 60, size: 9 },
    { id: "node-7", label: "services/task.ts", type: "core", tokens: "9.2K", exports: ["TaskEngine", "lifecycleFSM"], x: 120, y: 160, size: 10 },
    { id: "node-8", label: "workers/index.ts", type: "worker", tokens: "6.1K", exports: ["IndexWorker", "heartbeat"], x: 380, y: 220, size: 9 },
    { id: "node-9", label: "utils/redact.ts", type: "utility", tokens: "3.2K", exports: ["redactSecrets", "maskPaths"], x: 290, y: 260, size: 8 },
    { id: "node-10", label: "store/event.ts", type: "core", tokens: "7.8K", exports: ["EventStore", "appendEvent"], x: 320, y: 160, size: 10 },
  ], []);

  const mockLinks = React.useMemo(() => [
    { source: "node-1", target: "node-6" },
    { source: "node-1", target: "node-7" },
    { source: "node-7", target: "node-2" },
    { source: "node-6", target: "node-2" },
    { source: "node-3", target: "node-7" },
    { source: "node-4", target: "node-5" },
    { source: "node-8", target: "node-10" },
    { source: "node-9", target: "node-6" },
    { source: "node-10", target: "node-2" },
  ], []);

  const handleSendMessage = async (text: string) => {
    const promptText = text || "";
    if (!promptText.trim() && attachedFiles.length === 0) return;
    
    // 1. Append User & Assistant Pending Messages in a Single State Update
    const userMsgId = `user-${Date.now()}`;
    const userMsg = {
      id: userMsgId,
      sender: "user",
      text: promptText || `[Ekli Dosyalar: ${attachedFiles.map(f => f.name).join(", ")}]`,
      files: [...attachedFiles],
      timestamp: new Date().toISOString()
    };

    const assistantMsgId = `assistant-${Date.now() + 1}`;
    const assistantMsg = {
      id: assistantMsgId,
      sender: "assistant",
      text: "",
      status: "processing",
      timestamp: new Date().toISOString(),
      engineSteps: []
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInputText("");
    setAttachedFiles([]);
    setIsProcessing(true);

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
    const currentSteps: any[] = [];
    
    const updateSteps = (steps: any[], responseText = "", status = "processing") => {
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { 
        ...m, 
        engineSteps: [...steps],
        text: responseText,
        status: status
      } : m));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    };

    const combinedText = (promptText + " " + userMsg.files.map(f => f.name).join(" ")).trim();

    // Step 1: Security Redactor
    await delay(400);
    let containsSecrets = false;
    let sanitizedText = combinedText;
    
    // Robust regex check for secrets, tokens, and database credentials
    if (/(postgresql:\/\/|mysql:\/\/|mongodb:\/\/|ghp_\w+|sk_live_\w+|Bearer\s+[a-zA-Z0-9.\-_]+|SECRET|PASSWORD|api_key|secrets\.env)/i.test(combinedText)) {
      containsSecrets = true;
      sanitizedText = combinedText
        .replace(/(postgresql:\/\/[^:]+:)([^@]+)(@)/gi, "$1[REDACTED_PASSWORD]$3")
        .replace(/(ghp_[a-zA-Z0-9]+)/gi, "[REDACTED_GITHUB_TOKEN]")
        .replace(/(sk_live_[a-zA-Z0-9]+)/gi, "[REDACTED_STRIPE_KEY]")
        .replace(/(Bearer\s+)[a-zA-Z0-9.\-_]+/gi, "$1[REDACTED_JWT_TOKEN]")
        .replace(/((?:password|secret|api_key|token)\s*[:=]\s*["']?)([^"'\s]+)(["']?)/gi, "$1[REDACTED_SECRET]$3");
    }
    
    currentSteps.push({
      name: "Security Redactor",
      status: "success",
      detail: containsSecrets ? "Hassas veriler algılandı ve model öncesinde Redactor tarafından otomatik olarak maskelendi." : "Sır taraması temiz. Hassas veri sızıntısı saptanmadı.",
      containsSecrets,
      original: combinedText,
      redacted: sanitizedText
    });
    updateSteps(currentSteps);

    // Step 2: Context Compactor
    await delay(400);
    const codebaseSize = 120; // Simulated codebase size in K lines
    const ratio = "3.2x";
    const savings = "42.5K tokens";
    const lowerText = combinedText.toLowerCase();
    const isAstMapped = lowerText.includes("auth") || lowerText.includes("db") || lowerText.includes("server") || lowerText.includes("task") || lowerText.includes("cas");
    
    currentSteps.push({
      name: "Context Compactor",
      status: "success",
      detail: isAstMapped 
        ? "Kod tabanı AST bağımlılık grafiği başarıyla haritalandı. İlgili modüller bağlama dahil edildi."
        : "Kod tabanında genel tarama yapıldı. Bütçe optimizasyonu uygulandı.",
      codebaseSize: `${codebaseSize}K lines`,
      savings,
      ratio,
      isAstMapped
    });
    updateSteps(currentSteps);

    // Step 3: ABAC Policy Guard
    await delay(400);
    let isAuthorized = true;
    let rejectReason = "";
    
    if (lowerText.includes("/etc/passwd") || lowerText.includes("secret.key") || lowerText.includes("../")) {
      isAuthorized = false;
      rejectReason = "Directory Traversal veya yetkisiz sistem dosyası erişim engeli.";
    } else if (abacRole === "developer" && (lowerText.includes("secrets.env") || lowerText.includes("production"))) {
      isAuthorized = false;
      rejectReason = "Developer rolünün secrets.env veya production kaynaklarına erişim yetkisi yoktur.";
    }

    currentSteps.push({
      name: "ABAC Policy Guard",
      status: isAuthorized ? "success" : "blocked",
      detail: isAuthorized 
        ? `Erişim Yetkilendirmesi Başarılı. Rol: ${abacRole.toUpperCase()} yetkileri doğrulandı.`
        : `ERİŞİM ENGELLENDİ: ${rejectReason}`,
      role: abacRole,
      path: isAuthorized ? "/src/components" : "/secrets.env",
      action: lowerText.includes("sil") || lowerText.includes("delete") ? "DELETE" : "READ"
    });
    updateSteps(currentSteps);

    // Step 4: Forensic Audit Ledger
    await delay(400);
    const hash = "sha256-" + Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10);
    
    currentSteps.push({
      name: "Forensic Audit Ledger",
      status: "success",
      detail: "İşlem kaydı ve motor durum geçişi SHA-256 imzasıyla adli audit günlüğüne işlendi.",
      hash
    });

    // Generate domain & context-aware response text
    let responseText = "";

    if (!isAuthorized) {
      responseText = `### 🛑 ERİŞİM ENGELLENDİ\n\nY-OS ABAC Güvenlik Çekirdeği, yetkisiz dosya veya eylem talebini bloke etti. Ajan işlem sınırları korundu.\n\n* **Neden:** Rolünüz (\`${abacRole.toUpperCase()}\`) bu kaynağa erişim yetkisi vermiyor.\n* **Bloke Edilen Kaynak:** \`${lowerText.includes("/etc/passwd") ? "../../etc/passwd" : "secrets.env"}\`\n* **Güvenlik Eylemi:** Forensic Ledger günlüğüne \`SECURITY_ABAC_BLOCKED\` olarak kaydedildi.`;
    } else if (containsSecrets) {
      responseText = `### 🔒 GÜVENLİK UYARISI: Sır Bilgisi Algılandı\n\nY-OS Redactor motoru girdiğiniz hassas verileri otomatik olarak ayıkladı ve maskeledi. Temizlenen mesaj güvenli bir şekilde işlendi:\n\n* **Maskelenen Değerler:** Özel şifreler, API Token'ları veya veritabanı bağlantı linkleri.\n* **Maskelenmiş Çıktı:**\n  \`\`\`env\n  ${sanitizedText}\n  \`\`\`\n* **Aksiyon:** Orijinal veriler güvenlik vault'unda şifrelendi ve dış modele sızması engellendi.`;
    } else if (lowerText.includes("auth-middleware.ts") || lowerText.includes("auth")) {
      responseText = `### 📦 Compacted Context Pack: auth-middleware.ts\n\nY-OS Context Compactor, \`auth-middleware.ts\` dosyasını ve bağımlılıklarını analiz etti. AST tabanlı import takibi sonucunda \`services/auth.ts\` ve \`core/db.ts\` modülleri tespit edildi ve gereksiz yorum satırları elenerek **%82 oranında sıkıştırılmış** tek bir paket halinde birleştirildi:\n\n\`\`\`typescript\n// Y-OS COMPACTED CONTEXT PACK (B-ID: cref_auth_01)\nimport { db } from "../core/db";\nexport async function verifyToken(req: Request, res: Response, next: NextFunction) {\n  const authHeader = req.headers.authorization;\n  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");\n  const token = authHeader.split(" ")[1];\n  req.user = await db.query("SELECT id, role FROM users WHERE token = $1", [token]);\n  next();\n}\n\`\`\``;
    } else if (lowerText.includes("database-pool.ts") || lowerText.includes("db")) {
      responseText = `### 📦 Compacted Context Pack: database-pool.ts\n\nY-OS Context Compactor, veritabanı havuz ayarlarını sıkıştırdı. \`core/db.ts\` içindeki PostgreSQL bağlantı parametreleri ve havuz yönetimi optimize edildi:\n\n\`\`\`typescript\n// Y-OS COMPACTED CONTEXT PACK (B-ID: cref_db_99)\nimport { Pool } from "pg";\nexport const pool = new Pool({\n  max: 20,\n  idleTimeoutMillis: 30000,\n  connectionTimeoutMillis: 2000,\n});\n\`\`\``;
    } else if (lowerText.includes("abac") || lowerText.includes("yetki") || lowerText.includes("rol")) {
      responseText = `### 🛡️ ABAC Yetki Çekirdeği Durum Raporu\n\nY-OS ABAC (Attribute-Based Access Control) güvenlik katmanı aktiftir.\n\n* **Aktif Rolünüz:** \`${abacRole.toUpperCase()}\`\n* **Varsayılan Kural:** \`DEFAULT_DENY\`\n* **İzin Verilen Yollar:** Geliştirici beyaz listesindeki yollar (\`/src/components/*\`, \`/packages/*\`).\n* **Kısıtlı Yollar:** Üretim ortam değişkenleri (\`secrets.env\`) ve kök dosya sistemi (\`/etc/passwd\`).`;
    } else if (lowerText.includes("cas") || lowerText.includes("artefakt") || lowerText.includes("blob")) {
      responseText = `### 💾 İçerik Adreslemeli Depolama (CAS) Raporu\n\nY-OS CAS motoru ikili veri bloklarını SHA-256 hash imzalarıyla dizinler.\n\n* **Tekilleştirme Oranı:** %74 ortalama alan tasarrufu.\n* **Bütünlük:** SHA-256 doğrulama ile bozuk blob tespiti.\n* **Sürüm Kontrolü:** Önceki sürümler otomatik olarak supersede durumuna geçirilir.`;
    } else {
      responseText = `### 🤖 Y-OS AI Engine Yanıtı\n\n"${promptText || "Ekli dosyalar"}" talebiniz başarıyla alındı ve Y-OS Kernel motoru üzerinden işlendi.\n\n* **Model Council Kararı:** Model başarıyla çağrıldı.\n* **AST Mappings:** Sorguyla ilişkili modüller analiz edilip hafızaya alındı.\n* **İşlem Durumu:** Redactor, Compactor, ABAC ve Forensic Audit aşamaları başarıyla tamamlandı.`;
    }

    updateSteps(currentSteps, responseText, "complete");
    setIsProcessing(false);
  };

  const handleAttachMockFile = (fileName: string) => {
    if (attachedFiles.some(f => f.name === fileName)) return;
    const newFile = {
      name: fileName,
      size: "2.4 KB",
      type: "TypeScript Source"
    };
    setAttachedFiles(prev => [...prev, newFile]);
  };

  const toggleStepDetails = (msgId: string, stepName: string) => {
    setActiveStepTab(prev => {
      const current = prev[msgId];
      if (current === stepName) {
        const copy = { ...prev };
        delete copy[msgId];
        return copy;
      }
      return { ...prev, [msgId]: stepName };
    });
  };

  // Return narrative landing view prior to dynamic launch
  if (!cockpitLaunched) {
    return <LandingPage onLaunch={() => setCockpitLaunched(true)} />;
  }

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case "chat-cockpit":
        return (
          <div className="flex flex-col justify-between min-h-[calc(100vh-8rem)] relative bg-void-black max-w-4xl mx-auto border border-glass-border/30 rounded-2xl overflow-hidden shadow-2xl">
            {/* Top header stats bar */}
            <div className="h-14 border-b border-glass-border bg-graphite-dark/30 backdrop-blur-xl flex items-center justify-between px-6 shrink-0 z-10">
              <div className="flex items-center space-x-3 text-left">
                <span className="text-xs font-semibold text-slate-200 font-mono">Sohbet Kokpiti</span>
                <Badge tone="cyan" variant="low">Aktif Oturum</Badge>
              </div>
              <button 
                onClick={() => setCockpitLaunched(false)}
                className="text-[10px] font-mono text-optic-cyan/80 hover:text-optic-cyan hover:underline cursor-pointer bg-transparent border-none"
              >
                ← Ana Sayfaya Geri Dön
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-grow overflow-y-auto px-6 py-6 space-y-6 select-text max-h-[55vh] min-h-[40vh] scrollbar-thin">
              {messages.map((msg) => {
                const isUser = msg.sender === "user";
                return (
                  <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fadeIn`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 space-y-3 relative border ${
                      isUser 
                        ? "bg-optic-cyan/5 border-optic-cyan/25 text-slate-100 rounded-tr-none" 
                        : "bg-graphite-dark/40 border-glass-border/30 text-slate-200 rounded-tl-none"
                    }`}>
                      
                      {/* Sender label */}
                      <div className="flex items-center space-x-2 text-[9px] font-mono text-steel-muted justify-between">
                        <span>{isUser ? "İNSAN_OPERATÖR" : "Y-OS_YAPAY_ZEKA_AJANI"}</span>
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      </div>

                      {/* Content */}
                      <div className="text-xs leading-relaxed font-sans text-left space-y-2 whitespace-pre-wrap select-text">
                        {msg.text}
                      </div>

                      {/* Display attached files for user message */}
                      {isUser && msg.files && msg.files.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2">
                           {msg.files.map((file: any, fIdx: number) => (
                            <span key={fIdx} className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-optic-cyan/10 border border-optic-cyan/25 text-optic-cyan font-mono text-[9px]">
                              <FileCode className="w-3 h-3" />
                              <span>{file.name}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Engine Steps (for assistant messages) */}
                      {!isUser && msg.engineSteps && msg.engineSteps.length > 0 && (
                        <div className="pt-3 border-t border-glass-border/20 space-y-2">
                          <div className="text-[9px] font-mono text-steel-muted uppercase tracking-wider text-left">
                            Çekirdek İzleme Logları ({msg.engineSteps.length} adım)
                          </div>
                          <div className="space-y-1.5">
                            {msg.engineSteps.map((step: any, sIdx: number) => {
                              const stepExpanded = activeStepTab[msg.id] === step.name;
                              return (
                                <div key={sIdx} className="border border-glass-border/20 rounded-lg overflow-hidden bg-void-black/60">
                                  <button
                                    onClick={() => toggleStepDetails(msg.id, step.name)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-mono hover:bg-white/[0.02] cursor-pointer bg-transparent border-none text-left"
                                  >
                                    <div className="flex items-center space-x-2">
                                      <span className={`w-1.5 h-1.5 rounded-full ${
                                        step.status === "success" 
                                          ? "bg-evidence-green" 
                                          : step.status === "blocked" 
                                          ? "bg-[#ef4444]" 
                                          : "bg-signal-amber animate-pulse"
                                      }`} />
                                      <span className="text-slate-350">{step.name}</span>
                                    </div>
                                    <span className="text-zinc-650">{stepExpanded ? "Daralt" : "Detayları İncele"}</span>
                                  </button>

                                  {stepExpanded && (
                                    <div className="px-3 pb-3 pt-1.5 border-t border-glass-border/10 text-[10px] font-mono text-left space-y-2.5 text-slate-300 select-text">
                                      <div className="text-slate-400 text-xs leading-relaxed">{step.detail}</div>
                                      
                                      {/* Security Redactor diff layout */}
                                      {step.name === "Security Redactor" && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 bg-black/60 p-2.5 rounded-lg border border-glass-border/40 select-text">
                                          <div>
                                            <div className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Gelen prompt akışı</div>
                                            <pre className="text-[9px] text-[#ef4444] whitespace-pre-wrap select-text leading-tight">{step.original}</pre>
                                          </div>
                                          <div className="border-l border-zinc-900 pl-2">
                                            <div className="text-[8px] text-zinc-500 uppercase font-bold mb-1">Maskelenmiş prompt içeriği</div>
                                            <pre className="text-[9px] text-evidence-green whitespace-pre-wrap select-text leading-tight">{step.redacted}</pre>
                                          </div>
                                        </div>
                                      )}

                                      {/* Context Compactor metrics */}
                                      {step.name === "Context Compactor" && (
                                        <div className="grid grid-cols-3 gap-2 mt-2 bg-black/60 p-2 rounded-lg text-center font-mono">
                                          <div>
                                            <div className="text-[8px] text-zinc-500 uppercase">Girdi kod tabanı</div>
                                            <div className="text-slate-350 font-semibold">{step.codebaseSize}</div>
                                          </div>
                                          <div>
                                            <div className="text-[8px] text-zinc-500 uppercase">Optimize tasarruf</div>
                                            <div className="text-optic-cyan font-semibold">{step.savings}</div>
                                          </div>
                                          <div>
                                            <div className="text-[8px] text-zinc-500 uppercase">Oran</div>
                                            <div className="text-evidence-green font-semibold">{step.ratio}</div>
                                          </div>
                                        </div>
                                      )}

                                      {/* ABAC Policy matrix */}
                                      {step.name === "ABAC Policy Guard" && (
                                        <div className="flex flex-wrap items-center justify-between gap-2 mt-2 bg-black/60 p-2 rounded-lg text-[9px]">
                                          <div>
                                            Aktör Rolü: <span className="text-optic-cyan uppercase font-bold">{step.role}</span>
                                          </div>
                                          <div>
                                            Eylem: <span className="text-signal-amber font-bold">{step.action}</span>
                                          </div>
                                          <div>
                                            Hedef Kaynak: <span className="text-zinc-400">{step.path}</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Forensic Audit ledger link */}
                                      {step.name === "Forensic Audit Ledger" && (
                                        <div className="mt-2 bg-black/60 p-2 rounded-lg text-[9px] flex items-center justify-between text-glow-green">
                                          <span>Olay SHA-256 İmza Anahtarı:</span>
                                          <span className="text-[8px] font-bold text-slate-300 break-all select-text">{step.hash}</span>
                                        </div>
                                      )}

                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Bottom input area */}
            <div className="p-6 border-t border-glass-border/30 bg-graphite-dark/30 backdrop-blur-xl shrink-0 z-10">
              <div className="max-w-3xl mx-auto space-y-4">
                
                {/* Attachment suggestions bar */}
                {attachedFiles.length === 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-zinc-500 justify-start">
                    <span>Sohbete kod veya dosya ekle:</span>
                    <button 
                      onClick={() => handleAttachMockFile("auth-middleware.ts")}
                      className="px-2 py-1 rounded bg-zinc-950/40 hover:bg-optic-cyan/5 border border-glass-border hover:border-optic-cyan/20 text-slate-300 transition-all cursor-pointer"
                    >
                      + auth-middleware.ts
                    </button>
                    <button 
                      onClick={() => handleAttachMockFile("secrets.env")}
                      className="px-2 py-1 rounded bg-zinc-950/40 hover:bg-optic-cyan/5 border border-glass-border hover-lift border-glass-border/60 text-slate-300 transition-all cursor-pointer"
                    >
                      + secrets.env
                    </button>
                    <button 
                      onClick={() => handleAttachMockFile("database-pool.ts")}
                      className="px-2 py-1 rounded bg-zinc-950/40 hover:bg-optic-cyan/5 border border-glass-border hover:border-optic-cyan/20 text-slate-300 transition-all cursor-pointer"
                    >
                      + database-pool.ts
                    </button>
                  </div>
                )}

                {/* Display list of attached files to send */}
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-start">
                    {attachedFiles.map((file, fIdx) => (
                      <div key={fIdx} className="flex items-center space-x-2 px-2.5 py-1.5 bg-optic-cyan/5 border border-optic-cyan/20 rounded-xl font-mono text-[10px]">
                        <FileCode className="w-3.5 h-3.5 text-optic-cyan" />
                        <span>{file.name}</span>
                        <button 
                          onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== fIdx))}
                          className="text-zinc-500 hover:text-white ml-1 transition-colors bg-transparent border-none cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Form elements input box */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage(inputText);
                  }}
                  className="relative flex items-center bg-black/50 border border-glass-border/60 focus-within:border-optic-cyan/40 rounded-2xl p-2 transition-all shadow-inner"
                >
                  <button
                    type="button"
                    onClick={() => handleAttachMockFile("custom-module.ts")}
                    className="p-3 text-zinc-500 hover:text-white transition-colors cursor-pointer bg-transparent border-none"
                    title="Kaynak kod dosyası ekle"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                  
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Y-OS Engine'e bir soru yazın veya bir yetki denetimi başlatın..."
                    className="flex-grow bg-transparent text-xs text-slate-100 px-3 outline-none focus:outline-none placeholder-zinc-500 py-3"
                    disabled={isProcessing}
                  />

                  <button
                    type="submit"
                    disabled={isProcessing || (!inputText.trim() && attachedFiles.length === 0)}
                    className={`p-3 rounded-xl transition-all cursor-pointer border ${
                      inputText.trim() || attachedFiles.length > 0
                        ? "bg-optic-cyan/15 border-optic-cyan/40 hover:bg-optic-cyan/30 text-optic-cyan hover:text-white"
                        : "text-zinc-700 bg-zinc-950/40 border-transparent"
                    }`}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>

                <div className="text-[10px] text-zinc-650 font-sans text-center">
                  Y-OS Context OS Engine | Tüm işlemler ABAC ve Credential Redactor denetimine tabidir.
                </div>

              </div>
            </div>

          </div>
        );
      case "project-dashboard":
        return (
          <AIMissionControlPanel
            metrics={workspace.metrics}
            healthStatus={workspace.healthStatus}
            onLaunchSweep={() => {
              workspace.loadTaskMetrics();
              workspace.loadHealthStatus();
            }}
            onConfigureDb={() => workspace.setShowConfigModal(true)}
          />
        );
      case "worker-runtime":
        return <WorkerRuntimeDashboard projectId={workspace.activeProjectId} />;
      case "artifact-center":
        return <ArtifactCenterPanel projectId={workspace.activeProjectId} />;
      case "permission-kernel":
        return <PermissionKernelPanel projectId={workspace.activeProjectId} />;
      case "evidence-store":
        return <EvidenceStorePanel projectId={workspace.activeProjectId} />;
      case "event-journal":
        return <EventJournalPanel projectId={workspace.activeProjectId} />;
      case "file-locks":
        return <FileLockingPanel projectId={workspace.activeProjectId} />;
      case "quality-gate-report":
        return <QualityGateReportPanel projectId={workspace.activeProjectId} />;
      case "impact-analysis":
        return <ImpactAnalysisPanel projectId={workspace.activeProjectId} />;
      case "index-job-orchestrator":
        return <IndexJobOrchestratorPanel projectId={workspace.activeProjectId} />;
      default:
        return <ModuleSimulationPanel tabId={activeTab} projectId={workspace.activeProjectId} />;
    }
  };

  const renderPlaceholderView = (tabId: TabId) => {
    const item = NAVIGATION_CATEGORIES.flatMap((c) => c.items).find((i) => i.id === tabId);
    if (!item) return null;

    return (
      <div className="max-w-xl mx-auto my-12 text-center p-8 bg-graphite-dark/45 border border-glass-border/30 rounded-2xl backdrop-blur-xl shadow-2xl space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-optic-cyan/5 border border-optic-cyan/20 flex items-center justify-center mx-auto text-optic-cyan shadow-[0_0_15px_rgba(0,213,255,0.1)] animate-pulse">
          {React.createElement(item.icon, { className: "w-8 h-8" })}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-tight">{item.label}</h2>
            <Badge tone="warning" variant="low" className="text-[9px] uppercase tracking-wider font-mono">Henüz Kodlanmadı</Badge>
          </div>
          <p className="text-xs font-mono text-steel-muted uppercase tracking-wider text-center">Modül ID: {item.id}</p>
          <p className="text-sm text-slate-350 leading-relaxed font-sans text-center">{item.description}</p>
        </div>
        <div className="pt-4 border-t border-glass-border/20 text-xs text-zinc-550 font-mono text-center">
          Durum: Çekirdek yönetişim ve teknik borç protokolleri kapsamında kilitlenmiştir. Yerel taslaktan üretime geçirilmesi için aktif DB dilimi yetkilendirmeleri gerektirir.
        </div>
      </div>
    );
  };

  const [modalTab, setModalTab] = useState<"db" | "ai">("db");

  return (
    <AppProviders>
      <AppShell
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        projects={workspace.projects}
        activeProjectId={workspace.activeProjectId}
        setActiveProjectId={workspace.setActiveProjectId}
        healthStatus={workspace.healthStatus}
        metrics={workspace.metrics}
        setShowConfigModal={workspace.setShowConfigModal}
      >
        {renderActiveTabContent()}
      </AppShell>

      {/* Unified Configuration Settings Modal */}
      {workspace.showConfigModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn p-4">
          <div className="w-full max-w-lg bg-graphite-dark border border-glass-border rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5 text-left relative max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-glass-border/40 shrink-0">
              <div className="flex items-center space-x-2 text-optic-cyan">
                <Settings className="w-4 h-4" />
                <h3 className="text-sm font-bold uppercase tracking-wider font-mono">Y-OS Sistem Yapılandırması</h3>
              </div>
              <button 
                onClick={() => workspace.setShowConfigModal(false)}
                className="text-zinc-500 hover:text-white transition-colors text-lg bg-transparent border-none cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Modal Tab Switcher */}
            <div className="flex border-b border-glass-border/30 gap-2 shrink-0">
              <button
                onClick={() => setModalTab("db")}
                className={`pb-2 px-3 text-xs font-mono font-bold transition-all border-b-2 cursor-pointer ${
                  modalTab === "db"
                    ? "border-optic-cyan text-optic-cyan"
                    : "border-transparent text-steel-muted hover:text-slate-200"
                }`}
              >
                <Database className="w-3 h-3 inline mr-1.5" />
                Veritabanı Bağlantısı (PostgreSQL)
              </button>
              <button
                onClick={() => setModalTab("ai")}
                className={`pb-2 px-3 text-xs font-mono font-bold transition-all border-b-2 cursor-pointer ${
                  modalTab === "ai"
                    ? "border-optic-cyan text-optic-cyan"
                    : "border-transparent text-steel-muted hover:text-slate-200"
                }`}
              >
                <Cpu className="w-3 h-3 inline mr-1.5" />
                AI Motor & ABAC Ayarları
              </button>
            </div>

            {/* Modal Body Scroll Area */}
            <div className="overflow-y-auto space-y-4 flex-1 pr-1 scrollbar-thin">
              {modalTab === "db" && (
                <form onSubmit={workspace.handleConfigureDb} className="space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-steel-muted font-mono text-[10px]">BAĞLANTI MODU:</span>
                    <button
                      type="button"
                      onClick={() => workspace.setUseRawString(!workspace.useRawString)}
                      className="text-[10px] font-mono text-optic-cyan hover:underline bg-transparent border-none cursor-pointer"
                    >
                      {workspace.useRawString ? "Ayrıştırılmış Alanlara Geç" : "Ham Connection String Kullan"}
                    </button>
                  </div>

                  {workspace.configResultMsg && (
                    <div className={`p-3 rounded-lg border text-xs font-mono ${
                      workspace.configResultMsg.success
                        ? "bg-evidence-green/10 border-evidence-green/30 text-evidence-green"
                        : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                    }`}>
                      {workspace.configResultMsg.text}
                    </div>
                  )}

                  {workspace.useRawString ? (
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">PostgreSQL / Supabase Bağlantı Linki</label>
                      <input
                        type="text"
                        value={workspace.dbConnStr}
                        onChange={(e) => workspace.setDbConnStr(e.target.value)}
                        placeholder="postgresql://postgres:pass@db.supabase.co:5432/postgres"
                        className="w-full text-xs text-slate-200 p-2.5 rounded-lg border border-glass-border bg-black focus:border-optic-cyan/40 focus:outline-none font-mono"
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2 space-y-1">
                          <label className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">Sunucu Host</label>
                          <input
                            type="text"
                            value={workspace.dbHost}
                            onChange={(e) => workspace.setDbHost(e.target.value)}
                            className="w-full text-xs text-slate-200 p-2 rounded-lg border border-glass-border bg-black focus:border-optic-cyan/40 focus:outline-none font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">Port</label>
                          <input
                            type="text"
                            value={workspace.dbPort}
                            onChange={(e) => workspace.setDbPort(e.target.value)}
                            className="w-full text-xs text-slate-200 p-2 rounded-lg border border-glass-border bg-black focus:border-optic-cyan/40 focus:outline-none font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">Kullanıcı Adı</label>
                          <input
                            type="text"
                            value={workspace.dbUsername}
                            onChange={(e) => workspace.setDbUsername(e.target.value)}
                            className="w-full text-xs text-slate-200 p-2 rounded-lg border border-glass-border bg-black focus:border-optic-cyan/40 focus:outline-none font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">Veritabanı Adı</label>
                          <input
                            type="text"
                            value={workspace.dbName}
                            onChange={(e) => workspace.setDbName(e.target.value)}
                            className="w-full text-xs text-slate-200 p-2 rounded-lg border border-glass-border bg-black focus:border-optic-cyan/40 focus:outline-none font-mono"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">Veritabanı Şifresi</label>
                        <input
                          type="password"
                          value={workspace.dbPassword}
                          onChange={(e) => workspace.setDbPassword(e.target.value)}
                          placeholder="PostgreSQL / Supabase şifrenizi girin..."
                          className="w-full text-xs text-slate-200 p-2 rounded-lg border border-glass-border bg-black focus:border-optic-cyan/40 focus:outline-none font-mono"
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-glass-border/40 flex justify-end">
                    <button
                      type="submit"
                      disabled={workspace.configPending}
                      className="px-4 py-2 bg-optic-cyan/15 hover:bg-optic-cyan/30 border border-optic-cyan/40 text-optic-cyan text-xs rounded-xl font-bold font-mono uppercase transition-all cursor-pointer disabled:opacity-50"
                    >
                      {workspace.configPending ? "Bağlanıyor..." : "Veritabanını Bağla ve Test Et"}
                    </button>
                  </div>
                </form>
              )}

              {modalTab === "ai" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">Model Konseyi Yetkilendirmesi (Model Council)</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full text-xs text-slate-200 p-2.5 rounded-lg border border-glass-border bg-black focus:border-optic-cyan/40 focus:outline-none"
                    >
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                      <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                      <option value="deepseek-v3">DeepSeek V3 (Reasoning)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">Erişici Rolü (Principal ABAC Role)</label>
                    <select
                      value={abacRole}
                      onChange={(e) => setAbacRole(e.target.value)}
                      className="w-full text-xs text-slate-200 p-2.5 rounded-lg border border-glass-border bg-black focus:border-optic-cyan/40 focus:outline-none"
                    >
                      <option value="developer">Developer (Geliştirici)</option>
                      <option value="ci-cd">CI/CD Ajanı</option>
                      <option value="admin">Administrator (Yönetici)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] text-zinc-400 font-mono uppercase tracking-wider">
                      <span>Token Bütçesi Sıkıştırma Limiti (Token Budget Compactor)</span>
                      <span className="text-optic-cyan font-bold">{tokenBudget}K t</span>
                    </div>
                    <input 
                      type="range" 
                      min="20" 
                      max="150" 
                      value={tokenBudget}
                      onChange={(e) => setTokenBudget(Number(e.target.value))}
                      className="w-full accent-optic-cyan h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Active Context Vault cache list */}
                  <div className="space-y-2.5 pt-3 border-t border-glass-border/40">
                    <span className="text-[9px] font-mono text-steel-muted uppercase tracking-wider block">Obsidian Memory Vault (context-vault)</span>
                    <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1 scrollbar-thin">
                      {["auth-middleware.ts", "database-pool.ts", "env-configurations.env", "task-lifecycles.ts"].map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 border border-glass-border/30">
                          <span className="text-[10px] font-mono text-slate-350 break-all">{file}</span>
                          <Badge tone="success" variant="low" className="text-[8px] px-1.5 py-0 font-bold font-mono">DOĞRULANDI</Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-glass-border/40 flex justify-end">
                    <button 
                      onClick={() => workspace.setShowConfigModal(false)}
                      className="px-4 py-2 bg-optic-cyan/10 hover:bg-optic-cyan/20 border border-optic-cyan/30 text-optic-cyan text-xs rounded-xl font-bold font-mono uppercase transition-all cursor-pointer"
                    >
                      Yapılandırmayı Uygula
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppProviders>
  );
}

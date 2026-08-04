/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { SystemConfig, CodeFeedItem, SecretInput } from '../types';
import CyberCanvas from './CyberCanvas';
import SymmetryHud from './SymmetryHud';
import ControlTerminal from './ControlTerminal';
import { Button } from "./primitives/Button";
import { Card } from "./primitives/Card";
import { Badge } from "./primitives/Badge";
import { 
  Terminal, 
  Database, 
  Cpu, 
  Layers, 
  ShieldCheck, 
  Sparkles,
  ArrowRight
} from "lucide-react";
import {
  INITIAL_CODE_FEED,
  INITIAL_SECRETS,
  generateRandomHash,
} from '../utils/dataHelpers';

// Motion hooks and components
import { useSmoothScroll } from "../hooks/useSmoothScroll";
import { useMagnetic } from "../hooks/useMagnetic";
import { useTextReveal } from "../hooks/useTextReveal";
import { AuroraOrb } from "./motion/AuroraOrb";
import { AwwwardsCursor } from "./motion/AwwwardsCursor";
import { motion, AnimatePresence } from 'motion/react';

interface LandingPageProps {
  onLaunch: () => void;
}

export function LandingPage({ onLaunch }: LandingPageProps) {
  // 1. Core Operating System State
  const [config, setConfig] = useState<SystemConfig>({
    cameraSpeed: 0.28,
    focalDepth: 35,
    dofStrength: 1.4,
    volumetricFogDensity: 6.2,
    grainIntensity: 0.6,
    cyanIntensity: 1.0,
    secretEmberCount: 40,
    ambientPulseSpeed: 1.0,
    gridComposition: 'centralized',
    isMuted: true, // Default to silent
  });

  const [codeFeed, setCodeFeed] = useState<CodeFeedItem[]>(INITIAL_CODE_FEED);
  const [secrets, setSecrets] = useState<SecretInput[]>(INITIAL_SECRETS);
  const [activeCodeSnippets, setActiveCodeSnippets] = useState<string[]>(
    INITIAL_CODE_FEED.map((item) => item.code)
  );

  // Dynamic system events trigger state (e.g. amber ping pings all nodes)
  const [triggerAmberPing, setTriggerAmberPing] = useState(false);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(true);

  // 1.1 Capabilities Playground state declarations
  const [sandboxCodebaseSize, setSandboxCodebaseSize] = useState(120);
  const [sandboxTokenBudget, setSandboxTokenBudget] = useState(50);
  const [sandboxTaskMode, setSandboxTaskMode] = useState("AST Traversal");
  const [sandboxCompacting, setSandboxCompacting] = useState(false);
  const [sandboxCompactResult, setSandboxCompactResult] = useState<any>(null);

  const [sandboxSecretInput, setSandboxSecretInput] = useState(
    `// Veritabanı kimlik bilgileri ve anahtarlar\nDATABASE_URL=postgresql://postgres:sample_password@127.0.0.1:5432/y_os_db\nGITHUB_TOKEN=ghp_SAMPLE_DEVELOPMENT_TOKEN\nSTRIPE_SECRET=sk_test_SAMPLE_STRIPE_KEY`
  );
  const [sandboxRedactResult, setSandboxRedactResult] = useState("");

  const [sandboxAbacRole, setSandboxAbacRole] = useState("developer");
  const [sandboxAbacPath, setSandboxAbacPath] = useState("/src/components/AIMissionControlPanel.tsx");
  const [sandboxAbacAction, setSandboxAbacAction] = useState("read");
  const [sandboxAbacDecision, setSandboxAbacDecision] = useState("YETKİLENDİRİLDİ");

  const [sandboxAuditLogs, setSandboxAuditLogs] = useState<string[]>([
    "[SİSTEM] ABAC Çekirdek motoru başarıyla başlatıldı.",
    "[SİSTEM] Gizli veri maskeleme imzaları haritalandı: 14 şablon yüklendi."
  ]);

  const handleRunCompactor = () => {
    setSandboxCompacting(true);
    setSandboxCompactResult(null);
    setTimeout(() => {
      setSandboxCompacting(false);
      const computedSize = Math.floor(sandboxCodebaseSize * 0.35 + (sandboxTokenBudget * 0.15));
      const savings = (sandboxCodebaseSize * 0.08).toFixed(2);
      setSandboxCompactResult({
        size: `${computedSize}K`,
        savings: `$${savings}`,
        log: `[COMPACTOR] ${sandboxCodebaseSize}K kod tabanı başarıyla ${computedSize}K token bütçesine sıkıştırıldı.`
      });
      setSandboxAuditLogs(prev => [
        `[${new Date().toISOString()}] COMPACTOR_RUN | kod_tabani=${sandboxCodebaseSize}K | hedef=${sandboxTokenBudget}K | tasarruf=$${savings}`,
        ...prev
      ]);
    }, 700);
  };

  const handleSecretInputChange = (text: string) => {
    setSandboxSecretInput(text);
    // Basic redact regex rules
    let sanitized = text;
    // Redact password in DB url
    sanitized = sanitized.replace(/(postgresql:\/\/postgres:)([^@]+)(@)/g, "$1[GUVENLI_MASKELEME]$3");
    // Redact generic keys/tokens
    sanitized = sanitized.replace(/(ghp_[a-zA-Z0-9]+)/g, "[GUVENLI_MASKELEME]");
    sanitized = sanitized.replace(/(sk_live_[a-zA-Z0-9]+)/g, "[GUVENLI_MASKELEME]");
    setSandboxRedactResult(sanitized);

    // If change was made and something was redacted
    if (sanitized !== text) {
      setSandboxAuditLogs(prev => {
        const msg = `[${new Date().toISOString()}] REDACTION_SEAL | hassas veriler girdi tamponundan maskelendi`;
        if (prev[0] && prev[0].includes("REDACTION_SEAL")) return prev; // Avoid duplicates
        return [msg, ...prev];
      });
    }
  };

  // Run initial redact scan on load
  useEffect(() => {
    handleSecretInputChange(sandboxSecretInput);
  }, []);

  const handleAbacEvaluate = (role: string, path: string, action: string) => {
    let decision = "YETKİLENDİRİLDİ";
    if (path.includes("..")) {
      decision = "ENGELLEMİŞTİR: Dizin Aşma Girişimi Tespit Edildi";
    } else if (action === "delete") {
      decision = "ENGELLEMİŞTİR: Silme işlemleri Yönetici (Admin) rolü gerektirir";
    } else if (role === "developer" && path === "/secrets.env") {
      decision = "ENGELLEMİŞTİR: Geliştirici rolünün secrets.env dosyasına erişim izni yoktur";
    } else if (action === "write" && role === "ci-cd") {
      decision = "ENGELLEMİŞTİR: CI/CD otomasyon ajanları için yazma işlemleri kısıtlıdır";
    }

    setSandboxAbacDecision(decision);
    setSandboxAuditLogs(prev => [
      `[${new Date().toISOString()}] ABAC_EVALUATION | rol=${role} | yol=${path} | eylem=${action} | karar=${decision.startsWith("YETKİLENDİRİLDİ") ? "GEÇTİ" : "ENGEL"}`,
      ...prev
    ]);
  };

  // Activate fluid inertial smooth scroll on landing layout
  useSmoothScroll(true);

  // Initialize magnetic hovers on primary buttons
  const exploreBtnRef = useMagnetic<HTMLButtonElement>({ strength: 0.35 });
  const launchBtnRef = useMagnetic<HTMLButtonElement>({ strength: 0.28 });

  // Initialize intersection-based masking text reveals
  const headlineRevealRef = useTextReveal<HTMLHeadingElement>({ delayMs: 100 });
  const subheadRevealRef = useTextReveal<HTMLParagraphElement>({ delayMs: 250 });

  // 2. Procedural Synthesized Soundscape (Using Web Audio API)
  const playCyberBlip = useCallback((type: 'dissolve' | 'inject' | 'click' | 'alarm') => {
    if (config.isMuted) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();

      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      // Combine oscillators for a rich digital retro-minimal blip
      if (type === 'dissolve') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400 + Math.random() * 400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.35);

        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      } else if (type === 'inject') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(320, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(2400, audioCtx.currentTime + 0.18);

        gainNode.gain.setValueAtTime(0.015, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.18);
      } else if (type === 'alarm') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(580, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.1);
        osc.frequency.linearRampToValueAtTime(580, audioCtx.currentTime + 0.2);

        gainNode.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800 + Math.random() * 200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.12);

        gainNode.gain.setValueAtTime(0.03, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.12);
      }
    } catch (err) {
      console.warn('Audio Context interaction prevented', err);
    }
  }, [config.isMuted]);

  // 3. Compilation Bus Action Handler
  const handleCompileCode = (text: string) => {
    const timestamp = new Date().toISOString().substring(11, 19) + '.' + Math.floor(Math.random() * 100);
    const newId = `usr-${Date.now()}`;
    const newItem: CodeFeedItem = {
      id: newId,
      timestamp,
      label: `USR_PROC_${newId.substring(9)}`,
      code: text,
      status: 'PENDING'
    };

    setCodeFeed((prev) => [newItem, ...prev.slice(0, 7)]);
    playCyberBlip('inject');

    setTimeout(() => {
      setCodeFeed((prev) =>
        prev.map((item) =>
          item.id === newId ? { ...item, status: 'COMPILED' } : item
        )
      );
      setActiveCodeSnippets((prev) => [text, ...prev]);
      playCyberBlip('click');
    }, 1000);
  };

  // 4. Secrets Vault Trigger
  const handleDeploySecret = (text: string) => {
    const timestamp = new Date().toISOString().substring(11, 19) + '.' + Math.floor(Math.random() * 100);
    const newId = `sec-usr-${Date.now().toString().substring(8)}`;
    const hashSum = generateRandomHash();

    const newSecret: SecretInput = {
      id: newId,
      hash: hashSum,
      status: 'STABLE',
      timestamp,
    };

    setSecrets((prev) => [newSecret, ...prev.slice(0, 6)]);
    playCyberBlip('inject');
    setTriggerAmberPing(true);
  };

  // 5. Interactive Decay triggers
  const handleInfectSnippet = (id: string) => {
    setCodeFeed((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'INFECTED' } : item
      )
    );
    playCyberBlip('alarm');
  };

  const handleDissolveSecret = (id: string) => {
    setSecrets((prev) =>
      prev.map((sec) =>
        sec.id === id ? { ...sec, status: 'DISSOLVING' } : sec
      )
    );
    playCyberBlip('dissolve');

    setTimeout(() => {
      setSecrets((prev) =>
        prev.map((sec) =>
          sec.id === id ? { ...sec, status: 'STARDUST_EMBEDDED' } : sec
        )
      );
      playCyberBlip('click');
    }, 2000);
  };

  const handleExplosionTrigger = useCallback(() => {
    playCyberBlip('dissolve');
  }, [playCyberBlip]);

  return (
    <div className="flex flex-col xl:flex-row w-screen h-screen bg-[#040406] overflow-hidden select-none text-zinc-300 relative font-sans">
      
      {/* Custom Awwwards interactive lens cursor */}
      <AwwwardsCursor />

      {/* Cinematic mouse-following blur orb */}
      <AuroraOrb />

      {/* Film grain analog jitter texture */}
      <div className="noise-grain-animated pointer-events-none fixed inset-0 z-40 opacity-[0.4]" />

      {/* Floating radial grid background layer */}
      <div className="fixed inset-0 bg-[radial-gradient(rgba(255,255,255,0.01)_1px,transparent_1px)] [background-size:32px_32px] pointer-events-none z-0" />

      {/* Absolute Cinematic Fullscreen Setup / Welcome Card */}
      <AnimatePresence>
        {showWelcomeScreen && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 bg-[#040406] z-50 flex items-center justify-center p-6 text-center"
          >
            <div className="max-w-md flex flex-col items-center gap-6">
              <div className="w-16 h-16 rounded-full border border-[#00d5ff]/30 flex items-center justify-center relative bg-zinc-950/80">
                <Cpu className="w-8 h-8 text-[#00d5ff] animate-pulse" />
                <div className="absolute inset-0 border border-dashed border-[#00d5ff] rounded-full animate-spin [animation-duration:12s]" />
              </div>
              
              <div className="space-y-2">
                <span className="font-mono text-[9px] text-[#00d5ff] uppercase tracking-[0.25em]">
                  SİBERNETİK_BAĞLAM_İS
                </span>
                <h2 className="font-sans font-bold text-2xl text-white tracking-widest uppercase">
                  MATRİS KORİDORUNA GİRİŞ
                </h2>
                <p className="font-mono text-[11px] text-zinc-500 uppercase leading-relaxed pt-2">
                  Optik siyan sistemler ve çözünen sırlarla dolu, koyu obsidyen cam raflardan oluşan sonsuz bir dikey matris koridorunda kamera takibi.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowWelcomeScreen(false);
                  setConfig((prev) => ({ ...prev, isMuted: false }));
                  playCyberBlip('inject');
                }}
                className="font-mono text-xs text-[#00d5ff] border border-[#00d5ff]/40 bg-[#00d5ff]/10 hover:bg-[#00d5ff]/25 px-6 py-3 rounded font-bold uppercase cursor-pointer transition-all hover:text-white hover:shadow-[0_0_12px_rgba(0,213,255,0.3)]"
              >
                SES VE SİSTEM ÇEKİRDEĞİNİ BAŞLAT
              </button>

              <button
                onClick={() => {
                  setShowWelcomeScreen(false);
                  playCyberBlip('inject');
                }}
                className="font-mono text-[10px] text-zinc-650 hover:text-zinc-400 capitalize transition-colors cursor-pointer bg-transparent border-none"
              >
                Sessiz geliştirici modunda başlat
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Symmetrical Left Wing: Swiss Metadata Hud Panel (Width: 380px) */}
      <div className="w-full xl:w-[380px] h-1/2 xl:h-full shrink-0 border-r border-zinc-900 overflow-hidden z-20 bg-[#040406]">
        <SymmetryHud
          codeFeed={codeFeed}
          secrets={secrets}
          onInfectSnippet={handleInfectSnippet}
          onDissolveSecret={handleDissolveSecret}
          onLaunch={onLaunch}
        />
      </div>

      {/* Right Wing: Cinematic Visualizer Viewport + Control Terminal Rack */}
      <div className="flex-grow flex flex-col h-1/2 xl:h-full overflow-hidden z-10 relative">
        
        {/* Cinematic Render Port (Center) */}
        <div className="flex-grow relative border-b border-zinc-900 bg-[#040406] overflow-hidden">
          
          {/* Background Layer: 3D Dolly Corridor */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            <CyberCanvas
              config={config}
              secretsCount={secrets.filter((s) => s.status === 'STABLE').length}
              onExplosionTrigger={handleExplosionTrigger}
              activeCodeSnippets={activeCodeSnippets}
              triggerAmberPing={triggerAmberPing}
              onResetAmberTrigger={() => setTriggerAmberPing(false)}
            />
          </div>

          {/* Symmetrical Swiss vertical grid lines overlays */}
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-full max-w-[1200px] -translate-x-1/2 px-4 md:px-6 lg:px-8 xl:px-12">
            <div className="h-full w-full border-x border-white/[0.015]" />
          </div>

          {/* Quick HUD Overlay HUD Title */}
          <div className="absolute top-6 left-6 pointer-events-none md:flex flex-col gap-1 hidden z-20">
            <span className="font-sans font-bold text-xs tracking-widest text-[#00d5ff] uppercase flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00d5ff]" />
              SİBER_BAĞLAM_3D_KAFESİ
            </span>
            <span className="font-mono text-[9px] text-zinc-500 uppercase tracking-tight">
              TAKİP_KAMERASI: İLERİ_DÖNGÜ // SEKTÖR_44
            </span>
          </div>

          {/* Neon Floating Launch Button Overlay on Canvas */}
          <div className="absolute top-6 right-6 md:flex items-center gap-3 hidden z-30">
            <button
              onClick={onLaunch}
              className="px-4 py-2 bg-[#00d5ff]/15 hover:bg-[#00d5ff]/30 border border-[#00d5ff]/40 hover:border-[#00d5ff] text-[#00d5ff] hover:text-white font-mono font-bold text-xs uppercase tracking-widest rounded transition-all hover:shadow-[0_0_15px_rgba(0,213,255,0.4)] cursor-pointer"
            >
              SİSTEM KOKPİTİNİ BAŞLAT →
            </button>
          </div>

          {/* Foreground Layer: Scrolling Editorial Narrative sections */}
          <div className="absolute inset-0 z-20 overflow-y-auto scrollbar-thin select-text bg-gradient-to-b from-[#040406]/35 via-transparent to-[#040406]/45 px-8 md:px-16 scroll-smooth">
            
            <div className="relative w-full max-w-[1000px] mx-auto py-24 space-y-64">
              
              {/* HERO Segment */}
              <section className="min-h-[70vh] flex flex-col justify-center items-center text-center space-y-8 pt-10">
                <Badge tone="cyan" variant="low" className="glow-ambient border border-optic-cyan/15 bg-optic-cyan/5">
                  <Sparkles className="w-3 h-3 mr-1 text-[#00d5ff] animate-pulse" />
                  Yapay Zeka Mühendisliği İçin Yaşayan Bir Hafıza Katmanı
                </Badge>

                <h1 
                  ref={headlineRevealRef} 
                  className="text-4xl md:text-7xl font-bold tracking-tight text-white font-sans max-w-3xl leading-tight text-mask-reveal"
                >
                  <span className="text-mask-reveal-inner block">
                    Yapay Zeka Ajanları İçin <br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00d5ff] to-evidence-green">
                      Bağlam İşletim Sistemi.
                    </span>
                  </span>
                </h1>

                <p 
                  ref={subheadRevealRef} 
                  className="text-xs md:text-sm text-zinc-400 max-w-lg leading-relaxed font-sans font-light text-mask-reveal"
                >
                  <span className="text-mask-reveal-inner block">
                    Y; devasa kod tabanlarını, dosyaları, karamsar kilitleri ve FSM yaşam döngüsü metriklerini temiz, token-sınırlı bağlam paketlerine sıkıştırır. Ajanlarınıza ihtiyaç duydukları operasyonel hafızayı kazandırın.
                  </span>
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 z-30">
                  <Button 
                    ref={exploreBtnRef} 
                    variant="primary" 
                    size="lg" 
                    onClick={onLaunch}
                    className="shimmer-hover scale-press font-mono text-xs border border-[#00d5ff]/50 bg-[#00d5ff]/10 text-[#00d5ff] hover:bg-[#00d5ff]/20 px-6 py-3 rounded"
                  >
                    İşletim Sistemini Keşfet
                  </Button>
                  <Button 
                    ref={launchBtnRef} 
                    variant="ghost" 
                    size="lg" 
                    onClick={() => {
                      const el = document.getElementById('collapse-section');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="scale-press font-mono text-xs text-zinc-550 hover:text-zinc-300 px-6 py-3"
                  >
                    Deneyim Alanını İncele
                  </Button>
                </div>
              </section>

              {/* SECTION 2: Interactive Capabilities Playground Sandbox */}
              <section id="collapse-section" className="space-y-12 text-left scroll-mt-24">
                <div className="text-center space-y-4">
                  <Badge tone="cyan" variant="low" className="border border-optic-cyan/15 bg-optic-cyan/5">
                    Etkileşimli Yetenek Deneyim Alanı (Sandbox)
                  </Badge>
                  <h2 className="text-2xl md:text-5xl font-black text-white tracking-tight leading-tight">
                    Y-OS Nasıl Çalışır? <br/>
                    <span className="text-[#00d5ff]">Aşağıdaki canlı simülasyonları deneyin</span>
                  </h2>
                  <p className="text-xs text-zinc-400 max-w-lg mx-auto leading-relaxed font-sans font-light text-center">
                    Bağlam sıkıştırma, güvenlik maskeleme ve ABAC yetki denetimi servislerimizi gerçek zamanlı olarak test edin.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  
                  {/* Sandbox 1: Context Compactor */}
                  <Card glow className="glass-panel hover-lift p-6 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-2">
                          <Cpu className="w-4 h-4 text-[#00d5ff] animate-pulse" />
                          <h3 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wide">
                            1. Bağlam Sıkıştırıcı (Compactor)
                          </h3>
                        </div>
                        <Badge tone="cyan" variant="low">AST Token Tasarrufu</Badge>
                      </div>

                      <div className="space-y-4 text-xs font-mono text-zinc-400">
                        <div className="space-y-1.5">
                          <div className="flex justify-between">
                            <span>Kod Tabanı Boyutu:</span>
                            <span className="text-white font-bold">{sandboxCodebaseSize}K Satır</span>
                          </div>
                          <input 
                            type="range" 
                            min="10" 
                            max="500" 
                            value={sandboxCodebaseSize}
                            onChange={(e) => setSandboxCodebaseSize(Number(e.target.value))}
                            className="w-full accent-[#00d5ff] h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between">
                            <span>Hedef Token Bütçesi:</span>
                            <span className="text-white font-bold">{sandboxTokenBudget}K Token</span>
                          </div>
                          <input 
                            type="range" 
                            min="20" 
                            max="150" 
                            value={sandboxTokenBudget}
                            onChange={(e) => setSandboxTokenBudget(Number(e.target.value))}
                            className="w-full accent-[#00d5ff] h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <span>Sıkıştırma Algoritması:</span>
                          <select 
                            value={sandboxTaskMode}
                            onChange={(e) => setSandboxTaskMode(e.target.value)}
                            className="w-full text-slate-100 p-2 rounded-lg outline-none glass-input"
                          >
                            <option value="AST Traversal">AST Bağımlılık Taraması</option>
                            <option value="File Graph Walk">Dosya Grafiği BFS Araması</option>
                            <option value="Greedy Context Ingest">Açgözlü (Greedy) Bağlam Alımı</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-zinc-900/60 space-y-4">
                      <Button 
                        variant="command" 
                        size="sm" 
                        onClick={handleRunCompactor}
                        loading={sandboxCompacting}
                        className="w-full shimmer-hover"
                      >
                        Sıkıştırılmış Paket Üret
                      </Button>

                      {sandboxCompactResult && (
                        <div className="p-3 bg-black/60 rounded border border-zinc-900 font-mono text-[9px] text-slate-300 space-y-1 leading-normal text-left">
                          <div className="text-evidence-green font-bold">✓ Üretim Başarıyla Tamamlandı:</div>
                          <div>Paket Boyutu: {sandboxCompactResult.size} token</div>
                          <div>Tahmini Tasarruf Oranı: {sandboxCompactResult.savings}</div>
                          <div className="text-zinc-500">{sandboxCompactResult.log}</div>
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Sandbox 2: Security Redactor */}
                  <Card glow className="glass-panel hover-lift p-6 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-2">
                          <ShieldCheck className="w-4 h-4 text-[#00d5ff]" />
                          <h3 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wide">
                            2. Güvenlik Maskeleyicisi (Redactor)
                          </h3>
                        </div>
                        <Badge tone="success" variant="low">Gerçek Zamanlı Ayıklama</Badge>
                      </div>

                      <div className="space-y-2 text-xs font-mono">
                        <span className="text-zinc-400">Ham log / konfigürasyon girdisi (Düzenlemeyi deneyin):</span>
                        <textarea
                          value={sandboxSecretInput}
                          onChange={(e) => handleSecretInputChange(e.target.value)}
                          className="w-full h-24 text-[#ef4444]/90 p-3 rounded-lg outline-none font-mono text-[10px] leading-relaxed resize-none glass-input"
                        />
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-zinc-900/60 space-y-2 text-xs font-mono">
                      <span className="text-zinc-400 block text-left">Temizlenmiş Güvenli Çıktı:</span>
                      <pre className="w-full min-h-[64px] bg-black/60 text-slate-200 p-3 rounded border border-zinc-900 font-mono text-[9px] whitespace-pre-wrap leading-relaxed select-text text-left">
                        {sandboxRedactResult}
                      </pre>
                    </div>
                  </Card>

                  {/* Sandbox 3: ABAC Policy Guard */}
                  <Card glow className="glass-panel hover-lift p-6 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-2">
                          <Layers className="w-4 h-4 text-[#00d5ff]" />
                          <h3 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wide">
                            3. ABAC Yetki Sınırı Denetleyicisi
                          </h3>
                        </div>
                        <Badge tone="warning" variant="low">Erişim Geçidi</Badge>
                      </div>

                      <div className="space-y-3 text-xs font-mono text-zinc-400">
                        <div className="space-y-1">
                          <span>Erişici Rolü (Principal Role):</span>
                          <select 
                            value={sandboxAbacRole}
                            onChange={(e) => {
                              const newRole = e.target.value;
                              setSandboxAbacRole(newRole);
                              handleAbacEvaluate(newRole, sandboxAbacPath, sandboxAbacAction);
                            }}
                            className="w-full text-slate-100 p-2 rounded-lg outline-none glass-input"
                          >
                            <option value="developer">Developer (Geliştirici)</option>
                            <option value="ci-cd">CI/CD Otomasyon Ajanı</option>
                            <option value="admin">Administrator (Yönetici)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <span>Hedef Dosya / Klasör Yolu:</span>
                          <select 
                            value={sandboxAbacPath}
                            onChange={(e) => {
                              const newPath = e.target.value;
                              setSandboxAbacPath(newPath);
                              handleAbacEvaluate(sandboxAbacRole, newPath, sandboxAbacAction);
                            }}
                            className="w-full text-slate-100 p-2 rounded-lg outline-none glass-input"
                          >
                            <option value="/src/components/AIMissionControlPanel.tsx">/src/components/AIMissionControlPanel.tsx</option>
                            <option value="/secrets.env">/secrets.env</option>
                            <option value="../../etc/passwd">../../etc/passwd (Dizin Aşma Sınırı)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <span>Eylem Türü (Action Type):</span>
                          <select 
                            value={sandboxAbacAction}
                            onChange={(e) => {
                              const newAction = e.target.value;
                              setSandboxAbacAction(newAction);
                              handleAbacEvaluate(sandboxAbacRole, sandboxAbacPath, newAction);
                            }}
                            className="w-full text-slate-100 p-2 rounded-lg outline-none glass-input"
                          >
                            <option value="read">READ (Okuma)</option>
                            <option value="write">WRITE (Yazma)</option>
                            <option value="delete">DELETE (Silme)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-zinc-900/60 flex items-center justify-between gap-4 font-mono text-xs">
                      <div className="text-left">
                        <span className="text-[10px] text-zinc-500 uppercase block">Güvenlik Hükmü</span>
                        <span className={`font-bold mt-1 block ${
                          sandboxAbacDecision.startsWith("YETKİLENDİRİLDİ") ? "text-evidence-green" : "text-[#ef4444]"
                        }`}>
                          {sandboxAbacDecision}
                        </span>
                      </div>
                      <Badge 
                        tone={sandboxAbacDecision.startsWith("YETKİLENDİRİLDİ") ? "success" : "danger"} 
                        variant="low"
                      >
                        {sandboxAbacDecision.startsWith("YETKİLENDİRİLDİ") ? "GEÇTİ" : "BLOKE"}
                      </Badge>
                    </div>
                  </Card>

                  {/* Sandbox 4: Forensic Audit Ledger */}
                  <Card glow className="glass-panel hover-lift p-6 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-2">
                          <Database className="w-4 h-4 text-[#00d5ff]" />
                          <h3 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wide">
                            4. Adli Denetim Günlüğü (Ledger)
                          </h3>
                        </div>
                        <Badge tone="cyan" variant="low">Değiştirilemez Log</Badge>
                      </div>

                      <p className="text-[10px] text-zinc-400 leading-relaxed font-sans font-light text-left">
                        Deneyim alanındaki her eylem kriptografik imzalı olay günlüğünü tetikler. Salt okunur denetim defteri.
                      </p>

                      <div className="bg-black/80 rounded-lg p-3 border border-zinc-850 font-mono text-[9px] text-slate-400 space-y-2 h-[130px] overflow-y-auto leading-normal select-text text-left">
                        {sandboxAuditLogs.map((log, idx) => (
                          <div key={idx} className="break-all border-b border-zinc-900/40 pb-1 last:border-b-0">
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 flex justify-between items-center text-[9px] text-zinc-500 font-mono">
                      <span>Log Giriş Sayısı: {sandboxAuditLogs.length}</span>
                      <span>SHA-256 İmzalı Seal: AKTİF</span>
                    </div>
                  </Card>

                </div>

                <div className="text-center pt-8">
                  <Button 
                    variant="primary" 
                    size="lg" 
                    onClick={onLaunch} 
                    className="shimmer-hover scale-press font-mono text-xs border border-[#00d5ff]/50 bg-[#00d5ff]/10 text-[#00d5ff] hover:bg-[#00d5ff]/20 px-8 py-3 rounded"
                  >
                    Sistem Kokpitine Giriş Yap
                  </Button>
                </div>
              </section>

            </div>
          </div>
        </div>

        {/* Synthesizer Parameters Controller Rack (Bottom) */}
        <div className="shrink-0 bg-[#040406] z-20 relative">
          <ControlTerminal
            config={config}
            onConfigChange={setConfig}
            onDeploySecret={handleDeploySecret}
            onCompileCode={handleCompileCode}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  NAVIGATION_CATEGORIES, 
  TabId 
} from "./navigation";
import { 
  Badge 
} from "../components/primitives/Badge";
import { 
  Database, 
  Cpu, 
  Activity, 
  Terminal, 
  ChevronDown, 
  ChevronRight,
  Sparkles,
  Settings,
  Menu,
  X
} from "lucide-react";
import { Project } from "@y/shared";

interface AppShellProps {
  children: React.ReactNode;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  projects: Project[];
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  healthStatus: any;
  metrics: any;
  setShowConfigModal?: (show: boolean) => void;
}

export function AppShell({
  children,
  activeTab,
  setActiveTab,
  projects,
  activeProjectId,
  setActiveProjectId,
  healthStatus,
  metrics,
  setShowConfigModal
}: AppShellProps) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    "mission-control": true,
    "projects-workspace": false,
    "context-os": false,
    "graph-intelligence": false,
    "artifact-cas": false,
    "task-lifecycle": false,
    "agent-network": false,
    "security-kernel": false,
    "evidence-audit": false,
    "worker-runtime": false,
    "database-migrations": false,
    "providers-connectors": false,
    "qa-validation": false,
    "documentation": false,
    "governance-kernel-debt": false
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isDbConnected = healthStatus?.database?.connected || false;

  return (
    <div id="y-os-cockpit-shell" className="min-h-screen bg-void-black text-slate-100 flex flex-col font-sans relative overflow-hidden select-none">
      
      {/* Film grain analog jitter texture */}
      <div className="noise-grain" />

      {/* Top Telemetry Header Panel */}
      <header className="min-h-14 border-b border-glass-border bg-graphite-dark/65 backdrop-blur-xl backdrop-saturate-150 flex items-center justify-between gap-3 px-4 py-3 z-30 shrink-0 relative lg:px-6">
        
        {/* Core Glyph */}
        <div className="flex items-center space-x-3.5">
          <div className="w-7 h-7 rounded-lg bg-optic-cyan/10 border border-optic-cyan/20 flex items-center justify-center text-optic-cyan font-mono font-bold text-sm tracking-tighter shadow-[0_0_8px_rgba(0,213,255,0.15)] glow-active-cyan">
            Y
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-semibold tracking-wider text-slate-200 uppercase font-sans">Y Bağlam İşletim Sistemi</span>
            <span className="text-[9px] font-mono text-steel-muted tracking-widest uppercase">Yapay Zeka Mühendislik Ajan Kokpiti v1.0.8</span>
          </div>
        </div>

        {/* Workspace Project Dropdown Selector */}
        <div className="flex items-center space-x-4">
          <div className="relative">
            <select
              value={activeProjectId}
              onChange={(e) => setActiveProjectId(e.target.value)}
              className="bg-graphite-dark/90 text-xs text-slate-200 pl-3 pr-8 py-1.5 rounded-lg border border-glass-border focus:border-optic-cyan/50 focus:outline-none appearance-none cursor-pointer font-sans"
            >
              {projects && projects.length > 0 ? (
                projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))
              ) : (
                <option value="default">Varsayılan Proje</option>
              )}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-steel-muted absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* Database connection details banner status */}
          <button 
            onClick={() => setShowConfigModal && setShowConfigModal(true)}
            className="flex items-center space-x-2 bg-graphite-light/75 hover:bg-white/5 border border-glass-border hover-lift px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-soft"
          >
            <Database className={`w-3.5 h-3.5 ${isDbConnected ? "text-evidence-green" : "text-signal-amber animate-pulse"}`} />
            <span className="text-[10px] font-mono tracking-wider uppercase">
              {isDbConnected ? "POSTGRES: AKTİF" : "YEREL AI SİMÜLASYONU"}
            </span>
          </button>
        </div>

        {/* Global Live Processor Telemetries */}
        <div className="hidden lg:flex items-center space-x-6 text-[10px] font-mono text-steel-muted">
          <div className="flex items-center space-x-2">
            <Activity className="w-3.5 h-3.5 text-optic-cyan" />
            <span>HIZ: <span className="text-slate-200 tabular-nums text-glow-cyan font-semibold">48.2K t/sn</span></span>
          </div>
          <div className="flex items-center space-x-2">
            <Cpu className="w-3.5 h-3.5 text-evidence-green" />
            <span>İŞÇİLER: <span className="text-slate-200 tabular-nums text-glow-green font-semibold">{metrics?.activeWorkers || 4} AKTİF</span></span>
          </div>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-3.5 h-3.5 text-signal-amber animate-pulse" />
            <span>DİZİNLENEN: <span className="text-slate-200 tabular-nums text-glow-amber font-semibold">{metrics?.totalTokensText || "12.45M"} TOKEN</span></span>
          </div>
        </div>

        {/* Mobile menu toggle button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-lg border border-glass-border bg-graphite-dark hover:bg-white/5 text-slate-300 lg:hidden cursor-pointer"
          aria-label="Menüyü Aç/Kapat"
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>

      </header>

      {/* Main Body Grid */}
      <div className="flex flex-1 flex-col overflow-hidden relative lg:flex-row">
        
        {/* Left Side: Category Spatial Side navigation panel */}
        <aside className={`border-r border-glass-border bg-graphite-dark/85 backdrop-blur-xl backdrop-saturate-150 flex flex-col justify-between shrink-0 z-20 transition-all duration-300 ${
          mobileMenuOpen 
            ? "fixed inset-0 top-14 w-full h-[calc(100vh-3.5rem)]" 
            : "hidden lg:flex lg:w-64"
        }`}>
          
          <nav className="flex-1 overflow-y-auto py-4 px-3.5 space-y-4 scrollbar-thin">
            {NAVIGATION_CATEGORIES.map(category => {
              const expanded = expandedCategories[category.id];
              return (
                <div key={category.id} className="space-y-1.5">
                  <button
                    onClick={() => toggleCategory(category.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleCategory(category.id);
                      }
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-mono font-bold tracking-wider text-steel-muted uppercase hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-optic-cyan rounded-md transition-colors cursor-pointer"
                    aria-expanded={expanded}
                  >
                    <span>{category.label}</span>
                    {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>

                  {expanded && (
                    <ul className="space-y-1 pl-1">
                      {category.items.map(item => {
                        const active = activeTab === item.id;
                        const Icon = item.icon;
                        const isPlaceholder = item.status === "placeholder";
                        return (
                          <li key={item.id}>
                            <button
                                onClick={() => {
                                  setActiveTab(item.id);
                                  setMobileMenuOpen(false);
                                }}
                              className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-all border font-sans select-none text-left ${
                                active 
                                  ? "bg-optic-cyan/10 border-optic-cyan/25 text-optic-cyan font-semibold shadow-[0_0_12px_rgba(0,213,255,0.06)]" 
                                  : "text-steel-muted hover:bg-white/5 border-transparent cursor-pointer hover:text-slate-200"
                              }`}
                              disabled={false}
                              title={item.description}
                            >
                              <div className="flex items-center space-x-2.5 min-w-0">
                                <Icon className={`w-4 h-4 shrink-0 ${active ? "text-optic-cyan" : "text-steel-muted"}`} />
                                <span className="truncate">{item.label}</span>
                              </div>
                              {isPlaceholder && (
                                <span className="text-[8px] font-mono border border-optic-cyan/25 text-optic-cyan/80 px-1 py-0.2 rounded uppercase select-none shrink-0 scale-90">
                                  Simüle
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Sidebar Cockpit Bottom Card */}
          <div className="p-3 border-t border-glass-border bg-void-black/75 flex items-center justify-between z-10 shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-graphite-light border border-glass-border flex items-center justify-center text-steel-muted">
                <Terminal className="w-4 h-4" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-semibold text-slate-300 font-sans">Aydinoglu</span>
                <span className="text-[8px] font-mono text-steel-muted uppercase tracking-wider">İNSAN OPERATÖR</span>
              </div>
            </div>
            <button 
              onClick={() => setShowConfigModal && setShowConfigModal(true)}
              className="p-1.5 rounded-lg bg-graphite-light hover:bg-white/5 border border-glass-border hover-lift text-steel-muted hover:text-slate-200 transition-all cursor-pointer shadow-soft"
              aria-label="Konfigürasyon Ayarları"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>

        </aside>

        {/* Swiss Editorial Vertical Page Guidelines split for cockpit modules */}
        <div className="pointer-events-none absolute inset-y-0 left-64 z-[2] hidden w-[calc(100%-256px)] px-8 lg:block">
          <div className="h-full w-full border-x border-white/[0.012]" />
        </div>

        {/* Right Side: Active view frame container */}
        <main className="flex-1 overflow-y-auto bg-void-black relative">
          
          {/* Subtle scanning horizontal grid backdrop overlay layer */}
          <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.015)_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none z-0" />
          
          <div className="relative z-10 p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto w-full">
            {children}
          </div>

        </main>

      </div>

    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CodeFeedItem, SecretInput } from '../types';
import { Shield, Cpu, RefreshCw, Layers, Terminal as TermIcon, Compass, ArrowRight } from 'lucide-react';

interface SymmetryHudProps {
  codeFeed: CodeFeedItem[];
  secrets: SecretInput[];
  onInfectSnippet: (id: string) => void;
  onDissolveSecret: (id: string) => void;
  onLaunch: () => void;
}

export default function SymmetryHud({
  codeFeed,
  secrets,
  onInfectSnippet,
  onDissolveSecret,
  onLaunch,
}: SymmetryHudProps) {
  return (
    <div className="flex flex-col h-full bg-[#040406] text-[#e0e0e3] border-r border-zinc-900 overflow-y-auto">
      {/* Symmetrical Header */}
      <div className="p-6 border-b border-zinc-900 flex flex-col gap-2 bg-[#040406]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#00d5ff] animate-pulse" />
            <h1 className="font-sans font-bold text-lg tracking-widest text-white uppercase">
              CONTAINER_OS v1.0.4
            </h1>
          </div>
          <span className="font-mono text-[9px] px-2 py-0.5 rounded border border-[#ef4444] text-[#ef4444] uppercase font-semibold">
            SECURE_VOID
          </span>
        </div>
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-tight leading-relaxed">
          Symmetrical Swiss grid node tracking matrix. Context operating systems interface coordinates & secrets monitoring.
        </p>

        {/* High-fidelity primary trigger to transition into Cockpit AppShell */}
        <button
          onClick={onLaunch}
          className="mt-3 w-full font-mono text-xs text-[#00d5ff] border border-[#00d5ff]/40 bg-[#00d5ff]/10 hover:bg-[#00d5ff]/25 px-4 py-2.5 rounded font-bold uppercase cursor-pointer transition-all hover:text-white flex items-center justify-center gap-2 hover:shadow-[0_0_12px_rgba(0,213,255,0.25)]"
        >
          <Cpu className="w-4 h-4 text-[#00d5ff] animate-pulse" />
          LAUNCH SYSTEM COCKPIT
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </button>
      </div>

      {/* Grid Sub-Modules */}
      <div className="grid grid-rows-2 flex-grow">
        {/* Module 1: Codebase Stream Inspector (Optic Cyan Structures) */}
        <div className="p-6 border-b border-zinc-900 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#00d5ff]" />
              <h2 className="font-sans font-semibold text-xs tracking-wider text-zinc-200 uppercase">
                CODE_STRUCTURE_FEED
              </h2>
            </div>
            <span className="font-mono text-[9px] text-[#00d5ff] flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-[#00d5ff] rounded-full animate-ping" />
              CYAN_STREAMING
            </span>
          </div>

          {/* Code item structures */}
          <div className="flex-grow overflow-y-auto space-y-3 pr-2 scrollbar-thin">
            {codeFeed.map((item) => (
              <div
                key={item.id}
                onClick={() => onInfectSnippet(item.id)}
                className="group relative cursor-pointer block p-3 bg-zinc-950 hover:bg-[#070b14] border border-zinc-900 hover:border-[#00d5ff]/30 transition-all rounded duration-200"
              >
                <div className="flex justify-between font-mono text-[9px] text-zinc-500 mb-1.5">
                  <span className="group-hover:text-[#00d5ff] font-medium transition-colors">
                    {item.label}
                  </span>
                  <span>{item.timestamp}</span>
                </div>
                <div className="font-mono text-[11px] text-zinc-300 truncate font-medium selection:bg-[#00d5ff]/20">
                  {item.code}
                </div>
                <div className="absolute right-3 bottom-2 flex gap-1.5 items-center">
                  <span className={`text-[8px] px-1.5 py-0.2 rounded font-semibold tracking-wider ${
                    item.status === 'INFECTED' 
                      ? 'bg-[#ef4444]/10 text-[#ef4444]' 
                      : item.status === 'COMPILED' 
                      ? 'bg-[#00d5ff]/10 text-[#00d5ff]' 
                      : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {item.status}
                  </span>
                </div>
                {/* Floating tool-tip cue on hover */}
                <div className="text-[8px] text-zinc-600 font-mono mt-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between border-t border-zinc-900">
                  <span>CLICK TO STREAM IN 3D CORRIDOR</span>
                  <TermIcon className="w-3 h-3 text-[#00d5ff]" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Module 2: Secrets Registry (Crimson dissolving embers) */}
        <div className="p-6 flex flex-col overflow-hidden bg-[#050508]/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#ef4444]" />
              <h2 className="font-sans font-semibold text-xs tracking-wider text-zinc-200 uppercase">
                ENCRYPTED_SECRETS_VAULT
              </h2>
            </div>
            <span className="font-mono text-[9px] text-[#ef4444] flex items-center gap-0.5">
              CRIMSON_DECAY
            </span>
          </div>

          {/* Secrets list */}
          <div className="flex-grow overflow-y-auto space-y-3 pr-2 scrollbar-thin">
            {secrets.map((sec) => (
              <div
                key={sec.id}
                className="group relative p-3 bg-zinc-950 border border-zinc-900 rounded flex flex-col justify-between hover:border-[#ef4444]/30 transition-all duration-200"
              >
                <div className="flex justify-between font-mono text-[9px] text-zinc-500 mb-1">
                  <span>DEPLOYED_ID: {sec.id.toUpperCase()}</span>
                  <span>{sec.timestamp}</span>
                </div>
                
                <div className="flex items-center justify-between mt-1">
                  <div className="font-mono text-[11px] text-[#ef4444] font-semibold select-all">
                    {sec.hash}
                  </div>
                  
                  {sec.status === 'STABLE' && (
                    <button
                      onClick={() => onDissolveSecret(sec.id)}
                      className="font-mono text-[8px] bg-[#ef4444]/10 hover:bg-[#ef4444]/20 border border-[#ef4444]/30 text-[#ef4444] px-2 py-0.5 rounded font-bold cursor-pointer transition-colors"
                    >
                      DISSOLVE
                    </button>
                  )}
                  {sec.status === 'DISSOLVING' && (
                    <div className="font-mono text-[8px] text-[#f59e0b] animate-pulse flex items-center gap-1 font-bold">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      STARDUST_BURST
                    </div>
                  )}
                  {sec.status === 'STARDUST_EMBEDDED' && (
                    <span className="font-mono text-[8px] text-zinc-500 text-right italic">
                      DISSOLVED_STABLE
                    </span>
                  )}
                </div>

                {/* Secret hint */}
                <div className="mt-1.5 pt-1.5 border-t border-zinc-900 font-mono text-[8px] text-zinc-600 flex justify-between items-center">
                  <span>DECAY STATE: <span className="text-zinc-400 font-medium">{sec.status}</span></span>
                  <span>ENTROPY: {sec.status === 'STARDUST_EMBEDDED' ? '100%' : '27.4%'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modernist footer */}
      <div className="p-4 border-t border-zinc-900 bg-zinc-950 flex items-center justify-between font-mono text-[8px] text-zinc-600">
        <div className="flex items-center gap-1">
          <Compass className="w-3 h-3 text-[#f59e0b]" />
          <span>MATRIX COORDINATOR CODES</span>
        </div>
        <span>[0.12 - SYMMETRIC]</span>
      </div>
    </div>
  );
}

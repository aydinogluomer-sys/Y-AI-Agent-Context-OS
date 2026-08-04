/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SystemConfig } from '../types';
import {
  Sliders,
  Sparkles,
  Database,
  Layers,
  Volume2,
  VolumeX,
  Play,
} from 'lucide-react';

interface ControlTerminalProps {
  config: SystemConfig;
  onConfigChange: (newConfig: SystemConfig) => void;
  onDeploySecret: (text: string) => void;
  onCompileCode: (text: string) => void;
}

export default function ControlTerminal({
  config,
  onConfigChange,
  onDeploySecret,
  onCompileCode,
}: ControlTerminalProps) {
  // Local state for controller inputs
  const [secretInput, setSecretInput] = useState('');
  const [codeSnippetInput, setCodeSnippetInput] = useState('');

  const updateParam = (key: keyof SystemConfig, val: any) => {
    onConfigChange({
      ...config,
      [key]: val,
    });
  };

  const handleSecretSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretInput.trim()) return;
    onDeploySecret(secretInput);
    setSecretInput('');
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeSnippetInput.trim()) return;
    onCompileCode(codeSnippetInput);
    setCodeSnippetInput('');
  };

  return (
    <div className="bg-[#040406] text-zinc-300 border-t border-zinc-900 p-6 font-mono text-[11px] grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Col 1: Interactive System Hardware Synthesizer Settings */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-2 border-b border-zinc-900 justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#f59e0b]" />
            <span className="font-sans font-bold text-white uppercase text-xs">DIRECTOR_HARDWARE_SYNTH</span>
          </div>
          <button
            onClick={() => updateParam('isMuted', !config.isMuted)}
            className="p-1 px-2 rounded bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 text-zinc-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
          >
            {config.isMuted ? <VolumeX className="w-3.5 h-3.5 text-zinc-600" /> : <Volume2 className="w-3.5 h-3.5 text-[#00d5ff]" />}
            <span className="text-[9px] uppercase">{config.isMuted ? 'Muted' : 'Audible'}</span>
          </button>
        </div>

        <div className="space-y-4">
          {/* Dolly Camera Speed */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-zinc-500 uppercase tracking-wide">Camera Dolly Tracking Veloc</span>
              <span className="text-white bg-zinc-950 px-1 text-[10px] border border-zinc-900">{config.cameraSpeed.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="2.00"
              step="0.05"
              value={config.cameraSpeed}
              onChange={(e) => updateParam('cameraSpeed', parseFloat(e.target.value))}
              className="w-full h-1 bg-zinc-900 accent-[#00d5ff] rounded cursor-pointer mt-1"
            />
          </div>

          {/* Focal Depth (Sharpest range) */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-zinc-500 uppercase tracking-wide">Macro Lens focal Plane Depth</span>
              <span className="text-white bg-zinc-950 px-1 text-[10px] border border-zinc-900">{config.focalDepth}u</span>
            </div>
            <input
              type="range"
              min="5"
              max="120"
              step="5"
              value={config.focalDepth}
              onChange={(e) => updateParam('focalDepth', parseInt(e.target.value))}
              className="w-full h-1 bg-zinc-900 accent-[#f59e0b] rounded cursor-pointer mt-1"
            />
          </div>

          {/* DoF Blur Strength */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-zinc-500 uppercase tracking-wide">Circle of Confusion Bokeh blur</span>
              <span className="text-white bg-zinc-950 px-1 text-[10px] border border-zinc-900">{config.dofStrength.toFixed(1)}px</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="3.0"
              step="0.1"
              value={config.dofStrength}
              onChange={(e) => updateParam('dofStrength', parseFloat(e.target.value))}
              className="w-full h-1 bg-zinc-900 accent-[#ef4444] rounded cursor-pointer mt-1"
            />
          </div>
        </div>
      </div>

      {/* Col 2: Code Stream compiler */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-2 border-b border-zinc-900">
          <Layers className="w-4 h-4 text-[#00d5ff]" />
          <span className="font-sans font-bold text-white uppercase text-xs">CYAN_CODE_COMPILER_BUS</span>
        </div>

        <form onSubmit={handleCodeSubmit} className="flex flex-col gap-2 flex-grow justify-between">
          <div>
            <p className="text-zinc-500 text-[10px] uppercase leading-relaxed mb-2.5">
              Input software code fragments to compile and propagate down vertical matrix.
            </p>
            <div className="relative">
              <input
                type="text"
                placeholder="const keys = system.compile_code();"
                value={codeSnippetInput}
                onChange={(e) => setCodeSnippetInput(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-900 focus:border-[#00d5ff]/50 px-3 py-2.5 rounded font-mono text-[11px] outline-none text-[#00d5ff] h-10 select-text"
              />
              <span className="absolute right-3 top-2.5 text-zinc-700 text-[10px]">TS_OS</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 mt-2">
            <span className="text-[9px] text-zinc-600 uppercase">STREAM PORT: 3000 // STABLE</span>
            <button
              type="submit"
              className="bg-[#00d5ff]/10 hover:bg-[#00d5ff]/25 border border-[#00d5ff]/45 text-[#00d5ff] font-bold px-3 py-2.5 rounded hover:text-white flex items-center gap-1.5 transition-all text-[10px] cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              INJECT OPTIC STREAM
            </button>
          </div>
        </form>
      </div>

      {/* Col 3: Secrets Dissolution engine */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 pb-2 border-b border-zinc-900">
          <Database className="w-4 h-4 text-[#ef4444]" />
          <span className="font-sans font-bold text-white uppercase text-xs">CRIMSON_SECRET_PROPAGATOR</span>
        </div>

        <form onSubmit={handleSecretSubmit} className="flex flex-col gap-2 flex-grow justify-between">
          <div>
            <p className="text-zinc-500 text-[10px] uppercase leading-relaxed mb-2.5">
              Deploy secure secret identifiers into the void walk. Witness secrets expand and decay into glowing stellar dust.
            </p>
            <div className="relative">
              <input
                type="text"
                placeholder="0xF992E3F91A8E20B (or password)"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-900 focus:border-[#ef4444]/50 px-3 py-2.5 rounded font-mono text-[11px] outline-none text-[#ef4444] h-10 select-text"
              />
              <span className="absolute right-3 top-2.5 text-zinc-700 text-[10px]">MD5_VAULT</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 mt-2">
            <span className="text-[9px] text-zinc-600 uppercase">VAULT PROTOCOL: SECURE</span>
            <button
              type="submit"
              className="bg-[#ef4444]/10 hover:bg-[#ef4444]/25 border border-[#ef4444]/45 text-[#ef4444] font-bold px-3 py-2.5 rounded hover:text-white flex items-center gap-1.5 transition-all text-[10px] cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              DEPLOY SECRET EMBER
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

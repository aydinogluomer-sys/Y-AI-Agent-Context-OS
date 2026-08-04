/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  tone?: "success" | "warning" | "danger" | "info" | "cyan" | "neutral";
  variant?: "low" | "high";
  className?: string;
}

export function Badge({ 
  children, 
  tone = "neutral", 
  variant = "low", 
  className = "" 
}: BadgeProps) {
  const baseStyle = "inline-flex items-center font-mono font-medium rounded text-[10px] tracking-wider px-2 py-0.5 border uppercase select-none";

  const tones = {
    success: {
      low: "bg-evidence-green/10 text-evidence-green border-evidence-green/20",
      high: "bg-evidence-green text-void-black border-evidence-green shadow-[0_0_8px_rgba(16,185,129,0.3)]"
    },
    warning: {
      low: "bg-signal-amber/10 text-signal-amber border-signal-amber/20",
      high: "bg-signal-amber text-void-black border-signal-amber shadow-[0_0_8px_rgba(245,158,11,0.3)]"
    },
    danger: {
      low: "bg-corruption-red/10 text-corruption-red border-corruption-red/20",
      high: "bg-corruption-red text-white border-corruption-red shadow-[0_0_8px_rgba(239,68,68,0.3)]"
    },
    info: {
      low: "bg-optic-cyan/10 text-optic-cyan border-optic-cyan/20",
      high: "bg-optic-cyan text-void-black border-optic-cyan shadow-[0_0_8px_rgba(0,213,255,0.3)]"
    },
    cyan: {
      low: "bg-optic-cyan/10 text-optic-cyan border-optic-cyan/20",
      high: "bg-optic-cyan text-void-black border-optic-cyan shadow-[0_0_8px_rgba(0,213,255,0.3)]"
    },
    neutral: {
      low: "bg-graphite-light text-steel-muted border-glass-border",
      high: "bg-steel-muted text-void-black border-steel-muted"
    }
  };

  return (
    <span className={`${baseStyle} ${tones[tone][variant]} ${className}`}>
      {children}
    </span>
  );
}

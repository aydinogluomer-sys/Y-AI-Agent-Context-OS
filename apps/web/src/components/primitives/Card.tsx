/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glow?: boolean;
  scanline?: boolean;
  className?: string;
}

export function Card({ 
  children, 
  glow = false, 
  scanline = false, 
  className = "", 
  ...props 
}: CardProps) {
  const baseStyle = "glass-panel rounded-xl p-6 transition-all duration-300 relative overflow-hidden";
  
  const glowStyle = glow ? "glow-active-cyan shadow-[0_0_15px_rgba(0,213,255,0.08)] border-optic-cyan/20" : "";
  const scanStyle = scanline ? "scan-line" : "";

  return (
    <div 
      className={`${baseStyle} ${glowStyle} ${scanStyle} ${className}`}
      {...props}
    >
      {/* Background radial gradient overlay */}
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black/10 pointer-events-none z-0" />
      
      {/* Card Content wrapper to force alignment on top of overlays */}
      <div className="relative z-10 w-full h-full flex flex-col">
        {children}
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Particle {
  x: number;
  y: number;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  angle: number;
  orbitRadius: number;
  slideProgress: number;
  slideSpeed: number;
  hubIndex: number;
  gridX: number;
  gridY: number;
  type?: "structure" | "secret" | "noise";
  opacity?: number;
}

export type PhaseName = 
  | "hero_chaos" 
  | "reverse_torus" 
  | "constellation_web" 
  | "core_contraction" 
  | "grid_reveal";

export interface PhaseRange {
  name: PhaseName;
  start: number;
  end: number;
}

export const PHASES: PhaseRange[] = [
  { name: "hero_chaos", start: 0.0, end: 0.2 },
  { name: "reverse_torus", start: 0.2, end: 0.4 },
  { name: "constellation_web", start: 0.4, end: 0.7 },
  { name: "core_contraction", start: 0.7, end: 0.9 },
  { name: "grid_reveal", start: 0.9, end: 1.0 }
];

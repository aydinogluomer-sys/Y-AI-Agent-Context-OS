/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PHASES, PhaseName } from "./particleTypes";

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutElastic(t: number): number {
  const c4 = (2 * Math.PI) / 3;
  return t === 0
    ? 0
    : t === 1
    ? 1
    : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

export interface PhaseTInfo {
  name: PhaseName;
  localT: number;
  easedT: number;
}

export function calculatePhaseProgress(scrollPercent: number, targetPhase: PhaseName): PhaseTInfo {
  const phase = PHASES.find(p => p.name === targetPhase);
  if (!phase) {
    return { name: targetPhase, localT: 0, easedT: 0 };
  }

  const localT = clamp((scrollPercent - phase.start) / (phase.end - phase.start), 0, 1);
  const easedT = easeInOutCubic(localT);

  return { name: targetPhase, localT, easedT };
}

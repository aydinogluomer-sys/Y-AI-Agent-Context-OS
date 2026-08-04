/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Particle {
  id: string;
  pos: Vector3D;
  vel: Vector3D;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface GlowingEmber {
  id: string;
  pos: Vector3D;
  vel: Vector3D;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  dissolving: boolean;
  stardust: Particle[];
  secretText?: string;
}

export interface NodeJunction {
  id: string;
  pos: Vector3D;
  pulseRadius: number;
  maxRadius: number;
  pulseSpeed: number;
  isActive: boolean;
  lastPulseTime: number;
}

export interface CyanStream {
  id: string;
  pos: Vector3D; // base position
  length: number;
  speed: number;
  charTrail: { char: string; yOffset: number; brightness: number }[];
  currentOffset: number;
}

export interface SystemConfig {
  cameraSpeed: number;
  focalDepth: number; // distance of sharpest focus from camera
  dofStrength: number; // strength of macro lens bokeh blur
  volumetricFogDensity: number; // density of atmospheric fog
  grainIntensity: number; // strength of 35mm film grain
  cyanIntensity: number; // brightness of cyan codebase streams
  secretEmberCount: number; // density of secret floating red particles
  ambientPulseSpeed: number; // speed of amber junctions pulsing
  gridComposition: 'centralized' | 'dual_horizon' | 'quad_matrix';
  isMuted: boolean;
}

export interface CodeFeedItem {
  id: string;
  timestamp: string;
  label: string;
  code: string;
  status: 'PENDING' | 'COMPILED' | 'INFECTED';
}

export interface SecretInput {
  id: string;
  hash: string;
  status: 'STABLE' | 'DECRYP_INIT' | 'DISSOLVING' | 'STARDUST_EMBEDDED';
  timestamp: string;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Particle } from "./particleTypes";
import { calculatePhaseProgress, clamp, easeOutElastic } from "./particlePhases";

export function initializeParticles(width: number, height: number, count: number): Particle[] {
  const particles: Particle[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  const torusRadius = Math.min(width, height) * 0.22;

  // Set up grid parameters for Phase 5 (structured reveal order)
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const gridSpacingX = width / (columns + 1);
  const gridSpacingY = height / (rows + 1);

  for (let i = 0; i < count; i++) {
    const colIdx = i % columns;
    const rowIdx = Math.floor(i / columns);

    const orbitRadius = i % 2 === 0 ? torusRadius : torusRadius * 1.15;
    const angle = Math.random() * Math.PI * 2;

    // Define Y-OS storytelling categories:
    // - structure (cyan #00d5ff): code nodes, AST mappings
    // - secret (red #ef4444): passwords, API keys to be redacted
    // - noise (grey #8e939e): plain text, unindexed comments
    const rand = Math.random();
    let type: "structure" | "secret" | "noise" = "noise";
    let color = "#8e939e";

    if (rand < 0.35) {
      type = "structure";
      color = "#00d5ff";
    } else if (rand >= 0.35 && rand < 0.6) {
      type = "secret";
      color = "#ef4444";
    }

    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      originX: Math.random() * width,
      originY: Math.random() * height,
      targetX: 0,
      targetY: 0,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 2 + 1,
      color,
      type,
      opacity: 1.0,
      angle,
      orbitRadius,
      slideProgress: Math.random(),
      slideSpeed: Math.random() * 0.008 + 0.004,
      hubIndex: Math.floor(Math.random() * count),
      gridX: gridSpacingX * (colIdx + 1),
      gridY: gridSpacingY * (rowIdx + 1)
    });
  }

  return particles;
}

export function updateParticles(
  particles: Particle[],
  scrollPercent: number,
  width: number,
  height: number,
  prefersReducedMotion: boolean,
  mouseX: number = 0,
  mouseY: number = 0
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const torusRadius = Math.min(width, height) * 0.22;

  // Calculate local eased progress markers
  const p1 = calculatePhaseProgress(scrollPercent, "hero_chaos");
  const p2 = calculatePhaseProgress(scrollPercent, "reverse_torus");
  const p3 = calculatePhaseProgress(scrollPercent, "constellation_web");
  const p4 = calculatePhaseProgress(scrollPercent, "core_contraction");
  const p5 = calculatePhaseProgress(scrollPercent, "grid_reveal");

  // Elastic vertical squashing parameters for Phase 4->5
  let bounceYOffset = 0;
  if (scrollPercent > 0.85 && scrollPercent < 0.95 && !prefersReducedMotion) {
    const bounceT = clamp((scrollPercent - 0.85) / 0.1, 0, 1);
    const elasticFactor = easeOutElastic(bounceT);
    bounceYOffset = Math.sin(bounceT * Math.PI * 6) * 18 * (1 - elasticFactor);
  }

  // Mouse interactive parallax coefficients
  // Strongest in the Hero phase (scroll = 0), and scales down dynamically as user scrolls down.
  const parallaxInfluence = Math.max(0, 1.0 - scrollPercent * 2.0);

  particles.forEach((p, idx) => {
    // 1. Resolve Target X & Y per Phase
    let tx = p.originX;
    let ty = p.originY;

    if (prefersReducedMotion) {
      // In reduced motion, particles perform slow floating without intense timelines
      p.x += p.vx * 0.1;
      p.y += p.vy * 0.1;
      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;
      return;
    }

    // Apply smooth mouse interactive parallax offset based on particle depth (size)
    const particleDepthFactor = p.size * 8.5; // larger particles sway more for 3D illusion
    tx += mouseX * particleDepthFactor * parallaxInfluence;
    ty += -mouseY * particleDepthFactor * parallaxInfluence; // reverse Y coordinate to match standard viewport

    // 2. Dynamic Redaction Fading during Phase 3 (constellation_web)
    // Secret (red) particles fade out to represents context redaction process
    if (scrollPercent > 0.4) {
      if (p.type === "secret") {
        p.opacity = Math.max(0, 1.0 - p3.easedT * 1.5); // Fades out completely early in Phase 3
      }
    } else {
      p.opacity = 1.0;
    }

    // Phase 2: Reverse Torus Gathering (Clockwise spin rotation)
    if (scrollPercent > 0.2) {
      const activeAngle = p.angle - (p2.easedT * Math.PI * 1.5);
      tx = centerX + Math.cos(activeAngle) * p.orbitRadius;
      ty = centerY + Math.sin(activeAngle) * p.orbitRadius;
    }

    // Phase 3: Constellation Web sliding along connection paths
    if (scrollPercent > 0.4) {
      p.slideProgress += p.slideSpeed;
      if (p.slideProgress > 1.0) p.slideProgress = 0.0;

      // Find the sibling node hub to slide towards
      const sibling = particles[p.hubIndex] || p;
      const targetAngle = sibling.angle - (p2.easedT * Math.PI * 1.5);
      const hubX = centerX + Math.cos(targetAngle) * sibling.orbitRadius;
      const hubY = centerY + Math.sin(targetAngle) * sibling.orbitRadius;

      // Slide along edge path
      const pathX = tx + (hubX - tx) * p.slideProgress;
      const pathY = ty + (hubY - ty) * p.slideProgress;

      tx = tx + (pathX - tx) * p3.easedT;
      ty = ty + (pathY - ty) * p3.easedT;
    }

    // Phase 4: Core Contraction
    if (scrollPercent > 0.7) {
      const tightX = centerX + (tx - centerX) * 0.15;
      const tightY = centerY + (ty - centerY) * 0.15;

      tx = tx + (tightX - tx) * p4.easedT;
      ty = ty + (tightY - ty) * p4.easedT;
    }

    // Phase 5: Structured Grid Reveal
    if (scrollPercent > 0.9) {
      tx = tx + (p.gridX - tx) * p5.easedT;
      ty = ty + (p.gridY - ty) * p5.easedT;
    }

    // Apply elastic bounce yOffset
    ty += bounceYOffset;

    // 3. Spring-Damping Integration
    p.targetX = tx;
    p.targetY = ty;

    const stiffness = scrollPercent > 0.9 ? 0.05 : 0.08;
    p.x += (p.targetX - p.x) * stiffness;
    p.y += (p.targetY - p.y) * stiffness;
  });
}

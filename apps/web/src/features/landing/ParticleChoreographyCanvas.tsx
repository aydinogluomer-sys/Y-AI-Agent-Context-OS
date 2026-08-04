/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from "react";
import { useScrollProgress } from "./useScrollProgress";
import { useReducedMotion } from "./useReducedMotion";
import { useCanvasResize } from "./useCanvasResize";
import { initializeParticles, updateParticles } from "./particleEngine";
import { Particle } from "./particleTypes";

export function ParticleChoreographyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollPercent = useScrollProgress();
  const prefersReducedMotion = useReducedMotion();
  const { width, height } = useCanvasResize(canvasRef);

  const particlesRef = useRef<Particle[]>([]);
  const prevWidth = useRef<number>(0);
  const prevHeight = useRef<number>(0);

  // Mouse coordinate refs for interactive parallax LERPing
  const mouseX = useRef<number>(0);
  const mouseY = useRef<number>(0);
  const curMouseX = useRef<number>(0);
  const curMouseY = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined" || prefersReducedMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Normalize coordinate inputs to range [-1, 1]
      mouseX.current = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY.current = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [prefersReducedMotion]);

  // Initialize and adjust particles dynamically based on size & screen tiering
  useEffect(() => {
    if (width <= 0 || height <= 0) return;

    let targetCount = 420; // High-Performance Desktop default
    if (width < 640) {
      targetCount = 100; // Low-Power / Mobile
    } else if (width < 1024) {
      targetCount = 220; // Mid-Range / Tablet
    }

    if (particlesRef.current.length !== targetCount) {
      particlesRef.current = initializeParticles(width, height, targetCount);
    } else if (prevWidth.current !== width || prevHeight.current !== height) {
      // Proportional resizing adjustment to avoid reset layout pops
      const columns = Math.ceil(Math.sqrt(targetCount));
      const rows = Math.ceil(targetCount / columns);
      const gridSpacingX = width / (columns + 1);
      const gridSpacingY = height / (rows + 1);

      particlesRef.current.forEach((p, i) => {
        const colIdx = i % columns;
        const rowIdx = Math.floor(i / columns);

        if (prevWidth.current && prevHeight.current) {
          p.originX = (p.originX / prevWidth.current) * width;
          p.originY = (p.originY / prevHeight.current) * height;
          p.x = (p.x / prevWidth.current) * width;
          p.y = (p.y / prevHeight.current) * height;
        }

        p.gridX = gridSpacingX * (colIdx + 1);
        p.gridY = gridSpacingY * (rowIdx + 1);
      });
    }

    prevWidth.current = width;
    prevHeight.current = height;
  }, [width, height]);

  // Main animation loop with loop safety checks
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId = 0;

    const tick = () => {
      // Loop Safety 1: Pause rendering if tab is hidden
      if (document.hidden) {
        animationFrameId = requestAnimationFrame(tick);
        return;
      }

      // Loop Safety 2: Pause rendering if canvas is scrolled out of viewport
      const rect = canvas.getBoundingClientRect();
      const isVisible = rect.bottom >= 0 && rect.top <= window.innerHeight;
      if (!isVisible) {
        animationFrameId = requestAnimationFrame(tick);
        return;
      }

      // Smoothly LERP mouse positions for fluid lag parallax
      curMouseX.current += (mouseX.current - curMouseX.current) * 0.08;
      curMouseY.current += (mouseY.current - curMouseY.current) * 0.08;

      // Apply physics vector updates with LERPed mouse coordinates
      if (particlesRef.current.length > 0) {
        updateParticles(
          particlesRef.current,
          scrollPercent,
          width,
          height,
          prefersReducedMotion,
          curMouseX.current,
          curMouseY.current
        );
      }

      // High-performance canvas drawing prep
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 1. Draw network paths spanned between sibling hubs (Phase 3+)
      if (scrollPercent > 0.4 && !prefersReducedMotion) {
        const edgeProgress = Math.min((scrollPercent - 0.4) / 0.15, 1.0);
        ctx.strokeStyle = `rgba(0, 213, 255, ${0.08 * edgeProgress})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        
        particlesRef.current.forEach((p) => {
          const sibling = particlesRef.current[p.hubIndex];
          if (sibling) {
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(sibling.x, sibling.y);
          }
        });
        ctx.stroke();

        // Glowing Context Pack Core (Torus) assembly helper
        const centerX = width / 2;
        const centerY = height / 2;
        const torusRadius = Math.min(width, height) * 0.22;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, torusRadius * 0.8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 213, 255, ${0.04 * edgeProgress})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 2. Draw particle nodes
      particlesRef.current.forEach((p) => {
        const opacity = p.opacity !== undefined ? p.opacity : 1.0;
        if (opacity <= 0.01) return; // Skip completely faded out particles

        ctx.save();
        ctx.globalAlpha = opacity;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;

        // Apply optic glowing blur shadow filters selectively to cyan active nodes
        if (scrollPercent > 0.3 && p.color === "#00d5ff" && !prefersReducedMotion) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = "#00d5ff";
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fill();
        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [width, height, scrollPercent, prefersReducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0 opacity-75"
    />
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";

interface UseMagneticOptions {
  strength?: number; // magnetic force scale (default: 0.3)
  radius?: number; // hover influence boundary radius in pixels (default: 50)
}

/**
 * useMagnetic — pulls an element elegantly towards the mouse cursor on hover.
 */
export function useMagnetic<T extends HTMLElement>({
  strength = 0.3,
  radius = 60,
}: UseMagneticOptions = {}) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;

    // Respect system reduced motion
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let rafId = 0;

    const onMouseMove = (e: MouseEvent) => {
      const bound = el.getBoundingClientRect();
      const elX = bound.left + bound.width / 2;
      const elY = bound.top + bound.height / 2;

      const distX = e.clientX - elX;
      const distY = e.clientY - elY;
      const distance = Math.hypot(distX, distY);

      if (distance < radius) {
        // Apply magnet force pull
        targetX = distX * strength;
        targetY = distY * strength;
      } else {
        // Return to anchor position
        targetX = 0;
        targetY = 0;
      }
    };

    const onMouseLeave = () => {
      targetX = 0;
      targetY = 0;
    };

    const tick = () => {
      const diffX = targetX - currentX;
      const diffY = targetY - currentY;

      if (Math.abs(diffX) > 0.05 || Math.abs(diffY) > 0.05) {
        currentX += diffX * 0.12;
        currentY += diffY * 0.12;
        el.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        rafId = requestAnimationFrame(tick);
      } else {
        el.style.transform = targetX === 0 && targetY === 0 ? "" : `translate3d(${targetX}px, ${targetY}px, 0)`;
        currentX = targetX;
        currentY = targetY;
        rafId = requestAnimationFrame(tick);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    el.addEventListener("mouseleave", onMouseLeave);
    
    // Start tick loop
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      el.removeEventListener("mouseleave", onMouseLeave);
      cancelAnimationFrame(rafId);
      el.style.transform = "";
    };
  }, [strength, radius]);

  return ref;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from "react";

/**
 * AuroraOrb — mouse-following organic radial ambient blur.
 */
export function AuroraOrb() {
  const orbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const orb = orbRef.current;
    if (!orb || typeof window === "undefined") return;

    // Respect user prefers-reduced-motion
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = window.innerWidth / 2;
    let currentY = window.innerHeight / 2;
    let rafId = 0;

    const onMouseMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
    };

    const tick = () => {
      const diffX = targetX - currentX;
      const diffY = targetY - currentY;

      // Smoothed liquid follow
      currentX += diffX * 0.05;
      currentY += diffY * 0.05;

      orb.style.transform = `translate3d(${currentX - 250}px, ${currentY - 250}px, 0)`;
      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMouseMove);
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={orbRef}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 w-[500px] h-[500px] rounded-full mix-blend-screen filter blur-[100px] opacity-[0.07] z-[1] transition-opacity duration-1000 select-none bg-[radial-gradient(circle_at_center,var(--color-optic-cyan)_0%,rgba(16,185,129,0.4)_50%,transparent_100%)]"
    />
  );
}

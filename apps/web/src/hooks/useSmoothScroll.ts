/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";

/**
 * useSmoothScroll — delivers high-performance LERP-based smooth scrolling
 * for public/landing narratives while fully respecting system reduced-motion.
 */
export function useSmoothScroll(active: boolean = true) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    // Check prefers-reduced-motion to keep native behavior intact
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const html = document.documentElement;
    const body = document.body;

    let targetScrollY = window.scrollY;
    let currentScrollY = window.scrollY;
    let isMoving = false;

    const onWheel = (e: WheelEvent) => {
      // Allow default behavior inside textareas, selects, or overflow containers
      const target = e.target as HTMLElement;
      if (target?.closest("textarea") || target?.closest(".overflow-y-auto")) {
        return;
      }

      e.preventDefault();
      targetScrollY += e.deltaY * 0.85;
      
      // Bounded clamping
      const maxScroll = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight
      ) - window.innerHeight;

      targetScrollY = Math.max(0, Math.min(targetScrollY, maxScroll));

      if (!isMoving) {
        isMoving = true;
        requestAnimationFrame(tick);
      }
    };

    const tick = () => {
      const diff = targetScrollY - currentScrollY;
      if (Math.abs(diff) > 0.3) {
        // High-fidelity LERP factor
        currentScrollY += diff * 0.085;
        window.scrollTo(0, currentScrollY);
        requestAnimationFrame(tick);
      } else {
        window.scrollTo(0, targetScrollY);
        currentScrollY = targetScrollY;
        isMoving = false;
      }
    };

    const onScroll = () => {
      if (!isMoving) {
        currentScrollY = window.scrollY;
        targetScrollY = window.scrollY;
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
    };
  }, [active]);
}

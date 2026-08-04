/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";

/**
 * AwwwardsCursor — premium custom cursor lens.
 */
export function AwwwardsCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Guard 1: Disable completely on touch devices or reduced motion
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isTouch || reducedMotion) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let mouseX = 0;
    let mouseY = 0;
    let currentX = 0;
    let currentY = 0;
    let rafId = 0;

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!visible) setVisible(true);
    };

    const onMouseLeave = () => {
      setVisible(false);
    };

    const tick = () => {
      // Direct positioning for fast inner dot
      dot.style.transform = `translate3d(${mouseX - 3}px, ${mouseY - 3}px, 0)`;

      // LERPed coordinate tracking for smooth outer ring drag
      const diffX = mouseX - currentX;
      const diffY = mouseY - currentY;
      currentX += diffX * 0.15;
      currentY += diffY * 0.15;

      ring.style.transform = `translate3d(${currentX - 16}px, ${currentY - 16}px, 0) scale(${expanded ? 1.8 : 1})`;
      rafId = requestAnimationFrame(tick);
    };

    // Event listeners to handle interactive element hover expansion
    const setupInteractiveListeners = () => {
      const interactiveEls = document.querySelectorAll(
        'button, a, input, select, textarea, [data-cursor-expand="true"]'
      );

      const handleEnter = () => setExpanded(true);
      const handleLeave = () => setExpanded(false);

      interactiveEls.forEach((el) => {
        el.addEventListener("mouseenter", handleEnter);
        el.addEventListener("mouseleave", handleLeave);
      });

      return () => {
        interactiveEls.forEach((el) => {
          el.removeEventListener("mouseenter", handleEnter);
          el.removeEventListener("mouseleave", handleLeave);
        });
      };
    };

    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseleave", onMouseLeave);
    rafId = requestAnimationFrame(tick);

    // Initial setup and mutation observer to handle dynamic SPA mounts
    const cleanupListeners = setupInteractiveListeners();

    const observer = new MutationObserver(() => {
      setupInteractiveListeners();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      cancelAnimationFrame(rafId);
      cleanupListeners();
      observer.disconnect();
    };
  }, [expanded, visible]);

  if (typeof window === "undefined") return null;

  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (isTouch || reducedMotion) return null;

  return (
    <>
      {/* Tiny solid center core pointer */}
      <div
        ref={dotRef}
        className="pointer-events-none fixed top-0 left-0 w-1.5 h-1.5 rounded-full bg-optic-cyan z-[99999] transition-opacity duration-300 pointer-events-none select-none mix-blend-difference"
        style={{ opacity: visible ? 1 : 0 }}
      />
      {/* Lag-smoothed interactive outer lens */}
      <div
        ref={ringRef}
        className="pointer-events-none fixed top-0 left-0 w-8 h-8 rounded-full border border-optic-cyan/45 z-[99998] transition-opacity duration-300 pointer-events-none select-none mix-blend-difference"
        style={{
          opacity: visible ? 1 : 0,
          backgroundColor: expanded ? "rgba(0, 213, 255, 0.05)" : "transparent",
          transition: "opacity 0.3s, background-color 0.3s, border-color 0.3s",
        }}
      />
    </>
  );
}

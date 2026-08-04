/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";

export function useScrollProgress(): number {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    let activeFrame = 0;

    const handleScroll = () => {
      if (activeFrame) return;

      activeFrame = requestAnimationFrame(() => {
        const docH = document.documentElement.scrollHeight;
        const winH = window.innerHeight;
        const currentScroll = window.scrollY;
        
        const totalScrollable = docH - winH;
        if (totalScrollable <= 0) {
          setScrollProgress(0);
        } else {
          setScrollProgress(currentScroll / totalScrollable);
        }
        activeFrame = 0;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Trigger initial calculation
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (activeFrame) cancelAnimationFrame(activeFrame);
    };
  }, []);

  return scrollProgress;
}

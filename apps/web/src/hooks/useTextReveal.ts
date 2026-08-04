/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";

interface UseTextRevealOptions {
  threshold?: number;
  delayMs?: number;
}

/**
 * useTextReveal — leverages IntersectionObserver to add a ".revealed" class 
 * to wrapped text lines, triggering a premium CSS mask-reveal transition.
 */
export function useTextReveal<T extends HTMLElement>({
  threshold = 0.1,
  delayMs = 150,
}: UseTextRevealOptions = {}) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              // Find all inner child lines and trigger slide
              const inners = el.querySelectorAll(".text-mask-reveal-inner");
              if (inners.length > 0) {
                inners.forEach((inner) => inner.classList.add("revealed"));
              } else {
                el.classList.add("revealed");
              }
            }, delayMs);
            
            // Stop observing once triggered
            observer.unobserve(el);
          }
        });
      },
      { threshold }
    );

    observer.observe(el);

    return () => {
      if (el) observer.unobserve(el);
    };
  }, [threshold, delayMs]);

  return ref;
}

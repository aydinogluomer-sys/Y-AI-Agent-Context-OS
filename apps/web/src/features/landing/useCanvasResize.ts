/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, RefObject } from "react";

export interface CanvasDimensions {
  width: number;
  height: number;
}

export function useCanvasResize(canvasRef: RefObject<HTMLCanvasElement | null>): CanvasDimensions {
  const [dimensions, setDimensions] = useState<CanvasDimensions>({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = (width: number, height: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      
      // Set backing store dimensions scaled by DPR
      canvas.width = width * dpr;
      canvas.height = height * dpr;

      // Set style dimensions to logical size
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      setDimensions({ width, height });
    };

    // Initialize with parent element size or window size
    const parent = canvas.parentElement;
    const initialWidth = parent ? parent.clientWidth : window.innerWidth;
    const initialHeight = parent ? parent.clientHeight : window.innerHeight;
    handleResize(initialWidth, initialHeight);

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const entry = entries[0];
      
      // Get logical width and height
      const { width, height } = entry.contentRect;
      handleResize(width, height);
    });

    resizeObserver.observe(parent || canvas);

    return () => {
      resizeObserver.disconnect();
    };
  }, [canvasRef]);

  return dimensions;
}

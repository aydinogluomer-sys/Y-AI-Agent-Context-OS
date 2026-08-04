/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { GlowingEmber, NodeJunction, CyanStream, SystemConfig, Particle } from '../types';
import {
  CYAN_GLOW_COLOR,
  CRIMSON_GLOW_COLOR,
  AMBER_GLOW_COLOR,
  VOID_BLACK_COLOR,
  generateRandomChar,
  CODE_SNIPPETS
} from '../utils/dataHelpers';

interface CyberCanvasProps {
  config: SystemConfig;
  secretsCount: number;
  onExplosionTrigger: () => void;
  activeCodeSnippets: string[];
  triggerAmberPing: boolean;
  onResetAmberTrigger: () => void;
}

export default function CyberCanvas({
  config,
  onExplosionTrigger,
  activeCodeSnippets,
  triggerAmberPing,
  onResetAmberTrigger
}: CyberCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Keep mutable references for animation values to keep 60fps rendering without re-renders
  const cameraZRef = useRef<number>(0);
  const embersRef = useRef<GlowingEmber[]>([]);
  const junctionsRef = useRef<NodeJunction[]>([]);
  const streamsRef = useRef<CyanStream[]>([]);
  const frameIdRef = useRef<number>(0);

  // Interactive spark feedback from mouse clicks
  const clickSparksRef = useRef<Particle[]>([]);

  // Track FPS and active telemetry for HUD (exposed to parent via local interval, but animation stays high performance)
  const [fps, setFps] = useState(60);
  const [telemetry, setTelemetry] = useState({
    activeStreams: 0,
    activeEmbers: 0,
    activeStardust: 0,
    camZ: '0.0000',
    depthScale: 1.0,
  });

  // Size details
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Handle Resize beautifully
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setDimensions({
          width: clientWidth || 800,
          height: clientHeight || 600,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    handleResize();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Initialize objects in the 3D space once
  useEffect(() => {
    // Generate Symmetrical Amber Junctions along the corridor
    // Let's place them at x = ±5, y = ±4, and z = every 15 units from 15 to 150
    const junctions: NodeJunction[] = [];
    const depths = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150];
    let idCounter = 0;

    depths.forEach((z) => {
      const xPositions = [-5.5, 5.5];
      const yPositions = [-4.5, 4.5];

      xPositions.forEach((x) => {
        yPositions.forEach((y) => {
          junctions.push({
            id: `junction-${idCounter++}`,
            pos: { x, y, z },
            pulseRadius: 0,
            maxRadius: 4.5,
            pulseSpeed: 0.12,
            isActive: Math.random() > 0.4,
            lastPulseTime: Date.now() - Math.random() * 5000,
          });
        });
      });
    });
    junctionsRef.current = junctions;

    // Generate Initial Cyan Code Streams
    const streams: CyanStream[] = [];
    // Place them on the shelf frameworks: left shelves (-5.5), right shelves (5.5)
    for (let i = 0; i < 24; i++) {
      const isLeft = i % 2 === 0;
      const x = isLeft ? -5.5 : 5.5;
      // y distributed along the vertical struts
      const y = (Math.random() * 2 - 1) * 8;
      const z = Math.random() * 150;
      
      const snippet = CODE_SNIPPETS[Math.floor(Math.random() * CODE_SNIPPETS.length)];
      const trail = snippet.split('').map((char, index) => ({
        char,
        yOffset: index * 0.4,
        brightness: Math.max(0.1, 1 - index / snippet.length),
      }));

      streams.push({
        id: `stream-${i}`,
        pos: { x, y, z },
        length: snippet.length,
        speed: 0.15 + Math.random() * 0.25,
        charTrail: trail,
        currentOffset: Math.random() * 20,
      });
    }
    streamsRef.current = streams;

    // Generate Crimson Secrets (Floating Embers)
    const embers: GlowingEmber[] = [];
    for (let i = 0; i < 40; i++) {
      embers.push({
        id: `ember-${i}`,
        pos: {
          x: (Math.random() * 2 - 1) * 4, // within the inner void walk space
          y: (Math.random() * 2 - 1) * 3.5,
          z: Math.random() * 150,
        },
        vel: {
          x: (Math.random() * 2 - 1) * 0.02,
          y: -0.015 - Math.random() * 0.025, // float upwards
          z: (Math.random() * 2 - 1) * 0.02,
        },
        size: 1.2 + Math.random() * 1.5,
        alpha: 0.4 + Math.random() * 0.6,
        life: Math.random() * 300,
        maxLife: 200 + Math.random() * 250,
        dissolving: false,
        stardust: [],
      });
    }
    embersRef.current = embers;
  }, []);

  // Handle Trigger Pulse / Ping events from parent OS controls
  useEffect(() => {
    if (triggerAmberPing) {
      // Trigger a massive wave radiating outwards from the closest junctions
      junctionsRef.current.forEach((junction) => {
        // Only active ones close by or activate all of them with a pulse resets
        junction.isActive = true;
        junction.pulseRadius = 0.1;
      });
      // Clear the trigger
      onResetAmberTrigger();
    }
  }, [triggerAmberPing, onResetAmberTrigger]);

  // Main high-performance render and physics update loop
  useEffect(() => {
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsIntervalTime = lastTime;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameLoop = (timeNow: number) => {
      // Manage FPS counter
      frameCount++;
      if (timeNow > fpsIntervalTime + 1000) {
        setFps(Math.round((frameCount * 1000) / (timeNow - fpsIntervalTime)));
        frameCount = 0;
        fpsIntervalTime = timeNow;

        // Periodic telemetry state sync (does not block canvas loop)
        let totalStardust = 0;
        embersRef.current.forEach((e) => {
          totalStardust += e.stardust.length;
        });

        setTelemetry({
          activeStreams: streamsRef.current.length,
          activeEmbers: embersRef.current.filter((e) => !e.dissolving).length,
          activeStardust: totalStardust + clickSparksRef.current.length,
          camZ: cameraZRef.current.toFixed(2),
          depthScale: 1 / (1 + (config.focalDepth / 100)),
        });
      }

      const deltaTime = (timeNow - lastTime) / 16.666; // Normalized to 1frame = 16.67ms
      lastTime = timeNow;

      // 1. UPDATE PHYSICS & POSITIONS
      // Dolly camera forward in infinite corridor (decrementing Z position relative to camera)
      cameraZRef.current += config.cameraSpeed * deltaTime;
      const camZ = cameraZRef.current;
      const maxZWidth = 150; // loop boundaries

      // Wrap camera coordinate to keep numbers reasonable, elements wrap seamlessly
      if (cameraZRef.current > maxZWidth) {
        cameraZRef.current -= maxZWidth;
      }

      // Update amber junctions
      junctionsRef.current.forEach((junction) => {
        if (junction.isActive) {
          junction.pulseRadius += junction.pulseSpeed * config.ambientPulseSpeed * deltaTime;
          if (junction.pulseRadius > junction.maxRadius) {
            junction.pulseRadius = 0;
            // periodically cycle active state
            if (Math.random() > 0.6) {
              junction.isActive = false;
              junction.lastPulseTime = Date.now();
            }
          }
        } else {
          // If inactive, potentially reactivate after cooldown
          if (Date.now() - junction.lastPulseTime > 3000 + Math.random() * 8000) {
            junction.isActive = true;
            junction.pulseRadius = 0.1;
          }
        }
      });

      // Update cyber streams offsets (scrolling text)
      streamsRef.current.forEach((stream) => {
        stream.currentOffset += stream.speed * deltaTime;
        
        // Sometime inject a user defined codebase snippet if available
        if (Math.random() < 0.002 && activeCodeSnippets.length > 0) {
          const chosen = activeCodeSnippets[Math.floor(Math.random() * activeCodeSnippets.length)];
          stream.length = chosen.length;
          stream.charTrail = chosen.split('').map((char, index) => ({
            char,
            yOffset: index * 0.4,
            brightness: Math.max(0.1, 1 - index / chosen.length),
          }));
        }
      });

      // Update Crimson secret embers
      embersRef.current.forEach((ember) => {
        // Drift motion
        ember.pos.x += ember.vel.x * deltaTime;
        ember.pos.y += ember.vel.y * deltaTime;
        ember.pos.z += ember.vel.z * deltaTime;

        // Apply dynamic wave float
        ember.pos.x += Math.sin(timeNow * 0.001 + ember.pos.z) * 0.005 * deltaTime;

        // Age
        ember.life += deltaTime;

        // If ember is extremely old or floats too high, trigger dissolution
        if ((ember.life > ember.maxLife || ember.pos.y < -5.5) && !ember.dissolving) {
          ember.dissolving = true;
          onExplosionTrigger(); // trigger feedback sound / click effect in UI

          // Spawn stardust particles
          const burstCount = 8 + Math.floor(Math.random() * 10);
          for (let pi = 0; pi < burstCount; pi++) {
            const speed = 0.04 + Math.random() * 0.08;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);

            ember.stardust.push({
              id: `star-${ember.id}-${pi}`,
              pos: { x: ember.pos.x, y: ember.pos.y, z: ember.pos.z },
              vel: {
                x: Math.sin(phi) * Math.cos(theta) * speed,
                y: Math.sin(phi) * Math.sin(theta) * speed - 0.02, // extra float up
                z: Math.cos(phi) * speed,
              },
              size: 0.4 + Math.random() * 0.8,
              color: Math.random() > 0.4 ? CRIMSON_GLOW_COLOR : AMBER_GLOW_COLOR,
              alpha: 1.0,
              life: 0,
              maxLife: 40 + Math.random() * 50,
            });
          }
        }

        // Maintain stardust particles
        if (ember.dissolving) {
          ember.stardust.forEach((p) => {
            p.pos.x += p.vel.x * deltaTime;
            p.pos.y += p.vel.y * deltaTime;
            p.pos.z += p.vel.z * deltaTime;
            p.life += deltaTime;
            p.alpha = Math.max(0, 1.0 - p.life / p.maxLife);
          });
          // Remove dead stardust
          ember.stardust = ember.stardust.filter((p) => p.life < p.maxLife);

          // If all stardust is gone, reset/respawn this secret ember in the far distance
          if (ember.stardust.length === 0) {
            ember.dissolving = false;
            ember.life = 0;
            ember.maxLife = 200 + Math.random() * 250;
            ember.pos.x = (Math.random() * 2 - 1) * 4;
            ember.pos.y = 5.0; // spawn down low
            ember.pos.z = camZ + 120 + Math.random() * 30; // spawn in far distance
            ember.alpha = 0.4 + Math.random() * 0.6;
          }
        }
      });

      // Maintain click Sparks
      clickSparksRef.current.forEach((spark) => {
        spark.pos.x += spark.vel.x * deltaTime;
        spark.pos.y += spark.vel.y * deltaTime;
        spark.pos.z += spark.vel.z * deltaTime;
        spark.life += deltaTime;
        spark.alpha = Math.max(0, 1.0 - spark.life / spark.maxLife);
      });
      clickSparksRef.current = clickSparksRef.current.filter((p) => p.life < p.maxLife);

      // 2. RENDERING PIPELINE (DEPTH SORTED)
      // Clear with solid void black #040406
      ctx.fillStyle = VOID_BLACK_COLOR;
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      const fov = 320; // perspective focal length
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;

      // Project function maps 3D coordinate list to 2D view space
      const project = (pos: { x: number; y: number; z: number }) => {
        // Calculate coordinate relative to camera
        let relativeZ = pos.z - camZ;

        // Wrap relative depth within infinite range [0.1, 150]
        while (relativeZ < 0.1) relativeZ += maxZWidth;
        while (relativeZ > maxZWidth) relativeZ -= maxZWidth;

        const scale = fov / relativeZ;
        return {
          x: centerX + pos.x * scale,
          y: centerY + pos.y * scale,
          scale,
          relativeZ,
        };
      };

      // Create a list of all render tasks in the corridor for perfect depth sorting (Back to Front)
      const renderTasks: any = [];

      // A. PROCEDURAL OBSIDIAN SHELVES
      // Draw symmetrical shelves along the Z depth grid. Let's make 15 segments of shelves.
      // Left horizontal shelves (-15 to -4), Right horizontal shelves (4 to 15)
      // Placed at Y = ±4.5 vertical heights.
      const shelfZInterval = 10;
      for (let sz = 0; sz < 15; sz++) {
        const shelfBaseZ = sz * shelfZInterval;
        let relativeZ = shelfBaseZ - camZ;
        while (relativeZ < 0.1) relativeZ += maxZWidth;
        while (relativeZ > maxZWidth) relativeZ -= maxZWidth;

        // Middle depth used for sorting
        const midZ = relativeZ + shelfZInterval / 2;

        renderTasks.push({
          type: 'shelf_layer',
          depth: midZ,
          rawZ: shelfBaseZ,
          relativeZ,
        });
      }

      // B. AMBER NODE JUNCTIONS
      junctionsRef.current.forEach((junction) => {
        let relativeZ = junction.pos.z - camZ;
        while (relativeZ < 0.1) relativeZ += maxZWidth;
        while (relativeZ > maxZWidth) relativeZ -= maxZWidth;

        renderTasks.push({
          type: 'junction',
          depth: relativeZ,
          object: junction,
        });
      });

      // C. OPTIC CYAN FLOWING STREAMS
      streamsRef.current.forEach((stream) => {
        let relativeZ = stream.pos.z - camZ;
        while (relativeZ < 0.1) relativeZ += maxZWidth;
        while (relativeZ > maxZWidth) relativeZ -= maxZWidth;

        renderTasks.push({
          type: 'stream',
          depth: relativeZ,
          object: stream,
        });
      });

      // D. CRIMSON GLOWING EMBERS & STARDUST
      embersRef.current.forEach((ember) => {
        let relativeZ = ember.pos.z - camZ;
        while (relativeZ < 0.1) relativeZ += maxZWidth;
        while (relativeZ > maxZWidth) relativeZ -= maxZWidth;

        renderTasks.push({
          type: 'ember',
          depth: relativeZ,
          object: ember,
        });

        // Add ember's stardust
        ember.stardust.forEach((p) => {
          let pRelZ = p.pos.z - camZ;
          while (pRelZ < 0.1) pRelZ += maxZWidth;
          while (pRelZ > maxZWidth) pRelZ -= maxZWidth;

          renderTasks.push({
            type: 'stardust',
            depth: pRelZ,
            object: p,
          });
        });
      });

      // E. CLICK SPARKS
      clickSparksRef.current.forEach((spark) => {
        let pRelZ = spark.pos.z - camZ;
        while (pRelZ < 0.1) pRelZ += maxZWidth;
        while (pRelZ > maxZWidth) pRelZ -= maxZWidth;

        renderTasks.push({
          type: 'click_spark',
          depth: pRelZ,
          object: spark,
        });
      });

      // 3. SORT ALL RENDER TASKS BACK-TO-FRONT (furthest depth first)
      renderTasks.sort((a: any, b: any) => b.depth - a.depth);

      // 4. DRAW RENDER TASKS IN ORDER
      renderTasks.forEach((task: any) => {
        // Calculate global fog factor (far elements blend to pure black #040406)
        const density = config.volumetricFogDensity * 0.007;
        const fogFactor = Math.min(1.0, task.depth * density);
        const fogAlpha = 1.0 - fogFactor;

        if (fogFactor >= 0.99) return; // invisible behind heavy fog

        // Calculate lens blur for this depth based on Focus Plane Setup
        const distFromFocus = Math.abs(task.depth - config.focalDepth);
        const bokehBlur = Math.min(24, distFromFocus * config.dofStrength * 0.18);

        // Standard gradient builder representing volumetric light
        const applyFogColor = (baseRgba: string, elementAlpha: number) => {
          const finalAlpha = elementAlpha * fogAlpha;
          return `${baseRgba.substring(0, baseRgba.lastIndexOf(','))}, ${finalAlpha})`;
        };

        switch (task.type) {
          case 'shelf_layer': {
            const relZStart = task.relativeZ;
            let relZEnd = relZStart + shelfZInterval;
            
            // Project the four corners of a shelf segment
            // Horizontal shelf on left at H_Y = 4.5, depth from relZStart to relZEnd
            const leftShelfX_min = -14;
            const leftShelfX_max = -4.0;
            const rightShelfX_min = 4.0;
            const rightShelfX_max = 14;

            const drawShelfSegment = (xMin: number, xMax: number, y: number) => {
              // Project 4 vertices of the glass quad
              const scaleStart = fov / relZStart;
              const scaleEnd = fov / relZEnd;

              const p1 = { x: centerX + xMin * scaleStart, y: centerY + y * scaleStart };
              const p2 = { x: centerX + xMax * scaleStart, y: centerY + y * scaleStart };
              const p3 = { x: centerX + xMax * scaleEnd, y: centerY + y * scaleEnd };
              const p4 = { x: centerX + xMin * scaleEnd, y: centerY + y * scaleEnd };

              // Check boundary logic to prevent wild scaling across the camera
              if (relZStart < 0.2 || relZEnd < 0.2) return;

              // Draw Glass Shelf Polygon Face
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.lineTo(p3.x, p3.y);
              ctx.lineTo(p4.x, p4.y);
              ctx.closePath();

              // Glass body fill (Dark obsidian glass reflection)
              ctx.fillStyle = `rgba(10, 14, 24, ${0.45 * fogAlpha})`;
              ctx.fill();

              // Subtle reflective specular strip inside the glass
              ctx.strokeStyle = `rgba(0, 213, 255, ${0.05 * fogAlpha})`;
              ctx.lineWidth = 1;
              ctx.stroke();

              // Highlight glass edge lines (highly sharp)
              // We draw a glowing line at the inside edge facing the void walk space
              ctx.beginPath();
              ctx.moveTo(p2.x, p2.y);
              ctx.lineTo(p3.x, p3.y);
              
              // Edge brightness depends on focal sharpness
              const edgeAlpha = Math.max(0.1, 0.5 - bokehBlur * 0.05) * fogAlpha;
              ctx.strokeStyle = `rgba(0, 213, 255, ${edgeAlpha})`;
              ctx.lineWidth = Math.max(0.8, 1.5 - bokehBlur * 0.1);
              ctx.stroke();
            };

            // Draw left and right shelves at lower level (Y = 4.5)
            drawShelfSegment(leftShelfX_min, leftShelfX_max, 4.5);
            drawShelfSegment(rightShelfX_min, rightShelfX_max, 4.5);

            // Draw left and right shelves at upper level (Y = -4.5)
            drawShelfSegment(leftShelfX_min, leftShelfX_max, -4.5);
            drawShelfSegment(rightShelfX_min, rightShelfX_max, -4.5);

            // Draw vertical connecting struts (representing OS framework ribs) at the junction segment start
            if (relZStart > 0.5) {
              const scale = fov / relZStart;
              const edgeX_Left = centerX - 4.0 * scale;
              const edgeX_Right = centerX + 4.0 * scale;
              const yTop = centerY - 4.5 * scale;
              const yBottom = centerY + 4.5 * scale;

              ctx.beginPath();
              ctx.moveTo(edgeX_Left, yTop);
              ctx.lineTo(edgeX_Left, yBottom);
              ctx.moveTo(edgeX_Right, yTop);
              ctx.lineTo(edgeX_Right, yBottom);

              ctx.strokeStyle = `rgba(20, 24, 36, ${0.4 * fogAlpha})`;
              ctx.lineWidth = Math.max(0.5, 1.2 - bokehBlur * 0.1);
              ctx.stroke();
            }

            break;
          }

          case 'junction': {
            const node = task.object as NodeJunction;
            const proj = project(node.pos);

            if (proj.relativeZ < 0.5) return;

            // Render Core amber node point
            const baseAlpha = node.isActive ? 0.9 : 0.4;
            const finalAlpha = baseAlpha * fogAlpha;
            
            // Depth of Field Bokeh calculation
            const drawRadius = Math.max(1, 3.5 - bokehBlur * 0.2);
            
            // Draw Node Dot
            ctx.beginPath();
            ctx.arc(proj.x, proj.y, drawRadius + 1, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(245, 158, 11, ${finalAlpha})`;
            ctx.fill();

            // Amber pulse expanding ring (symmetrical concentric pulse on horizontal / vertical panels)
            if (node.isActive && node.pulseRadius > 0.1) {
              const pulseRelZ = node.pos.z - camZ;
              // Circle projection: projects an XZ concentric disk
              // Inner border: xPos ± pulseRadius, zPos ± pulseRadius at y level
              const pulsePoints = 16;
              ctx.beginPath();
              
              for (let i = 0; i <= pulsePoints; i++) {
                const angle = (i / pulsePoints) * Math.PI * 2;
                // Circle on XZ plane
                const ptX = node.pos.x + Math.cos(angle) * node.pulseRadius;
                const ptY = node.pos.y; // horizontal plane
                const ptZ = node.pos.z + Math.sin(angle) * node.pulseRadius;

                // Project this point
                let pZ = ptZ - camZ;
                while (pZ < 0.1) pZ += maxZWidth;
                while (pZ > maxZWidth) pZ -= maxZWidth;

                const ptScale = fov / pZ;
                const scrX = centerX + ptX * ptScale;
                const scrY = centerY + ptY * ptScale;

                if (i === 0) {
                  ctx.moveTo(scrX, scrY);
                } else {
                  ctx.lineTo(scrX, scrY);
                }
              }

              const pulseFade = Math.max(0, 1.0 - node.pulseRadius / node.maxRadius) * fogAlpha;
              ctx.strokeStyle = `rgba(245, 158, 11, ${pulseFade * 0.8})`;
              ctx.lineWidth = Math.max(0.6, 1.8 - bokehBlur * 0.2);
              ctx.stroke();
            }
            break;
          }

          case 'stream': {
            const stream = task.object as CyanStream;
            const proj = project(stream.pos);

            if (proj.relativeZ < 1.0) return;

            // Draw cyber stream characters running down
            ctx.save();
            // Font scale decreases with distance
            const fontSize = Math.max(2, Math.round(14 * proj.scale / 100));
            ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';

            const alphaMultiplier = config.cyanIntensity * fogAlpha;

            // Render each character in the trail
            stream.charTrail.forEach((tc, idx) => {
              // Calculate scrolling vertical positions
              const wordY = stream.pos.y + tc.yOffset - (stream.currentOffset % 2.0);
              
              // Skip if out of visual bracket range
              if (wordY < -8 || wordY > 8) return;

              const charProj = project({ x: stream.pos.x, y: wordY, z: stream.pos.z });

              // If character falls behind, wrap
              if (charProj.relativeZ < 0.5) return;

              // Character illumination logic: brightest at bottom / head
              const headHighlight = idx === 0 ? 1.4 : tc.brightness;
              const charColAlpha = Math.max(0, headHighlight * alphaMultiplier * (1 - bokehBlur * 0.1));

              if (charColAlpha > 0.02) {
                // Apply soft bokeh circle rendering for large out-of-focus glyphs
                if (bokehBlur > 2) {
                  ctx.fillStyle = `rgba(0, 213, 255, ${charColAlpha * 0.2})`;
                  ctx.fillText(generateRandomChar(), charProj.x + (Math.random() - 0.5) * bokehBlur, charProj.y);
                } else {
                  ctx.fillStyle = `rgba(0, 213, 255, ${charColAlpha})`;
                  ctx.fillText(tc.char, charProj.x, charProj.y);
                }
              }
            });

            ctx.restore();
            break;
          }

          case 'ember': {
            const ember = task.object as GlowingEmber;
            const proj = project(ember.pos);

            if (proj.relativeZ < 0.5) return;

            // Calculate bokeh blur circle of confusion
            const size = ember.size * proj.scale * 0.08;
            const finalRadius = size + bokehBlur * 0.8;
            
            // As particles blur out of focus, they expand and fade
            const drawAlpha = Math.max(0.01, ember.alpha * fogAlpha / (1.0 + bokehBlur * 0.5));

            // Radial gradient representing glowing particle core + halo
            const radGrad = ctx.createRadialGradient(
              proj.x, proj.y, 0.1,
              proj.x, proj.y, Math.max(1, finalRadius)
            );
            
            // Embers melt from bright crimson code secrets into glowing ambers and stardust
            radGrad.addColorStop(0, `rgba(239, 68, 68, ${drawAlpha})`);
            radGrad.addColorStop(0.3, `rgba(239, 68, 68, ${drawAlpha * 0.7})`);
            radGrad.addColorStop(1, `rgba(245, 158, 11, 0)`);

            ctx.beginPath();
            ctx.arc(proj.x, proj.y, Math.max(1, finalRadius), 0, Math.PI * 2);
            ctx.fillStyle = radGrad;
            ctx.fill();

            break;
          }

          case 'stardust': {
            const p = task.object as Particle;
            const proj = project(p.pos);

            if (proj.relativeZ < 0.5) return;

            // Render smaller bits of star-fall sparks
            const size = p.size * proj.scale * 0.08;
            const finalRadius = size + bokehBlur * 0.4;
            const drawAlpha = p.alpha * fogAlpha / (1.0 + bokehBlur * 0.2);

            if (drawAlpha > 0.01) {
              ctx.beginPath();
              ctx.arc(proj.x, proj.y, Math.max(0.5, finalRadius), 0, Math.PI * 2);
              ctx.fillStyle = p.color === CRIMSON_GLOW_COLOR 
                ? `rgba(239, 68, 68, ${drawAlpha})` 
                : `rgba(245, 110, 11, ${drawAlpha * 0.85})`;
              ctx.fill();
            }
            break;
          }

          case 'click_spark': {
            const p = task.object as Particle;
            const proj = project(p.pos);

            if (proj.relativeZ < 0.5) return;

            // User-generated click spark
            const size = p.size * proj.scale * 0.08;
            const finalRadius = size + bokehBlur * 0.3;
            const drawAlpha = p.alpha * fogAlpha;

            if (drawAlpha > 0.01) {
              ctx.beginPath();
              ctx.arc(proj.x, proj.y, Math.max(0.5, finalRadius), 0, Math.PI * 2);
              ctx.fillStyle = p.color;
              ctx.fill();
            }
            break;
          }
        }
      });

      // 5. RENDER THE ANALOG 35MM FILM GRAIN TEXTURE LAYER
      // We generate microscopic micro-particles of grain scattered on the lens on each frame
      const grainCount = Math.round(dimensions.width * dimensions.height * 0.00035 * config.grainIntensity);
      if (grainCount > 5) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.05 * config.grainIntensity})`;
        
        for (let gi = 0; gi < grainCount; gi++) {
          const gx = Math.random() * dimensions.width;
          const gy = Math.random() * dimensions.height;
          // random gray/white dot
          ctx.fillRect(gx, gy, 1, 1);
        }
      }

      // Draw subtle macro lens dirt haze (radial halo in center)
      const centerHaze = ctx.createRadialGradient(
        centerX, centerY, 10,
        centerX, centerY, dimensions.width * 0.8
      );
      centerHaze.addColorStop(0, 'rgba(0, 213, 255, 0.01)');
      centerHaze.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
      centerHaze.addColorStop(1, 'rgba(4, 4, 6, 0.45)');
      ctx.fillStyle = centerHaze;
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      // Trigger next frame
      frameIdRef.current = requestAnimationFrame(gameLoop);
    };

    // Begin looping
    frameIdRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(frameIdRef.current);
    };
  }, [dimensions, config, activeCodeSnippets, onExplosionTrigger]);

  // Click on Canvas handles spawning high-glowing feedback spikes
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !containerRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Project client click back into a simulated 3D node location at 3D distance of Z=15
    const fov = 320;
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const zSpawn = 15; // spawn in nearest projection layer
    const scale = fov / zSpawn;

    const projectedX = (clickX - centerX) / scale;
    const projectedY = (clickY - centerY) / scale;

    // Trigger visual stardust burst on click
    for (let si = 0; si < 20; si++) {
      const speed = 0.06 + Math.random() * 0.12;
      const angle = Math.random() * Math.PI * 2;
      const angle2 = Math.random() * Math.PI;

      clickSparksRef.current.push({
        id: `click-spark-${Date.now()}-${si}`,
        pos: {
          x: projectedX,
          y: projectedY,
          z: zSpawn + (Math.random() * 2 - 1) * 3,
        },
        vel: {
          x: Math.sin(angle2) * Math.cos(angle) * speed,
          y: Math.sin(angle2) * Math.sin(angle) * speed,
          z: Math.cos(angle2) * speed,
        },
        size: 0.8 + Math.random() * 1.5,
        color: Math.random() > 0.5 ? CYAN_GLOW_COLOR : AMBER_GLOW_COLOR,
        alpha: 1.0,
        life: 0,
        maxLife: 25 + Math.random() * 30,
      });
    }

    // Trigger parent visual alert
    onExplosionTrigger();
  };

  return (
    <div
      ref={containerRef}
      id="cyber-canvas-container"
      className="relative w-full h-full bg-[#040406] overflow-hidden select-none"
    >
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onClick={handleCanvasClick}
        className="block cursor-crosshair w-full h-full"
      />

      {/* Symmetrical Swiss Frame UI / Matrix coordinates overlays inside the camera view */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 font-mono text-[10px]">
        {/* Top telemetry indicators */}
        <div className="flex justify-between items-start text-zinc-500 tracking-wider">
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-[#00d5ff] rounded-full animate-ping" />
              <span className="text-[#00d5ff]">RENDER_ENGINE_4K_60FPS</span>
            </div>
            <div>|</div>
            <div>SYS_FPS: <span className="text-zinc-300">{fps}</span></div>
          </div>
          <div className="text-right">
            <div>CAMERA_XYZ: <span className="text-zinc-300">0.00 / 0.00 / {telemetry.camZ}</span></div>
          </div>
        </div>

        {/* Diagonal calibration crosshairs on corners */}
        <div className="absolute top-1/2 left-4 -translate-y-1/2 flex items-center gap-2">
          <div className="h-4 w-[1px] bg-zinc-800" />
          <div className="text-zinc-600 text-[9px] rotate-90">SCALE_01</div>
        </div>
        <div className="absolute top-1/2 right-4 -translate-y-1/2 flex items-center gap-2">
          <div className="text-zinc-600 text-[9px] -rotate-90">DEPTH_HASE_02</div>
          <div className="h-4 w-[1px] bg-zinc-800" />
        </div>

        {/* Absolute center targeting rect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center opacity-30">
          <div className="w-10 h-10 border border-dashed border-[#00d5ff] relative">
            <div className="absolute top-0 left-0 w-2 h-[1px] bg-[#00d5ff]" />
            <div className="absolute top-0 left-0 w-[1px] h-2 bg-[#00d5ff]" />
            <div className="absolute bottom-0 right-0 w-2 h-[1px] bg-[#00d5ff]" />
            <div className="absolute bottom-0 right-0 w-[1px] h-2 bg-[#00d5ff]" />
          </div>
        </div>

        {/* Bottom matrix telemetry */}
        <div className="flex justify-between items-end text-zinc-500 tracking-widest pt-12 border-t border-zinc-900">
          <div className="flex gap-6">
            <div>STREAMS_ACTIVE: <span className="text-zinc-300">{telemetry.activeStreams}</span></div>
            <div>EMBERS_SEC_ACTIVE: <span className="text-zinc-300">{telemetry.activeEmbers}</span></div>
            <div>STARDUST_DENSITY: <span className="text-[#ef4444]">{telemetry.activeStardust}</span></div>
          </div>
          <div>
            <div>CORRIDOR_LOOP_SEGMENTS: <span className="text-[#f59e0b]">15 // STABLE</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

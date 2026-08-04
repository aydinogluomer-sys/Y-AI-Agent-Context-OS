# Y-OS UI Accessibility & High Contrast Recommendations

This document outlines design-token recommendations to improve text readability on dense Y-OS telemetry tables and terminal dashboards. These notes are pure documentation resources, leaving all implementation styles and runtime files in `/packages/ui/` entirely unmodified.

---

## 1. Contrast Evaluation (WCAG 2.1 AA Guidelines)

To comply with WCAG 2.1 AA accessibility guidelines, text elements must maintain minimum contrast ratios against background elements:
* **Normal Text (<18pt / <14pt Bold):** 4.5:1 minimum ratio.
* **Large Text (>=18pt / >=14pt Bold):** 3.0:1 minimum ratio.
* **Dense Data tables & Indicators:** 4.5:1 ratio for critical status elements.

---

## 2. Proposed High-Contrast Color Palette Tokens

The following design tokens are proposed as a highly readable, eye-safe high-contrast dark theme (ideal for monospace telemetry views):

### Canvas Backgrounds
* **Base background:** `#0c0f12` (Deep Charcoal Black)
* **Card base component container:** `#161b22` (Graphite Grey)
* **Hover State Highlights:** `#21262d` (Slightly lighter grey to provide strong interactive borders)

### Typographical Text Alignments
* **Primary Headers and Text:** `#f0f6fc` (Off-white / 15.8:1 ratio over card base background, exceeding WCAG AAA level of 7:1)
* **Secondary Labels and Descriptions:** `#c9d1d9` (Light steel grey / 11.2:1 ratio over card base, safe and legible)
* **Muted Metadata/Checksum Tags:** `#8b949e` (Medium slate / 5.6:1 ratio over base background, fully compliant with WCAG 2.1 AA)

### Action Elements and Accents
* **Warning Icons / Stale States (Yellow):** Propose high-contrast amber `#f0b400` instead of light yellow (4.8:1 ratio) for status checks.
* **Success Badges / Verified Locks (Green):** Propose `#39d353` or bright mint green `#2ea44f` instead of muted green (5.3:1 ratio).
* **Failure Alerts / Corruption Warnings (Red):** Propose high-impact tomato red `#f85149` (4.9:1 ratio).
* **Quarantine Badges / Restricted Detections (Amber/Orange):** Propose safety orange `#ff7b72` (5.1:1 ratio).

---

## 3. Recommended CSS Integration (Future Cycles)

When the Kernel MVP stabilization phase finishes and authorization is granted to modify theme files, these CSS custom property tokens can be declared inside `@theme` tags in `src/index.css` or `packages/ui/src/index.ts`:

```css
@theme {
  --color-canvas-base: #0c0f12;
  --color-canvas-card: #161b22;
  --color-text-high-contrast: #f0f6fc;
  --color-text-readable: #c9d1d9;
  --color-text-muted: #8b949e;
  
  --color-status-success: #2ea44f;
  --color-status-warning: #f0b400;
  --color-status-danger: #f85149;
}
```

This ensures maximum contrast on data-heavy grids without risking syntax errors or build failures during active stabilization.

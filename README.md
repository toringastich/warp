# Warp

**Live at [toringastich.github.io/warp](https://toringastich.github.io/warp/)**

A browser-based, Desmos-style sandbox for visualizing matrices as the linear
transformations they encode. Type a matrix and see how it warps space, where the
basis vectors land, and how areas scale by the determinant — with a live
computation engine alongside. Inspired by 3Blue1Brown's *Essence of Linear Algebra*.

Fully client-side; no backend.

## Tech stack

- **React + Vite + TypeScript**
- **HTML5 Canvas** for the graph (grid, vectors, animation)
- Hand-rolled math + a small expression engine (no math libraries)

## Getting started

Requires Node 18+ (developed on Node 22).

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check + production build
```

## Project structure

```
src/
  lib/
    matrix.ts          Pure 2x2 linear-algebra helpers (no rendering deps)
    expr.ts            Tokenizer + recursive-descent parser + typed evaluator
                       over scalars / vectors / 2x2 matrices
  rows.ts              Document model: typed rows, auto-naming, env building
  components/
    ExpressionList.tsx Desmos-style expression list + gear palette + toggles
    TransformCanvas.tsx Canvas renderer: warped grid, basis vectors, drawables
  App.tsx              State, scene assembly, animation loop
  styles.css
```

The design keeps the math (`lib/`) pure and rendering-agnostic so a future 3D
phase can layer on Three.js without a rewrite.

## What it does today

- **Expression-list sandbox**: add matrices (`M, N…`), vectors (`v, w…`), and
  free-form expressions via a per-row gear palette. Everything is live.
- **Expression engine**: `+ − ×`, unary minus, parentheses, vector literals
  `(a, b)`, implicit multiplication, `det()`, `eigen()`, and variable references
  over scalars / vectors / 2×2 matrices — so `M·v`, `M·N`, `det(M)`, `v + w` all
  work, with typed error messages and inline results.
- **Named expression rows**: `u = M·v` binds a name that every row below it can
  use (rows evaluate top-to-bottom, so definitions come before uses). Named
  vector results plot with their label.
- **Composition animation**: a matrix-valued expression (`M·N`, `C = M·N·P`)
  is itself graphable — toggle it on and the play button animates one factor at
  a time, right-to-left (first N warps space, then M lands on M·N), with a
  stage indicator showing which factor is applying.
- **Eigenvectors**: `eigen(M)` shows λ₁/λ₂ and their eigen-directions inline,
  draws the invariant lines (dashed) through the origin, and plots unit
  eigenvectors that ride the warp — so during animation they stretch by λ along
  their fixed line. Complex (rotation-like), repeated, and λI ("every vector")
  cases are all reported.
- **Space-warp graphing**: the active matrix deforms the grid; î (blue) / ĵ
  (green) land on its columns; the unit square becomes the parallelogram whose
  area is |det|.
- **Animation**: play/slider interpolates identity → M at constant rate, gliding
  cleanly through orientation flips (grid fades out at det = 0, no smear/stutter).
- **Vectors ride along** the warp; **computed results** are fixed markers.
- **Vector addition** drawn head-to-tail. **Pan/zoom** with adaptive tick labels.
- **Desmos-style visibility toggles** per row; matrices are mutually exclusive.
- Handles edge cases: det = 0 (collapse to a line) and negative det (flip).

## Roadmap

Warp is deliberately a **sandbox** — a blank canvas you build scenes in, not a
preset gallery. Next up: shareable URLs, 3D (3×3 matrices), and export.

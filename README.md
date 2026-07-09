# Warp

**Live at [toringastich.github.io/warp](https://toringastich.github.io/warp/)**

A browser-based, Desmos-style sandbox for visualizing matrices as the linear
transformations they encode. Type a matrix and see how it warps space, where the
basis vectors land, and how areas scale by the determinant — with a live
computation engine alongside. Inspired by 3Blue1Brown's *Essence of Linear Algebra*.

Fully client-side; no backend.

## Tech stack

- **React + Vite + TypeScript**
- **HTML5 Canvas** for the 2D graph (grid, vectors, animation)
- **Three.js** for the 3D stage (lazy-loaded only when 3D mode is opened)
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
    matrix3.ts         Pure 3x3 counterparts (det, inverse, transpose, lerp)
    expr.ts            Tokenizer + recursive-descent parser + typed evaluator
                       over scalars / vectors / matrices in both dimensions
  rows.ts              Document model: typed rows, auto-naming, shared types
  format.ts            Value -> display text
  components/
    ExpressionList.tsx Desmos-style expression list + palettes + toggles
    TransformCanvas.tsx   2D canvas: warped grid, basis vectors, drawables
    TransformCanvas3D.tsx 3D stage: Three.js orbit camera, arrows, unit cube
  App.tsx              Mode shell + the 2D sandbox
  Warp3D.tsx           The 3D sandbox
  styles.css
```

The math (`lib/`) stays pure and rendering-agnostic; the 3D phase reuses the
same expression engine and expression-list UI on top of a Three.js stage.

## What it does today

- **Expression-list sandbox**: add matrices (`M, N…`), vectors (`v, w…`),
  expressions, and sliders from the header **+** menu; each expression row's
  gear menu inserts any engine function (`det`, `eigen`, `inv`, `transpose`,
  `dot`, `norm`, `proj`). Everything is live.
- **Expression engine**: `+ − ×`, unary minus, parentheses, vector literals
  `(a, b)`, implicit multiplication, and variable references over scalars /
  vectors / 2×2 matrices — so `M·v`, `M·N`, `det(M)`, `v + w` all work, with
  typed error messages and inline results. Built-ins: `det()`, `eigen()`,
  `inv()`, `transpose()`, `dot(v, w)`, `norm(v)`, and `proj(v, w)` (projection
  of v onto w). Graphing `proj(v, w)` draws the line through w, a ghost of v,
  and the perpendicular drop — with a play button that animates v falling onto
  its projection.
- **Sliders**: binding a name to a number (`a = 1.5`) turns the row into a
  Desmos-style slider with editable bounds; every expression using it — and
  the active warp — updates live as you drag (`a·M`, `a·v + w`, …).
- **Named expression rows**: `u = M·v` binds a name any other row can use —
  above or below; definitions resolve document-wide regardless of order, and
  duplicate names are flagged. Named vector results plot with their label.
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

- **3D mode (first version)**: a 2D/3D toggle in the header switches to a
  Three.js stage — Desmos 3D-style navigation (orbit around the origin, z-up,
  scroll to zoom) with 3Blue1Brown visuals (dark stage, green/red/blue basis
  arrows, translucent unit-cube volume = |det|). 3×3 matrices and 3-vectors
  graph, vectors ride an animated identity → M warp, and the engine built-ins
  (`det`, `inv`, `transpose`, `dot`, `norm`, `proj`, sliders) all work on 3D
  values. Both documents stay alive when you switch modes.

## Roadmap

Warp is deliberately a **sandbox** — a blank canvas you build scenes in, not a
preset gallery. Next up: shareable URLs, deeper 3D (warped lattice, eigen,
composition stages), and export.

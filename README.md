# Warp

**Live at [warp.us.com](https://warp.us.com)**

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
    matrix.ts          Pure 2x2 linear-algebra helpers (det, eigen, svd, …)
    matrix3.ts         Pure 3x3 counterparts (det, inverse, transpose, lerp,
                       svd via a Jacobi eigensolver)
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
  gear menu inserts any engine function (`det`, `eigen`, `svd`, `inv`,
  `transpose`, `diag`, `dot`, `norm`, `proj`, `circle`/`sphere`) — offering the ones
  that apply to the current dimension. Everything is live.
- **Expression engine**: `+ − ×`, unary minus, parentheses, vector literals
  `(a, b)`, implicit multiplication, and variable references over scalars /
  vectors / 2×2 matrices — so `M·v`, `M·N`, `det(M)`, `v + w` all work, with
  typed error messages and inline results. Built-ins: `det()`, `eigen()`,
  `inv()`, `transpose()`, `dot(v, w)`, `cross(v, w)` (scalar signed area in
  2D; in 3D a vector graphed with the parallelogram it measures), `norm(v)`,
  and `proj(v, w)` (projection of v onto w). Graphing `proj(v, w)` draws the
  line through w, a ghost of v, and the perpendicular drop — with a play
  button that animates v falling onto its projection.
- **Symbolic algebra**: every scalar slot is a polynomial in `x, y, z`, so
  `v = (2x, 3y)`, `w = (x^2, xy)`, `dot(v, w) = 2x³ + 3xy²` just work — in
  expression rows or typed straight into vector/matrix cells. `^` powers,
  Desmos-style implicit products (`xy`, `2ax`), and sliders folding in as
  numeric coefficients. Anything containing a symbol computes but doesn't
  graph; `inv`/`norm`/`eigen` ask for numeric input.
- **Vector calculus**: the del operator — `dot(del, F)` is the divergence of
  a polynomial vector field and `cross(del, F)` its curl (scalar in 2D, full
  vector in 3D), for literal fields or named rows. Constant results graph:
  `cross(del, (-y, x, 0))` draws the rotation axis (0, 0, 2). Identities hold
  symbolically — curl of a gradient and divergence of a curl are 0.
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
- **`diag()`**: `diag(a, b)` (and `diag(a, b, c)` in 3D) builds a pure stretch
  along the axes. Unlike four editable cells it can't accidentally stop being
  diagonal, and because it's an expression it can be driven by sliders — matrix
  cells evaluate in isolation and can't reference other rows, so this is the only
  way a slider can move a stretch.
- **Singular values / SVD**: `svd(M)` reports σ₁ ≥ σ₂ (≥ σ₃ in 3D) with the
  input direction each one stretches, plus a one-line reading of the whole
  decomposition (`Vᵀ spins −50.3°, Σ stretches, U spins 23.7°`). Toggle it on
  and a unit vector along each input axis rides the warp, landing exactly on a
  semi-axis of the image ellipse. V is normalized to a pure rotation, so every
  orientation flip shows up in U — and σ₁·σ₂ is always |det|.
- **The unit circle and sphere**: `circle()` (2D) and `sphere()` (3D) graph the
  shape itself, so the active matrix carries it to the ellipse / ellipsoid whose
  semi-axes *are* the singular values. The 2D version keeps a dashed ghost of
  where it started. Drive σ to zero and the ellipse flattens to a segment — the
  same rank collapse the determinant shows, but continuously.
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
  A matrix's dot cycles through three states — full (warped grid + basis
  vectors + unit square/cube), **gridlines only**, and off — so a scene about
  some other shape can drop the furniture without extra controls. The state
  rides along in the share link.
- Handles edge cases: det = 0 (collapse to a line) and negative det (flip).

- **Save, share, undo**: the whole sandbox (both documents + mode) serializes
  into the URL hash on every change and persists to localStorage — reloads
  restore your session, and copying the address bar (or the ⧉ header button)
  shares exactly what you built. Per-document undo/redo (⌘Z / ⇧⌘Z, or the
  header arrows) with rapid edits grouped into single steps. No backend.
- **3D mode**: a 2D/3D toggle in the header switches to a Three.js stage —
  Desmos 3D-style navigation (orbit around the origin, z-up, scroll to zoom)
  and a light theme continuous with the 2D graph: fat grey axes with
  arrowheads and x/y/z labels, 3b1b basis arrows (î green, ĵ red, k̂ blue),
  and the unit cube in the same green as the 2D parallelogram, warping to the
  parallelepiped whose volume is |det|. A ±4 lattice of light-grey gridlines
  warps with the matrix (lines stay straight — it's linear!), vectors ride the
  animated identity → M warp and relabel as their image (`M·v = …`), and the
  engine built-ins (`det`, `inv`, `transpose`, `dot`, `norm`, `proj`, sliders)
  all work on 3D values. Both documents stay alive when you switch modes.

## Roadmap

Warp is deliberately a **sandbox** — a blank canvas you build scenes in, not a
preset gallery. Next up: shareable URLs, deeper 3D (warped lattice, eigen,
composition stages), and export.

import { useEffect, useMemo, useRef, useState } from "react";
import TransformCanvas, {
  type Drawable,
  type VectorDrawable,
} from "./components/TransformCanvas";
import ExpressionList from "./components/ExpressionList";
import {
  apply,
  eigen,
  IDENTITY,
  lerp,
  multiply,
  type Mat2,
  type Vec2,
} from "./lib/matrix";
import {
  additiveTerms,
  evaluate,
  ExprError,
  multiplicativeFactors,
  parse,
  parseBinding,
  RESERVED_NAMES,
  type Env,
  type Node,
  type Value,
} from "./lib/expr";
import {
  cellsToMatrix,
  cellsToVector,
  EIGEN_COLORS,
  GRAPH_COLORS,
  nextName,
  type Row,
  type RowId,
  type RowKind,
} from "./rows";

const ANIM_MS = 1400; // per animation stage

const SUBS = ["₁", "₂"];

function fmt(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? "0" : String(r);
}

/** Rounder display for eigen output, where values are usually irrational. */
function fmt3(n: number): string {
  const r = Math.round(n * 1e3) / 1e3;
  return Object.is(r, -0) ? "0" : String(r);
}

function valueToText(v: Value): string {
  if (v.kind === "scalar") return fmt(v.value);
  if (v.kind === "vector") return `(${fmt(v.value.x)}, ${fmt(v.value.y)})`;
  const m = v.value;
  return `[${fmt(m[0])} ${fmt(m[1])}; ${fmt(m[2])} ${fmt(m[3])}]`;
}

/**
 * Scale a unit eigenvector so its smallest nonzero component is ±1 — reads
 * better than unit-length decimals ((1, 1) instead of (0.707, 0.707)).
 */
function niceDir(v: Vec2): Vec2 {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const m = Math.min(ax > 1e-6 ? ax : Infinity, ay > 1e-6 ? ay : Infinity);
  if (!Number.isFinite(m)) return v;
  return { x: v.x / m, y: v.y / m };
}

export interface ResultLine {
  text: string;
  color?: string;
}
export interface RowResult {
  text?: string;
  lines?: ResultLine[];
  error?: string;
}

let idCounter = 0;
const newId = (): RowId => `r${++idCounter}`;

export default function App() {
  const [rows, setRows] = useState<Row[]>(() => [
    { id: newId(), kind: "expr", src: "", shown: true },
  ]);
  const [activeId, setActiveId] = useState<RowId | null>(null);
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);

  // --- Build the scene. Names are document-global: the first row to define a
  // --- name owns it, and any other row may reference it — above or below.
  // --- Literal rows resolve first, then named expressions to a fixpoint.  ----
  const scene = useMemo(() => {
    const drawables: Drawable[] = [];
    const results = new Map<RowId, RowResult>();
    const colorOf = new Map<RowId, string>();
    const stagesOf = new Map<RowId, Mat2[]>(); // cumulative warp boundaries
    const stageNamesOf = new Map<RowId, string[]>();
    const warpables = new Set<RowId>(); // expr rows that can drive the warp
    const eigenRows = new Set<RowId>();
    const sliders = new Map<RowId, number>(); // scalar bindings -> current value
    const projRows = new Set<RowId>(); // top-level proj(v, w) rows (animatable)
    const ridingVectors = new Map<RowId, VectorDrawable>();
    const env: Env = new Map();
    let ci = 0;
    const nextColor = () => GRAPH_COLORS[ci++ % GRAPH_COLORS.length];

    const nameOwner = new Map<string, RowId>();
    for (const row of rows) {
      const nm =
        row.kind === "expr" ? parseBinding(row.src)?.name ?? null : row.name;
      if (!nm || RESERVED_NAMES.has(nm)) continue;
      if (!nameOwner.has(nm)) nameOwner.set(nm, row.id);
    }

    // Literal rows don't depend on anything — bind them first.
    for (const row of rows) {
      if (row.kind === "matrix" && nameOwner.get(row.name) === row.id)
        env.set(row.name, { kind: "matrix", value: cellsToMatrix(row.cells) });
      else if (row.kind === "vector" && nameOwner.get(row.name) === row.id)
        env.set(row.name, { kind: "vector", value: cellsToVector(row.cells) });
    }

    // Named expressions may reference each other in any order, so keep
    // resolving until a pass makes no progress. Whatever never resolves
    // (missing names, cycles) gets its error reported in the main pass.
    const pending: { name: string; ast: Node }[] = [];
    for (const row of rows) {
      if (row.kind !== "expr") continue;
      const b = parseBinding(row.src);
      if (!b || !b.expr.trim() || nameOwner.get(b.name) !== row.id) continue;
      try {
        pending.push({ name: b.name, ast: parse(b.expr) });
      } catch {
        // parse error — the main pass reports it
      }
    }
    let progressed = true;
    while (progressed && pending.length > 0) {
      progressed = false;
      for (let i = pending.length - 1; i >= 0; i--) {
        try {
          env.set(pending[i].name, evaluate(pending[i].ast, env));
          pending.splice(i, 1);
          progressed = true;
        } catch {
          // unresolved this round — try again after others land
        }
      }
    }

    // Cumulative products for a factor chain, applied right-to-left like
    // function composition: M·N warps by N first, then M lands on M·N.
    const buildStages = (
      ast: Node,
    ): { mats: Mat2[]; names: string[] } | null => {
      const factors = multiplicativeFactors(ast);
      if (!factors || factors.length < 2) return null;
      const ms: Mat2[] = [];
      for (const f of factors) {
        let v: Value;
        try {
          v = evaluate(f, env);
        } catch {
          return null;
        }
        if (v.kind !== "matrix") return null;
        ms.push(v.value);
      }
      const mats: Mat2[] = [];
      const names: string[] = [];
      let acc: Mat2 = IDENTITY;
      for (let i = ms.length - 1; i >= 0; i--) {
        acc = multiply(ms[i], acc);
        mats.push(acc);
        const f = factors[i];
        names.push(f.t === "var" ? f.name : `step ${ms.length - i}`);
      }
      return { mats, names };
    };

    // A literal row that lost its name (someone above defines it too, or it's
    // a built-in) reports the clash instead of silently shadowing.
    const nameClash = (row: Row & { name: string }): string | null => {
      if (!row.name) return null;
      if (RESERVED_NAMES.has(row.name))
        return `"${row.name}" is a reserved name`;
      if (nameOwner.get(row.name) !== row.id)
        return `"${row.name}" is already defined`;
      return null;
    };

    for (const row of rows) {
      if (row.kind === "matrix") {
        const clash = nameClash(row);
        if (clash) {
          results.set(row.id, { error: clash });
          continue;
        }
        stagesOf.set(row.id, [cellsToMatrix(row.cells)]);
        continue;
      }
      if (row.kind === "vector") {
        const clash = nameClash(row);
        if (clash) {
          results.set(row.id, { error: clash });
          continue;
        }
        const color = nextColor();
        colorOf.set(row.id, color);
        if (row.shown) {
          const d: VectorDrawable = {
            kind: "vector",
            vec: cellsToVector(row.cells),
            color,
            ride: true,
            label: row.name,
          };
          drawables.push(d);
          ridingVectors.set(row.id, d);
        }
        continue;
      }

      const src = row.src.trim();
      if (!src) continue;
      try {
        const binding = parseBinding(src);
        if (binding && RESERVED_NAMES.has(binding.name))
          throw new ExprError(`"${binding.name}" is a reserved name`);
        if (binding && nameOwner.get(binding.name) !== row.id)
          throw new ExprError(`"${binding.name}" is already defined`);
        if (binding && !binding.expr.trim()) continue; // still typing "u ="
        const ast = parse(binding ? binding.expr : src);

        if (ast.t === "call" && ast.fn === "eigen") {
          if (binding)
            throw new ExprError("eigen(…) can't be assigned to a name");
          const mv = evaluate(ast.args[0], env);
          if (mv.kind !== "matrix") throw new ExprError("eigen expects a matrix");
          const eg = eigen(mv.value);
          eigenRows.add(row.id);
          if (eg.kind === "complex") {
            results.set(row.id, {
              lines: [
                { text: `λ = ${fmt3(eg.re)} ± ${fmt3(eg.im)}i` },
                { text: "complex — no real eigenvectors (space rotates)" },
              ],
            });
          } else if (eg.kind === "uniform") {
            results.set(row.id, {
              lines: [
                {
                  text: `λ = ${fmt3(eg.value)} — every vector is an eigenvector`,
                },
              ],
            });
          } else {
            const lines: ResultLine[] = eg.pairs.map((p, i) => {
              const d = niceDir(p.vec);
              return {
                text: `λ${SUBS[i]} = ${fmt3(p.value)}   →  (${fmt3(d.x)}, ${fmt3(d.y)})`,
                color: EIGEN_COLORS[i],
              };
            });
            if (eg.repeated)
              lines.push({ text: "repeated eigenvalue — one eigen-direction" });
            results.set(row.id, { lines });
            if (row.shown) {
              eg.pairs.forEach((p, i) => {
                const color = EIGEN_COLORS[i];
                // Invariant line of the target matrix stays put; the unit
                // eigenvector rides the warp and stretches by λ along it.
                drawables.push({ kind: "line", dir: p.vec, color });
                drawables.push({
                  kind: "vector",
                  vec: p.vec,
                  color,
                  ride: true,
                  label: `λ${SUBS[i]} = ${fmt3(p.value)}`,
                });
              });
            }
          }
          continue;
        }

        const value = evaluate(ast, env); // env is fully populated already
        // A name bound to a plain number ("a = 1.5") gets a slider instead of
        // a redundant "= 1.5" result line.
        const isNumericLiteral =
          ast.t === "num" || (ast.t === "neg" && ast.a.t === "num");
        if (binding && isNumericLiteral && value.kind === "scalar") {
          sliders.set(row.id, value.value);
        } else {
          results.set(row.id, { text: valueToText(value) });
        }

        if (value.kind === "matrix") {
          const st = buildStages(ast);
          stagesOf.set(row.id, st ? st.mats : [value.value]);
          if (st) stageNamesOf.set(row.id, st.names);
          warpables.add(row.id);
        } else if (value.kind === "vector") {
          const color = nextColor();
          colorOf.set(row.id, color);
          // A top-level proj(v, w) draws the line it projects onto, a ghost of
          // v, and the perpendicular drop — and can animate the drop.
          if (ast.t === "call" && ast.fn === "proj") {
            const from = evaluate(ast.args[0], env);
            const onto = evaluate(ast.args[1], env);
            if (from.kind === "vector" && onto.kind === "vector") {
              projRows.add(row.id);
              if (row.shown) {
                const len = Math.hypot(onto.value.x, onto.value.y);
                drawables.push({
                  kind: "proj",
                  from: from.value,
                  to: value.value,
                  dir: { x: onto.value.x / len, y: onto.value.y / len },
                  color,
                  label: binding?.name,
                  animate: activeId === row.id,
                });
              }
              continue;
            }
          }
          // Decompose a top-level sum/difference into head-to-tail parts.
          const terms = additiveTerms(ast);
          let parts: Vec2[] | null = null;
          if (terms && terms.length >= 2) {
            parts = [];
            for (const term of terms) {
              const tv = evaluate(term.node, env);
              if (tv.kind !== "vector") {
                parts = null;
                break;
              }
              parts.push({
                x: term.sign * tv.value.x,
                y: term.sign * tv.value.y,
              });
            }
          }
          if (row.shown) {
            if (parts) {
              drawables.push({
                kind: "sum",
                parts,
                result: value.value,
                color,
                ride: false,
                label: binding?.name,
              });
            } else {
              drawables.push({
                kind: "vector",
                vec: value.value,
                color,
                ride: false,
                label: binding?.name,
              });
            }
          }
        }
      } catch (e) {
        results.set(row.id, {
          error: e instanceof ExprError ? e.message : "Invalid expression",
        });
      }
    }
    // While a warp is active, shown vectors ride it — relabel each one as its
    // image ("M·v") and report where it lands in the row's box.
    const active = activeId ? rows.find((r) => r.id === activeId) : undefined;
    const activeStages = activeId ? stagesOf.get(activeId) : undefined;
    if (active && activeStages && activeStages.length > 0) {
      const target = activeStages[activeStages.length - 1];
      let warpName: string;
      if (active.kind === "matrix") {
        warpName = active.name;
      } else {
        const b = active.kind === "expr" ? parseBinding(active.src) : null;
        if (b) warpName = b.name;
        else {
          const s = (active.kind === "expr" ? active.src : "").trim().replace(/[*×•]/g, "·");
          warpName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : `(${s})`;
        }
      }
      for (const row of rows) {
        if (row.kind !== "vector" || !row.shown || row.id === activeId) continue;
        const d = ridingVectors.get(row.id);
        if (!d) continue; // no drawable (e.g. name clash) — keep its error
        const image = apply(target, cellsToVector(row.cells));
        const lbl = `${warpName}·${row.name}`;
        d.label = lbl;
        results.set(row.id, {
          lines: [
            {
              text: `${lbl} = (${fmt(image.x)}, ${fmt(image.y)})`,
              color: colorOf.get(row.id),
            },
          ],
        });
      }
    }

    return {
      drawables,
      results,
      colorOf,
      stagesOf,
      stageNamesOf,
      warpables,
      eigenRows,
      sliders,
      projRows,
    };
  }, [rows, activeId]);

  // --- The active row (matrix or matrix-valued expression) drives the warp.
  // --- Compositions animate stage by stage: t sweeps all stages in order. ----
  const activeStages = useMemo(
    () => (activeId ? scene.stagesOf.get(activeId) ?? null : null),
    [scene, activeId],
  );
  const warp = useMemo(() => {
    if (!activeStages) return IDENTITY;
    const S = activeStages.length;
    const u = Math.min(1, Math.max(0, t)) * S;
    const k = Math.min(Math.floor(u), S - 1);
    const from = k === 0 ? IDENTITY : activeStages[k - 1];
    return lerp(from, activeStages[k], u - k);
  }, [activeStages, t]);

  // --- Animation loop (constant rate per stage). -----------------------------
  const tRef = useRef(t);
  tRef.current = t;
  const animMsRef = useRef(ANIM_MS);
  animMsRef.current = ANIM_MS * (activeStages?.length ?? 1);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (!last) last = now;
      const dt = now - last;
      last = now;
      const next = tRef.current + dt / animMsRef.current;
      if (next >= 1) {
        setT(1);
        setPlaying(false);
        return;
      }
      setT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // --- Row operations -------------------------------------------------------
  const addRow = (kind: RowKind, afterId?: RowId) => {
    const id = newId();
    setRows((prev) => {
      let row: Row;
      if (kind === "matrix")
        row = { id, kind: "matrix", name: nextName(prev, "matrix"), cells: ["1", "0", "0", "1"] };
      else if (kind === "vector")
        row = { id, kind: "vector", name: nextName(prev, "vector"), cells: ["", ""], shown: true };
      else if (kind === "slider")
        row = { id, kind: "expr", src: `${nextName(prev, "scalar")} = 1`, shown: true };
      else row = { id, kind: "expr", src: "", shown: true };

      if (afterId != null) {
        const idx = prev.findIndex((r) => r.id === afterId);
        if (idx >= 0) {
          const target = prev[idx];
          // Replace an empty expression box in place (gear on a blank box).
          if (target.kind === "expr" && target.src.trim() === "") {
            const copy = [...prev];
            copy[idx] = row;
            return copy;
          }
          const copy = [...prev];
          copy.splice(idx + 1, 0, row);
          return copy;
        }
      }
      return [...prev, row];
    });
    if (kind === "matrix") {
      setActiveId(id);
      setPlaying(false);
      setT(1);
    }
  };

  const updateRow = (id: RowId, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r) => (r.id === id ? ({ ...r, ...patch } as Row) : r)),
    );

  const setMatrixCell = (id: RowId, index: number, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id || r.kind !== "matrix") return r;
        const cells = [...r.cells] as typeof r.cells;
        cells[index] = value;
        return { ...r, cells };
      }),
    );
    // Only refresh the warp if this matrix is the one currently graphed,
    // so editing a toggled-off matrix doesn't pop it back on.
    if (activeId === id) {
      setPlaying(false);
      setT(1);
    }
  };

  const setExprSrc = (id: RowId, src: string) => {
    updateRow(id, { src } as Partial<Row>);
    if (activeId === id) {
      setPlaying(false);
      setT(1);
    }
  };

  // Toggle a row's graph on/off. Warp sources (matrices and matrix-valued
  // expressions) share a single "active warp" slot, so turning one on turns
  // any other off automatically.
  const toggleShown = (id: RowId) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (row.kind === "matrix" || scene.warpables.has(id)) {
      setActiveId((prev) => (prev === id ? null : id));
      setPlaying(false);
      setT(1);
    } else {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id && r.kind !== "matrix" ? { ...r, shown: !r.shown } : r,
        ),
      );
      // Hiding a proj row that was mid-animation releases the animation slot.
      if (activeId === id) {
        setActiveId(null);
        setPlaying(false);
        setT(1);
      }
    }
  };

  const setVectorCell = (id: RowId, index: number, value: string) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id || r.kind !== "vector") return r;
        const cells = [...r.cells] as typeof r.cells;
        cells[index] = value;
        return { ...r, cells };
      }),
    );

  const deleteRow = (id: RowId) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      if (id === activeId) {
        const m = next.find((r) => r.kind === "matrix");
        setActiveId(m ? m.id : null);
      }
      return next;
    });
  };

  const playWarp = (id: RowId) => {
    setActiveId(id);
    if (tRef.current >= 1) setT(0);
    setPlaying(true);
  };
  const scrubWarp = (id: RowId, value: number) => {
    setActiveId(id);
    setPlaying(false);
    setT(value);
  };

  return (
    <div className="app">
      <ExpressionList
        rows={rows}
        results={scene.results}
        colorOf={scene.colorOf}
        warpables={scene.warpables}
        eigenRows={scene.eigenRows}
        sliders={scene.sliders}
        projRows={scene.projRows}
        stageNamesOf={scene.stageNamesOf}
        activeId={activeId}
        t={t}
        playing={playing}
        onAdd={addRow}
        onToggle={toggleShown}
        onDelete={deleteRow}
        onRename={(id, name) => updateRow(id, { name } as Partial<Row>)}
        onExprChange={setExprSrc}
        onSliderBounds={(id, min, max) =>
          updateRow(id, { sliderMin: min, sliderMax: max } as Partial<Row>)
        }
        onMatrixCell={setMatrixCell}
        onVectorCell={setVectorCell}
        onPlay={playWarp}
        onScrub={scrubWarp}
      />
      <main className="stage">
        <TransformCanvas
          warp={warp}
          showActiveMatrix={activeStages !== null}
          drawables={scene.drawables}
          projT={t}
        />
      </main>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import TransformCanvas, {
  type Drawable,
} from "./components/TransformCanvas";
import ExpressionList from "./components/ExpressionList";
import { IDENTITY, lerp, type Vec2 } from "./lib/matrix";
import {
  additiveTerms,
  evaluate,
  ExprError,
  parse,
  type Value,
} from "./lib/expr";
import {
  buildEnv,
  cellsToMatrix,
  cellsToVector,
  firstMatrixName,
  GRAPH_COLORS,
  nextName,
  type Row,
  type RowId,
  type RowKind,
} from "./rows";

const ANIM_MS = 1400;

function fmt(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? "0" : String(r);
}

function valueToText(v: Value): string {
  if (v.kind === "scalar") return fmt(v.value);
  if (v.kind === "vector") return `(${fmt(v.value.x)}, ${fmt(v.value.y)})`;
  const m = v.value;
  return `[${fmt(m[0])} ${fmt(m[1])}; ${fmt(m[2])} ${fmt(m[3])}]`;
}

export interface RowResult {
  text?: string;
  error?: string;
}

let idCounter = 0;
const newId = (): RowId => `r${++idCounter}`;

export default function App() {
  const [rows, setRows] = useState<Row[]>(() => [
    { id: newId(), kind: "expr", src: "", shown: true },
  ]);
  const [activeId, setActiveId] = useState<RowId | null>(
    () => rows.find((r) => r.kind === "matrix")?.id ?? null,
  );
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);

  const env = useMemo(() => buildEnv(rows), [rows]);

  // --- Build the scene: drawables for the canvas + inline results. ----------
  const { drawables, results, colorOf } = useMemo(() => {
    const drawables: Drawable[] = [];
    const results = new Map<RowId, RowResult>();
    const colorOf = new Map<RowId, string>();
    let ci = 0;
    const nextColor = () => GRAPH_COLORS[ci++ % GRAPH_COLORS.length];

    for (const row of rows) {
      if (row.kind === "vector") {
        const color = nextColor();
        colorOf.set(row.id, color);
        if (row.shown) {
          drawables.push({
            kind: "vector",
            vec: cellsToVector(row.cells),
            color,
            ride: true,
            label: row.name,
          });
        }
      } else if (row.kind === "expr") {
        const src = row.src.trim();
        if (!src) continue;
        try {
          const ast = parse(src);
          const value = evaluate(ast, env);
          results.set(row.id, { text: valueToText(value) });
          if (value.kind === "vector") {
            const color = nextColor();
            colorOf.set(row.id, color);
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
                parts.push({ x: term.sign * tv.value.x, y: term.sign * tv.value.y });
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
                });
              } else {
                drawables.push({
                  kind: "vector",
                  vec: value.value,
                  color,
                  ride: false,
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
    }
    return { drawables, results, colorOf };
  }, [rows, env]);

  // --- Active matrix drives the ambient warp. -------------------------------
  const activeMatrix = useMemo(() => {
    const r = rows.find((row) => row.id === activeId && row.kind === "matrix");
    return r && r.kind === "matrix" ? cellsToMatrix(r.cells) : null;
  }, [rows, activeId]);
  const warp = useMemo(
    () => (activeMatrix ? lerp(IDENTITY, activeMatrix, t) : IDENTITY),
    [activeMatrix, t],
  );

  // --- Animation loop (constant rate, glides through any collapse). ----------
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (!last) last = now;
      const dt = now - last;
      last = now;
      const next = tRef.current + dt / ANIM_MS;
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
      else if (kind === "det")
        row = { id, kind: "expr", src: `det(${firstMatrixName(prev)})`, shown: true };
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

  // Toggle a row's graph on/off. Matrices share a single "active warp" slot,
  // so turning one on turns any other matrix off automatically.
  const toggleShown = (id: RowId) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (row.kind === "matrix") {
      setActiveId((prev) => (prev === id ? null : id));
      setPlaying(false);
      setT(1);
    } else {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id && r.kind !== "matrix" ? { ...r, shown: !r.shown } : r,
        ),
      );
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

  const playMatrix = (id: RowId) => {
    setActiveId(id);
    if (tRef.current >= 1) setT(0);
    setPlaying(true);
  };
  const scrubMatrix = (id: RowId, value: number) => {
    setActiveId(id);
    setPlaying(false);
    setT(value);
  };

  return (
    <div className="app">
      <ExpressionList
        rows={rows}
        results={results}
        colorOf={colorOf}
        activeId={activeId}
        t={t}
        playing={playing}
        onAdd={addRow}
        onToggle={toggleShown}
        onDelete={deleteRow}
        onRename={(id, name) => updateRow(id, { name } as Partial<Row>)}
        onExprChange={(id, src) => updateRow(id, { src } as Partial<Row>)}
        onMatrixCell={setMatrixCell}
        onVectorCell={setVectorCell}
        onPlay={playMatrix}
        onScrub={scrubMatrix}
      />
      <main className="stage">
        <TransformCanvas
          warp={warp}
          showActiveMatrix={activeMatrix !== null}
          drawables={drawables}
        />
      </main>
    </div>
  );
}

/**
 * The 3D sandbox — same expression-list UX as the 2D version, rendered with
 * Three.js. First version: matrices and vectors graph (basis vectors + the
 * warped unit cube), expressions and the engine built-ins evaluate inline,
 * sliders work, and the active matrix animates identity → M.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import TransformCanvas3D, {
  type Drawable3,
} from "./components/TransformCanvas3D";
import ExpressionList from "./components/ExpressionList";
import { IDENTITY3, lerp3, type Mat3 } from "./lib/matrix3";
import {
  evaluate,
  ExprError,
  parse,
  parseBinding,
  RESERVED_NAMES,
  type Env,
} from "./lib/expr";
import {
  cellsToMatrix3,
  cellsToVector3,
  GRAPH_COLORS_3D,
  nextName,
  type Row,
  type RowId,
  type RowKind,
  type RowResult,
} from "./rows";
import { valueToText } from "./format";
import { newId, type SandboxProps } from "./App";

const ANIM_MS = 1400;

const EMPTY_SET = new Set<RowId>();
const EMPTY_MAP = new Map<RowId, string[]>();

export default function Warp3D({ mode, onModeChange }: SandboxProps) {
  const [rows, setRows] = useState<Row[]>(() => [
    { id: newId(), kind: "expr", src: "", shown: true },
  ]);
  const [activeId, setActiveId] = useState<RowId | null>(null);
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);

  // Same name model as 2D: document-global, first definition owns the name.
  const scene = useMemo(() => {
    const drawables: Drawable3[] = [];
    const results = new Map<RowId, RowResult>();
    const colorOf = new Map<RowId, string>();
    const targetOf = new Map<RowId, Mat3>(); // rows that can drive the warp
    const warpables = new Set<RowId>();
    const sliders = new Map<RowId, number>();
    const env: Env = new Map();
    let ci = 0;
    const nextColor = () => GRAPH_COLORS_3D[ci++ % GRAPH_COLORS_3D.length];

    const nameOwner = new Map<string, RowId>();
    for (const row of rows) {
      const nm =
        row.kind === "expr" ? parseBinding(row.src)?.name ?? null : row.name;
      if (!nm || RESERVED_NAMES.has(nm)) continue;
      if (!nameOwner.has(nm)) nameOwner.set(nm, row.id);
    }
    for (const row of rows) {
      if (row.kind === "matrix" && nameOwner.get(row.name) === row.id)
        env.set(row.name, { kind: "matrix3", value: cellsToMatrix3(row.cells) });
      else if (row.kind === "vector" && nameOwner.get(row.name) === row.id)
        env.set(row.name, { kind: "vector3", value: cellsToVector3(row.cells) });
    }
    const pending: { name: string; ast: ReturnType<typeof parse> }[] = [];
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
          // unresolved this round
        }
      }
    }

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
        if (clash) results.set(row.id, { error: clash });
        else targetOf.set(row.id, cellsToMatrix3(row.cells));
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
        if (row.shown)
          drawables.push({
            kind: "vector",
            vec: cellsToVector3(row.cells),
            color,
            ride: true,
            label: row.name,
          });
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

        if (ast.t === "call" && ast.fn === "eigen")
          throw new ExprError("eigen isn't supported in 3D yet");

        const value = evaluate(ast, env);
        const isNumericLiteral =
          ast.t === "num" || (ast.t === "neg" && ast.a.t === "num");
        if (binding && isNumericLiteral && value.kind === "scalar") {
          sliders.set(row.id, value.value);
        } else {
          results.set(row.id, { text: valueToText(value) });
        }

        if (value.kind === "matrix3") {
          targetOf.set(row.id, value.value);
          warpables.add(row.id);
        } else if (value.kind === "vector3") {
          const color = nextColor();
          colorOf.set(row.id, color);
          if (row.shown)
            drawables.push({
              kind: "vector",
              vec: value.value,
              color,
              ride: false,
              label: binding?.name,
            });
        }
      } catch (e) {
        results.set(row.id, {
          error: e instanceof ExprError ? e.message : "Invalid expression",
        });
      }
    }

    return { drawables, results, colorOf, targetOf, warpables, sliders };
  }, [rows]);

  const activeTarget = useMemo(
    () => (activeId ? scene.targetOf.get(activeId) ?? null : null),
    [scene, activeId],
  );
  const warp = useMemo(
    () => (activeTarget ? lerp3(IDENTITY3, activeTarget, Math.min(1, Math.max(0, t))) : IDENTITY3),
    [activeTarget, t],
  );

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

  const addRow = (kind: RowKind) => {
    const id = newId();
    setRows((prev) => {
      let row: Row;
      if (kind === "matrix")
        row = {
          id,
          kind: "matrix",
          name: nextName(prev, "matrix"),
          cells: ["1", "0", "0", "0", "1", "0", "0", "0", "1"],
        };
      else if (kind === "vector")
        row = {
          id,
          kind: "vector",
          name: nextName(prev, "vector"),
          cells: ["", "", ""],
          shown: true,
        };
      else if (kind === "slider")
        row = { id, kind: "expr", src: `${nextName(prev, "scalar")} = 1`, shown: true };
      else row = { id, kind: "expr", src: "", shown: true };
      // Replace a trailing empty expression box in place, else append.
      const last = prev[prev.length - 1];
      if (last && last.kind === "expr" && last.src.trim() === "" && row.kind !== "expr") {
        return [...prev.slice(0, -1), row];
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

  const setCell = (id: RowId, index: number, value: string, kind: "matrix" | "vector") => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id || r.kind !== kind) return r;
        const cells = [...r.cells];
        cells[index] = value;
        return { ...r, cells };
      }),
    );
    if (kind === "matrix" && activeId === id) {
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
    }
  };

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
        mode={mode}
        onModeChange={onModeChange}
        rows={rows}
        results={scene.results}
        colorOf={scene.colorOf}
        warpables={scene.warpables}
        eigenRows={EMPTY_SET}
        sliders={scene.sliders}
        projRows={EMPTY_SET}
        stageNamesOf={EMPTY_MAP}
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
        onMatrixCell={(id, i, v) => setCell(id, i, v, "matrix")}
        onVectorCell={(id, i, v) => setCell(id, i, v, "vector")}
        onPlay={playWarp}
        onScrub={scrubWarp}
      />
      <main className="stage">
        <TransformCanvas3D
          warp={warp}
          showActiveMatrix={activeTarget !== null}
          drawables={scene.drawables}
        />
      </main>
    </div>
  );
}

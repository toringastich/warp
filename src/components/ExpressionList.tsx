import { useState } from "react";
import { type RowResult } from "../App";
import { type Row, type RowId, type RowKind } from "../rows";

interface Props {
  rows: Row[];
  results: Map<RowId, RowResult>;
  colorOf: Map<RowId, string>;
  activeId: RowId | null;
  t: number;
  playing: boolean;
  onAdd: (kind: RowKind, afterId?: RowId) => void;
  onToggle: (id: RowId) => void;
  onDelete: (id: RowId) => void;
  onRename: (id: RowId, name: string) => void;
  onExprChange: (id: RowId, src: string) => void;
  onMatrixCell: (id: RowId, index: number, value: string) => void;
  onVectorCell: (id: RowId, index: number, value: string) => void;
  onPlay: (id: RowId) => void;
  onScrub: (id: RowId, value: number) => void;
}

const PALETTE: { kind: RowKind; label: string }[] = [
  { kind: "matrix", label: "Add matrix" },
  { kind: "vector", label: "Add vector" },
  { kind: "expr", label: "Add expression" },
  { kind: "det", label: "det( )" },
];

export default function ExpressionList(props: Props) {
  const { rows, results, colorOf, activeId, t, playing } = props;
  const [openGear, setOpenGear] = useState<string | null>(null);

  const pick = (kind: RowKind, afterId?: RowId) => {
    props.onAdd(kind, afterId);
    setOpenGear(null);
  };

  const palette = (afterId?: RowId) => (
    <div className="palette">
      {PALETTE.map((p) => (
        <button key={p.kind} className="palette-item" onClick={() => pick(p.kind, afterId)}>
          {p.label}
        </button>
      ))}
    </div>
  );

  const gearKey = (id: RowId) => `row:${id}`;

  return (
    <aside className="sidebar">
      <header className="brand">
        <span className="brand-mark">▦</span>
        <h1>Warp</h1>
        <div className="gear-wrap">
          <button
            className="gear"
            title="Add…"
            onClick={() => setOpenGear(openGear === "header" ? null : "header")}
          >
            +
          </button>
          {openGear === "header" && palette(undefined)}
        </div>
      </header>

      <div className="rows">
        {rows.length === 0 && (
          <p className="empty-hint">Press + to add a matrix or vector.</p>
        )}
        {rows.map((row, i) => {
          const color = colorOf.get(row.id);
          const res = results.get(row.id);
          const isMatrix = row.kind === "matrix";
          const graphable = isMatrix || color !== undefined;
          const shown = isMatrix ? activeId === row.id : row.shown;
          return (
            <div className="row" key={row.id}>
              <div className="row-index">{i + 1}</div>
              <div className="row-body">
                <div className="row-top">
                  {graphable ? (
                    <button
                      className={
                        "toggle-dot" +
                        (isMatrix ? " matrix" : "") +
                        (shown ? " on" : "")
                      }
                      style={!isMatrix && color ? { color } : undefined}
                      title={shown ? "Hide" : "Show"}
                      aria-pressed={shown}
                      onClick={() => props.onToggle(row.id)}
                    />
                  ) : (
                    <span className="dot dot-empty" />
                  )}

                  {row.kind === "matrix" && (
                    <div className="row-main">
                      <input
                        className="name-input"
                        value={row.name}
                        onChange={(e) => props.onRename(row.id, e.target.value)}
                      />
                      <span className="eq">=</span>
                      <div className="matrix-bracket">
                        <div className="matrix-grid">
                          {row.cells.map((c, idx) => (
                            <input
                              key={idx}
                              className="matrix-cell"
                              type="text"
                              inputMode="decimal"
                              value={c}
                              onChange={(e) =>
                                props.onMatrixCell(row.id, idx, e.target.value)
                              }
                              onFocus={(e) => e.target.select()}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {row.kind === "vector" && (
                    <div className="row-main">
                      <input
                        className="name-input"
                        value={row.name}
                        onChange={(e) => props.onRename(row.id, e.target.value)}
                      />
                      <span className="eq">=</span>
                      <div className="matrix-bracket">
                        <div className="vector-grid">
                          {row.cells.map((c, idx) => (
                            <input
                              key={idx}
                              className="matrix-cell"
                              type="text"
                              inputMode="decimal"
                              value={c}
                              onChange={(e) =>
                                props.onVectorCell(row.id, idx, e.target.value)
                              }
                              onFocus={(e) => e.target.select()}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {row.kind === "expr" && (
                    <div className="row-main expr-main">
                      <input
                        className="expr-input"
                        type="text"
                        placeholder="e.g. M·v, det(M), v + w"
                        value={row.src}
                        onChange={(e) => props.onExprChange(row.id, e.target.value)}
                      />
                    </div>
                  )}

                  <div className="row-actions">
                    <div className="gear-wrap">
                      <button
                        className="gear gear-sm"
                        title="Add…"
                        onClick={() =>
                          setOpenGear(
                            openGear === gearKey(row.id) ? null : gearKey(row.id),
                          )
                        }
                      >
                        ⚙
                      </button>
                      {openGear === gearKey(row.id) && palette(row.id)}
                    </div>
                    <button
                      className="del"
                      title="Delete"
                      onClick={() => props.onDelete(row.id)}
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Animation controls for the active (shown) matrix */}
                {row.kind === "matrix" && activeId === row.id && (
                  <div className="anim">
                    <button
                      className="play"
                      onClick={() => props.onPlay(row.id)}
                      title="Animate identity → matrix"
                    >
                      {playing && activeId === row.id ? "❚❚" : "▶"}
                    </button>
                    <input
                      className="anim-slider"
                      type="range"
                      min={0}
                      max={1}
                      step={0.001}
                      value={activeId === row.id ? t : 1}
                      onChange={(e) =>
                        props.onScrub(row.id, parseFloat(e.target.value))
                      }
                    />
                  </div>
                )}

                {/* Inline result for expressions */}
                {row.kind === "expr" && res?.text && (
                  <div className="result-line">
                    <span className="result-eq">=</span>
                    <span className="result-value" style={color ? { color } : undefined}>
                      {res.text}
                    </span>
                  </div>
                )}
                {row.kind === "expr" && res?.error && (
                  <div className="result-error">{res.error}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="hint">Drag to pan · scroll to zoom</footer>
    </aside>
  );
}

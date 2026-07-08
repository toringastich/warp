/**
 * The sandbox's document model: an ordered list of typed rows, plus helpers
 * to name them, read their numeric values, and build the evaluation env.
 */
import { type Mat2, type Vec2 } from "./lib/matrix";
import { parseBinding } from "./lib/expr";

export type RowId = string;

export interface MatrixRow {
  id: RowId;
  kind: "matrix";
  name: string;
  cells: [string, string, string, string];
}
export interface VectorRow {
  id: RowId;
  kind: "vector";
  name: string;
  cells: [string, string];
  shown: boolean;
}
export interface ExprRow {
  id: RowId;
  kind: "expr";
  src: string;
  shown: boolean;
  /** Slider bounds for scalar bindings ("a = 1.5"); kept as raw input text. */
  sliderMin?: string;
  sliderMax?: string;
}
export type Row = MatrixRow | VectorRow | ExprRow;

export type RowKind = "matrix" | "vector" | "expr" | "slider" | "det" | "eigen";

const MATRIX_NAMES = ["M", "N", "P", "Q", "R", "S", "T"];
const VECTOR_NAMES = ["v", "w", "u", "p", "q", "r", "s"];
const SCALAR_NAMES = ["a", "b", "c", "k", "g", "h"];

/** First unused name from the appropriate pool. */
export function nextName(
  rows: Row[],
  kind: "matrix" | "vector" | "scalar",
): string {
  const used = new Set<string>();
  for (const r of rows) {
    if (r.kind === "expr") {
      const b = parseBinding(r.src);
      if (b) used.add(b.name);
    } else {
      used.add(r.name);
    }
  }
  const pool =
    kind === "matrix" ? MATRIX_NAMES : kind === "vector" ? VECTOR_NAMES : SCALAR_NAMES;
  for (const n of pool) if (!used.has(n)) return n;
  const prefix = kind === "matrix" ? "M" : kind === "vector" ? "v" : "a";
  let i = 1;
  while (used.has(prefix + i)) i++;
  return prefix + i;
}

export function firstMatrixName(rows: Row[]): string {
  const m = rows.find((r) => r.kind === "matrix") as MatrixRow | undefined;
  return m?.name ?? "M";
}

const num = (s: string): number => {
  const f = parseFloat(s);
  return Number.isFinite(f) ? f : 0;
};

export function cellsToMatrix(c: MatrixRow["cells"]): Mat2 {
  return [num(c[0]), num(c[1]), num(c[2]), num(c[3])];
}
export function cellsToVector(c: VectorRow["cells"]): Vec2 {
  return { x: num(c[0]), y: num(c[1]) };
}

/** Colors for plotted vectors/results (blue + green are reserved for î, ĵ). */
export const GRAPH_COLORS = [
  "#e0792b",
  "#6042a6",
  "#c74440",
  "#0d9488",
  "#c026d3",
  "#b45309",
];

/** Fixed colors for λ₁ / λ₂ so eigen rows always look the same. */
export const EIGEN_COLORS = ["#e0792b", "#6042a6"];

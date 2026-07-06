/**
 * The sandbox's document model: an ordered list of typed rows, plus helpers
 * to name them, read their numeric values, and build the evaluation env.
 */
import { type Mat2, type Vec2 } from "./lib/matrix";
import { type Env } from "./lib/expr";

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
}
export type Row = MatrixRow | VectorRow | ExprRow;

export type RowKind = "matrix" | "vector" | "expr" | "det";

const MATRIX_NAMES = ["M", "N", "P", "Q", "R", "S", "T"];
const VECTOR_NAMES = ["v", "w", "u", "p", "q", "r", "s"];

/** First unused name from the appropriate pool. */
export function nextName(rows: Row[], kind: "matrix" | "vector"): string {
  const used = new Set(
    rows.filter((r): r is MatrixRow | VectorRow => r.kind !== "expr").map((r) => r.name),
  );
  const pool = kind === "matrix" ? MATRIX_NAMES : VECTOR_NAMES;
  for (const n of pool) if (!used.has(n)) return n;
  const prefix = kind === "matrix" ? "M" : "v";
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

/** Build the variable environment from every named (matrix/vector) row. */
export function buildEnv(rows: Row[]): Env {
  const env: Env = new Map();
  for (const r of rows) {
    if (r.kind === "matrix")
      env.set(r.name, { kind: "matrix", value: cellsToMatrix(r.cells) });
    else if (r.kind === "vector")
      env.set(r.name, { kind: "vector", value: cellsToVector(r.cells) });
  }
  return env;
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

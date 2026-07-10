/**
 * The sandbox's document model: an ordered list of typed rows, plus helpers
 * to name them, read their numeric values, and build the evaluation env.
 */
import {
  evaluate,
  parse,
  parseBinding,
  type Env,
  type PMat2,
  type PMat3,
  type PVec2,
  type PVec3,
} from "./lib/expr";
import * as P from "./lib/poly";
import { type Poly } from "./lib/poly";

export type RowId = string;
export type Mode = "2d" | "3d";

export interface MatrixRow {
  id: RowId;
  kind: "matrix";
  name: string;
  /** 4 entries (2D) or 9 entries (3D), row-major. */
  cells: string[];
}
export interface VectorRow {
  id: RowId;
  kind: "vector";
  name: string;
  /** 2 entries (2D) or 3 entries (3D). */
  cells: string[];
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

export type RowKind = "matrix" | "vector" | "expr" | "slider";

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

const EMPTY_ENV: Env = new Map();

/**
 * A cell is a tiny expression: "1.5", "2x", "2^0.5"… (no references to other
 * rows). Unreadable or non-scalar input falls back to 0, like the old
 * parseFloat behavior for garbage — mid-typing states shouldn't shout.
 */
export function cellPoly(s: string): Poly {
  const t = s.trim();
  if (!t) return P.constant(0);
  try {
    const v = evaluate(parse(t), EMPTY_ENV);
    if (v.kind === "scalar") return v.value;
  } catch {
    // fall through
  }
  return P.constant(0);
}

export function cellsToPMat2(c: MatrixRow["cells"]): PMat2 {
  return c.map(cellPoly) as unknown as PMat2;
}
export function cellsToPVec2(c: VectorRow["cells"]): PVec2 {
  return { x: cellPoly(c[0]), y: cellPoly(c[1]) };
}
export function cellsToPMat3(c: MatrixRow["cells"]): PMat3 {
  return c.map(cellPoly) as unknown as PMat3;
}
export function cellsToPVec3(c: VectorRow["cells"]): PVec3 {
  return { x: cellPoly(c[0]), y: cellPoly(c[1]), z: cellPoly(c[2]) };
}

/** What a row reports back to the list: an inline value, lines, or an error. */
export interface ResultLine {
  text: string;
  color?: string;
}
export interface RowResult {
  text?: string;
  lines?: ResultLine[];
  error?: string;
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

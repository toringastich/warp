/** Shared display formatting for numbers and engine values. */
import { type Value } from "./lib/expr";
import * as P from "./lib/poly";

export function fmt(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? "0" : String(r);
}

/** A polynomial as display text ("2x³ + 3xy²"; plain number when constant). */
export function polyText(p: P.Poly): string {
  return P.toText(p, fmt);
}

export function valueToText(v: Value): string {
  switch (v.kind) {
    case "scalar":
      return polyText(v.value);
    case "vector":
      return `(${polyText(v.value.x)}, ${polyText(v.value.y)})`;
    case "vector3":
      return `(${polyText(v.value.x)}, ${polyText(v.value.y)}, ${polyText(v.value.z)})`;
    case "matrix": {
      const t = v.value.map(polyText);
      // Symbolic entries can contain spaces, so separate with commas then.
      const sep = v.value.every(P.isConst) ? " " : ", ";
      return `[${t[0]}${sep}${t[1]}; ${t[2]}${sep}${t[3]}]`;
    }
    case "matrix3": {
      const t = v.value.map(polyText);
      const sep = v.value.every(P.isConst) ? " " : ", ";
      const row = (r: number) => `${t[r]}${sep}${t[r + 1]}${sep}${t[r + 2]}`;
      return `[${row(0)}; ${row(3)}; ${row(6)}]`;
    }
  }
}

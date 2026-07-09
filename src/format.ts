/** Shared display formatting for numbers and engine values. */
import { type Value } from "./lib/expr";

export function fmt(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? "0" : String(r);
}

export function valueToText(v: Value): string {
  switch (v.kind) {
    case "scalar":
      return fmt(v.value);
    case "vector":
      return `(${fmt(v.value.x)}, ${fmt(v.value.y)})`;
    case "vector3":
      return `(${fmt(v.value.x)}, ${fmt(v.value.y)}, ${fmt(v.value.z)})`;
    case "matrix": {
      const m = v.value;
      return `[${fmt(m[0])} ${fmt(m[1])}; ${fmt(m[2])} ${fmt(m[3])}]`;
    }
    case "matrix3": {
      const m = v.value;
      const row = (r: number) =>
        `${fmt(m[r])} ${fmt(m[r + 1])} ${fmt(m[r + 2])}`;
      return `[${row(0)}; ${row(3)}; ${row(6)}]`;
    }
  }
}

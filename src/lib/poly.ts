/**
 * Multivariate polynomials in x, y, z — the symbolic backbone of the
 * expression engine. A Poly maps an exponent key "i,j,k" (the powers of
 * x, y, z) to its coefficient; a plain number is the constant polynomial
 * {"0,0,0": n}. Closed under + − × and whole-number powers, which is exactly
 * the algebra the engine speaks. Pure, no rendering deps.
 */

export type Poly = ReadonlyMap<string, number>;

const EPS = 1e-12;
const CONST_KEY = "0,0,0";

export function constant(n: number): Poly {
  return Math.abs(n) < EPS ? new Map() : new Map([[CONST_KEY, n]]);
}

/** The symbol x (axis 0), y (1), or z (2). */
export function symbol(axis: 0 | 1 | 2): Poly {
  const e = [0, 0, 0];
  e[axis] = 1;
  return new Map([[e.join(","), 1]]);
}

export function isConst(p: Poly): boolean {
  return p.size === 0 || (p.size === 1 && p.has(CONST_KEY));
}

/** Numeric value of a constant polynomial (meaningless if !isConst). */
export function constValue(p: Poly): number {
  return p.get(CONST_KEY) ?? 0;
}

export function add(a: Poly, b: Poly, sign: 1 | -1 = 1): Poly {
  const out = new Map(a);
  for (const [k, c] of b) {
    const next = (out.get(k) ?? 0) + sign * c;
    if (Math.abs(next) < EPS) out.delete(k);
    else out.set(k, next);
  }
  return out;
}

export function scale(p: Poly, s: number): Poly {
  if (Math.abs(s) < EPS) return new Map();
  const out = new Map<string, number>();
  for (const [k, c] of p) out.set(k, c * s);
  return out;
}

export function mul(a: Poly, b: Poly): Poly {
  const out = new Map<string, number>();
  for (const [ka, ca] of a) {
    const ea = ka.split(",").map(Number);
    for (const [kb, cb] of b) {
      const eb = kb.split(",").map(Number);
      const k = `${ea[0] + eb[0]},${ea[1] + eb[1]},${ea[2] + eb[2]}`;
      const next = (out.get(k) ?? 0) + ca * cb;
      if (Math.abs(next) < EPS) out.delete(k);
      else out.set(k, next);
    }
  }
  return out;
}

/** p^n for whole n >= 0 (callers validate the exponent). */
export function pow(p: Poly, n: number): Poly {
  let out = constant(1);
  for (let i = 0; i < n; i++) out = mul(out, p);
  return out;
}

/** Partial derivative with respect to x (axis 0), y (1), or z (2). */
export function diff(p: Poly, axis: 0 | 1 | 2): Poly {
  const out = new Map<string, number>();
  for (const [k, c] of p) {
    const e = k.split(",").map(Number);
    const n = e[axis];
    if (n === 0) continue;
    e[axis] = n - 1;
    out.set(e.join(","), c * n);
  }
  return out;
}

const SUP = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
const sup = (n: number): string =>
  String(n)
    .split("")
    .map((d) => SUP[+d])
    .join("");

/** "2x³ + 3xy² − 4" — terms sorted by degree, then by x/y/z exponent. */
export function toText(p: Poly, fmt: (n: number) => string): string {
  if (p.size === 0) return "0";
  const terms = [...p.entries()].map(([k, c]) => {
    const [ex, ey, ez] = k.split(",").map(Number);
    return { ex, ey, ez, deg: ex + ey + ez, c };
  });
  terms.sort(
    (a, b) => b.deg - a.deg || b.ex - a.ex || b.ey - a.ey || b.ez - a.ez,
  );
  let out = "";
  for (const t of terms) {
    const vars =
      (t.ex ? "x" + (t.ex > 1 ? sup(t.ex) : "") : "") +
      (t.ey ? "y" + (t.ey > 1 ? sup(t.ey) : "") : "") +
      (t.ez ? "z" + (t.ez > 1 ? sup(t.ez) : "") : "");
    const mag = Math.abs(t.c);
    const coef = vars && Math.abs(mag - 1) < EPS ? "" : fmt(mag);
    const body = coef + vars;
    if (!out) out = (t.c < 0 ? "−" : "") + body;
    else out += (t.c < 0 ? " − " : " + ") + body;
  }
  return out;
}

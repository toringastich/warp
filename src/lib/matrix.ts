/**
 * Pure 2x2 linear-algebra helpers.
 *
 * This module knows nothing about Canvas, React, or the DOM — it only
 * transforms numbers. Keeping the math isolated like this is what lets the
 * 3D phase layer Three.js on top later without touching any of it.
 *
 * A matrix is stored row-major as [a, b, c, d], meaning:
 *     | a  b |
 *     | c  d |
 * Its columns are where the basis vectors land:
 *     i-hat (1,0) -> (a, c)
 *     j-hat (0,1) -> (b, d)
 */

export type Mat2 = readonly [number, number, number, number];
export interface Vec2 {
  x: number;
  y: number;
}

export const IDENTITY: Mat2 = [1, 0, 0, 1];

/** det = ad - bc. Signed area scale factor; sign encodes orientation. */
export function det(m: Mat2): number {
  return m[0] * m[3] - m[1] * m[2];
}

/** Apply the matrix to a vector: M * v. */
export function apply(m: Mat2, v: Vec2): Vec2 {
  return {
    x: m[0] * v.x + m[1] * v.y,
    y: m[2] * v.x + m[3] * v.y,
  };
}

/** First column — where i-hat lands. */
export function iHat(m: Mat2): Vec2 {
  return { x: m[0], y: m[2] };
}

/** Second column — where j-hat lands. */
export function jHat(m: Mat2): Vec2 {
  return { x: m[1], y: m[3] };
}

/** Matrix product M * N. */
export function multiply(m: Mat2, n: Mat2): Mat2 {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
  ];
}

/** Inverse, or null if the matrix is singular (det ~ 0). */
export function inverse(m: Mat2): Mat2 | null {
  const d = det(m);
  if (Math.abs(d) < 1e-12) return null;
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d];
}

/** Per-entry linear interpolation from `from` to `to` at t in [0, 1]. */
export function lerp(from: Mat2, to: Mat2, t: number): Mat2 {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
    from[3] + (to[3] - from[3]) * t,
  ];
}

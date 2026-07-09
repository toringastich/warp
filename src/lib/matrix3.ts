/**
 * Pure 3x3 linear-algebra helpers — the 3D counterpart of matrix.ts.
 *
 * Like matrix.ts, this knows nothing about rendering. A matrix is stored
 * row-major as [a, b, c, d, e, f, g, h, i], meaning:
 *     | a  b  c |
 *     | d  e  f |
 *     | g  h  i |
 * Its columns are where the basis vectors land:
 *     i-hat (1,0,0) -> (a, d, g)
 *     j-hat (0,1,0) -> (b, e, h)
 *     k-hat (0,0,1) -> (c, f, i)
 */

export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const IDENTITY3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** det = signed volume scale factor; sign encodes orientation. */
export function det3(m: Mat3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

/** Apply the matrix to a vector: M * v. */
export function apply3(m: Mat3, v: Vec3): Vec3 {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}

/** Column n (0..2) — where the nth basis vector lands. */
export function col3(m: Mat3, n: 0 | 1 | 2): Vec3 {
  return { x: m[n], y: m[3 + n], z: m[6 + n] };
}

/** Matrix product M * N. */
export function multiply3(m: Mat3, n: Mat3): Mat3 {
  const out: number[] = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      out[r * 3 + c] =
        m[r * 3] * n[c] + m[r * 3 + 1] * n[3 + c] + m[r * 3 + 2] * n[6 + c];
  return out as unknown as Mat3;
}

/** Transpose: rows become columns. */
export function transpose3(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/** Inverse via the adjugate, or null if the matrix is singular (det ~ 0). */
export function inverse3(m: Mat3): Mat3 | null {
  const d = det3(m);
  if (Math.abs(d) < 1e-12) return null;
  return [
    (m[4] * m[8] - m[5] * m[7]) / d,
    (m[2] * m[7] - m[1] * m[8]) / d,
    (m[1] * m[5] - m[2] * m[4]) / d,
    (m[5] * m[6] - m[3] * m[8]) / d,
    (m[0] * m[8] - m[2] * m[6]) / d,
    (m[2] * m[3] - m[0] * m[5]) / d,
    (m[3] * m[7] - m[4] * m[6]) / d,
    (m[1] * m[6] - m[0] * m[7]) / d,
    (m[0] * m[4] - m[1] * m[3]) / d,
  ];
}

/** Per-entry linear interpolation from `from` to `to` at t in [0, 1]. */
export function lerp3(from: Mat3, to: Mat3, t: number): Mat3 {
  return from.map((x, i) => x + (to[i] - x) * t) as unknown as Mat3;
}

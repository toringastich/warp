/**
 * A tiny expression engine for Warp's sandbox.
 *
 * It parses and evaluates expressions over a three-type algebra:
 *   - scalar  (a number)
 *   - vector  (a 2D vector)
 *   - matrix  (a 2x2 matrix)
 *
 * Supported syntax:
 *   + - * (and the · glyph) , unary minus, parentheses,
 *   vector literals (a, b), function calls (det, eigen, inv, transpose,
 *   dot, norm, proj), and variable references.
 *   Juxtaposition means multiplication: "2v", "2(v + w)".
 *
 * Like everything in lib/, this is pure and rendering-agnostic.
 */

import {
  apply,
  det as matDet,
  inverse,
  multiply,
  transpose as matTranspose,
  type Mat2,
  type Vec2,
} from "./matrix";
import {
  apply3,
  det3,
  inverse3,
  multiply3,
  transpose3,
  type Mat3,
  type Vec3,
} from "./matrix3";

export type Value =
  | { kind: "scalar"; value: number }
  | { kind: "vector"; value: Vec2 }
  | { kind: "matrix"; value: Mat2 }
  | { kind: "vector3"; value: Vec3 }
  | { kind: "matrix3"; value: Mat3 };

/** Human-readable name of a value's type, for error messages. */
export function kindName(k: Value["kind"]): string {
  switch (k) {
    case "scalar":
      return "number";
    case "vector":
      return "2D vector";
    case "matrix":
      return "2×2 matrix";
    case "vector3":
      return "3D vector";
    case "matrix3":
      return "3×3 matrix";
  }
}

export type Env = Map<string, Value>;

export class ExprError extends Error {}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: "+" | "-" | "*" }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "comma" };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= "0" && c <= "9";
  const isAlpha = (c: string) =>
    (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
    } else if (c === "(") {
      toks.push({ t: "lp" });
      i++;
    } else if (c === ")") {
      toks.push({ t: "rp" });
      i++;
    } else if (c === ",") {
      toks.push({ t: "comma" });
      i++;
    } else if (c === "+" || c === "-") {
      toks.push({ t: "op", v: c });
      i++;
    } else if (c === "*" || c === "·" || c === "×" || c === "•") {
      toks.push({ t: "op", v: "*" });
      i++;
    } else if (isDigit(c) || (c === "." && isDigit(src[i + 1] ?? ""))) {
      let j = i;
      while (j < src.length && (isDigit(src[j]) || src[j] === ".")) j++;
      toks.push({ t: "num", v: parseFloat(src.slice(i, j)) });
      i = j;
    } else if (isAlpha(c)) {
      let j = i;
      while (j < src.length && (isAlpha(src[j]) || isDigit(src[j]))) j++;
      toks.push({ t: "id", v: src.slice(i, j) });
      i = j;
    } else {
      throw new ExprError(`Unexpected character "${c}"`);
    }
  }
  return toks;
}

// ---------------------------------------------------------------------------
// AST + parser (recursive descent)
// ---------------------------------------------------------------------------

/** Built-in functions and how many arguments each takes. */
const FN_ARITY = {
  det: 1,
  eigen: 1,
  inv: 1,
  transpose: 1,
  norm: 1,
  dot: 2,
  proj: 2,
} as const;
export type FnName = keyof typeof FN_ARITY;

export type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "vec"; x: Node; y: Node }
  | { t: "vec3"; x: Node; y: Node; z: Node }
  | { t: "neg"; a: Node }
  | { t: "add"; a: Node; b: Node }
  | { t: "sub"; a: Node; b: Node }
  | { t: "mul"; a: Node; b: Node }
  | { t: "call"; fn: FnName; args: Node[] };

class Parser {
  private pos = 0;
  constructor(private toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  private next(): Tok | undefined {
    return this.toks[this.pos++];
  }

  parse(): Node {
    const node = this.parseExpr();
    if (this.pos < this.toks.length) throw new ExprError("Unexpected trailing input");
    return node;
  }

  // expr := term (('+' | '-') term)*
  private parseExpr(): Node {
    let node = this.parseTerm();
    while (true) {
      const p = this.peek();
      if (p?.t === "op" && (p.v === "+" || p.v === "-")) {
        this.next();
        const rhs = this.parseTerm();
        node = { t: p.v === "+" ? "add" : "sub", a: node, b: rhs };
      } else break;
    }
    return node;
  }

  // term := factor ( ('*')? factor )*   — juxtaposition is multiplication
  private parseTerm(): Node {
    let node = this.parseFactor();
    while (true) {
      const p = this.peek();
      if (p?.t === "op" && p.v === "*") {
        this.next();
        node = { t: "mul", a: node, b: this.parseFactor() };
      } else if (p && (p.t === "num" || p.t === "id" || p.t === "lp")) {
        // implicit multiplication, e.g. 2v
        node = { t: "mul", a: node, b: this.parseFactor() };
      } else break;
    }
    return node;
  }

  // factor := '-' factor | atom
  private parseFactor(): Node {
    const p = this.peek();
    if (p?.t === "op" && p.v === "-") {
      this.next();
      return { t: "neg", a: this.parseFactor() };
    }
    if (p?.t === "op" && p.v === "+") {
      this.next();
      return this.parseFactor();
    }
    return this.parseAtom();
  }

  private parseAtom(): Node {
    const tok = this.next();
    if (!tok) throw new ExprError("Unexpected end of expression");
    if (tok.t === "num") return { t: "num", v: tok.v };
    if (tok.t === "id") {
      if (tok.v in FN_ARITY) {
        const fn = tok.v as FnName;
        if (this.peek()?.t !== "lp")
          throw new ExprError(`${fn} expects parentheses`);
        this.next(); // (
        const args: Node[] = [this.parseExpr()];
        while (this.peek()?.t === "comma") {
          this.next();
          args.push(this.parseExpr());
        }
        if (this.next()?.t !== "rp") throw new ExprError("Missing )");
        const want = FN_ARITY[fn];
        if (args.length !== want)
          throw new ExprError(
            `${fn} expects ${want} argument${want > 1 ? "s" : ""}`,
          );
        return { t: "call", fn, args };
      }
      return { t: "var", name: tok.v };
    }
    if (tok.t === "lp") {
      const first = this.parseExpr();
      const p = this.peek();
      if (p?.t === "comma") {
        this.next();
        const second = this.parseExpr();
        if (this.peek()?.t === "comma") {
          this.next();
          const third = this.parseExpr();
          if (this.next()?.t !== "rp") throw new ExprError("Missing )");
          return { t: "vec3", x: first, y: second, z: third };
        }
        if (this.next()?.t !== "rp") throw new ExprError("Missing )");
        return { t: "vec", x: first, y: second };
      }
      if (this.next()?.t !== "rp") throw new ExprError("Missing )");
      return first;
    }
    throw new ExprError("Unexpected token");
  }
}

export function parse(src: string): Node {
  return new Parser(tokenize(src)).parse();
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

const scalar = (n: number): Value => ({ kind: "scalar", value: n });
const vector = (v: Vec2): Value => ({ kind: "vector", value: v });
const matrix = (m: Mat2): Value => ({ kind: "matrix", value: m });
const vector3 = (v: Vec3): Value => ({ kind: "vector3", value: v });
const matrix3 = (m: Mat3): Value => ({ kind: "matrix3", value: m });

function add(a: Value, b: Value, sign: 1 | -1): Value {
  const s = sign;
  if (a.kind === "scalar" && b.kind === "scalar")
    return scalar(a.value + s * b.value);
  if (a.kind === "vector" && b.kind === "vector")
    return vector({ x: a.value.x + s * b.value.x, y: a.value.y + s * b.value.y });
  if (a.kind === "vector3" && b.kind === "vector3")
    return vector3({
      x: a.value.x + s * b.value.x,
      y: a.value.y + s * b.value.y,
      z: a.value.z + s * b.value.z,
    });
  if (a.kind === "matrix" && b.kind === "matrix")
    return matrix([
      a.value[0] + s * b.value[0],
      a.value[1] + s * b.value[1],
      a.value[2] + s * b.value[2],
      a.value[3] + s * b.value[3],
    ]);
  if (a.kind === "matrix3" && b.kind === "matrix3") {
    const bv = b.value;
    return matrix3(a.value.map((x, i) => x + s * bv[i]) as unknown as Mat3);
  }
  const word = s === 1 ? "add" : "subtract";
  throw new ExprError(
    `Can't ${word} a ${kindName(a.kind)} and a ${kindName(b.kind)}`,
  );
}

function mul(a: Value, b: Value): Value {
  if (a.kind === "scalar" && b.kind === "scalar")
    return scalar(a.value * b.value);
  if (a.kind === "scalar" && b.kind === "vector")
    return vector({ x: a.value * b.value.x, y: a.value * b.value.y });
  if (a.kind === "vector" && b.kind === "scalar")
    return vector({ x: a.value.x * b.value, y: a.value.y * b.value });
  if (a.kind === "scalar" && b.kind === "vector3")
    return vector3({
      x: a.value * b.value.x,
      y: a.value * b.value.y,
      z: a.value * b.value.z,
    });
  if (a.kind === "vector3" && b.kind === "scalar") return mul(b, a);
  if (a.kind === "scalar" && b.kind === "matrix")
    return matrix(b.value.map((x) => a.value * x) as unknown as Mat2);
  if (a.kind === "matrix" && b.kind === "scalar")
    return matrix(a.value.map((x) => x * b.value) as unknown as Mat2);
  if (a.kind === "scalar" && b.kind === "matrix3")
    return matrix3(b.value.map((x) => a.value * x) as unknown as Mat3);
  if (a.kind === "matrix3" && b.kind === "scalar") return mul(b, a);
  if (a.kind === "matrix" && b.kind === "vector")
    return vector(apply(a.value, b.value));
  if (a.kind === "matrix3" && b.kind === "vector3")
    return vector3(apply3(a.value, b.value));
  if (a.kind === "matrix" && b.kind === "matrix")
    return matrix(multiply(a.value, b.value));
  if (a.kind === "matrix3" && b.kind === "matrix3")
    return matrix3(multiply3(a.value, b.value));
  if (
    (a.kind === "vector" && b.kind === "matrix") ||
    (a.kind === "vector3" && b.kind === "matrix3")
  )
    throw new ExprError("Put the matrix on the left of the vector (M·v)");
  throw new ExprError(
    `Can't multiply a ${kindName(a.kind)} and a ${kindName(b.kind)}`,
  );
}

export function evaluate(node: Node, env: Env): Value {
  switch (node.t) {
    case "num":
      return scalar(node.v);
    case "var": {
      const v = env.get(node.name);
      if (!v) throw new ExprError(`"${node.name}" is not defined`);
      return v;
    }
    case "vec": {
      const x = evaluate(node.x, env);
      const y = evaluate(node.y, env);
      if (x.kind !== "scalar" || y.kind !== "scalar")
        throw new ExprError("Vector components must be numbers");
      return vector({ x: x.value, y: y.value });
    }
    case "vec3": {
      const x = evaluate(node.x, env);
      const y = evaluate(node.y, env);
      const z = evaluate(node.z, env);
      if (x.kind !== "scalar" || y.kind !== "scalar" || z.kind !== "scalar")
        throw new ExprError("Vector components must be numbers");
      return vector3({ x: x.value, y: y.value, z: z.value });
    }
    case "neg": {
      const a = evaluate(node.a, env);
      return mul(scalar(-1), a);
    }
    case "add":
      return add(evaluate(node.a, env), evaluate(node.b, env), 1);
    case "sub":
      return add(evaluate(node.a, env), evaluate(node.b, env), -1);
    case "mul":
      return mul(evaluate(node.a, env), evaluate(node.b, env));
    case "call": {
      const args = node.args.map((n) => evaluate(n, env));
      switch (node.fn) {
        case "det": {
          const [a] = args;
          if (a.kind === "matrix") return scalar(matDet(a.value));
          if (a.kind === "matrix3") return scalar(det3(a.value));
          throw new ExprError("det expects a matrix");
        }
        case "inv": {
          const [a] = args;
          if (a.kind !== "matrix" && a.kind !== "matrix3")
            throw new ExprError("inv expects a matrix");
          const m =
            a.kind === "matrix" ? inverse(a.value) : inverse3(a.value);
          if (!m) throw new ExprError("Not invertible (det = 0)");
          return a.kind === "matrix" ? matrix(m as Mat2) : matrix3(m as Mat3);
        }
        case "transpose": {
          const [a] = args;
          if (a.kind === "matrix") return matrix(matTranspose(a.value));
          if (a.kind === "matrix3") return matrix3(transpose3(a.value));
          throw new ExprError("transpose expects a matrix");
        }
        case "norm": {
          const [a] = args;
          if (a.kind === "vector") return scalar(Math.hypot(a.value.x, a.value.y));
          if (a.kind === "vector3")
            return scalar(Math.hypot(a.value.x, a.value.y, a.value.z));
          throw new ExprError("norm expects a vector");
        }
        case "dot": {
          const [a, b] = args;
          if (a.kind === "vector" && b.kind === "vector")
            return scalar(a.value.x * b.value.x + a.value.y * b.value.y);
          if (a.kind === "vector3" && b.kind === "vector3")
            return scalar(
              a.value.x * b.value.x +
                a.value.y * b.value.y +
                a.value.z * b.value.z,
            );
          throw new ExprError("dot expects two vectors of the same dimension");
        }
        case "proj": {
          // proj(v, w): the projection of v onto w.
          const [a, b] = args;
          if (a.kind === "vector" && b.kind === "vector") {
            const ww = b.value.x * b.value.x + b.value.y * b.value.y;
            if (ww < 1e-24)
              throw new ExprError("Can't project onto the zero vector");
            const k = (a.value.x * b.value.x + a.value.y * b.value.y) / ww;
            return vector({ x: k * b.value.x, y: k * b.value.y });
          }
          if (a.kind === "vector3" && b.kind === "vector3") {
            const ww =
              b.value.x * b.value.x +
              b.value.y * b.value.y +
              b.value.z * b.value.z;
            if (ww < 1e-24)
              throw new ExprError("Can't project onto the zero vector");
            const k =
              (a.value.x * b.value.x +
                a.value.y * b.value.y +
                a.value.z * b.value.z) /
              ww;
            return vector3({
              x: k * b.value.x,
              y: k * b.value.y,
              z: k * b.value.z,
            });
          }
          throw new ExprError("proj expects two vectors of the same dimension");
        }
        case "eigen":
          // eigen doesn't produce a scalar/vector/matrix, so it can't take
          // part in a larger expression; App handles it at the top level.
          throw new ExprError("eigen(…) can only be used on its own");
      }
    }
  }
}

/** Names with built-in meaning that rows can't bind. */
export const RESERVED_NAMES = new Set(Object.keys(FN_ARITY));

/**
 * If the row's source is a name binding like "u = M·v", split it into the
 * name and the expression text. Returns null for plain expressions.
 */
export function parseBinding(src: string): { name: string; expr: string } | null {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)([\s\S]*)$/.exec(src);
  if (!m) return null;
  return { name: m[1], expr: m[2] };
}

/**
 * If the expression's top level is a product, return its factors in source
 * order (M·N·P -> [M, N, P]). Used to animate a composition one factor at a
 * time. Returns null if the root isn't a product.
 */
export function multiplicativeFactors(node: Node): Node[] | null {
  if (node.t !== "mul") return null;
  const out: Node[] = [];
  const walk = (n: Node) => {
    if (n.t === "mul") {
      walk(n.a);
      walk(n.b);
    } else {
      out.push(n);
    }
  };
  walk(node);
  return out;
}

/**
 * If the expression's top level is a sum/difference, return each signed term
 * as a Node. Used to draw vector addition head-to-tail. Returns null if the
 * root isn't additive (so there's nothing to decompose).
 */
export function additiveTerms(node: Node): { sign: 1 | -1; node: Node }[] | null {
  if (node.t !== "add" && node.t !== "sub") return null;
  const out: { sign: 1 | -1; node: Node }[] = [];
  const walk = (n: Node, sign: 1 | -1) => {
    if (n.t === "add") {
      walk(n.a, sign);
      walk(n.b, sign);
    } else if (n.t === "sub") {
      walk(n.a, sign);
      walk(n.b, (sign === 1 ? -1 : 1) as 1 | -1);
    } else {
      out.push({ sign, node: n });
    }
  };
  walk(node, 1);
  return out;
}

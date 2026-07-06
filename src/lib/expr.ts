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
 *   vector literals (a, b), det(<expr>), and variable references.
 *   Juxtaposition means multiplication: "2v", "2(v + w)".
 *
 * Like everything in lib/, this is pure and rendering-agnostic.
 */

import { apply, det as matDet, multiply, type Mat2, type Vec2 } from "./matrix";

export type Value =
  | { kind: "scalar"; value: number }
  | { kind: "vector"; value: Vec2 }
  | { kind: "matrix"; value: Mat2 };

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

export type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "vec"; x: Node; y: Node }
  | { t: "neg"; a: Node }
  | { t: "add"; a: Node; b: Node }
  | { t: "sub"; a: Node; b: Node }
  | { t: "mul"; a: Node; b: Node }
  | { t: "det"; a: Node };

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
      if (tok.v === "det") {
        if (this.peek()?.t !== "lp") throw new ExprError("det expects parentheses");
        this.next(); // (
        const inner = this.parseExpr();
        if (this.next()?.t !== "rp") throw new ExprError("Missing )");
        return { t: "det", a: inner };
      }
      return { t: "var", name: tok.v };
    }
    if (tok.t === "lp") {
      const first = this.parseExpr();
      const p = this.peek();
      if (p?.t === "comma") {
        this.next();
        const second = this.parseExpr();
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

function add(a: Value, b: Value, sign: 1 | -1): Value {
  const s = sign;
  if (a.kind === "scalar" && b.kind === "scalar")
    return scalar(a.value + s * b.value);
  if (a.kind === "vector" && b.kind === "vector")
    return vector({ x: a.value.x + s * b.value.x, y: a.value.y + s * b.value.y });
  if (a.kind === "matrix" && b.kind === "matrix")
    return matrix([
      a.value[0] + s * b.value[0],
      a.value[1] + s * b.value[1],
      a.value[2] + s * b.value[2],
      a.value[3] + s * b.value[3],
    ]);
  const word = s === 1 ? "add" : "subtract";
  throw new ExprError(`Can't ${word} a ${a.kind} and a ${b.kind}`);
}

function mul(a: Value, b: Value): Value {
  if (a.kind === "scalar" && b.kind === "scalar")
    return scalar(a.value * b.value);
  if (a.kind === "scalar" && b.kind === "vector")
    return vector({ x: a.value * b.value.x, y: a.value * b.value.y });
  if (a.kind === "vector" && b.kind === "scalar")
    return vector({ x: a.value.x * b.value, y: a.value.y * b.value });
  if (a.kind === "scalar" && b.kind === "matrix")
    return matrix(b.value.map((x) => a.value * x) as unknown as Mat2);
  if (a.kind === "matrix" && b.kind === "scalar")
    return matrix(a.value.map((x) => x * b.value) as unknown as Mat2);
  if (a.kind === "matrix" && b.kind === "vector")
    return vector(apply(a.value, b.value));
  if (a.kind === "matrix" && b.kind === "matrix")
    return matrix(multiply(a.value, b.value));
  if (a.kind === "vector" && b.kind === "matrix")
    throw new ExprError("Put the matrix on the left of the vector (M·v)");
  throw new ExprError(`Can't multiply a ${a.kind} and a ${b.kind}`);
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
    case "det": {
      const a = evaluate(node.a, env);
      if (a.kind !== "matrix") throw new ExprError("det expects a matrix");
      return scalar(matDet(a.value));
    }
  }
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

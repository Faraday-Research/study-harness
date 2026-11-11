/**
 * The calculate tool: evaluates arithmetic so a skill can recompute every number it writes
 * (answers, tolerances, distractors) instead of doing sums in its head.
 *
 * Expressions are parsed here, never passed to eval or Function. Supported:
 *   numbers (1, 2.5, 3e8), + - * / ^ (power, right-associative), %, parentheses, unary minus,
 *   constants pi and e, and functions sqrt, abs, min, max, round, floor, ceil, log10, ln, log, exp,
 *   sin, cos, tan (radians).
 */
import { z } from "zod";
import type { Tool } from "../tool.js";

const MAX_EXPRESSIONS = 40;
const MAX_LENGTH = 300;

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  round: (x, digits = 0) => {
    const f = 10 ** digits;
    return Math.round(x * f) / f;
  },
  floor: Math.floor,
  ceil: Math.ceil,
  log10: Math.log10,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
};

type Token = { kind: "num"; value: number } | { kind: "id"; value: string } | { kind: "op"; value: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) {
      tokens.push({ kind: "num", value: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const id = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i));
    if (id) {
      tokens.push({ kind: "id", value: id[0].toLowerCase() });
      i += id[0].length;
      continue;
    }
    if ("+-*/^%(),".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    throw new Error(`unexpected character "${ch}"`);
  }
  return tokens;
}

/** Evaluates one arithmetic expression. Throws with a short reason if it can't. */
export function evaluate(expression: string): number {
  const tokens = tokenize(expression);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.kind === "op" && peek()!.value === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`expected "${v}"`);
    pos++;
  };

  // expr := term (('+'|'-') term)*
  function expr(): number {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++]!.value;
      const right = term();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  // term := unary (('*'|'/'|'%') unary)*
  function term(): number {
    let left = unary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = tokens[pos++]!.value;
      const right = unary();
      left = op === "*" ? left * right : op === "/" ? left / right : left % right;
    }
    return left;
  }
  // unary := '-' unary | power   (so -2^2 = -4)
  function unary(): number {
    if (isOp("-")) {
      pos++;
      return -unary();
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    return power();
  }
  // power := atom ('^' unary)?   (right-associative)
  function power(): number {
    const base = atom();
    if (isOp("^")) {
      pos++;
      return base ** unary();
    }
    return base;
  }
  function atom(): number {
    const t = peek();
    if (!t) throw new Error("expression ended early");
    if (t.kind === "num") {
      pos++;
      return t.value;
    }
    if (t.kind === "id") {
      pos++;
      if (isOp("(")) {
        const fn = FUNCTIONS[t.value];
        if (!fn) throw new Error(`unknown function "${t.value}"`);
        pos++;
        const args: number[] = [];
        if (!isOp(")")) {
          args.push(expr());
          while (isOp(",")) {
            pos++;
            args.push(expr());
          }
        }
        expect(")");
        return fn(...args);
      }
      if (t.value in CONSTANTS) return CONSTANTS[t.value]!;
      throw new Error(`unknown name "${t.value}" (use numbers, not variables)`);
    }
    if (t.value === "(") {
      pos++;
      const v = expr();
      expect(")");
      return v;
    }
    throw new Error(`unexpected "${t.value}"`);
  }

  if (tokens.length === 0) throw new Error("empty expression");
  const value = expr();
  if (pos < tokens.length) throw new Error(`unexpected "${String(tokens[pos]!.value)}"`);
  if (!Number.isFinite(value)) throw new Error("the result is not a finite number");
  return value;
}

export function createCalculateTool(): Tool {
  return {
    name: "calculate",
    description:
      "Evaluates arithmetic exactly, so every number you write is recomputed rather than estimated. " +
      "Send several expressions at once. Supports + - * / ^ %, parentheses, pi, e and sqrt, abs, min, max, " +
      "round(x, digits), floor, ceil, log10, ln, exp, sin, cos, tan (radians). Numbers only, no variables or units. " +
      `At most ${MAX_EXPRESSIONS} expressions per call.`,
    schema: z.object({
      expressions: z
        .array(z.string().max(MAX_LENGTH))
        .min(1)
        .max(MAX_EXPRESSIONS)
        .describe('e.g. ["0.4 * 9.81 * 20", "abs(78.5 - 70) / 2"]'),
    }),
    run({ expressions }: { expressions: string[] }) {
      return JSON.stringify({
        results: expressions.map((expression) => {
          try {
            return { expression, value: Number(evaluate(expression).toPrecision(12)) };
          } catch (err) {
            return { expression, error: err instanceof Error ? err.message : String(err) };
          }
        }),
      });
    },
  } as Tool;
}

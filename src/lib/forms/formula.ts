/**
 * Formulas for computed fields: `{price} * {qty}`, `sum({children.amount})`, `age({birthDate})`,
 * `if({income} > 5000, "high", "low")`. Same code runs in the browser (live) and on the server (authoritative).
 *
 * Values: number | string | boolean | null (empty). Rules:
 *  - `+ - * /` treat empty as 0, except division by zero or by empty, which gives empty.
 *  - `{a.b}` is the list of column `b` over the rows of table `a`; aggregate functions flatten lists.
 *  - Anything unparsable evaluates to empty rather than throwing at fill time; `parseFormula` reports errors for the builder.
 */
import type { Answers } from "./conditions";

export type FormulaValue = number | string | boolean | null;
type Value = FormulaValue | Value[];

export type Ast =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ref"; path: string[] }
  | { t: "unary"; op: "-" | "!"; arg: Ast }
  | { t: "bin"; op: string; l: Ast; r: Ast }
  | { t: "call"; name: string; args: Ast[] };

// ---------- lexer ----------

type Tok = { k: "num" | "str" | "ref" | "id" | "op" | "(" | ")" | ","; v: string };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (c === "{") {
      const end = src.indexOf("}", i);
      if (end < 0) throw new Error("חסר } בנוסחה");
      out.push({ k: "ref", v: src.slice(i + 1, end).trim() });
      i = end + 1;
    } else if (c === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== '"') s += src[j++];
      if (j >= src.length) throw new Error('חסר " בנוסחה');
      out.push({ k: "str", v: s });
      i = j + 1;
    } else if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j++;
      const n = src.slice(i, j);
      if (!/^\d*\.?\d+$|^\d+\.$/.test(n)) throw new Error(`מספר לא תקין: ${n}`);
      out.push({ k: "num", v: n });
      i = j;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j]!)) j++;
      out.push({ k: "id", v: src.slice(i, j) });
      i = j;
    } else if (c === "(" || c === ")" || c === ",") {
      out.push({ k: c, v: c });
      i++;
    } else {
      const two = src.slice(i, i + 2);
      if (["<=", ">=", "!=", "==", "&&", "||"].includes(two)) { out.push({ k: "op", v: two }); i += 2; }
      else if ("+-*/%<>=!".includes(c)) { out.push({ k: "op", v: c }); i++; }
      else throw new Error(`תו לא צפוי בנוסחה: ${c}`);
    }
  }
  return out;
}

// ---------- parser (precedence climbing) ----------

const BINARY: Record<string, number> = {
  "||": 1, "&&": 2,
  "=": 3, "==": 3, "!=": 3, "<": 4, ">": 4, "<=": 4, ">=": 4,
  "+": 5, "-": 5, "*": 6, "/": 6, "%": 6,
};

class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}
  private peek() { return this.toks[this.p]; }
  private next() { return this.toks[this.p++]; }
  parse(): Ast {
    const e = this.expr(0);
    if (this.peek()) throw new Error("נוסחה לא תקינה: תוכן עודף בסוף");
    return e;
  }
  private expr(minPrec: number): Ast {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (!t || t.k !== "op") break;
      const prec = BINARY[t.v];
      if (prec === undefined || prec < minPrec) break;
      this.next();
      const right = this.expr(prec + 1);
      left = { t: "bin", op: t.v === "==" ? "=" : t.v, l: left, r: right };
    }
    return left;
  }
  private unary(): Ast {
    const t = this.peek();
    if (t?.k === "op" && (t.v === "-" || t.v === "!")) {
      this.next();
      return { t: "unary", op: t.v, arg: this.unary() };
    }
    return this.primary();
  }
  private primary(): Ast {
    const t = this.next();
    if (!t) throw new Error("נוסחה לא שלמה");
    if (t.k === "num") return { t: "num", v: Number(t.v) };
    if (t.k === "str") return { t: "str", v: t.v };
    if (t.k === "ref") {
      if (!t.v) throw new Error("הפניה ריקה {}");
      return { t: "ref", path: t.v.split(".").map((s) => s.trim()) };
    }
    if (t.k === "(") {
      const e = this.expr(0);
      if (this.next()?.k !== ")") throw new Error("חסר )");
      return e;
    }
    if (t.k === "id") {
      const lower = t.v.toLowerCase();
      if (lower === "true" || lower === "false") return { t: "num", v: lower === "true" ? 1 : 0 };
      if (this.next()?.k !== "(") throw new Error(`פונקציה ${t.v} צריכה סוגריים`);
      const args: Ast[] = [];
      if (this.peek()?.k === ")") { this.next(); }
      else {
        for (;;) {
          args.push(this.expr(0));
          const n = this.next();
          if (n?.k === ")") break;
          if (n?.k !== ",") throw new Error("חסר ) או ,");
        }
      }
      if (!(lower in FUNCTIONS)) throw new Error(`פונקציה לא מוכרת: ${t.v}`);
      return { t: "call", name: lower, args };
    }
    throw new Error(`אסימון לא צפוי: ${t.v}`);
  }
}

/** Parse for the builder: returns the AST or a Hebrew error message. */
export function parseFormula(src: string): { ok: true; ast: Ast } | { ok: false; error: string } {
  try {
    if (!src.trim()) return { ok: false, error: "נוסחה ריקה" };
    return { ok: true, ast: new Parser(lex(src)).parse() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Field ids a formula reads (first path segment), for dependency ordering and the editor. */
export function formulaRefs(ast: Ast): string[] {
  const out = new Set<string>();
  const walk = (a: Ast) => {
    if (a.t === "ref") out.add(a.path[0]!);
    else if (a.t === "unary") walk(a.arg);
    else if (a.t === "bin") { walk(a.l); walk(a.r); }
    else if (a.t === "call") a.args.forEach(walk);
  };
  walk(ast);
  return [...out];
}

// ---------- evaluator ----------

export interface FormulaContext {
  answers: Answers;
  /** yyyy-mm-dd, injectable for tests */
  today: string;
}

const isList = (v: Value): v is Value[] => Array.isArray(v);

function num(v: Value): number | null {
  if (isList(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[,₪%\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function flat(vals: Value[]): FormulaValue[] {
  return vals.flatMap((v) => (isList(v) ? flat(v) : [v]));
}

function nums(vals: Value[]): number[] {
  return flat(vals).map(num).filter((n): n is number => n !== null);
}

function truthy(v: Value): boolean {
  if (isList(v)) return v.length > 0;
  if (v === null) return false;
  if (typeof v === "string") return v.trim() !== "" && v !== "no" && v !== "false";
  return !!v;
}

function ageOn(dob: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  let a = Number(today.slice(0, 4)) - Number(dob.slice(0, 4));
  if (today.slice(5) < dob.slice(5)) a--;
  return a;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

type Fn = (args: Value[], ctx: FormulaContext) => Value;
const FUNCTIONS: Record<string, Fn> = {
  sum: (a) => round6(nums(a).reduce((x, y) => x + y, 0)),
  avg: (a) => { const n = nums(a); return n.length ? round6(n.reduce((x, y) => x + y, 0) / n.length) : null; },
  min: (a) => { const n = nums(a); return n.length ? Math.min(...n) : null; },
  max: (a) => { const n = nums(a); return n.length ? Math.max(...n) : null; },
  count: (a) => flat(a).filter((v) => v !== null && v !== "").length,
  round: (a) => { const n = num(a[0] ?? null); if (n === null) return null; const d = num(a[1] ?? 0) ?? 0; const f = 10 ** d; return Math.round(n * f) / f; },
  abs: (a) => { const n = num(a[0] ?? null); return n === null ? null : Math.abs(n); },
  if: (a) => (truthy(a[0] ?? null) ? (a[1] ?? null) : (a[2] ?? null)),
  age: (a, ctx) => { const v = a[0]; return typeof v === "string" ? ageOn(v, ctx.today) : null; },
  concat: (a) => flat(a).filter((v) => v !== null).join(""),
  and: (a) => a.every(truthy),
  or: (a) => a.some(truthy),
  not: (a) => !truthy(a[0] ?? null),
  isempty: (a) => { const v = a[0] ?? null; return isList(v) ? v.length === 0 : v === null || v === ""; },
};

function lookup(path: string[], answers: Answers): Value {
  const [head, ...rest] = path;
  const raw = answers[head!];
  if (rest.length === 0) {
    if (raw === undefined || raw === null || raw === "") return null;
    if (typeof raw === "number" || typeof raw === "boolean") return raw;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw.length;
    return null;
  }
  if (Array.isArray(raw)) return raw.map((row) => lookup(rest, (row ?? {}) as Answers));
  if (raw && typeof raw === "object") return lookup(rest, raw as Answers);
  return null;
}

function evalAst(a: Ast, ctx: FormulaContext): Value {
  switch (a.t) {
    case "num": return a.v;
    case "str": return a.v;
    case "ref": return lookup(a.path, ctx.answers);
    case "unary": {
      const v = evalAst(a.arg, ctx);
      if (a.op === "!") return !truthy(v);
      const n = num(v);
      return n === null ? null : -n;
    }
    case "call": return FUNCTIONS[a.name]!(a.args.map((x) => evalAst(x, ctx)), ctx);
    case "bin": {
      const l = evalAst(a.l, ctx);
      const r = evalAst(a.r, ctx);
      switch (a.op) {
        case "&&": return truthy(l) && truthy(r);
        case "||": return truthy(l) || truthy(r);
        case "=": case "!=": case "<": case ">": case "<=": case ">=": {
          const ln = num(l), rn = num(r);
          const both = ln !== null && rn !== null;
          const x: number | string = both ? ln : String(isList(l) ? "" : (l ?? ""));
          const y: number | string = both ? rn : String(isList(r) ? "" : (r ?? ""));
          switch (a.op) {
            case "=": return x === y;
            case "!=": return x !== y;
            case "<": return x < y;
            case ">": return x > y;
            case "<=": return x <= y;
            default: return x >= y;
          }
        }
        default: {
          const x = num(l) ?? 0;
          const y = num(r);
          if (a.op === "/" || a.op === "%") {
            if (y === null || y === 0) return null;
            return round6(a.op === "/" ? x / y : x % y);
          }
          if (y === null && num(l) === null && l === null && r === null) return null;
          // A product with a missing factor is unknown, not 0 (e.g. hours × rate with no rate yet).
          if (a.op === "*" && (num(l) === null || y === null)) return null;
          const yy = y ?? 0;
          return round6(a.op === "+" ? x + yy : a.op === "-" ? x - yy : x * yy);
        }
      }
    }
  }
}

/** Evaluate; any error or list result gives empty (null). */
export function evaluateFormula(src: string, ctx: FormulaContext): FormulaValue {
  const parsed = parseFormula(src);
  if (!parsed.ok) return null;
  const v = evalAst(parsed.ast, ctx);
  return isList(v) ? null : v;
}

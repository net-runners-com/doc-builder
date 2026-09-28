type Ast =
  | { t: "num"; v: number }
  | { t: "id"; name: string }
  | { t: "neg"; e: Ast }
  | { t: "bin"; op: string; l: Ast; r: Ast }
  | { t: "call"; fn: "sum" | "count"; list: string; arg?: Ast };

function parseExpr(src: string): Ast {
  const toks = src.match(/\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/(),]|\S/g) ?? [];
  let i = 0;
  const peek = () => toks[i];
  const eat = (t?: string) => {
    const v = toks[i++];
    if (t !== undefined && v !== t) throw new Error(`"${t}" が必要です（${v ?? "終端"}）`);
    if (v === undefined) throw new Error("式が途中で終わっています");
    return v;
  };
  const expr = (): Ast => {
    let l = term();
    while (peek() === "+" || peek() === "-") l = { t: "bin", op: eat(), l, r: term() };
    return l;
  };
  const term = (): Ast => {
    let l = factor();
    while (peek() === "*" || peek() === "/") l = { t: "bin", op: eat(), l, r: factor() };
    return l;
  };
  const factor = (): Ast => {
    const v = eat();
    if (v === "-") return { t: "neg", e: factor() };
    if (v === "(") {
      const e = expr();
      eat(")");
      return e;
    }
    if (/^\d/.test(v)) return { t: "num", v: Number(v) };
    if (/^[A-Za-z_]/.test(v)) {
      if (peek() !== "(") return { t: "id", name: v };
      if (v !== "sum" && v !== "count") throw new Error(`未知の関数 "${v}"`);
      eat("(");
      const list = eat();
      let arg: Ast | undefined;
      if (v === "sum") {
        eat(",");
        arg = expr();
      }
      eat(")");
      return { t: "call", fn: v, list, arg };
    }
    throw new Error(`不正な字句 "${v}"`);
  };
  const ast = expr();
  if (i < toks.length) throw new Error(`余分な字句 "${toks[i]}"`);
  return ast;
}

function evalAst(a: Ast, data: any, row?: Record<string, unknown>): number {
  switch (a.t) {
    case "num":
      return a.v;
    case "neg":
      return -evalAst(a.e, data, row);
    case "id": {
      const v = row && typeof row[a.name] === "number" ? row[a.name] : data?.[a.name];
      if (typeof v !== "number") throw new Error(`未定義の値 "${a.name}"`);
      return v;
    }
    case "bin": {
      const l = evalAst(a.l, data, row);
      const r = evalAst(a.r, data, row);
      if (a.op === "/" && r === 0) throw new Error("0 で割っています");
      return a.op === "+" ? l + r : a.op === "-" ? l - r : a.op === "*" ? l * r : l / r;
    }
    case "call": {
      const list = data?.[a.list];
      if (!Array.isArray(list)) throw new Error(`"${a.list}" はリストではありません`);
      if (a.fn === "count") return list.length;
      return list.reduce((s: number, r: Record<string, unknown>) => s + evalAst(a.arg!, data, r), 0);
    }
  }
}

export function evalCalc(expr: string, data: any, row?: Record<string, unknown>): number {
  return evalAst(parseExpr(expr), data, row);
}

export const formatNumber = (n: number) => new Intl.NumberFormat("ja-JP").format(n);

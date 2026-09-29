/** 手順書のフロー（kind: procedure）をグラフとして扱う */
export interface Step {
  id: string;
  requires?: string[];
  produces?: string[];
  next?: string;
  end?: boolean;
  loop?: boolean;
  branches?: { if: string; goto: string }[];
}

export interface Graph {
  ids: string[];
  /** id → 行き先（既定の次 + 分岐） */
  edges: Map<string, { to: string; cond?: string }[]>;
  /** 終端（end: true、または最後の手順で next なし） */
  terminals: Set<string>;
}

export function buildGraph(steps: Step[]): Graph {
  const ids = steps.map((s) => s.id);
  const edges = new Map<string, { to: string; cond?: string }[]>();
  const terminals = new Set<string>();
  steps.forEach((s, i) => {
    const out: { to: string; cond?: string }[] = [];
    if (!s.end) {
      const def = s.next ?? steps[i + 1]?.id;
      if (def) out.push({ to: def });
      else terminals.add(s.id);
    } else terminals.add(s.id);
    for (const b of s.branches ?? []) out.push({ to: b.goto, cond: b.if });
    edges.set(s.id, out);
  });
  return { ids, edges, terminals };
}

/** 行き先が存在しない辺 */
export const danglingEdges = (g: Graph) =>
  [...g.edges].flatMap(([from, es]) => es.filter((e) => !g.ids.includes(e.to)).map((e) => ({ from, to: e.to })));

export function reachable(g: Graph, start = g.ids[0]): Set<string> {
  const seen = new Set<string>();
  const stack = start ? [start] : [];
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n) || !g.ids.includes(n)) continue;
    seen.add(n);
    for (const e of g.edges.get(n) ?? []) stack.push(e.to);
  }
  return seen;
}

/** 終端にたどり着けない手順（無限ループの罠） */
export function cannotFinish(g: Graph): string[] {
  const rev = new Map<string, string[]>();
  for (const [from, es] of g.edges) for (const e of es) rev.set(e.to, [...(rev.get(e.to) ?? []), from]);
  const ok = new Set<string>();
  const stack = [...g.terminals];
  while (stack.length) {
    const n = stack.pop()!;
    if (ok.has(n)) continue;
    ok.add(n);
    for (const p of rev.get(n) ?? []) stack.push(p);
  }
  return [...reachable(g)].filter((n) => !ok.has(n));
}

/** loop: true の手順を含まない循環（強連結成分） */
export function unmarkedCycles(g: Graph, loopOk: Set<string>): string[][] {
  let index = 0;
  const idx = new Map<string, number>(), low = new Map<string, number>(), on = new Set<string>(), st: string[] = [];
  const out: string[][] = [];
  const visit = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    st.push(v);
    on.add(v);
    for (const e of g.edges.get(v) ?? []) {
      if (!g.ids.includes(e.to)) continue;
      if (!idx.has(e.to)) {
        visit(e.to);
        low.set(v, Math.min(low.get(v)!, low.get(e.to)!));
      } else if (on.has(e.to)) low.set(v, Math.min(low.get(v)!, idx.get(e.to)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = st.pop()!;
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      const self = (g.edges.get(v) ?? []).some((e) => e.to === v);
      if ((comp.length > 1 || self) && !comp.some((c) => loopOk.has(c))) out.push(comp.reverse());
    }
  };
  for (const v of g.ids) if (!idx.has(v)) visit(v);
  return out;
}

/**
 * 状態の連鎖: 各手順の requires が、開始からのすべての経路で先行手順の produces（と initial_state）により満たされるか。
 * 「全経路で必ず成り立つ状態」の前向きデータフロー解析（合流点は積集合）。
 */
export function unmetRequires(steps: Step[], g: Graph, initial: string[] = []): { step: string; missing: string[] }[] {
  const all = new Set(steps.flatMap((s) => [...(s.produces ?? []), ...(s.requires ?? [])]).concat(initial));
  const byId = new Map(steps.map((s) => [s.id, s]));
  const preds = new Map<string, string[]>();
  for (const [from, es] of g.edges) for (const e of es) preds.set(e.to, [...(preds.get(e.to) ?? []), from]);
  const live = reachable(g);
  const IN = new Map<string, Set<string>>();
  const OUT = new Map<string, Set<string>>();
  for (const id of g.ids) OUT.set(id, new Set(all)); // 最大元から始めて縮める
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of g.ids) {
      if (!live.has(id)) continue;
      const ps = (preds.get(id) ?? []).filter((p) => live.has(p));
      // 開始手順には「開始時点の状態（initial）」という経路も合流する
      const sources = id === g.ids[0] ? [new Set(initial), ...ps.map((p) => OUT.get(p)!)] : ps.map((p) => OUT.get(p)!);
      const inn = sources.length ? new Set([...sources[0]].filter((x) => sources.every((s) => s.has(x)))) : new Set<string>();
      const out = new Set([...inn, ...(byId.get(id)!.produces ?? [])]);
      if (out.size !== OUT.get(id)!.size || [...out].some((x) => !OUT.get(id)!.has(x))) changed = true;
      IN.set(id, inn);
      OUT.set(id, out);
    }
  }
  return steps
    .filter((s) => live.has(s.id))
    .map((s) => ({ step: s.id, missing: (s.requires ?? []).filter((r) => !IN.get(s.id)!.has(r)) }))
    .filter((x) => x.missing.length);
}

/**
 * シナリオ: choose で分岐を決めてたどり、到達した終端と、経路上で満たされなかった前提を返す。
 * choose の値が文字列なら最初の訪問だけ、配列なら訪問ごとに順に使う（null・尽きたら既定の次へ）。
 */
export function simulate(
  steps: Step[],
  g: Graph,
  choose: Record<string, string | (string | null)[]> = {},
  initial: string[] = [],
): { end?: string; error?: "bad-choice" | "loop"; at?: string; choice?: string; path: string[]; unmet: { step: string; missing: string[] }[] } {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const path: string[] = [];
  const unmet: { step: string; missing: string[] }[] = [];
  const state = new Set(initial);
  const visits = new Map<string, number>();
  const limit = g.ids.length * 4 + 4;
  let cur: string | undefined = g.ids[0];
  while (cur) {
    path.push(cur);
    if (path.length > limit) return { error: "loop", at: cur, path, unmet };
    const s: Step = byId.get(cur)!;
    const missing = (s.requires ?? []).filter((r) => !state.has(r));
    if (missing.length) unmet.push({ step: cur, missing });
    for (const p of s.produces ?? []) state.add(p);
    const n: number = visits.get(cur) ?? 0;
    visits.set(cur, n + 1);
    const c: string | (string | null)[] | undefined = choose[cur];
    const pick: string | null | undefined = Array.isArray(c) ? c[n] : n === 0 ? c : undefined;
    if (pick) {
      const b: { if: string; goto: string } | undefined = (s.branches ?? []).find((x) => x.if === pick);
      if (!b) return { error: "bad-choice", at: cur, choice: pick, path, unmet };
      cur = b.goto;
    } else if (g.terminals.has(cur)) return { end: cur, path, unmet };
    else cur = (g.edges.get(cur) ?? []).find((e) => !e.cond)?.to;
    if (cur && !byId.has(cur)) return { error: "bad-choice", at: cur, path, unmet };
  }
  return { end: path[path.length - 1], path, unmet };
}

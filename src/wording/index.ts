import { m } from "../messages";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 表記スタイル（wording）: 文書に出る固定の文言と書式を ID で引く。
 * 言語の切り替えではなく、書き方・表現の仕方（公文書調 / くだけた調子 など）を切り替えるためのもの。
 */
export type Strings = Record<string, string>;

/** キーごとに使える変数（これ以外の {x} は検査で不合格） */
export const VARS: Record<string, string[]> = {
  "number.article": ["n"],
  "number.step": ["n"],
  "number.table": ["n"],
  "number.figure": ["n"],
  "number.source": ["n"],
  "ref.section": ["num", "title"],
  "ref.section-plain": ["title"],
  "heading.article": ["label", "title"],
  "heading.step": ["label", "title"],
  "label.accessed": ["date"],
  "label.tel": ["tel"],
  "unit.yen": ["n"],
  "label.branch": ["cond", "target"],
  "label.goto": ["target"],
};
/** 必須の変数（書式が意味をなさなくなるもの） */
export const REQUIRED_VARS: Record<string, string[]> = {
  "number.article": ["n"],
  "number.step": ["n"],
  "number.table": ["n"],
  "number.figure": ["n"],
  "number.source": ["n"],
  "unit.yen": ["n"],
};

let builtin: Strings | undefined;
/** 組み込みの既定（全キーの定義元） */
export function defaultStrings(): Strings {
  return (builtin ??= JSON.parse(readFileSync(join(import.meta.dir, "default.json"), "utf8")));
}

export const wordingsDir = (root: string) => join(root, "wordings");

export function listWordings(root: string): string[] {
  const dir = wordingsDir(root);
  if (!existsSync(dir)) return [];
  return [...new Bun.Glob("*.json").scanSync({ cwd: dir })].map((f) => f.replace(/\.json$/, "")).sort();
}

/** プロジェクトの wordings/<name>.json を読む（"extends" で継承） */
export function resolveWording(root: string, name = "default"): { strings: Strings; errors: string[] } {
  const errors: string[] = [];
  const chain: Record<string, string>[] = [];
  const seen: string[] = [];
  let cur: string | undefined = name;
  while (cur && cur !== "default") {
    if (seen.includes(cur)) {
      errors.push(m("extends.cycle", { chain: [...seen, cur].join(" → ") }));
      break;
    }
    seen.push(cur);
    const p = join(wordingsDir(root), `${cur}.json`);
    if (!existsSync(p)) {
      errors.push(m("wording.not-found", { id: cur, path: p }));
      break;
    }
    let data: any;
    try {
      data = JSON.parse(readFileSync(p, "utf8"));
    } catch (e) {
      errors.push(`${cur}.json: ${(e as Error).message}`);
      break;
    }
    const { extends: ext, ...rest } = data ?? {};
    chain.unshift(rest);
    cur = ext;
  }
  return { strings: Object.assign({}, defaultStrings(), ...chain), errors };
}

export function t(s: Strings, key: string, vars: Record<string, string | number> = {}): string {
  const tpl = s[key];
  if (tpl === undefined) return `⟨${key}⟩`;
  return tpl.replace(/\{([a-z]+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** 上書き（wordings/*.json・文書の strings:）の検査: 未知のキー、使えない変数、必須変数の欠落 */
export function validateStrings(over: Record<string, unknown>): { key: string; message: string }[] {
  const known = defaultStrings();
  const out: { key: string; message: string }[] = [];
  for (const [k, v] of Object.entries(over)) {
    if (k === "extends") continue;
    if (!(k in known)) {
      out.push({ key: k, message: m("wording.unknown-key", { key: k }) });
      continue;
    }
    if (typeof v !== "string") {
      out.push({ key: k, message: m("wording.not-string", { key: k }) });
      continue;
    }
    if (k === "heading.style" && !["1.1", "none"].includes(v)) out.push({ key: k, message: m("wording.heading-style") });
    const used = [...v.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]);
    const allowed = VARS[k] ?? [];
    for (const u of used) if (!allowed.includes(u)) out.push({ key: k, message: m("wording.bad-var", { key: k, var: u, allowed: allowed.map((a) => `{${a}}`).join(" ") || m("wording.none") }) });
    for (const r of REQUIRED_VARS[k] ?? []) if (!used.includes(r)) out.push({ key: k, message: m("wording.missing-var", { key: k, var: r }) });
  }
  return out;
}

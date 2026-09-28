import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { loadYaml } from "../parse/yaml";
import { registry, type Registry } from "./components";
import { REGIONS, type ResolvedLayout } from "./types";
import { validateLayout } from "./validate";

export const layoutsDir = (root: string) => join(root, "layouts");

export function listLayouts(root: string): string[] {
  const dir = layoutsDir(root);
  if (!existsSync(dir)) return [];
  return [...new Bun.Glob("*.yaml").scanSync({ cwd: dir })].map((f) => f.replace(/\.yaml$/, "")).sort();
}

/** ファイル単体の検証（行番号つき）。layout/valid 用 */
export function checkLayoutFile(root: string, id: string, reg: Registry = registry(root)) {
  const p = join(layoutsDir(root), `${id}.yaml`);
  const l = loadYaml(readFileSync(p, "utf8"));
  if (l.error) return [{ message: `YAML 構文エラー: ${l.error.message}`, line: l.error.line }];
  return validateLayout(l.data, reg, true).map((e) => ({ message: e.message, line: l.lineOf(e.ptr) }));
}

function read(root: string, id: string): any {
  const p = join(layoutsDir(root), `${id}.yaml`);
  if (!existsSync(p)) throw new Error(`レイアウト "${id}" が見つかりません（${p}）`);
  const d = parse(readFileSync(p, "utf8"));
  if (!d || typeof d !== "object") throw new Error(`レイアウト "${id}" が空か不正です`);
  return d;
}

/** 区画単位で置き換え、page_numbers はマージ */
function merge(a: any, b: any) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k === "page_numbers" ? { ...a.page_numbers, ...(v as object) } : v;
  return out;
}

export function resolveLayout(root: string, spec: unknown, reg: Registry = registry(root)): ResolvedLayout {
  // 区画の空配列は構造上の初期値（内容の既定値ではない）
  const errors: string[] = [];
  const id = typeof spec === "string" ? spec : (spec as any)?.extends;
  if (!id) errors.push("レイアウト名がありません（文書の layout: か runner.yaml の defaultLayout）");
  const chain: any[] = [];
  const seen: string[] = [];
  let cur: string | undefined = id;
  while (cur) {
    if (seen.includes(cur)) {
      errors.push(`extends が循環しています: ${[...seen, cur].join(" → ")}`);
      break;
    }
    seen.push(cur);
    try {
      const d = read(root, cur);
      chain.unshift(d);
      cur = d.extends;
    } catch (e) {
      errors.push((e as Error).message);
      break;
    }
  }
  let merged: any = Object.fromEntries(REGIONS.map((r) => [r, []]));
  for (const d of chain) merged = merge(merged, d);
  if (spec && typeof spec === "object") {
    const { extends: _e, ...over } = spec as any;
    merged = merge(merged, over);
  }
  delete merged.extends;
  errors.push(...validateLayout(merged, reg).map((e) => `${e.ptr}: ${e.message}`));
  if (!merged.page_numbers) errors.push("page_numbers がありません");
  if (errors.length) {
    // 壊れたレイアウトでも出力できるよう、壊れた区画は空にする
    for (const r of REGIONS) if (!Array.isArray(merged[r]) || validateLayout({ [r]: merged[r] }, reg).length) merged[r] = [];
  }
  return { ...merged, id, errors };
}

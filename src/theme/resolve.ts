import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parse } from "yaml";
import { validateTheme } from "../schema/theme";
import { FALLBACK, type ResolvedTheme, type Theme } from "./types";

type Partial = Record<string, any>;

export const themesDir = (root: string) => join(root, "themes");

export function listThemes(root: string): string[] {
  const dir = themesDir(root);
  if (!existsSync(dir)) return [];
  return [...new Bun.Glob("*.yaml").scanSync({ cwd: dir })].map((f) => f.replace(/\.yaml$/, "")).sort();
}

/** logo / template を定義元ファイルからの絶対パスにする */
function absolutize(t: Partial, base: string): Partial {
  const out = structuredClone(t);
  if (typeof out.template === "string" && !isAbsolute(out.template)) out.template = resolve(base, out.template);
  if (typeof out.cover?.logo === "string" && !isAbsolute(out.cover.logo)) out.cover.logo = resolve(base, out.cover.logo);
  return out;
}

function readTheme(root: string, id: string): Partial {
  const p = join(themesDir(root), `${id}.yaml`);
  if (!existsSync(p)) throw new Error(`テーマ "${id}" が見つかりません（${p}）`);
  const data = parse(readFileSync(p, "utf8"));
  if (!data || typeof data !== "object") throw new Error(`テーマ "${id}" が空か不正です`);
  return absolutize(data, dirname(p));
}

export function deepMerge(a: Partial, b: Partial): Partial {
  const out: Partial = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k]) ? deepMerge(a[k], v) : v;
  }
  return out;
}

/**
 * 解決順（後勝ち）: FALLBACK → default → extends 連鎖 → 文書のインライン上書き。
 * CLI の --theme は spec として文書の theme を丸ごと置き換える（呼び出し側）。
 */
export function resolveTheme(root: string, spec: unknown, docDir?: string): ResolvedTheme {
  const errors: string[] = [];
  const id = typeof spec === "string" ? spec : (spec as Partial)?.extends ?? "default";
  const chain: Partial[] = [];
  const seen: string[] = [];
  let cur: string | undefined = id;
  while (cur) {
    if (seen.includes(cur)) {
      errors.push(`extends が循環しています: ${[...seen, cur].join(" → ")}`);
      break;
    }
    seen.push(cur);
    try {
      const t = readTheme(root, cur);
      chain.unshift(t);
      cur = t.extends;
    } catch (e) {
      if (cur !== "default" || id === "default") errors.push((e as Error).message);
      break;
    }
  }
  if (!seen.includes("default") && existsSync(join(themesDir(root), "default.yaml"))) {
    try {
      chain.unshift(readTheme(root, "default"));
    } catch {}
  }
  let merged: Partial = structuredClone(FALLBACK);
  for (const t of chain) merged = deepMerge(merged, t);
  if (spec && typeof spec === "object") {
    const { extends: _e, ...over } = spec as Partial;
    merged = deepMerge(merged, docDir ? absolutize(over, docDir) : over);
  }
  delete merged.extends;
  errors.push(...validateTheme(merged));
  if (errors.length) {
    // 不正なテーマでも文書チェックを続けられるよう、採番だけは FALLBACK を保証する
    const numbering = validateTheme({ ...FALLBACK, numbering: merged.numbering }).length ? FALLBACK.numbering : merged.numbering;
    return { ...(merged as Theme), numbering, id, errors };
  }
  return { ...(merged as Theme), id, errors };
}

function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

export function watermarkActive(t: Theme, meta: { version?: string }): boolean {
  if (!t.watermark || !meta.version) return false;
  const m = t.watermark.when.match(/^meta\.version\s*(<=|>=|<|>|==)\s*([\d.]+)$/);
  if (!m) return false;
  const c = cmpVersion(meta.version, m[2]);
  return { "<": c < 0, "<=": c <= 0, ">": c > 0, ">=": c >= 0, "==": c === 0 }[m[1]]!;
}

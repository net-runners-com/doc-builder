import Ajv from "ajv";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { m } from "../messages";

/** 配色のトークン。テーマ・テンプレート・部品・図はこの名前だけで色を参照する */
export const COLOR_TOKENS = ["background", "surface", "text", "muted", "primary", "accent", "border", "grid", "watermark"] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export interface Palette {
  colors: Record<ColorToken, string>;
  /** グラフの系列色 */
  series: string[];
  /** D2 の配色テーマ ID */
  diagram_theme: number;
}

const color = { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" };
const validate = new Ajv({ allErrors: true, strict: false }).compile({
  type: "object",
  required: ["colors", "series", "diagram_theme"],
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    extends: { type: "string" },
    colors: { type: "object", required: [...COLOR_TOKENS], additionalProperties: false, properties: Object.fromEntries(COLOR_TOKENS.map((k) => [k, color])) },
    series: { type: "array", minItems: 1, items: color },
    diagram_theme: { type: "integer", minimum: 0 },
  },
});

export const palettesDir = (root: string) => join(root, "palettes");
export const paletteFile = (root: string, id: string) => join(palettesDir(root), `${id}.yaml`);

export function listPalettes(root: string): string[] {
  const dir = palettesDir(root);
  if (!existsSync(dir)) return [];
  return [...new Bun.Glob("*.yaml").scanSync({ cwd: dir })].map((f) => f.replace(/\.yaml$/, "")).sort();
}

/** extends を解決したパレット。colors はトークン単位でマージ */
export function resolvePalette(root: string, id: string): { palette?: Palette; errors: string[]; files: string[] } {
  const errors: string[] = [];
  const chain: any[] = [];
  const seen: string[] = [];
  let cur: string | undefined = id;
  while (cur) {
    if (seen.includes(cur)) {
      errors.push(m("extends.cycle", { chain: [...seen, cur].join(" → ") }));
      break;
    }
    seen.push(cur);
    const p = paletteFile(root, cur);
    if (!existsSync(p)) {
      errors.push(m("palette.not-found", { id: cur, path: p }));
      break;
    }
    const d = parse(readFileSync(p, "utf8")) ?? {};
    chain.unshift(d);
    cur = d.extends;
  }
  const merged: any = {};
  for (const d of chain) {
    const { extends: _e, name: _n, ...rest } = d;
    Object.assign(merged, rest, { colors: { ...merged.colors, ...rest.colors } });
  }
  if (!errors.length && !validate(merged))
    errors.push(...(validate.errors ?? []).map((e) => `${id}${e.instancePath}: ${e.message}${(e.params as any).missingProperty ? ` (${(e.params as any).missingProperty})` : ""}`));
  const files = [...seen].reverse().map((x) => paletteFile(root, x)).filter((f) => existsSync(f));
  return { palette: errors.length ? undefined : (merged as Palette), errors, files };
}

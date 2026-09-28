import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vega from "vega";
import * as vl from "vega-lite";
import { requireTool } from "../errors";
import type { Doc } from "../types";

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

export class RenderError extends Error {}

export async function renderD2(source: string, cacheDir: string): Promise<string> {
  const d2 = requireTool("d2", "brew install d2");
  const dir = join(cacheDir, "render");
  mkdirSync(dir, { recursive: true });
  const h = hash(source);
  const out = join(dir, `${h}.svg`);
  if (existsSync(out)) return out;
  const input = join(dir, `${h}.d2`);
  writeFileSync(input, source);
  const p = Bun.spawnSync([d2, "--pad", "20", input, out], { stderr: "pipe", stdout: "pipe" });
  if (p.exitCode !== 0) throw new RenderError(`D2: ${p.stderr.toString().trim().split("\n").slice(-3).join(" ")}`);
  return out;
}

export interface ChartFigure {
  id: string;
  chart: "bar" | "line" | "pie";
  data: string;
  x: string;
  y: string[];
}
interface Table {
  id: string;
  columns: string[];
  rows: (string | number)[][];
}

/** `{{ref:ID}}` から表を引く */
export function chartTable(doc: Doc, fig: ChartFigure): Table {
  const m = fig.data.match(/^\{\{\s*ref:([^}]+?)\s*\}\}$/);
  if (!m) throw new RenderError(`data は "{{ref:表ID}}" 形式で指定してください（${fig.data}）`);
  const t = (doc.data.tables ?? []).find((x: Table) => x.id === m[1]);
  if (!t) throw new RenderError(`data が参照する表 "${m[1]}" がありません`);
  for (const c of [fig.x, ...fig.y]) if (!t.columns.includes(c)) throw new RenderError(`表 "${t.id}" に列 "${c}" がありません`);
  for (const c of fig.y) {
    const i = t.columns.indexOf(c);
    const bad = t.rows.find((r: (string | number)[]) => typeof r[i] !== "number");
    if (bad) throw new RenderError(`列 "${c}" に数値でない値があります: ${bad[i]}`);
  }
  return t;
}

export function chartSpec(fig: ChartFigure, t: Table, colors: string[]): object {
  const values = t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i]])));
  const base = { $schema: "https://vega.github.io/schema/vega-lite/v6.json", data: { values }, width: 420, height: 240, config: { font: "sans-serif", range: { category: colors } } };
  if (fig.chart === "pie")
    return { ...base, mark: "arc", encoding: { theta: { field: fig.y[0], type: "quantitative" }, color: { field: fig.x, type: "nominal" } } };
  const enc = {
    x: { field: fig.x, type: fig.chart === "bar" ? "nominal" : "ordinal", sort: null, axis: { labelAngle: 0 } },
    y: { field: "値", type: "quantitative" },
    color: { field: "系列", type: "nominal", sort: fig.y },
  };
  return {
    ...base,
    transform: [{ fold: fig.y, as: ["系列", "値"] }],
    mark: fig.chart === "bar" ? "bar" : { type: "line", point: true },
    encoding: fig.chart === "bar" ? { ...enc, xOffset: { field: "系列", sort: fig.y } } : enc,
  };
}

export async function renderChart(doc: Doc, fig: ChartFigure, cacheDir: string, colors: string[]): Promise<string> {
  const t = chartTable(doc, fig);
  const spec = chartSpec(fig, t, colors);
  const dir = join(cacheDir, "render");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${hash(JSON.stringify(spec))}.svg`);
  if (existsSync(out)) return out;
  const view = new vega.View(vega.parse(vl.compile(spec as any).spec), { renderer: "none" });
  writeFileSync(out, await view.toSVG());
  view.finalize();
  return out;
}

/** 文書の全図を描画して id → svg パスを返す。失敗は errors に積む */
export async function renderFigures(doc: Doc, cacheDir: string, colors: string[]) {
  const svgs: Record<string, string> = {};
  const errors: { id: string; error: Error }[] = [];
  for (const f of doc.data.figures ?? []) {
    try {
      svgs[f.id] = f.type === "diagram" ? await renderD2(f.source, cacheDir) : await renderChart(doc, f, cacheDir, colors);
    } catch (e) {
      errors.push({ id: f.id, error: e as Error });
    }
  }
  return { svgs, errors };
}

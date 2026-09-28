import { m } from "../messages";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vega from "vega";
import * as vl from "vega-lite";
import { requireTool } from "../errors";
import { buildGraph } from "../flow";
import type { Doc } from "../types";

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

export class RenderError extends Error {}

export async function renderD2(source: string, workDir: string, pad: number, theme = 0): Promise<string> {
  const d2 = requireTool("d2", "brew install d2");
  const dir = join(workDir, "render");
  mkdirSync(dir, { recursive: true });
  const h = hash(`${pad}:${theme}:${source}`);
  const out = join(dir, `${h}.svg`);
  const input = join(dir, `${h}.d2`);
  writeFileSync(input, source);
  const p = Bun.spawnSync([d2, "--pad", String(pad), "--theme", String(theme), input, out], { stderr: "pipe", stdout: "pipe" });
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
  const ref = fig.data.match(/^\{\{\s*ref:([^}]+?)\s*\}\}$/);
  if (!ref) throw new RenderError(m("render.data-form", { data: fig.data }));
  const t = (doc.data.tables ?? []).find((x: Table) => x.id === ref[1]);
  if (!t) throw new RenderError(m("render.no-table", { id: ref[1] }));
  for (const c of [fig.x, ...fig.y]) if (!t.columns.includes(c)) throw new RenderError(m("render.no-column", { table: t.id, column: c }));
  for (const c of fig.y) {
    const i = t.columns.indexOf(c);
    const bad = t.rows.find((r: (string | number)[]) => typeof r[i] !== "number");
    if (bad) throw new RenderError(m("render.not-number", { column: c, value: bad[i] }));
  }
  return t;
}

export interface ChartStyle {
  colors: string[];
  width: number;
  height: number;
  font: string;
  /** パレットのトークン */
  text: string;
  background: string;
  border: string;
  grid: string;
  /** 凡例と値軸の見出し（表記スタイル chart.series / chart.value） */
  series: string;
  value: string;
}

export function chartSpec(fig: ChartFigure, t: Table, style: ChartStyle): object {
  const values = t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i]])));
  const base = { $schema: "https://vega.github.io/schema/vega-lite/v6.json", data: { values }, width: style.width, height: style.height, config: {
      font: style.font,
      background: style.background,
      axis: { labelColor: style.text, titleColor: style.text, domainColor: style.border, tickColor: style.border, gridColor: style.grid },
      legend: { labelColor: style.text, titleColor: style.text },
      range: { category: style.colors },
    },
  };
  if (fig.chart === "pie")
    return { ...base, mark: "arc", encoding: { theta: { field: fig.y[0], type: "quantitative" }, color: { field: fig.x, type: "nominal" } } };
  const enc = {
    x: { field: fig.x, type: fig.chart === "bar" ? "nominal" : "ordinal", sort: null, axis: { labelAngle: 0 } },
    y: { field: style.value, type: "quantitative" },
    color: { field: style.series, type: "nominal", sort: fig.y },
  };
  return {
    ...base,
    transform: [{ fold: fig.y, as: [style.series, style.value] }],
    mark: fig.chart === "bar" ? "bar" : { type: "line", point: true },
    encoding: fig.chart === "bar" ? { ...enc, xOffset: { field: style.series, sort: fig.y } } : enc,
  };
}

export async function renderChart(doc: Doc, fig: ChartFigure, workDir: string, style: ChartStyle): Promise<string> {
  const t = chartTable(doc, fig);
  const spec = chartSpec(fig, t, style);
  const dir = join(workDir, "render");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${hash(JSON.stringify(spec))}.svg`);
  const view = new vega.View(vega.parse(vl.compile(spec as any).spec), { renderer: "none" });
  writeFileSync(out, await view.toSVG());
  view.finalize();
  return out;
}

/** 文書の全図を描画して id → svg パスを返す。失敗は errors に積む */
export interface RenderOptions {
  chart: ChartStyle;
  d2Pad: number;
  d2Theme: number;
}

/** テーマと設定から描画オプションを作る */
export const renderOptions = (
  theme: { colors: { text: string; background: string; border: string; grid: string }; series: string[]; charts: { width: number; height: number; font: string }; diagram_theme: number },
  cfg: { render: { d2Pad: number } },
  strings: Record<string, string>,
): RenderOptions => ({
  chart: {
    colors: theme.series,
    ...theme.charts,
    series: strings["chart.series"],
    value: strings["chart.value"],
    text: theme.colors.text,
    background: theme.colors.background,
    border: theme.colors.border,
    grid: theme.colors.grid,
  },
  d2Pad: cfg.render.d2Pad,
  d2Theme: theme.diagram_theme,
});

/** 手順の定義から D2 のフロー図を作る（type: flow） */
export function flowD2(doc: Doc): string {
  const q = (s: string) => JSON.stringify(s);
  const g = buildGraph(doc.data.steps ?? []);
  const lines = ["direction: down"];
  for (const s of doc.data.steps ?? []) lines.push(`${q(s.id)}: ${q(`${doc.defs[s.id]?.label ?? s.id} ${doc.expand(s.title, s)}`)}`);
  for (const [from, es] of g.edges) for (const e of es) lines.push(`${q(from)} -> ${q(e.to)}${e.cond ? `: ${q(doc.expand(e.cond))}` : ""}`);
  return lines.join("\n") + "\n";
}

/** 図を毎回描画する（再利用しない）。出力先は呼び出し側の作業ディレクトリ */
export async function renderFigures(doc: Doc, workDir: string, o: RenderOptions) {
  const svgs: Record<string, string> = {};
  const errors: { id: string; error: Error }[] = [];
  for (const f of doc.data.figures ?? []) {
    try {
      svgs[f.id] =
        f.type === "diagram" ? await renderD2(f.source, workDir, o.d2Pad, o.d2Theme)
        : f.type === "flow" ? await renderD2(flowD2(doc), workDir, o.d2Pad, o.d2Theme)
        : await renderChart(doc, f, workDir, o.chart);
    } catch (e) {
      errors.push({ id: f.id, error: e as Error });
    }
  }
  return { svgs, errors };
}

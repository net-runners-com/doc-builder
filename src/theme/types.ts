import type { ColorToken } from "./palette";

export interface Theme {
  name?: string;
  extends?: string;
  page: { size: "A4" | "A5" | "B5" | "Letter"; margin: { top: string; bottom: string; x: string } };
  /** 配色ファイル（palettes/<name>.yaml）の名前 */
  palette: string;
  fonts: { body: string[]; heading: string[]; mono: string[] };
  typography: {
    base_size: string;
    leading: string;
    heading_rule: string;
    heading_rule_gap: string;
    heading_above: string;
    heading_below: string;
    header_size: string;
    table_stroke: string;
    table_inset: string;
    quote_rule: string;
    quote_inset: string;
    quote_inset_y: string;
    attribution_size: string;
    watermark_size: string;
    watermark_angle: string;
    figure_width: string;
  };
  charts: { width: number; height: number; font: string };
  /** keep_max: 本文領域に対する高さの割合がこれ以下の塊は分割しない / max_gap: ページ下部の余白の許容割合 */
  pagination: { keep_max: string; max_gap: string };
  watermark?: { when: string; text: string };
  template?: string;
}
export interface ResolvedTheme extends Theme {
  id: string;
  errors: string[];
  /** 解決したパレット（palette の中身）。色はここのトークンだけから参照する */
  colors: Record<ColorToken, string>;
  series: string[];
  diagram_theme: number;
  /** パレットの解決に使ったファイル */
  paletteFiles: string[];
  /** 解決に使ったファイル（継承の親から順） */
  files: string[];
}

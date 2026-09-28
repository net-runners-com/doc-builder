import type { Numbering } from "../types";

export interface HF {
  left?: string;
  center?: string;
  right?: string;
}
export interface Theme {
  name?: string;
  extends?: string;
  page: { size: "A4" | "A5" | "B5" | "Letter"; margin: { top: string; bottom: string; x: string } };
  colors: { primary: string; accent: string; text: string; background: string };
  fonts: { body: string[]; heading: string[]; mono: string[] };
  cover: { enabled: boolean; logo?: string; fields: string[] };
  toc: { enabled: boolean; depth: number };
  header: HF;
  footer: HF & { start_at: "cover" | "toc" | "body" };
  numbering: Numbering;
  watermark?: { when: string; text: string };
  template?: string;
}
export interface ResolvedTheme extends Theme {
  id: string;
  errors: string[];
}

/** themes/ が無くても動くための最下層 */
export const FALLBACK: Theme = {
  page: { size: "A4", margin: { top: "25mm", bottom: "20mm", x: "20mm" } },
  colors: { primary: "#1F4E79", accent: "#E07B00", text: "#222222", background: "#FFFFFF" },
  fonts: {
    body: ["Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN"],
    heading: ["Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN"],
    mono: ["JetBrains Mono", "Menlo"],
  },
  cover: { enabled: false, fields: ["title", "updated", "owner"] },
  toc: { enabled: false, depth: 2 },
  header: {},
  footer: { center: "{{page}} / {{pages}}", start_at: "body" },
  numbering: { terms: "第{n}条", procedure: "手順{n}", heading: "1.1" },
};

export const fallbackTheme = (): ResolvedTheme => ({ ...structuredClone(FALLBACK), id: "fallback", errors: [] });

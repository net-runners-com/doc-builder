import type { ResolvedTheme } from "../theme/types";
import type { Doc } from "../types";
import type { Layout } from "./layout";

export async function emitPdf(_l: Layout, _t: ResolvedTheme, _d: Doc, _work: string, _out: string): Promise<string> {
  throw new Error("未実装");
}

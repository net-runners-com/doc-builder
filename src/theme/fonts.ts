import { requireTool } from "../errors";

let cache: Set<string> | undefined;

/** typst が認識しているフォントファミリ名（typst 未インストールなら ToolMissing） */
export function installedFonts(): Set<string> {
  if (cache) return cache;
  const typst = requireTool("typst", "brew install typst");
  const out = Bun.spawnSync([typst, "fonts"]).stdout.toString();
  cache = new Set(out.split("\n").map((s) => s.trim()).filter(Boolean));
  return cache;
}

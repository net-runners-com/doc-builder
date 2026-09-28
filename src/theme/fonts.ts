import { requireTool } from "../errors";

/** typst が認識しているフォントファミリ名（typst 未インストールなら ToolMissing） */
export function installedFonts(): Set<string> {
  const typst = requireTool("typst", "brew install typst");
  const out = Bun.spawnSync([typst, "fonts"]).stdout.toString();
  return new Set(out.split("\n").map((s) => s.trim()).filter(Boolean));
}

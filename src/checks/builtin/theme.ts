import { m } from "../../messages";
import { existsSync } from "node:fs";
import { ToolMissing, Unknown } from "../../errors";
import { installedFonts } from "../../theme/fonts";
import { listPalettes, resolvePalette } from "../../theme/palette";
import { listThemes, resolveTheme } from "../../theme/resolve";
import { defineProjectCheck } from "../define";

export const themeValid = defineProjectCheck({
  id: "theme/valid",
  axis: "structure",
  scope: "corpus",
  severity: "error",
  run(ctx) {
    const out = [];
    let fontsNote: string | undefined;
    for (const id of listPalettes(ctx.root))
      for (const e of resolvePalette(ctx.root, id).errors) out.push(ctx.fail(m("check.theme.error", { id: `palettes/${id}`, error: e }), { blockId: id }));
    for (const id of listThemes(ctx.root)) {
      const t = resolveTheme(ctx.root, id);
      for (const e of t.errors) out.push(ctx.fail(m("check.theme.error", { id, error: e }), { blockId: id }));
      if (t.template && !existsSync(t.template)) out.push(ctx.fail(m("check.theme.template-missing", { id, path: t.template }), { blockId: id }));
      try {
        const fonts = installedFonts();
        for (const [role, list] of Object.entries(t.fonts ?? {}))
          if (!list.some((f: string) => fonts.has(f))) out.push(ctx.fail(m("check.theme.font-missing", { id, role, fonts: list.join(", ") }), { blockId: id }));
      } catch (e) {
        if (!(e instanceof ToolMissing)) throw e;
        fontsNote = e.message;
      }
    }
    if (!out.length && fontsNote) throw new Unknown(m("check.theme.font-unknown", { note: fontsNote }));
    return out;
  },
});

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

export const themeContrast = defineProjectCheck({
  id: "theme/contrast",
  axis: "expression",
  scope: "corpus",
  severity: "warn",
  run(ctx) {
    const out = [];
    for (const id of listPalettes(ctx.root)) {
      const p = resolvePalette(ctx.root, id).palette;
      if (!p) continue;
      for (const key of ["text", "primary", "muted"] as const) {
        const r = contrast(p.colors[key], p.colors.background);
        if (r < ctx.config.contrastMin) out.push(ctx.fail(m("check.theme.contrast", { id, key, ratio: r.toFixed(2), min: ctx.config.contrastMin }), { blockId: id }));
      }
    }
    return out;
  },
});

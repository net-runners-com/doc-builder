import { m } from "../../messages";
import { ToolMissing, Unknown } from "../../errors";
import { renderFigures, renderOptions } from "../../render";
import { defineCheck } from "../define";

export const figureRender = defineCheck({
  id: "figure/render",
  axis: "structure",
  scope: "item",
  kinds: ["*"],
  severity: "error",
  async run(doc, ctx) {
    const { errors } = await renderFigures(doc, ctx.workDir, renderOptions(ctx.theme, ctx.config, doc.strings));
    const missing = errors.filter((e) => e.error instanceof ToolMissing);
    const out = errors
      .filter((e) => !(e.error instanceof ToolMissing))
      .map((e) => {
        const i = doc.data.figures.findIndex((f: any) => f.id === e.id);
        return ctx.fail(m("check.figure.render", { id: e.id, error: e.error.message }), { blockId: e.id, line: doc.lineOf(`/figures/${i}`) });
      });
    if (!out.length && missing.length) throw new Unknown(missing[0].error.message);
    return out;
  },
});

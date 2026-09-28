import type { MdCtx } from "../../src/page/components";

export default (p: { text?: string } | undefined, c: MdCtx) => [`**${p?.text ?? c.t("label.confidential")}**`, ""];

import type { BuildErrorId } from "../../types";
import { defineCheck } from "../define";

const fromBuild = (id: BuildErrorId) =>
  defineCheck({
    id,
    group: "schema",
    kinds: ["*"],
    severity: "error",
    run: (doc) => doc.buildErrors.filter((e) => e.checkId === id).map((e) => e.finding),
  });

export const schemaChecks = [fromBuild("schema/valid"), fromBuild("ref/resolve"), fromBuild("calc/eval")];

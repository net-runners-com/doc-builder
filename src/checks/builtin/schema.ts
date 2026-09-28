import type { Axis, BuildErrorId, Scope } from "../../types";
import { defineCheck } from "../define";

const fromBuild = (id: BuildErrorId, axis: Axis, scope: Scope) =>
  defineCheck({ id, axis, scope, kinds: ["*"], severity: "error", run: (doc) => doc.buildErrors.filter((e) => e.checkId === id).map((e) => e.finding) });

export const schemaChecks = [fromBuild("schema/valid", "structure", "document"), fromBuild("ref/resolve", "structure", "item"), fromBuild("calc/eval", "structure", "item")];

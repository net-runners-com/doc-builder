import type { Check, ProjectCheck } from "../define";
import { schemaChecks } from "./schema";
import { textChecks } from "./text";
import { defChecks } from "./defs";
import { kindChecks } from "./kinds";
import { figureRender } from "./figure";
import { onlineChecks } from "./online";
import { factRefs } from "./facts";
import { flowChecks } from "./flow";
import { expressionChecks } from "./expression";
import { approvalComplete, layoutData, layoutValid, wordingValid } from "./layout";
import { themeContrast, themeValid } from "./theme";

export const builtinChecks: Check[] = [...schemaChecks, ...textChecks, ...defChecks, ...kindChecks, figureRender, factRefs, layoutData, approvalComplete, ...flowChecks, ...expressionChecks, ...onlineChecks];
export const projectChecks: ProjectCheck[] = [themeValid, themeContrast, layoutValid, wordingValid];

import type { Check, ProjectCheck } from "../define";
import { schemaChecks } from "./schema";
import { textChecks } from "./text";
import { defChecks } from "./defs";
import { kindChecks } from "./kinds";
import { figureRender } from "./figure";
import { onlineChecks } from "./online";
import { factRefs } from "./facts";
import { themeContrast, themeValid } from "./theme";

export const builtinChecks: Check[] = [...schemaChecks, ...textChecks, ...defChecks, ...kindChecks, figureRender, factRefs, ...onlineChecks];
export const projectChecks: ProjectCheck[] = [themeValid, themeContrast];

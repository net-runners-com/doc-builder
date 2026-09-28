import type { Check, ProjectCheck } from "../define";
import { schemaChecks } from "./schema";
import { textChecks } from "./text";
import { defChecks } from "./defs";
import { kindChecks } from "./kinds";
import { themeContrast, themeValid } from "./theme";

export const builtinChecks: Check[] = [...schemaChecks, ...textChecks, ...defChecks, ...kindChecks];
export const projectChecks: ProjectCheck[] = [themeValid, themeContrast];

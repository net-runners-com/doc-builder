import type { Check, ProjectCheck } from "../define";
import { schemaChecks } from "./schema";
import { textChecks } from "./text";
import { defChecks } from "./defs";

export const builtinChecks: Check[] = [...schemaChecks, ...textChecks, ...defChecks];
export const projectChecks: ProjectCheck[] = [];

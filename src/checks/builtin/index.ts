import type { Check, ProjectCheck } from "../define";
import { schemaChecks } from "./schema";
import { textChecks } from "./text";

export const builtinChecks: Check[] = [...schemaChecks, ...textChecks];
export const projectChecks: ProjectCheck[] = [];

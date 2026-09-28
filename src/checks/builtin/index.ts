import type { Check, ProjectCheck } from "../define";
import { schemaChecks } from "./schema";

export const builtinChecks: Check[] = [...schemaChecks];
export const projectChecks: ProjectCheck[] = [];

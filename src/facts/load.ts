import Ajv from "ajv";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadYaml } from "../parse/yaml";
import { factSchema } from "../schema/fact";
import type { Fact } from "./types";

const validate = new Ajv({ allErrors: true, strict: false }).compile({ type: "array", items: factSchema });

export interface LoadedFacts {
  facts: Record<string, Fact>;
  errors: { message: string; line?: number }[];
}

export const factsFile = (root: string) => join(root, "facts.yaml");
export const snapshotFile = (root: string, id: string) => join(root, "facts", "snapshots", `${id}.txt`);

export function loadFacts(root: string): LoadedFacts {
  const p = factsFile(root);
  if (!existsSync(p)) return { facts: {}, errors: [] };
  const l = loadYaml(readFileSync(p, "utf8"));
  if (l.error) return { facts: {}, errors: [{ message: `YAML 構文エラー: ${l.error.message}`, line: l.error.line }] };
  const list = l.data?.facts;
  if (!validate(list ?? null))
    return {
      facts: {},
      errors: (validate.errors ?? [])
        .filter((e) => e.keyword !== "anyOf" || e.instancePath.split("/").length === 2)
        .map((e) => ({ message: `facts${e.instancePath}: ${e.message}`, line: l.lineOf(`/facts${e.instancePath}`) })),
    };
  const facts: Record<string, Fact> = {};
  const errors: LoadedFacts["errors"] = [];
  (list as Fact[]).forEach((f, i) => {
    const line = l.lineOf(`/facts/${i}`);
    if (facts[f.id]) errors.push({ message: `fact ID "${f.id}" が重複しています`, line });
    else facts[f.id] = { ...f, origin: "facts.yaml", line };
  });
  return { facts, errors };
}

export function readSnapshot(root: string, id: string): string | undefined {
  const p = snapshotFile(root, id);
  return existsSync(p) ? readFileSync(p, "utf8") : undefined;
}

import Ajv from "ajv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parse } from "yaml";

export interface Company {
  name: string;
  logo?: string;
  address?: string;
  tel?: string;
  email?: string;
  url?: string;
}

const str = { type: "string" };
const validate = new Ajv({ allErrors: true, strict: false }).compile({
  type: "object",
  required: ["name"],
  additionalProperties: false,
  properties: { name: str, logo: str, address: str, tel: str, email: str, url: str },
});

export const companyFile = (root: string) => join(root, "company.yaml");

export function loadCompany(root: string): { company?: Company; error?: string } {
  const p = companyFile(root);
  if (!existsSync(p)) return { error: "company.yaml がありません" };
  let data: any;
  try {
    data = parse(readFileSync(p, "utf8"));
  } catch (e) {
    return { error: `company.yaml: ${(e as Error).message.split("\n")[0]}` };
  }
  if (!validate(data)) return { error: `company.yaml: ${(validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`).join(", ")}` };
  const c = data as Company;
  if (c.logo && !isAbsolute(c.logo)) c.logo = resolve(dirname(p), c.logo);
  return { company: c };
}

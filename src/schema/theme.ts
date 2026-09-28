import Ajv from "ajv";

const str = { type: "string" };
const strs = { type: "array", items: str, minItems: 1 };
const color = { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" };
const length = { type: "string", pattern: "^\\d+(\\.\\d+)?(mm|cm|pt|in)$" };
const hf = { type: "object", additionalProperties: false, properties: { left: str, center: str, right: str } };
const obj = (required: string[], properties: Record<string, unknown>) => ({ type: "object", required, additionalProperties: false, properties });

const schema = obj(["page", "colors", "fonts", "cover", "toc", "header", "footer", "numbering"], {
  name: str,
  extends: str,
  id: str,
  errors: {},
  page: obj(["size", "margin"], {
    size: { enum: ["A4", "A5", "B5", "Letter"] },
    margin: obj(["top", "bottom", "x"], { top: length, bottom: length, x: length }),
  }),
  colors: obj(["primary", "accent", "text", "background"], { primary: color, accent: color, text: color, background: color }),
  fonts: obj(["body", "heading", "mono"], { body: strs, heading: strs, mono: strs }),
  cover: obj(["enabled", "fields"], {
    enabled: { type: "boolean" },
    logo: str,
    fields: { type: "array", items: { enum: ["title", "version", "updated", "effective", "owner", "client", "audience"] } },
  }),
  toc: obj(["enabled", "depth"], { enabled: { type: "boolean" }, depth: { type: "integer", minimum: 1, maximum: 3 } }),
  header: hf,
  footer: { ...hf, required: ["start_at"], properties: { ...hf.properties, start_at: { enum: ["cover", "toc", "body"] } } },
  numbering: obj(["terms", "procedure", "heading"], {
    terms: { type: "string", pattern: "\\{n\\}" },
    procedure: { type: "string", pattern: "\\{n\\}" },
    heading: { enum: ["1.1", "none"] },
  }),
  watermark: obj(["when", "text"], { when: { type: "string", pattern: "^meta\\.version\\s*(<=|>=|<|>|==)\\s*\\d+(\\.\\d+){0,2}$" }, text: str }),
  template: str,
});

const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

export function validateTheme(t: unknown): string[] {
  if (validate(t)) return [];
  return (validate.errors ?? []).map((e) => {
    const p = (e.params as any).additionalProperty ?? (e.params as any).missingProperty;
    return `${e.instancePath || "/"}: ${e.message}${p ? ` (${p})` : ""}`;
  });
}

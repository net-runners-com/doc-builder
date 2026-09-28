import Ajv from "ajv";

const str = { type: "string" };
const strs = { type: "array", items: str, minItems: 1 };
const color = { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" };
const length = { type: "string", pattern: "^\\d+(\\.\\d+)?(mm|cm|pt|in)$" };
const obj = (required: string[], properties: Record<string, unknown>) => ({ type: "object", required, additionalProperties: false, properties });

const len = { type: "string", pattern: "^-?\\d+(\\.\\d+)?(mm|cm|pt|em|%|deg)$" };
const typographyKeys = ["base_size", "leading", "heading_rule", "heading_rule_gap", "heading_above", "heading_below", "header_size", "table_stroke", "table_inset", "quote_rule", "quote_inset", "quote_inset_y", "attribution_size", "watermark_size", "watermark_angle", "figure_width"];

const ratio = { type: "string", pattern: "^\\d+(\\.\\d+)?%$" };
const schema = obj(["page", "palette", "fonts", "typography", "charts", "pagination"], {
  name: str,
  extends: str,
  id: str,
  errors: {},
  colors: {},
  series: {},
  diagram_theme: {},
  paletteFiles: {},
  files: {},
  page: obj(["size", "margin"], {
    size: { enum: ["A4", "A5", "B5", "Letter"] },
    margin: obj(["top", "bottom", "x"], { top: length, bottom: length, x: length }),
  }),
  palette: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" },
  fonts: obj(["body", "heading", "mono"], { body: strs, heading: strs, mono: strs }),
  typography: obj(typographyKeys, Object.fromEntries(typographyKeys.map((k) => [k, len]))),
  charts: obj(["width", "height", "font"], { width: { type: "number" }, height: { type: "number" }, font: str }),
  pagination: obj(["keep_max", "max_gap"], { keep_max: ratio, max_gap: ratio }),
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

import { m } from "../messages";
import Ajv from "ajv";
import { factSchema } from "./fact";
import { KINDS, type Kind } from "../types";

const str = { type: "string" };
const strs = { type: "array", items: str };
const date = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const id = { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" };

const quote = {
  type: "object",
  required: ["quote"],
  additionalProperties: false,
  properties: {
    quote: { type: "object", required: ["source", "text"], additionalProperties: false, properties: { source: id, text: str } },
  },
};
const tableBlock = { type: "object", required: ["table"], additionalProperties: false, properties: { table: id } };
const body = { anyOf: [str, { type: "array", items: { anyOf: [str, quote, tableBlock] } }] };

const meta = (extra: string[]) => ({
  type: "object",
  required: ["title", "version", "updated", "owner", ...extra],
  properties: {
    title: str,
    version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    updated: date,
    effective: date,
    owner: str,
    client: str,
    audience: str,
    estimated_time: str,
    number: str,
    approvals: {
      type: "array",
      items: {
        type: "object",
        required: ["role"],
        additionalProperties: false,
        properties: { role: str, name: str, date, stamp: str },
      },
    },
    history: {
      type: "array",
      items: { type: "object", required: ["version", "date", "note"], additionalProperties: false, properties: { version: str, date, note: str } },
    },
  },
});

const common = {
  kind: { enum: KINDS },
  facts: { type: "array", items: factSchema },
  theme: { anyOf: [str, { type: "object" }] },
  layout: { anyOf: [str, { type: "object" }] },
  wording: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" },
  strings: { type: "object", additionalProperties: { type: "string" } },
  glossary: {
    type: "array",
    items: { type: "object", required: ["term", "avoid"], additionalProperties: false, properties: { term: str, avoid: strs } },
  },
  sources: {
    type: "array",
    items: {
      type: "object",
      required: ["id", "url", "title", "accessed"],
      additionalProperties: false,
      properties: { id, url: { type: "string", pattern: "^https?://" }, title: str, accessed: date },
    },
  },
  images: {
    type: "array",
    items: {
      type: "object",
      required: ["id", "path", "alt"],
      additionalProperties: false,
      properties: { id, path: str, alt: str, caption: str },
    },
  },
  figures: {
    type: "array",
    items: {
      type: "object",
      required: ["id", "type"],
      additionalProperties: false,
      properties: {
        id,
        type: { enum: ["diagram", "chart"] },
        caption: str,
        source: str,
        chart: { enum: ["bar", "line", "pie"] },
        data: str,
        x: str,
        y: strs,
      },
      allOf: [
        { if: { properties: { type: { const: "diagram" } } }, then: { required: ["source"] } },
        { if: { properties: { type: { const: "chart" } } }, then: { required: ["chart", "data", "x", "y"] } },
      ],
    },
  },
  tables: {
    type: "array",
    items: {
      type: "object",
      required: ["id", "columns", "rows"],
      additionalProperties: false,
      properties: {
        id,
        title: str,
        columns: strs,
        rows: { type: "array", items: { type: "array", items: { type: ["string", "number"] } } },
      },
    },
  },
};

const section: any = {
  type: "object",
  required: ["id", "title", "body"],
  properties: { id, title: str, body, children: { type: "array", items: { $ref: "#/$defs/section" } } },
};

const kinds: Record<Kind, { required: string[]; metaExtra: string[]; props: Record<string, unknown> }> = {
  terms: {
    required: ["articles"],
    metaExtra: ["effective"],
    props: {
      preamble: str,
      articles: {
        type: "array",
        minItems: 1,
        items: { type: "object", required: ["id", "title", "clauses"], properties: { id, title: str, clauses: { ...strs, minItems: 1 } } },
      },
      supplement: str,
    },
  },
  procedure: {
    required: ["purpose", "steps"],
    metaExtra: ["audience", "estimated_time"],
    props: {
      purpose: str,
      prerequisites: strs,
      steps: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["id", "title", "actions", "expected"],
          properties: { id, title: str, actions: { ...strs, minItems: 1 }, expected: str },
        },
      },
      troubleshooting: {
        type: "array",
        items: { type: "object", required: ["symptom", "action"], additionalProperties: false, properties: { symptom: str, action: str } },
      },
    },
  },
  proposal: {
    required: ["sections"],
    metaExtra: ["client"],
    props: {
      sections: { type: "array", minItems: 1, items: { $ref: "#/$defs/section" } },
      costs: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "item", "unit_price", "qty"],
          additionalProperties: false,
          properties: { id, item: str, unit_price: { type: "number" }, qty: { type: "number" } },
        },
      },
      total: str,
      schedule: {
        type: "array",
        items: { type: "object", required: ["date", "task"], additionalProperties: false, properties: { date, task: str } },
      },
    },
  },
  guide: {
    required: ["sections"],
    metaExtra: [],
    props: { sections: { type: "array", minItems: 1, items: { $ref: "#/$defs/section" } } },
  },
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = Object.fromEntries(
  KINDS.map((k) => [
    k,
    ajv.compile({
      $defs: { section },
      type: "object",
      required: ["kind", "meta", ...kinds[k].required],
      additionalProperties: false,
      properties: { ...common, meta: meta(kinds[k].metaExtra), ...kinds[k].props },
    }),
  ]),
) as Record<Kind, ReturnType<typeof ajv.compile>>;

export interface SchemaError {
  ptr: string;
  message: string;
}

export function validateDoc(data: unknown): SchemaError[] {
  if (!data || typeof data !== "object" || Array.isArray(data))
    return [{ ptr: "", message: m("schema.root") }];
  const kind = (data as any).kind;
  if (!KINDS.includes(kind)) return [{ ptr: "/kind", message: m("schema.kind", { kinds: KINDS.join(" | "), kind }) }];
  const v = validators[kind as Kind];
  if (v(data)) return [];
  return (v.errors ?? [])
    .filter((e) => e.keyword !== "if")
    .map((e) => {
      const extra =
        e.keyword === "required"
          ? m("schema.required", { name: (e.params as any).missingProperty })
          : e.keyword === "additionalProperties"
            ? m("schema.unknown", { name: (e.params as any).additionalProperty })
            : e.message ?? m("schema.invalid");
      return { ptr: e.instancePath, message: `${e.instancePath || "/"}: ${extra}` };
    });
}

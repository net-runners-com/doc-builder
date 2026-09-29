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
const posInt = { type: "integer", minimum: 1 };
export const flowsSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["name", "expect_end"],
    additionalProperties: false,
    properties: {
      name: str,
      choose: { type: "object", additionalProperties: { anyOf: [str, { type: "array", items: { type: ["string", "null"] } }] } },
      expect_end: id,
    },
  },
};
export const expectSchema = {
  type: "array",
  items: {
    type: "object",
    minProperties: 1,
    maxProperties: 1,
    additionalProperties: false,
    properties: {
      contains_fact: id,
      contains_ref: id,
      contains: strs,
      not_contains: strs,
      max_sentence_length: posInt,
      max_sentences: posInt,
      max_actions_per_sentence: posInt,
    },
  },
};

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
  expect: expectSchema,
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
        type: { enum: ["diagram", "chart", "flow"] },
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
        breakable: { type: "boolean" },
        columns: strs,
        rows: { type: "array", items: { type: "array", items: { type: ["string", "number"] } } },
      },
    },
  },
};

const section: any = {
  type: "object",
  required: ["id", "title", "body"],
  properties: { id, title: str, body, expect: expectSchema, children: { type: "array", items: { $ref: "#/$defs/section" } } },
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
        items: { type: "object", required: ["id", "title", "clauses"], properties: { id, title: str, clauses: { ...strs, minItems: 1 }, expect: expectSchema } },
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
          properties: {
            id,
            title: str,
            actions: { ...strs, minItems: 1 },
            expected: str,
            expect: expectSchema,
            requires: { type: "array", items: id },
            produces: { type: "array", items: id },
            next: id,
            end: { type: "boolean" },
            loop: { type: "boolean" },
            branches: {
              type: "array",
              items: { type: "object", required: ["if", "goto"], additionalProperties: false, properties: { if: str, goto: id } },
            },
          },
        },
      },
      initial_state: { type: "array", items: id },
      flows: flowsSchema,
      troubleshooting: {
        type: "array",
        items: {
          type: "object",
          required: ["symptom", "action"],
          additionalProperties: false,
          properties: { symptom: str, action: str, step: id, branch: str, goto: id },
        },
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

/** doctests/<文書名>.yaml（文書のテスト） */
const validateTests = ajv.compile({
  type: "object",
  additionalProperties: false,
  properties: {
    doc: { type: "string" },
    expect: expectSchema,
    blocks: { type: "object", additionalProperties: expectSchema },
    flows: flowsSchema,
  },
});

export function validateTestFile(data: unknown): SchemaError[] {
  if (data === null || data === undefined) return [];
  if (validateTests(data)) return [];
  return (validateTests.errors ?? []).map((e) => {
    const extra = e.keyword === "additionalProperties" ? m("schema.unknown", { name: (e.params as any).additionalProperty }) : e.message ?? m("schema.invalid");
    return { ptr: e.instancePath, message: `${e.instancePath || "/"}: ${extra}` };
  });
}

const str = { type: "string" };
const cmd = (required: string[], extra: Record<string, unknown>) => ({
  type: "object",
  required,
  additionalProperties: false,
  properties: { shell: { enum: ["powershell", "pwsh", "sh", "bash"] }, run: str, ...extra },
});

export const factSchema = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  anyOf: [{ required: ["value"] }, { required: ["claim"] }, { required: ["capture"] }],
  properties: {
    id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" },
    value: { anyOf: [str, { type: "number" }, { type: "array", items: str }] },
    claim: str,
    verify: cmd(["run", "expect"], {
      timeout: { anyOf: [{ type: "number" }, { type: "string", pattern: "^\\d+(ms|s)$" }] },
      expect: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          exit: { type: "integer" },
          equals: str,
          stdout_contains: str,
          stdout_match: str,
          lines_equal_value: { const: true },
          max_ms: { type: "number" },
        },
      },
    }),
    capture: cmd(["run"], { normalize: { type: "array", items: str } }),
  },
};

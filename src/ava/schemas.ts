type JsonSchema = Record<string, unknown>

export const pageContextSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    route: {
      type: "string",
      description: "Current route or page identifier.",
    },
    fields: {
      type: "array",
      description: "Fields present on the page and their editability.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fieldId: { type: "string" },
          label: { type: "string" },
          value: {},
          editable: { type: "boolean" },
          required: { type: "boolean" },
          type: { type: "string" },
          options: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["fieldId", "editable"],
      },
    },
  },
  required: ["route", "fields"],
}

export const formPatchSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fieldId: { type: "string" },
          value: {},
        },
        required: ["fieldId", "value"],
      },
    },
  },
  required: ["updates"],
}




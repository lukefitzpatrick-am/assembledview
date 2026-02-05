type JsonSchema = Record<string, unknown>

export const pageContextSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    route: {
      description: "Current route or page identifier.",
      oneOf: [
        { type: "string" },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            pathname: { type: "string" },
            clientSlug: { type: "string" },
            mbaSlug: { type: "string" },
          },
        },
      ],
    },
    entities: {
      type: "object",
      additionalProperties: false,
      description: "Entity-level context cues for the current page.",
      properties: {
        clientSlug: { type: "string" },
        clientName: { type: "string" },
        mbaNumber: { type: "string" },
        campaignName: { type: "string" },
        mediaTypes: { type: "array", items: { type: "string" } },
      },
    },
    pageText: {
      type: "object",
      additionalProperties: false,
      description: "Visible page text cues (hardcoded or extracted).",
      properties: {
        title: { type: "string" },
        headings: { type: "array", items: { type: "string" } },
        breadcrumbs: { type: "array", items: { type: "string" } },
      },
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
          semanticType: { type: "string" },
          group: { type: "string" },
          source: { type: "string", enum: ["xano", "computed", "ui"] },
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












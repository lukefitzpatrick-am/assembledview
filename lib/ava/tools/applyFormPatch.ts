import type AvaTool from "./types";
import type { FormPatch } from "@/lib/openai";

type PageFields = NonNullable<import("@/lib/openai").PageContext["fields"]>;

function buildEditableFieldIdMap(fields: PageFields): Map<string, true> {
  const map = new Map<string, true>();
  for (const field of fields) {
    if (field.editable !== true) continue;
    if (typeof field.fieldId === "string" && field.fieldId.length > 0) {
      map.set(field.fieldId, true);
    }
    if (typeof field.id === "string" && field.id.length > 0) {
      map.set(field.id, true);
    }
  }
  return map;
}

export const applyFormPatchTool: AvaTool = {
  definition: {
    name: "apply_form_patch",
    description:
      "Apply one or more field updates to the form on the current AssembledView page. Use this when the user asks you to change, set, update, or fill field values. Only fields listed in the page context as editable can be updated. After calling this tool, confirm what was changed in your final reply.",
    input_schema: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fieldId: { type: "string" },
              value: {
                anyOf: [
                  { type: "string" },
                  { type: "number" },
                  { type: "boolean" },
                  { type: "null" },
                ],
              },
            },
            required: ["fieldId", "value"],
            additionalProperties: false,
          },
        },
      },
      required: ["updates"],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return {
        content: "apply_form_patch requires an updates array.",
        isError: true,
      };
    }

    const rawUpdates = (input as Record<string, unknown>).updates;
    if (rawUpdates === undefined || !Array.isArray(rawUpdates)) {
      return {
        content: "apply_form_patch requires an updates array.",
        isError: true,
      };
    }

    if (rawUpdates.length === 0) {
      return {
        content: "apply_form_patch was called with no updates. Nothing to apply.",
        isError: true,
      };
    }

    const fields = context.pageContext?.fields;
    if (!fields?.length) {
      return {
        content:
          "This page has no editable fields registered. Patch cannot be applied.",
        isError: true,
      };
    }

    const editableIds = buildEditableFieldIdMap(fields);
    if (editableIds.size === 0) {
      return {
        content:
          "This page has no editable fields registered. Patch cannot be applied.",
        isError: true,
      };
    }

    const validated: FormPatch["updates"] = [];

    for (let i = 0; i < rawUpdates.length; i++) {
      const item = rawUpdates[i];
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        return {
          content: `Update at index ${i} is missing fieldId.`,
          isError: true,
        };
      }
      const fieldId = (item as Record<string, unknown>).fieldId;
      if (typeof fieldId !== "string") {
        return {
          content: `Update at index ${i} is missing fieldId.`,
          isError: true,
        };
      }
      if (!editableIds.has(fieldId)) {
        return {
          content: `Field "${fieldId}" is not editable on this page.`,
          isError: true,
        };
      }
      validated.push({
        fieldId,
        value: (item as Record<string, unknown>).value,
      });
    }

    context.capturedPatch = { updates: validated };

    return {
      content: `Validated ${validated.length} field update(s). The client will apply them: ${validated.map((u) => u.fieldId).join(", ")}.`,
      isError: false,
    };
  },
};

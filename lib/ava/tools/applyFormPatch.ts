import type AvaTool from "./types";
import type { FormPatch, PageField } from "@/lib/ava/types";

type PageFields = NonNullable<import("@/lib/ava/types").PageContext["fields"]>;

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

function findFieldById(fields: PageFields, fieldId: string): PageField | undefined {
  return fields.find(
    (field) => field.fieldId === fieldId || field.id === fieldId,
  );
}

function normalisedOptions(field: PageField): string[] {
  if (!field.options?.length) return [];
  return field.options.map((o) => (typeof o === "string" ? o : o.value));
}

function optionMatches(allowed: string[], value: unknown): boolean {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    return false;
  }
  const needle = String(value).toLowerCase();
  return allowed.some((opt) => opt.toLowerCase() === needle);
}

/**
 * Validate `value` against the field's declared type/options when metadata is present.
 * Returns an error message, or null if the value is acceptable (or metadata is absent).
 */
function validateFieldValue(field: PageField, fieldId: string, value: unknown): string | null {
  const allowed = normalisedOptions(field);
  if (allowed.length > 0 && !optionMatches(allowed, value)) {
    return `"${value}" is not a valid option for "${fieldId}" (allowed: ${allowed.join(", ")})`;
  }

  const isNumberIsh = field.type === "number" || field.semanticType === "budget";
  if (isNumberIsh) {
    if (!Number.isFinite(Number(value))) {
      return `"${value}" is not a valid number for "${fieldId}".`;
    }
  }

  const isBooleanIsh =
    field.type === "boolean" || field.semanticType === "boolean_toggle";
  if (isBooleanIsh && typeof value !== "boolean") {
    return `"${value}" is not a valid boolean for "${fieldId}".`;
  }

  if (field.required === true && (value === null || value === "")) {
    return `Field "${fieldId}" is required and cannot be empty.`;
  }

  return null;
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

      const value = (item as Record<string, unknown>).value;
      const field = findFieldById(fields, fieldId);
      if (field) {
        const validationError = validateFieldValue(field, fieldId, value);
        if (validationError) {
          return {
            content: validationError,
            isError: true,
          };
        }
      }

      validated.push({
        fieldId,
        value,
      });
    }

    context.capturedPatch = { updates: validated };

    return {
      content: `Validated ${validated.length} field update(s). The client will apply them: ${validated.map((u) => u.fieldId).join(", ")}.`,
      isError: false,
    };
  },
};

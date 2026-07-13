import type AvaTool from "./types"
import { summariseNamingRules } from "./summaries"
import { asRecord, asString, jsonContent } from "./helpers"

export { summariseNamingRules } from "./summaries"

export const getNamingRulesTool: AvaTool = {
  definition: {
    name: "get_naming_rules",
    description:
      "Show naming template element order for a platform/level and optionally compose a preview name from provided values. Use for trafficking naming questions.",
    input_schema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          description: 'Platform key, e.g. "meta", "google_ads", "search", "dv360".',
        },
        level: {
          type: "string",
          description: 'Template level, e.g. "campaign", "ad_set", "ad", "insertion_order".',
        },
        values: {
          type: "object",
          description: "Key/value map of template element values for compose preview.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["platform", "level"],
      additionalProperties: false,
    },
  },
  async execute(input) {
    const args = asRecord(input)
    const platform = asString(args.platform)
    const level = asString(args.level)
    if (!platform || !level) {
      return { content: "platform and level are required.", isError: true }
    }
    const rawValues = args.values
    const values: Record<string, string> = {}
    if (rawValues && typeof rawValues === "object" && !Array.isArray(rawValues)) {
      for (const [k, v] of Object.entries(rawValues as Record<string, unknown>)) {
        if (typeof v === "string") values[k] = v
        else if (v != null) values[k] = String(v)
      }
    }
    const result = summariseNamingRules(platform, level, values)
    if (result.error) {
      return { content: jsonContent(result), isError: true }
    }
    return { content: jsonContent(result), isError: false }
  },
}

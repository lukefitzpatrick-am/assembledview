import type AvaTool from "./types"
import { getCachedPlanningMeta } from "@/lib/planning/metaCache"
import { summariseMethodology } from "./summaries"
import { asRecord, asString, jsonContent } from "./helpers"

export { summariseMethodology } from "./summaries"

export const getMethodologyTool: AvaTool = {
  definition: {
    name: "get_methodology",
    description:
      "Load planning methodology rows (title, formula, source). Optionally filter by methodology_id or title substring (e.g. affinity, DFII).",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional filter matched against methodology_id or title.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input) {
    const args = asRecord(input)
    const query = asString(args.query)?.toLowerCase()

    try {
      const meta = await getCachedPlanningMeta()
      const rows = meta.methodology ?? []
      const filtered = query
        ? rows.filter(
            (r) =>
              r.methodology_id.toLowerCase().includes(query) ||
              r.title.toLowerCase().includes(query),
          )
        : rows
      return {
        content: jsonContent({
          query: query ?? null,
          count: filtered.length,
          methodology: filtered.slice(0, 30).map(summariseMethodology),
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `Failed to load methodology: ${message}`, isError: true }
    }
  },
}

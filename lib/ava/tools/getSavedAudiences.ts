import type AvaTool from "./types"
import {
  listPlanningAudiences,
  listPlanningAudiencesByMba,
} from "@/lib/planning/xanoPlanningAudiences"
import { summariseAudience } from "./summaries"
import {
  asNumber,
  asRecord,
  asString,
  capList,
  jsonContent,
  resolveScopedMba,
} from "./helpers"

export { summariseAudience } from "./summaries"

export const getSavedAudiencesTool: AvaTool = {
  definition: {
    name: "get_saved_audiences",
    description:
      "List saved planning audiences by clients_id or mba_number. Returns name, size (composed_wc), and a short definition summary. Prefer mba when on a campaign page.",
    input_schema: {
      type: "object",
      properties: {
        clientsId: { type: "number", description: "Xano clients.id filter." },
        mbaNumber: {
          type: "string",
          description: "MBA number. Defaults to page context mbaNumber.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const clientsId = asNumber(args.clientsId)
    const scopedMba = resolveScopedMba(context, asString(args.mbaNumber))
    if (!scopedMba.ok) return { content: scopedMba.error, isError: true }
    const mba = scopedMba.mba

    if (clientsId == null && !mba) {
      return {
        content: "Provide clientsId or mbaNumber (or open a page with an MBA in context).",
        isError: true,
      }
    }

    try {
      const rows = mba
        ? await listPlanningAudiencesByMba(mba)
        : await listPlanningAudiences({ clientsId: clientsId! })
      const summarised = rows.map(summariseAudience)
      const { items, truncated } = capList(summarised, 50)
      return {
        content: jsonContent({
          filter: mba ? { mbaNumber: mba } : { clientsId },
          count: summarised.length,
          truncated,
          audiences: items,
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `Failed to load saved audiences: ${message}`, isError: true }
    }
  },
}

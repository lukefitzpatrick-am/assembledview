import type AvaTool from "./types"
import { getCachedClients } from "@/lib/finance/xanoReferenceCache"
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug"
import { summariseClientDetails } from "./summaries"
import {
  asRecord,
  asString,
  jsonContent,
  resolveScopedClientSlug,
  truncateText,
} from "./helpers"

export { summariseClientDetails } from "./summaries"

export const getClientDetailsTool: AvaTool = {
  definition: {
    name: "get_client_details",
    description:
      "Look up a client by slug or name. Returns display name, brand colour, fee fields, and whether platform IDs are populated. Use when the user asks about a client's fees, platform setup, or profile.",
    input_schema: {
      type: "object",
      properties: {
        clientSlug: {
          type: "string",
          description: "Client URL slug or display name. Defaults to page context clientSlug.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const scoped = resolveScopedClientSlug(context, asString(args.clientSlug))
    if (!scoped.ok) return { content: scoped.error, isError: true }
    if (!scoped.slug) {
      return {
        content: "clientSlug is required (pass it or open a page with a client in context).",
        isError: true,
      }
    }

    try {
      const clients = await getCachedClients()
      const want = slugifyClientNameForUrl(scoped.slug)
      const match = clients.find((row) => {
        const name = getClientDisplayName(row)
        return slugifyClientNameForUrl(name) === want
      })
      if (!match) {
        return { content: `No client found for "${scoped.slug}".`, isError: false }
      }
      return {
        content: jsonContent({
          client: summariseClientDetails(match as Record<string, unknown>),
          note: truncateText("Fee values are percentages where set; platformIdsPopulated is y/n only."),
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `Failed to load client details: ${message}`, isError: true }
    }
  },
}

import type AvaTool from "./types"
import { fetchClientById } from "@/lib/clients/fetchClientById"
import { getClientDisplayName, slugifyClientNameForUrl } from "@/lib/clients/slug"
import { getCachedClients } from "@/lib/finance/xanoReferenceCache"
import { CLIENT_LINK_FIELDS } from "@/lib/types/clientProfile"
import { asRecord, asString, jsonContent, resolveScopedClientSlug } from "./helpers"

function extractLinks(row: Record<string, unknown>) {
  const links: Record<string, string> = {}
  for (const key of CLIENT_LINK_FIELDS) {
    const v = asString(row[key])
    links[key] = v ?? ""
  }
  return links
}

function brainPayload(row: Record<string, unknown>) {
  const name = getClientDisplayName(row)
  const idNum = Number(row.id)
  return {
    client_id: Number.isFinite(idNum) ? idNum : row.id ?? null,
    client_name: name,
    client_brain:
      typeof row.client_brain === "string" ? row.client_brain : "",
    client_brain_updated_at:
      typeof row.client_brain_updated_at === "number" &&
      Number.isFinite(row.client_brain_updated_at)
        ? row.client_brain_updated_at
        : null,
    links: extractLinks(row),
  }
}

async function resolveClientRow(
  clientArg: string,
): Promise<Record<string, unknown> | null> {
  const want = clientArg.trim()
  if (!want) return null

  if (/^\d+$/.test(want)) {
    return fetchClientById(want)
  }

  const clients = await getCachedClients()
  const wantSlug = slugifyClientNameForUrl(want)
  const wantLower = want.toLowerCase()
  const match = clients.find((row) => {
    const name = getClientDisplayName(row)
    if (name.toLowerCase() === wantLower) return true
    return slugifyClientNameForUrl(name) === wantSlug
  })
  if (!match?.id) return null
  return fetchClientById(match.id as string | number)
}

export const getClientBrainTool: AvaTool = {
  definition: {
    name: "get_client_brain",
    description:
      "Load a client's marketing brain and profile links (website, socials). Call before writing ad copy, commentary, or insights for a client. Pass client name or numeric id.",
    input_schema: {
      type: "object",
      properties: {
        client: {
          type: "string",
          description:
            "Client display name, URL slug, or numeric id. Defaults to page context clientSlug.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    const args = asRecord(input)
    const requested =
      asString(args.client) || asString(args.clientSlug) || context.clientSlug || ""
    const scoped = resolveScopedClientSlug(context, requested)
    if (!scoped.ok) return { content: scoped.error, isError: true }
    if (!scoped.slug) {
      return {
        content:
          "client is required (pass a name/id or open a page with a client in context).",
        isError: true,
      }
    }

    try {
      const row = await resolveClientRow(scoped.slug)
      if (!row) {
        return {
          content: jsonContent({
            found: false,
            message: `No client found for "${scoped.slug}".`,
          }),
          isError: false,
        }
      }
      const payload = brainPayload(row)
      return {
        content: jsonContent({
          found: true,
          ...payload,
          empty: !payload.client_brain.trim(),
          note: payload.client_brain.trim()
            ? "Honour Tone and Compliance & never-say as hard constraints."
            : "Brain is empty — offer the client-marketing-brain skill before writing.",
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: `Failed to load client brain: ${message}`,
        isError: true,
      }
    }
  },
}

// Re-export helper for save tool / tests
export { extractLinks, resolveClientRow }

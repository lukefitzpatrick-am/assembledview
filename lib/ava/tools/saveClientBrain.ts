import axios from "axios"
import type AvaTool from "./types"
import { invalidateClientsCache } from "@/lib/cache/clientsCache"
import { fetchClientById } from "@/lib/clients/fetchClientById"
import { getXanoClientsCollectionUrl } from "@/lib/api/xanoClients"
import { xanoAuthHeaderRecord } from "@/lib/api/xano"
import { invalidateCachedClients } from "@/lib/finance/xanoReferenceCache"
import {
  CLIENT_LINK_FIELDS,
  type ClientLinkField,
} from "@/lib/types/clientProfile"
import { asRecord, asString, jsonContent } from "./helpers"
import { extractLinks } from "./getClientBrain"

function linkValue(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : ""
}

export const saveClientBrainTool: AvaTool = {
  definition: {
    name: "save_client_brain",
    description:
      "Save or update a client's marketing brain markdown and optionally profile links. Sets client_brain_updated_at. Will not overwrite a non-empty link unless overwrite_links is true.",
    input_schema: {
      type: "object",
      properties: {
        client_id: {
          type: "number",
          description: "Numeric Xano client id.",
        },
        client_brain: {
          type: "string",
          description: "Full marketing brain markdown document.",
        },
        links: {
          type: "object",
          description:
            "Optional partial link updates (website, facebook_url, instagram_url, linkedin_url, tiktok_url).",
          properties: {
            website: { type: "string" },
            facebook_url: { type: "string" },
            instagram_url: { type: "string" },
            linkedin_url: { type: "string" },
            tiktok_url: { type: "string" },
          },
          additionalProperties: false,
        },
        overwrite_links: {
          type: "boolean",
          description:
            "If true, allow replacing non-empty existing link fields. Default false.",
        },
      },
      required: ["client_id", "client_brain"],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    if (!context.roles.includes("admin")) {
      return {
        content: "save_client_brain is admin-only.",
        isError: true,
      }
    }

    const args = asRecord(input)
    const clientId = Number(args.client_id)
    if (!Number.isFinite(clientId) || clientId <= 0) {
      return { content: "client_id must be a positive number.", isError: true }
    }

    const brain = asString(args.client_brain)
    if (brain == null) {
      return { content: "client_brain is required.", isError: true }
    }

    const overwriteLinks = args.overwrite_links === true
    const linksArg = asRecord(args.links)

    try {
      const existing = await fetchClientById(clientId)
      if (!existing) {
        return {
          content: `No client found for id ${clientId}.`,
          isError: true,
        }
      }

      const patch: Record<string, unknown> = {
        client_brain: brain,
        client_brain_updated_at: Date.now(),
      }

      const skippedLinks: Array<{ field: ClientLinkField; reason: string }> = []
      const appliedLinks: Partial<Record<ClientLinkField, string>> = {}

      for (const field of CLIENT_LINK_FIELDS) {
        if (!(field in linksArg)) continue
        const next = linkValue(linksArg[field])
        if (!next) continue
        const current = linkValue(existing[field])
        if (current && current !== next && !overwriteLinks) {
          skippedLinks.push({
            field,
            reason: `Existing non-empty value preserved (pass overwrite_links: true to replace).`,
          })
          continue
        }
        patch[field] = next
        appliedLinks[field] = next
      }

      const url = `${getXanoClientsCollectionUrl()}/${encodeURIComponent(String(clientId))}`
      const response = await axios.patch(url, patch, {
        headers: {
          "Content-Type": "application/json",
          ...xanoAuthHeaderRecord(),
        },
        timeout: Number(process.env.XANO_TIMEOUT_MS ?? 15000),
      })
      invalidateClientsCache()
      invalidateCachedClients()

      const saved =
        response.data && typeof response.data === "object"
          ? (response.data as Record<string, unknown>)
          : ((await fetchClientById(clientId)) ?? existing)

      return {
        content: jsonContent({
          ok: true,
          client_id: clientId,
          client_brain_updated_at: patch.client_brain_updated_at,
          links: extractLinks(saved),
          applied_links: appliedLinks,
          skipped_links: skippedLinks,
          note:
            skippedLinks.length > 0
              ? "Some link fields were skipped to avoid clobbering existing values."
              : "Brain saved. Confirm by reading get_client_brain if needed.",
        }),
        isError: false,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        content: `Failed to save client brain: ${message}`,
        isError: true,
      }
    }
  },
}

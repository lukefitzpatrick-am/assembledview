import type AvaTool from "./types"
import type { PageContext } from "@/lib/ava/types"
import { toChatFileAttachment } from "@/lib/ava/chatFileAttachment"
import { extractPlanGlobals, type PlanGlobals } from "@/lib/naming/fromPlan"
import {
  asNumber,
  asRecord,
  asString,
  jsonContent,
  resolveMediaContainerScope,
  resolveScopedMba,
} from "./helpers"

/** Explicit caveat: chat cannot see unsaved create/edit form state. */
export const NAMING_WORKBOOK_SAVED_PLAN_CAVEAT =
  "Uses the SAVED plan in Xano only — unsaved create/edit form edits are not visible to chat. For in-progress work, use Generate Naming (Ava) on the plan page (source of truth for live form state)."

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/** Build PlanGlobals from saved containers + optional page entities. */
export function globalsFromSavedNamingPlan(
  mba: string,
  lineItems: Record<string, unknown[]>,
  pageContext?: PageContext,
): PlanGlobals {
  const first = Object.values(lineItems)
    .flat()
    .find(
      (item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
  const entities = pageContext?.entities
  return extractPlanGlobals(
    {
      mp_client_name:
        text(entities?.clientName) ||
        text(first?.client_name) ||
        text(first?.client) ||
        text(first?.mp_client_name) ||
        text(first?.mp_clientname),
      mp_brand: text(first?.brand) || text(first?.mp_brand) || text(entities?.clientName),
      mp_campaignname:
        text(entities?.campaignName) ||
        text(first?.campaign_name) ||
        text(first?.mp_campaignname) ||
        mba,
      campaign_start_date:
        text(first?.campaign_start_date) ||
        text(first?.mp_campaigndates_start) ||
        text(first?.start_date),
      mp_campaigndates_start:
        text(first?.mp_campaigndates_start) ||
        text(first?.campaign_start_date) ||
        text(first?.start_date),
    },
    mba,
  )
}

export const generateNamingWorkbookTool: AvaTool = {
  definition: {
    name: "generate_naming_workbook",
    description:
      "Export a naming-conventions XLSX workbook for a saved MBA (channel tabs + Input sheet + AVA-shortened targeting/geo tokens). " +
      NAMING_WORKBOOK_SAVED_PLAN_CAVEAT +
      " The chat UI shows a download card — confirm briefly (e.g. Naming workbook ready) and note AI vs slug tokens; do not paste a download URL.",
    input_schema: {
      type: "object",
      properties: {
        mba: {
          type: "string",
          description: "MBA number to export.",
        },
        mbaNumber: {
          type: "string",
          description: "Alias for mba.",
        },
        versionNumber: {
          type: "number",
          description:
            "Plan version to scope. Defaults to page context version when present; omit for MBA-wide containers.",
        },
        useAva: {
          type: "boolean",
          description:
            "When true (default), run the AVA token summariser. On AVA failure the workbook still exports with auto slugs.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  async execute(input, context) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return {
        content:
          "Naming workbook export is unavailable: BLOB_READ_WRITE_TOKEN is not configured.",
        isError: true,
      }
    }

    const args = asRecord(input)
    const scopedMba = resolveScopedMba(
      context,
      asString(args.mba) ?? asString(args.mbaNumber),
    )
    if (!scopedMba.ok) return { content: scopedMba.error, isError: true }
    if (!scopedMba.mba) {
      return {
        content: "mba is required to generate a naming workbook.",
        isError: true,
      }
    }

    try {
      const { fetchAllMediaContainerLineItems } = await import(
        "@/lib/api/media-containers"
      )
      const { buildNamingWorkbook, namingWorkbookFilename } = await import(
        "@/lib/naming/exportNamingWorkbook"
      )
      const {
        collectTokenSources,
        normalizeNamingLineItems,
        summariseTargetingTokens,
      } = await import("@/lib/naming/summariseTargetingTokens")
      const { suggestAvaNamingTokensWithTimeout } = await import(
        "@/lib/naming/suggestAvaNamingTokens"
      )
      const { storeNamingWorkbookBuffer } = await import(
        "@/lib/naming/storeNamingExport"
      )

      const { mediaTypeFilter } = resolveMediaContainerScope(context)
      const versionNumber =
        asNumber(args.versionNumber) ?? context.versionNumber ?? undefined
      const rawLineItems = await fetchAllMediaContainerLineItems(
        scopedMba.mba,
        versionNumber,
        mediaTypeFilter,
      )
      const lineItems = normalizeNamingLineItems(
        rawLineItems as Record<string, unknown[] | undefined>,
      )

      const hasRows = Object.values(lineItems).some(
        (rows) => Array.isArray(rows) && rows.length > 0,
      )
      if (!hasRows) {
        return {
          content: jsonContent({
            error: "no_naming_channels",
            message:
              "No saved naming-relevant line items found for this MBA/version (digital/prog/search/social). Save the plan first, or use Generate Naming (Ava) on the plan page for unsaved edits.",
            caveat: NAMING_WORKBOOK_SAVED_PLAN_CAVEAT,
          }),
          isError: true,
        }
      }

      const globals = globalsFromSavedNamingPlan(
        scopedMba.mba,
        lineItems,
        context.pageContext,
      )
      const version = String(versionNumber ?? context.versionNumber ?? "1")
      const useAva = args.useAva !== false

      let tokenPath: "ai" | "slug" = "slug"
      let appliedCount = 0
      let tokenOverrides = {} as Awaited<
        ReturnType<typeof summariseTargetingTokens>
      >["overrides"]

      if (useAva) {
        const sources = collectTokenSources(lineItems, {
          globals: { brand: globals.brand, campaign: globals.campaign },
        })
        if (sources.length > 0) {
          const summarised = await summariseTargetingTokens(sources, {
            suggest: (items) => suggestAvaNamingTokensWithTimeout(items),
          })
          tokenOverrides = summarised.overrides
          appliedCount = summarised.appliedCount
          tokenPath = summarised.usedAva ? "ai" : "slug"
        }
      }

      const workbook = await buildNamingWorkbook({
        globals,
        lineItems,
        version,
        tokenOverrides,
      })
      const buffer = await workbook.xlsx.writeBuffer()
      const filename = namingWorkbookFilename(globals.mba || scopedMba.mba, version)
      const exportResult = await storeNamingWorkbookBuffer(
        scopedMba.mba,
        filename,
        buffer as ArrayBuffer,
      )
      const sizeBytes =
        buffer instanceof ArrayBuffer
          ? buffer.byteLength
          : Buffer.byteLength(buffer as Buffer)

      const attachment = toChatFileAttachment({
        fileName: exportResult.filename,
        url: `/api/naming/exports/download?path=${encodeURIComponent(exportResult.pathname)}`,
        contentType: XLSX_CONTENT_TYPE,
        sizeBytes,
      })

      return {
        content: jsonContent({
          filename: exportResult.filename,
          tokenPath,
          appliedCount,
          version,
          caveat: NAMING_WORKBOOK_SAVED_PLAN_CAVEAT,
          note:
            "A download card is shown in the chat UI — reply briefly (e.g. Naming workbook ready); do not paste a download URL. " +
            (tokenPath === "ai"
              ? `AI-cleaned ${appliedCount} targeting/geo token(s).`
              : "Used auto slugs (AI skipped or unavailable)."),
        }),
        attachments: [attachment],
        isError: false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: `Failed to generate naming workbook: ${message}`,
        isError: true,
      }
    }
  },
}

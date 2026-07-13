import { getScheduleHeaders } from "@/lib/billing/scheduleHeaders"

/** Xano table names per MBA API `lineItems` channel key (see MEDIA_TYPE_ENDPOINTS in mediaplans/mba route). */
export const LINE_ITEM_SOURCE_TABLES: Record<string, string> = {
  television: "media_plan_television",
  radio: "media_plan_radio",
  newspaper: "media_plan_newspaper",
  magazines: "media_plan_magazines",
  ooh: "media_plan_ooh",
  cinema: "media_plan_cinema",
  search: "media_plan_search",
  socialMedia: "media_plan_social",
  digitalDisplay: "media_plan_digi_display",
  digitalAudio: "media_plan_digi_audio",
  digitalVideo: "media_plan_digi_video",
  bvod: "media_plan_digi_bvod",
  integration: "media_plan_integrations",
  progDisplay: "media_plan_prog_display",
  progVideo: "media_plan_prog_video",
  progBvod: "media_plan_prog_bvod",
  progAudio: "media_plan_prog_audio",
  progOoh: "media_plan_prog_ooh",
  influencers: "media_plan_influencers",
  production: "media_plan_production",
}

export type LineItemOption = {
  line_item_id: string
  line_item_name: string
  source_table: string
}

function resolveLineItemId(item: Record<string, unknown>): string {
  const candidates = [item.line_item_id, item.lineItemId, item.LINE_ITEM_ID, item.id]
  for (const value of candidates) {
    if (value === undefined || value === null) continue
    const id = String(value).trim()
    if (id) return id
  }
  return ""
}

function formatLineItemLabel(mediaType: string, item: Record<string, unknown>): string {
  const { header1, header2 } = getScheduleHeaders(mediaType, item)
  const parts = [header1, header2].map((part) => String(part ?? "").trim()).filter(Boolean)
  if (parts.length > 0) return parts.join(" · ")
  const id = resolveLineItemId(item)
  return id || "Line item"
}

export function flattenLineItemOptions(
  lineItems: Record<string, unknown[]> | null | undefined,
): LineItemOption[] {
  if (!lineItems || typeof lineItems !== "object") return []

  const options: LineItemOption[] = []

  for (const [mediaType, items] of Object.entries(lineItems)) {
    if (!Array.isArray(items)) continue
    const source_table = LINE_ITEM_SOURCE_TABLES[mediaType]
    if (!source_table) continue

    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue
      const item = raw as Record<string, unknown>
      const line_item_id = resolveLineItemId(item)
      if (!line_item_id) continue
      options.push({
        line_item_id,
        source_table,
        line_item_name: formatLineItemLabel(mediaType, item),
      })
    }
  }

  return options.sort((a, b) => a.line_item_name.localeCompare(b.line_item_name))
}

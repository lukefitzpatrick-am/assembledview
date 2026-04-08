import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"
import { filterLineItemsByPlanNumber } from "@/lib/api/mediaPlanVersionHelper"
import { MEDIA_PLAN_VERSION_LINE_ITEM_TABLE_KEYS } from "@/lib/finance/planLineItemEnrichment"

const HEADERS = { "Content-Type": "application/json", Accept: "application/json" }

/** One HTTP call per entry; `outputKeys` are the version property names filled with the same array. */
const LINE_ITEM_ENDPOINT_GROUPS: { endpoint: string; label: string; outputKeys: string[] }[] = [
  { endpoint: "television_line_items", label: "television", outputKeys: ["television_line_items"] },
  { endpoint: "radio_line_items", label: "radio", outputKeys: ["radio_line_items"] },
  { endpoint: "newspaper_line_items", label: "newspaper", outputKeys: ["newspaper_line_items"] },
  { endpoint: "magazines_line_items", label: "magazines", outputKeys: ["magazines_line_items"] },
  { endpoint: "ooh_line_items", label: "ooh", outputKeys: ["ooh_line_items"] },
  { endpoint: "cinema_line_items", label: "cinema", outputKeys: ["cinema_line_items"] },
  {
    endpoint: "media_plan_digi_display",
    label: "digitalDisplay",
    outputKeys: ["media_plan_digi_display", "digital_display_line_items"],
  },
  { endpoint: "digital_audio_line_items", label: "digitalAudio", outputKeys: ["digital_audio_line_items"] },
  { endpoint: "digital_video_line_items", label: "digitalVideo", outputKeys: ["digital_video_line_items"] },
  { endpoint: "bvod_line_items", label: "bvod", outputKeys: ["bvod_line_items"] },
  { endpoint: "integration_line_items", label: "integration", outputKeys: ["integration_line_items"] },
  { endpoint: "search_line_items", label: "search", outputKeys: ["search_line_items"] },
  { endpoint: "social_media_line_items", label: "socialMedia", outputKeys: ["social_media_line_items"] },
  { endpoint: "prog_display_line_items", label: "progDisplay", outputKeys: ["prog_display_line_items"] },
  { endpoint: "prog_video_line_items", label: "progVideo", outputKeys: ["prog_video_line_items"] },
  { endpoint: "prog_bvod_line_items", label: "progBvod", outputKeys: ["prog_bvod_line_items"] },
  { endpoint: "prog_audio_line_items", label: "progAudio", outputKeys: ["prog_audio_line_items"] },
  { endpoint: "prog_ooh_line_items", label: "progOoh", outputKeys: ["prog_ooh_line_items"] },
  { endpoint: "influencers_line_items", label: "influencers", outputKeys: ["influencers_line_items"] },
]

function snakeToCamelKey(tableKey: string): string {
  return tableKey.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

function versionHasEmbeddedLineArrays(version: Record<string, unknown>): boolean {
  for (const tableKey of MEDIA_PLAN_VERSION_LINE_ITEM_TABLE_KEYS) {
    const camel = snakeToCamelKey(tableKey)
    const raw = version[tableKey] ?? version[camel]
    if (Array.isArray(raw) && raw.length > 0) return true
  }
  return false
}

async function fetchScopedLineItems(
  endpoint: string,
  label: string,
  mbaNumber: string,
  versionNumber: string
): Promise<unknown[]> {
  const baseUrl = xanoUrl(endpoint, ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])
  const hasVersion = versionNumber.length > 0

  if (!hasVersion) {
    const res = await axios.get(`${baseUrl}?mba_number=${encodeURIComponent(mbaNumber)}`, { headers: HEADERS, timeout: 12000 }).catch(() => ({ data: [] }))
    return Array.isArray(res.data) ? res.data : []
  }

  const attempts: Record<string, string | number>[] = [
    { mba_number: mbaNumber, mp_plannumber: versionNumber },
    { mba_number: mbaNumber, version_number: versionNumber },
  ]

  let bestFiltered: unknown[] = []
  let bestRawCount = Number.POSITIVE_INFINITY

  for (const params of attempts) {
    const res = await axios.get(baseUrl, { headers: HEADERS, params, timeout: 12000 }).catch(() => ({ data: [] }))
    const raw = Array.isArray(res.data) ? res.data : []
    const filtered = filterLineItemsByPlanNumber(raw as any[], mbaNumber, versionNumber, label)

    if (
      filtered.length > bestFiltered.length ||
      (filtered.length === bestFiltered.length && raw.length < bestRawCount)
    ) {
      bestFiltered = filtered
      bestRawCount = raw.length
    }

    if (raw.length > 0 && raw.length === filtered.length) break
  }

  return bestFiltered
}

/**
 * When `media_plan_versions` list rows omit related line-item tables, fetch them (same endpoints as
 * `app/api/mediaplans/[id]/route.ts`) so receivable derivation can join `billingSchedule` lines to plan rows.
 */
export async function fetchPlanLineItemTablesForVersion(
  mbaNumber: string,
  versionNumber: string | number | null | undefined
): Promise<Record<string, unknown[]>> {
  const vn = versionNumber != null && versionNumber !== "" ? String(versionNumber) : ""
  const mba = String(mbaNumber ?? "").trim()
  const out: Record<string, unknown[]> = {}

  const results = await Promise.all(
    LINE_ITEM_ENDPOINT_GROUPS.map((g) => fetchScopedLineItems(g.endpoint, g.label, mba, vn))
  )

  LINE_ITEM_ENDPOINT_GROUPS.forEach((g, i) => {
    const rows = results[i] ?? []
    for (const key of g.outputKeys) {
      out[key] = rows as unknown[]
    }
  })

  return out
}

export async function hydratePlanVersionsForBillingLineEnrichment(
  versions: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  return Promise.all(
    versions.map(async (v) => {
      if (versionHasEmbeddedLineArrays(v)) return v
      const mba = String(v.mba_number ?? "").trim()
      const vn = v.version_number
      if (!mba || vn == null || vn === "") return v
      const tables = await fetchPlanLineItemTablesForVersion(mba, vn as string | number)
      return { ...v, ...tables }
    })
  )
}

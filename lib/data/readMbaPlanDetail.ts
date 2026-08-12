/**
 * Postgres reader for GET /api/mediaplans/mba/[mba_number] (C-22).
 * Gated by DATA_BACKEND_PLAN_DETAIL — default postgres (X2); `xano` → 410.
 *
 * One query set: master + versions for MBA + all line_items for the target
 * version (no 20× channel fan-out / param-shape retries).
 */

import "server-only"

import { eq, sql } from "drizzle-orm"
import { type LineChannel } from "@/db/schema"
import { getDb, schema } from "@/db"
import { getCachedClients } from "@/lib/finance/xanoReferenceCache"
import {
  mapPlanMasterFromPostgres,
  mapPlanVersionFromPostgres,
  publishedVersionIfStamped,
} from "@/lib/data/readMediaPlans"
import {
  mapLineItemFromPostgres,
  type LineItemAssemblyContext,
} from "@/lib/data/planShapes"
import { coerceNumericStringsToNumbers, toApiRow } from "@/lib/data/toApiRow"
import { sortLineItemsByLineItemNumber } from "@/lib/mediaplan/lineItemIds"
import {
  assembleMbaGetCombinedData,
  createEmptyMbaGetLineItems,
  deriveEnabledMediaTypes,
  parseMbaGetVersion,
  type MbaGetMediaLineItems,
  type MbaGetAssembleInput,
} from "@/lib/mediaplan/mbaGetAssemble"

export const PLAN_DETAIL_POSTGRES_ERROR_CODE = "PLAN_DETAIL_POSTGRES_FAILED"

/** API lineItems key → consolidated line_channel enum. */
export const MBA_GET_KEY_TO_LINE_CHANNEL: Record<
  keyof MbaGetMediaLineItems,
  LineChannel
> = {
  television: "television",
  radio: "radio",
  newspaper: "newspaper",
  magazines: "magazines",
  ooh: "ooh",
  cinema: "cinema",
  search: "search",
  socialMedia: "social",
  digitalDisplay: "digi_display",
  digitalAudio: "digi_audio",
  digitalVideo: "digi_video",
  bvod: "digi_bvod",
  integration: "integrations",
  progDisplay: "prog_display",
  progVideo: "prog_video",
  progBvod: "prog_bvod",
  progAudio: "prog_audio",
  progOoh: "prog_ooh",
  influencers: "influencers",
  production: "production",
}

const LINE_CHANNEL_TO_MBA_GET_KEY = Object.fromEntries(
  Object.entries(MBA_GET_KEY_TO_LINE_CHANNEL).map(([k, v]) => [v, k])
) as Record<LineChannel, keyof MbaGetMediaLineItems>

function normaliseMba(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
}

function slugifyClientName(name: string | null | undefined): string {
  if (!name || typeof name !== "string") return ""
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

async function fetchClientBrandColour(
  clientName?: string | null
): Promise<string | null> {
  if (!clientName) return null
  try {
    const clients = await getCachedClients()
    const target = slugifyClientName(clientName)
    const match = (clients as Array<Record<string, unknown>>).find((c) => {
      const n = String(c.mp_client_name ?? c.clientname_input ?? "")
      return slugifyClientName(n) === target
    })
    const colour = match?.brand_colour ?? match?.brandColour
    return typeof colour === "string" && colour.trim() ? colour : null
  } catch {
    return null
  }
}

export type ReadMbaPlanDetailQuery = {
  mbaNumber: string
  requestedVersionNumber?: number | null
  skipLineItems?: boolean
  includeVersionsMeta?: boolean
  billingScheduleFull?: boolean
  requestedStartDateParam?: string | null
  requestedEndDateParam?: string | null
}

export type ReadMbaPlanDetailResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 500; error: string; code: typeof PLAN_DETAIL_POSTGRES_ERROR_CODE }

/**
 * Pure assembly entry for parity tests (no DB). Maps already-shaped master /
 * version / line items through the same combine function as the live reader.
 */
export function assembleMbaPlanDetailFromParts(
  input: MbaGetAssembleInput
): Record<string, unknown> {
  return assembleMbaGetCombinedData(input)
}

export function groupLineItemsByMbaGetKey(
  rows: Record<string, unknown>[],
  ctx: LineItemAssemblyContext
): MbaGetMediaLineItems {
  const grouped = createEmptyMbaGetLineItems()
  for (const row of rows) {
    const api = coerceNumericStringsToNumbers(toApiRow(row))
    const channel = String(api.channel ?? "") as LineChannel
    const key = LINE_CHANNEL_TO_MBA_GET_KEY[channel]
    if (!key) continue
    grouped[key].push(mapLineItemFromPostgres(row, ctx))
  }
  for (const key of Object.keys(grouped) as Array<keyof MbaGetMediaLineItems>) {
    grouped[key] = sortLineItemsByLineItemNumber(grouped[key])
  }
  return grouped
}

/**
 * Intentional Postgres-vs-Xano differences (listed, never silent).
 * - nextVersionNumber: Postgres tip+1 (O4.6); Xano path uses published watermark+1
 * - Master/version omit Xano-only denormalised scalars with no PG column
 *   (`inputs_hash`, `rebill_needed`, `latest_version_id`, `temp_version_number`, …)
 */
export const MBA_PLAN_DETAIL_INTENTIONAL_DIFFS = [
  {
    path: "nextVersionNumber",
    reason:
      "Postgres = max(version_number)+1 for the master (O4.6 tip); Xano GET = published watermark + 1. Equal when no staged-unpublished versions exist.",
  },
  {
    path: "master-only Xano scalars",
    reason:
      "Postgres master mapper does not invent Xano-only fields absent from media_plan_masters (inputs_hash, rebill_needed, latest_version_id, temp_version_number).",
  },
] as const

async function loadMasterAndVersions(mbaNumber: string): Promise<{
  master: Record<string, unknown> | null
  versions: Record<string, unknown>[]
  tipVersionNumber: number
}> {
  const db = getDb()
  const target = normaliseMba(mbaNumber)

  const masterRows = await db
    .select()
    .from(schema.mediaPlanMasters)
    .where(sql`lower(${schema.mediaPlanMasters.mbaNumber}) = ${target}`)
    .limit(1)
  const masterRow = masterRows[0]
  if (!masterRow) {
    return { master: null, versions: [], tipVersionNumber: 0 }
  }

  const versionRows = await db
    .select()
    .from(schema.mediaPlanVersions)
    .where(eq(schema.mediaPlanVersions.masterId, masterRow.id))

  const versionById = new Map(
    versionRows.map((v) => [v.id, v as Record<string, unknown>])
  )
  let tipVersionNumber = 0
  for (const v of versionRows) {
    const vn = Number(v.versionNumber)
    if (Number.isFinite(vn) && vn > tipVersionNumber) tipVersionNumber = vn
  }

  const pubId = masterRow.publishedVersionId
  const publishedRaw =
    pubId != null && Number.isFinite(Number(pubId))
      ? versionById.get(Number(pubId)) ?? null
      : null
  // Join requires published_at IS NOT NULL — stale pointer ≡ null pointer (NV-1).
  const published = publishedVersionIfStamped(
    publishedRaw as Record<string, unknown> | null
  )
  const publishedApi = published
    ? coerceNumericStringsToNumbers(toApiRow(published))
    : null

  const master = mapPlanMasterFromPostgres(
    masterRow as Record<string, unknown>,
    publishedApi,
    published == null ? tipVersionNumber : null
  )

  const versions = versionRows.map((row) =>
    mapPlanVersionFromPostgres(row as Record<string, unknown>)
  )

  return { master, versions, tipVersionNumber }
}

async function loadLineItemsGrouped(
  ctx: LineItemAssemblyContext,
  versionData: Record<string, unknown>,
  skipLineItems: boolean
): Promise<MbaGetMediaLineItems> {
  if (skipLineItems) return createEmptyMbaGetLineItems()

  const enabled = deriveEnabledMediaTypes(versionData)
  const enabledChannels = new Set(
    enabled.map((k) => MBA_GET_KEY_TO_LINE_CHANNEL[k])
  )

  const db = getDb()
  const rows = await db
    .select()
    .from(schema.lineItems)
    .where(eq(schema.lineItems.versionId, ctx.versionId))

  const filtered = rows.filter((row) => {
    const channel = String(
      (row as { channel?: unknown }).channel ?? ""
    ) as LineChannel
    return enabledChannels.has(channel)
  })

  return groupLineItemsByMbaGetKey(
    filtered as unknown as Record<string, unknown>[],
    ctx
  )
}

/**
 * Serve the full MBA GET response from Postgres. Throws only for unexpected
 * failures; 404s return `{ ok: false, status: 404 }`. Callers must NOT fall
 * back to Xano — the flag is the fallback.
 */
export async function readMbaPlanDetailFromPostgres(
  query: ReadMbaPlanDetailQuery
): Promise<ReadMbaPlanDetailResult> {
  try {
    const mbaNumber = String(query.mbaNumber ?? "").trim()
    if (!mbaNumber) {
      return { ok: false, status: 404, error: "MBA number required" }
    }

    const { master, versions, tipVersionNumber } =
      await loadMasterAndVersions(mbaNumber)
    if (!master) {
      return {
        ok: false,
        status: 404,
        error: `Media plan master not found for MBA number: ${mbaNumber}`,
      }
    }

    const publishedCap = parseMbaGetVersion(master.version_number) ?? 0
    const latestVersionNumber = publishedCap
    // O4.6: next save version is tip+1 (not merely published+1).
    const nextVersionNumber = (tipVersionNumber || publishedCap || 0) + 1

    let versionsMetadata: Array<{
      id: unknown
      version_number: number
      created_at: unknown
      published_at: unknown
      published_by: unknown
    }> = []
    if (query.includeVersionsMeta) {
      versionsMetadata = versions
        .map((v) => ({
          id: v.id,
          version_number: parseMbaGetVersion(v.version_number) ?? 0,
          created_at: v.created_at ?? null,
          published_at: v.published_at ?? null,
          published_by: v.published_by ?? null,
        }))
        .filter((v) => v.version_number > 0 && v.version_number <= publishedCap)
    }

    let targetVersionNumber =
      query.requestedVersionNumber ??
      latestVersionNumber ??
      parseMbaGetVersion(master.version_number) ??
      1

    let versionData =
      versions.find(
        (v) => parseMbaGetVersion(v.version_number) === targetVersionNumber
      ) ?? null

    if (query.requestedVersionNumber != null && !versionData) {
      return {
        ok: false,
        status: 404,
        error: `Media plan version ${query.requestedVersionNumber} not found for MBA number ${mbaNumber}`,
      }
    }

    if (!versionData) {
      const fallbackVn = publishedCap || tipVersionNumber
      versionData =
        versions.find((v) => parseMbaGetVersion(v.version_number) === fallbackVn) ??
        null
      if (versionData) {
        targetVersionNumber = parseMbaGetVersion(versionData.version_number) ?? fallbackVn
      }
    }

    if (!versionData) {
      return {
        ok: false,
        status: 404,
        error: `No media plan versions found for MBA number ${mbaNumber}`,
      }
    }

    // Overlay master-owned client name (DI-9) — versions do not store it.
    versionData = {
      ...versionData,
      mp_client_name:
        versionData.mp_client_name || master.mp_client_name || "",
    }

    const versionId = Number(versionData.id)
    const ctx: LineItemAssemblyContext = {
      versionId,
      versionNumber: targetVersionNumber,
      mbaNumber: String(versionData.mba_number ?? mbaNumber),
      mpClientName:
        typeof master.mp_client_name === "string" ? master.mp_client_name : null,
    }

    const lineItemsData = await loadLineItemsGrouped(
      ctx,
      versionData,
      Boolean(query.skipLineItems)
    )

    const clientName =
      (versionData.mp_client_name as string | undefined) ||
      (master.mp_client_name as string | undefined) ||
      null
    const clientBrandColour = await fetchClientBrandColour(clientName)

    const data = assembleMbaPlanDetailFromParts({
      mbaNumber,
      masterData: master,
      versionData,
      lineItemsData,
      versionsMetadata,
      latestVersionNumber,
      nextVersionNumber,
      targetVersionNumber,
      billingScheduleFull: Boolean(query.billingScheduleFull),
      requestedStartDateParam: query.requestedStartDateParam ?? null,
      requestedEndDateParam: query.requestedEndDateParam ?? null,
      clientBrandColour,
    })

    return { ok: true, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[readMbaPlanDetailFromPostgres]", err)
    return {
      ok: false,
      status: 500,
      error: message || "Failed to load media plan detail from Postgres",
      code: PLAN_DETAIL_POSTGRES_ERROR_CODE,
    }
  }
}

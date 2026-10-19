import "server-only"

import { del, put } from "@vercel/blob"
import { and, eq, inArray, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { creativePreviewCache, mediaPlanMasters } from "@/db/schema"
import { querySnowflake } from "@/lib/snowflake/query"
import { dateOnly, field, text } from "@/lib/webReport/rows"

import {
  isPreviewPlatform,
  notReadyResult,
  runPreviewJob,
  type CachedPreviewRow,
  type PreviewAsset,
  type PreviewCacheUpsert,
  type PreviewJobResult,
} from "./core"
import { fetchPreviewImage } from "./fetchPreviewImage"
import { readPreviewCacheGate } from "./markers"

const ASSETS_SQL = `
WITH recent AS (
  SELECT
    platform,
    creative_key,
    MAX(date) AS last_delivery_date,
    LISTAGG(DISTINCT LOWER(TRIM(mba_number)), ',') AS mba_numbers
  FROM ASSEMBLEDVIEW.MART.V_CREATIVE_PERFORMANCE_DAILY
  WHERE platform IN ('meta', 'tiktok')
    AND date >= ?
  GROUP BY platform, creative_key
)
SELECT
  a.platform,
  a.creative_key,
  a.preview_image_url,
  a.preview_kind,
  a.view_url,
  r.last_delivery_date,
  r.mba_numbers
FROM ASSEMBLEDVIEW.MART.V_CREATIVE_ASSETS a
JOIN recent r
  ON r.platform = a.platform
 AND r.creative_key = a.creative_key
WHERE a.preview_image_url IS NOT NULL
`

function windowStart(days: number, today: Date): string {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  start.setUTCDate(start.getUTCDate() - days)
  return start.toISOString().slice(0, 10)
}

export function assetsFromWarehouse(rows: Record<string, unknown>[]): PreviewAsset[] {
  const out: PreviewAsset[] = []
  for (const row of rows) {
    const platform = text(field(row, "platform"))?.toLowerCase() ?? ""
    const creativeKey = text(field(row, "creative_key"))
    const previewImageUrl = text(field(row, "preview_image_url"))
    if (!isPreviewPlatform(platform) || !creativeKey || !previewImageUrl) continue
    out.push({
      platform,
      creativeKey,
      previewImageUrl,
      previewKind: text(field(row, "preview_kind")),
      viewUrl: text(field(row, "view_url")),
      lastDeliveryDate: dateOnly(field(row, "last_delivery_date")) ?? "",
      mbaNumbers: (text(field(row, "mba_numbers")) ?? "")
        .split(",")
        .map((mba) => mba.trim().toLowerCase())
        .filter(Boolean),
    })
  }
  return out
}

async function loadAssets(days: number): Promise<PreviewAsset[]> {
  const raw = await querySnowflake<Record<string, unknown>>(ASSETS_SQL, [windowStart(days, new Date())], {
    label: "creative-previews-assets",
  })
  return assetsFromWarehouse(raw ?? [])
}

async function loadCached(assets: PreviewAsset[]): Promise<CachedPreviewRow[]> {
  const db = getDb()
  const out: CachedPreviewRow[] = []
  for (const platform of ["meta", "tiktok"] as const) {
    const keys = [...new Set(assets.filter((a) => a.platform === platform).map((a) => a.creativeKey))]
    if (keys.length === 0) continue
    const rows = await db
      .select({
        platform: creativePreviewCache.platform,
        creativeKey: creativePreviewCache.creativeKey,
        sourceHash: creativePreviewCache.sourceHash,
        blobPathname: creativePreviewCache.blobPathname,
      })
      .from(creativePreviewCache)
      .where(and(eq(creativePreviewCache.platform, platform), inArray(creativePreviewCache.creativeKey, keys)))
    out.push(...rows)
  }
  return out
}

/** MBA to client: media_plan_masters.client_id, matched on lower(mba_number). */
async function loadClientByMba(mbaNumbers: string[]): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({ mbaNumber: mediaPlanMasters.mbaNumber, clientId: mediaPlanMasters.clientId })
    .from(mediaPlanMasters)
    .where(inArray(sql`lower(${mediaPlanMasters.mbaNumber})`, mbaNumbers))
  const out = new Map<string, number>()
  for (const row of rows) {
    if (row.clientId != null && row.clientId > 0) out.set(row.mbaNumber.toLowerCase(), row.clientId)
  }
  return out
}

function blobToken(): { token?: string } {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  return token ? { token } : {}
}

async function putBlob(pathname: string, bytes: Uint8Array, contentType: string) {
  const blob = await put(pathname, Buffer.from(bytes), {
    access: "private",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    ...blobToken(),
  })
  return { pathname: blob.pathname }
}

async function deleteBlob(pathname: string): Promise<void> {
  await del(pathname, blobToken())
}

async function upsertRow(row: PreviewCacheUpsert): Promise<void> {
  const stamp = new Date().toISOString()
  const values = { ...row, error: null, updatedAt: stamp }
  await getDb()
    .insert(creativePreviewCache)
    .values(values)
    .onConflictDoUpdate({
      target: [creativePreviewCache.platform, creativePreviewCache.creativeKey],
      set: values,
    })
}

/**
 * Warehouse-only dry run: what the job would fetch if no cache row had a source
 * hash yet (true for every row until 0102 is applied). Reads no Postgres table.
 */
export async function countPreviewCandidates(days: number): Promise<PreviewJobResult> {
  return runPreviewJob(
    {
      loadAssets,
      loadCached: async () => [],
      loadClientByMba: async () => new Map(),
      fetchImage: async () => ({ ok: false, reason: "network" }),
      putBlob: async () => {
        throw new Error("dry run")
      },
      deleteBlob: async () => undefined,
      upsertRow: async () => {
        throw new Error("dry run")
      },
    },
    { days, confirm: false, limit: Number.MAX_SAFE_INTEGER },
  )
}

export async function runCreativePreviewCache(options: {
  days: number
  confirm: boolean
  limit?: number
}): Promise<PreviewJobResult> {
  const gate = await readPreviewCacheGate()
  if (!gate.ready) {
    console.warn(`[creative-previews] ${gate.message}`)
    return notReadyResult(options.days, !options.confirm)
  }
  return runPreviewJob(
    {
      loadAssets,
      loadCached,
      loadClientByMba,
      fetchImage: (url) => fetchPreviewImage(url),
      putBlob,
      deleteBlob,
      upsertRow,
      log: (message, detail) => console.info(`[creative-previews] ${message}`, detail ?? {}),
    },
    options,
  )
}

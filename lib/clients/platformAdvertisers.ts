import "server-only"

import { unstable_cache } from "next/cache"

import { querySnowflake } from "@/lib/snowflake/query"

export type PlatformAdvertiser = {
  name: string
  firstSeen: string | null
  lastSeen: string | null
  rowCount: number
}

type AdvertiserRaw = {
  ADVERTISER_NAME?: unknown
  FIRST_SEEN?: unknown
  LAST_SEEN?: unknown
  ROW_COUNT?: unknown
}

function asDay(value: unknown): string | null {
  if (value == null || value === "") return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const text = String(value).trim()
  const day = text.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : text || null
}

export function mapAdvertiserRows(rows: readonly AdvertiserRaw[]): PlatformAdvertiser[] {
  return rows.flatMap((row) => {
    const name = String(row.ADVERTISER_NAME ?? "").trim()
    if (!name) return []
    const count = Number(row.ROW_COUNT ?? 0)
    return [
      {
        name,
        firstSeen: asDay(row.FIRST_SEEN),
        lastSeen: asDay(row.LAST_SEEN),
        rowCount: Number.isFinite(count) ? count : 0,
      },
    ]
  })
}

const ADVERTISER_SQL = `
  SELECT advertiser_name, first_seen, last_seen, row_count
  FROM ASSEMBLEDVIEW.MART.V_PLATFORM_ADVERTISERS
  WHERE platform = ?
  ORDER BY advertiser_name
`

/** Uncached read. Throws the Snowflake error when the view is missing so it is not cached. */
export async function fetchPlatformAdvertisersUncached(
  platform: "cm360" | "dv360",
): Promise<PlatformAdvertiser[]> {
  const rows = await querySnowflake<AdvertiserRaw>(ADVERTISER_SQL, [platform], {
    label: "platform_advertisers",
  })
  return mapAdvertiserRows(rows ?? [])
}

/** One hour. Auth stays outside this cache. A thrown error is not stored. */
export async function listPlatformAdvertisers(
  platform: "cm360" | "dv360",
): Promise<PlatformAdvertiser[]> {
  const cached = unstable_cache(
    () => fetchPlatformAdvertisersUncached(platform),
    ["platform-advertisers", platform],
    { revalidate: 3600, tags: ["platform-advertisers"] },
  )
  return cached()
}

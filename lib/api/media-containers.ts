import { publishedVersionFromMaster } from '@/lib/mediaplan/publishedVersionGuard'
import { boundedMap } from '@/lib/utils/boundedMap'

// Track which "no data" messages have already been logged to avoid spam
const missingLineItemsLogCache = new Set<string>()

export interface MediaContainerLineItem {
  id: number
  mba_number: string
  media_plan_version: number
  placement_date?: string
  start_date?: string
  end_date?: string
  budget?: number
  cost?: number
  spend?: number
  investment?: number
  [key: string]: any // For flexibility with different media type fields
}

// Media container endpoints mapping — paths match live Xano media_plan_* tables
// (same map as MEDIA_TYPE_ENDPOINTS in app/api/mediaplans/mba/[mba_number]/route.ts)
export const MEDIA_CONTAINER_ENDPOINTS = {
  television: 'media_plan_television',
  radio: 'media_plan_radio',
  newspaper: 'media_plan_newspaper',
  magazines: 'media_plan_magazines',
  ooh: 'media_plan_ooh',
  cinema: 'media_plan_cinema',
  digitalDisplay: 'media_plan_digi_display',
  digitalAudio: 'media_plan_digi_audio',
  digitalVideo: 'media_plan_digi_video',
  bvod: 'media_plan_digi_bvod',
  integration: 'media_plan_integrations',
  search: 'media_plan_search',
  socialMedia: 'media_plan_social',
  progDisplay: 'media_plan_prog_display',
  progVideo: 'media_plan_prog_video',
  progBvod: 'media_plan_prog_bvod',
  progAudio: 'media_plan_prog_audio',
  progOoh: 'media_plan_prog_ooh',
  influencers: 'media_plan_influencers',
  production: 'media_plan_production',
}

/**
 * Fetch line items for a specific media type and MBA number
 * Queries with BOTH mba_number AND version_number when available, then filters in JavaScript as safety net
 * This ensures we check ALL entries and don't stop at the first match
 */
export async function fetchMediaContainerLineItems(
  mediaType: keyof typeof MEDIA_CONTAINER_ENDPOINTS,
  mbaNumber: string,
  versionNumber?: number
): Promise<MediaContainerLineItem[]> {
  if (!mbaNumber) return []
  const byChannel = await fetchAllPlanLineItemsForDelivery(
    mbaNumber,
    versionNumber,
    [mediaType]
  )
  return byChannel[mediaType] ?? []
}

/**
 * Bounded per-channel fan-out that never rejects: a single failing channel
 * returns [] and the rest still resolve (same degradation as the old Promise.all
 * + per-item catch inside fetchMediaContainerLineItems).
 * Exported for unit tests.
 */
export async function mapMediaContainerFetches<T extends string>(
  mediaTypes: readonly T[],
  fetchOne: (mediaType: T) => Promise<MediaContainerLineItem[]>,
  concurrency = 4
): Promise<Array<{ mediaType: T; lineItems: MediaContainerLineItem[] }>> {
  return boundedMap(
    mediaTypes,
    async (mediaType) => {
      try {
        const lineItems = await fetchOne(mediaType)
        return { mediaType, lineItems }
      } catch (e) {
        console.error(`Error fetching ${mediaType} line items:`, e)
        return { mediaType, lineItems: [] as MediaContainerLineItem[] }
      }
    },
    concurrency
  )
}

/**
 * Fetch all line items for a given MBA number across all media types
 */
export async function fetchAllMediaContainerLineItems(
  mbaNumber: string,
  versionNumber?: number,
  mediaTypeFilter?: Array<keyof typeof MEDIA_CONTAINER_ENDPOINTS>
): Promise<Record<string, MediaContainerLineItem[]>> {
  return fetchAllPlanLineItemsForDelivery(mbaNumber, versionNumber, mediaTypeFilter)
}

/** Delivery and container plan lines from Postgres `line_items`. */
export async function fetchAllPlanLineItemsForDelivery(
  mbaNumber: string,
  versionNumber?: number,
  mediaTypeFilter?: Array<keyof typeof MEDIA_CONTAINER_ENDPOINTS>
): Promise<Record<string, MediaContainerLineItem[]>> {
  const { fetchLineItemsFromPostgresByEndpoint, readPlanMasterByMba } = await import(
    '@/lib/data/readMediaPlans'
  )

  let targetVersion = versionNumber
  if (targetVersion === undefined || targetVersion === null) {
    const master = await readPlanMasterByMba(mbaNumber)
    if (!master) {
      throw new Error(`Media plan master not found for MBA number ${mbaNumber}`)
    }
    const published = publishedVersionFromMaster(master)
    if (published <= 0) {
      throw new Error(
        `Media plan master for MBA ${mbaNumber} is missing published version_number`
      )
    }
    targetVersion = published
  }

  const mediaTypes =
    mediaTypeFilter && mediaTypeFilter.length > 0
      ? mediaTypeFilter
      : (Object.keys(MEDIA_CONTAINER_ENDPOINTS) as Array<keyof typeof MEDIA_CONTAINER_ENDPOINTS>)

  const responses = await mapMediaContainerFetches(
    mediaTypes,
    async (mediaType) => {
      const rows = await fetchLineItemsFromPostgresByEndpoint(
        MEDIA_CONTAINER_ENDPOINTS[mediaType],
        mbaNumber,
        targetVersion
      )
      return rows as MediaContainerLineItem[]
    },
    4
  )

  const results: Record<string, MediaContainerLineItem[]> = {}
  responses.forEach(({ mediaType, lineItems }) => {
    results[mediaType] = lineItems
  })
  return results
}


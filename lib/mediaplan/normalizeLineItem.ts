export type NormalisedBurst = {
  startDate: string
  endDate: string
  budget: number
  deliverables: number
  deliverablesAmount: number
}

export type NormalisedLineItem = {
  lineItemId: string
  mediaType: string
  market?: string
  platform?: string
  network?: string
  station?: string
  site?: string
  publisher?: string
  title?: string
  targeting?: string
  creative?: string
  buyType?: string
  buyingDemo?: string
  totalMedia?: number
  bursts: NormalisedBurst[]
}

const DEBUG_NORMALISER = process.env.NEXT_PUBLIC_DEBUG_NORMALISER === 'true'
const DEBUG_MEDIA_PLAN = process.env.NEXT_PUBLIC_DEBUG_MEDIA_PLAN === 'true'
const BURST_KEY_SEPARATOR = '|'

export function firstNonEmpty<T>(...vals: T[]): T | '' {
  return (
    vals.find((v) => {
      if (v === null || v === undefined) return false
      if (typeof v === 'string') return v.trim().length > 0
      return Boolean(v)
    }) || ''
  )
}

function cleanLabel(value: any): string | undefined {
  const str = coerceString(value)
  if (!str) return undefined
  if (/^\s*auto\s*allocation\s*$/i.test(str)) return undefined
  if (/^\s*auto\s*$/i.test(str)) return undefined
  return str
}

function toCurrencyNumber(value: any): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]+/g, '')
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function parseBursts(raw: any): NormalisedBurst[] {
  if (raw === null || raw === undefined) return []

  let parsed: any = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return []
    }
  }

  const burstArray = Array.isArray(parsed) ? parsed : typeof parsed === 'object' ? [parsed] : []

  return burstArray
    .map((burst) => {
      const budget =
        toCurrencyNumber(burst?.budget) ??
        toCurrencyNumber(burst?.deliverablesAmount) ??
        0

      const deliverablesAmount =
        toCurrencyNumber(burst?.deliverablesAmount) ??
        toCurrencyNumber(burst?.budget) ??
        0

      const deliverables =
        toCurrencyNumber(burst?.deliverables) ??
        toCurrencyNumber(burst?.calculatedValue) ??
        0

      const startDate = burst?.startDate || burst?.start_date || ''
      const endDate = burst?.endDate || burst?.end_date || ''

      if (!startDate && !endDate) return null

      return {
        startDate,
        endDate,
        budget: budget ?? 0,
        deliverables,
        deliverablesAmount: deliverablesAmount ?? budget ?? 0,
      } as NormalisedBurst
    })
    .filter(Boolean) as NormalisedBurst[]
}

function parseRawBursts(raw: any): any[] {
  if (raw === null || raw === undefined) return []
  let parsed: any = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return []
    }
  }
  if (Array.isArray(parsed)) return parsed
  if (typeof parsed === 'object') return [parsed]
  return []
}

function collectRawBursts(item: any): any[] {
  return parseRawBursts(item?.bursts_json ?? item?.bursts)
}

function buildRawBurstKey(burst: any) {
  const start = burst?.start_date ?? burst?.startDate ?? burst?.start
  const end = burst?.end_date ?? burst?.endDate ?? burst?.end
  const budget =
    burst?.budget ??
    burst?.media_investment ??
    burst?.amount ??
    burst?.spend ??
    burst?.investment
  const buyAmount =
    burst?.buyAmount ??
    burst?.buy_amount ??
    burst?.totalMedia ??
    burst?.grossMedia

  return [start ?? '', end ?? '', budget ?? '', buyAmount ?? ''].join(BURST_KEY_SEPARATOR)
}

function shouldReplaceBase(
  current: { lineItem: number; createdAt: number },
  candidate: { lineItem: number; createdAt: number }
) {
  const currentLineValid = Number.isFinite(current.lineItem)
  const candidateLineValid = Number.isFinite(candidate.lineItem)
  if (candidateLineValid && (!currentLineValid || candidate.lineItem < current.lineItem)) return true
  if (candidateLineValid !== currentLineValid) return false

  const currentCreatedValid = Number.isFinite(current.createdAt)
  const candidateCreatedValid = Number.isFinite(candidate.createdAt)
  if (candidateCreatedValid && (!currentCreatedValid || candidate.createdAt < current.createdAt)) return true
  return false
}

function groupRawLineItems(items: any[]): any[] {
  if (!Array.isArray(items) || items.length === 0) return []

  const grouped = new Map<
    string,
    {
      base: any
      bursts: any[]
      lineItem: number
      createdAt: number
    }
  >()

  items.forEach((item, idx) => {
    const key =
      item?.line_item_id ??
      item?.lineItemId ??
      item?.line_item_id_string ??
      item?.line_item_id?.toString?.()

    const bursts = collectRawBursts(item)
    const lineItem = Number(item?.line_item)
    const createdAt = Number(item?.created_at)

    if (!key) {
      const fallbackKey = `__idx_${idx}`
      grouped.set(fallbackKey, {
        base: item,
        bursts,
        lineItem,
        createdAt,
      })
      return
    }

    const existing = grouped.get(String(key))
    if (!existing) {
      grouped.set(String(key), { base: item, bursts: [...bursts], lineItem, createdAt })
      return
    }

    existing.bursts.push(...bursts)
    if (shouldReplaceBase({ lineItem: existing.lineItem, createdAt: existing.createdAt }, { lineItem, createdAt })) {
      existing.base = item
      existing.lineItem = lineItem
      existing.createdAt = createdAt
    }
  })

  return Array.from(grouped.values()).map(({ base, bursts }) => {
    const seen = new Set<string>()
    const deduped = bursts.filter((burst) => {
      const key = buildRawBurstKey(burst)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return {
      ...base,
      bursts: deduped.length ? deduped : base?.bursts,
      bursts_json: deduped.length ? deduped : base?.bursts_json,
    }
  })
}

function bestDeliverables(item: any) {
  return (
    toCurrencyNumber(item?.deliverables) ??
    toCurrencyNumber(item?.timps) ??
    toCurrencyNumber(item?.tarps) ??
    toCurrencyNumber(item?.spots) ??
    toCurrencyNumber(item?.insertions) ??
    toCurrencyNumber(item?.screens) ??
    toCurrencyNumber(item?.impressions) ??
    toCurrencyNumber(item?.clicks) ??
    0
  )
}

function coerceString(value: any): string | undefined {
  if (value === null || value === undefined) return undefined
  const str = String(value).trim()
  return str || undefined
}

function buildBurstKey(burst: NormalisedBurst) {
  return [
    burst.startDate || '',
    burst.endDate || '',
    burst.budget ?? '',
    burst.deliverables ?? '',
    burst.deliverablesAmount ?? '',
  ].join(BURST_KEY_SEPARATOR)
}

function sortBurstsAscending(bursts: NormalisedBurst[]) {
  return [...bursts].sort((a, b) => {
    const aTime = new Date(a.startDate || '').getTime()
    const bTime = new Date(b.startDate || '').getTime()
    return aTime - bTime
  })
}

export function normaliseLineItemsByType(lineItemsByMediaType: Record<string, any[]>): Record<string, NormalisedLineItem[]> {
  const output: Record<string, NormalisedLineItem[]> = {}

  Object.entries(lineItemsByMediaType || {}).forEach(([mediaType, items]) => {
    if (!Array.isArray(items)) {
      output[mediaType] = []
      return
    }

    const groupedItems = groupRawLineItems(items)
    const normalised = groupedItems.map((item, index) => {
      const lineItemId =
        coerceString(
          firstNonEmpty(
            item?.line_item_id,
            item?.lineItemId,
            item?.line_itemId,
            item?.line_item_id_string,
            item?.line_item_id?.toString?.(),
            item?.line_item_id ?? item?.line_item_id,
            item?.id
          )
        ) || String(index)

      const market = coerceString(firstNonEmpty(item?.market, item?.state, item?.region))
      const platform = coerceString(item?.platform)
      const network = coerceString(item?.network)
      const station = coerceString(item?.station)
      const site = coerceString(item?.site)
      const creative = cleanLabel(firstNonEmpty(item?.creative, item?.ad_name, item?.adName))
      const placement = cleanLabel(firstNonEmpty(item?.placement, item?.line_item_name, item?.lineItemName))
      const daypart = cleanLabel(item?.daypart)
      const buyType = coerceString(firstNonEmpty(item?.buyType, item?.buy_type))
      const buyingDemo = coerceString(firstNonEmpty(item?.buyingDemo, item?.buying_demo))
      const titleCandidates = [
        cleanLabel(item?.title),
        placement,
        creative,
        cleanLabel(item?.adset_name),
        cleanLabel(item?.ad_set_name),
        cleanLabel(item?.name),
        cleanLabel(item?.size),
      ]
      const targetingBase = cleanLabel(
        firstNonEmpty(
          item?.targeting,
          item?.creative_targeting,
          item?.creativeTargeting,
          item?.adset_targeting,
          item?.audience
        )
      )

      const isTelevision = mediaType === 'television'
      const publisher = coerceString(
        isTelevision
          ? firstNonEmpty(cleanLabel(network), cleanLabel(station), placement)
          : firstNonEmpty(cleanLabel(platform), cleanLabel(network), cleanLabel(site), cleanLabel(station))
      )

      const title = (() => {
        if (isTelevision) {
          return (
            firstNonEmpty(placement, creative, daypart, ...titleCandidates) ||
            `Line item ${lineItemId}`
          )
        }
        return firstNonEmpty(creative, placement, ...titleCandidates) || `Line item ${lineItemId}`
      })()

      const targeting = (() => {
        if (targetingBase) return targetingBase
        if (isTelevision) return firstNonEmpty(cleanLabel(buyingDemo), daypart) || ''
        return ''
      })()

      const totalMedia =
        toCurrencyNumber(item?.totalMedia) ??
        toCurrencyNumber(item?.grossMedia) ??
        toCurrencyNumber(item?.budget) ??
        toCurrencyNumber(item?.spend)

      const burstsRaw = item?.bursts_json ?? item?.bursts
      const burstsParsed = parseBursts(burstsRaw)

      const fallbackStart =
        coerceString(item?.start_date) ||
        coerceString(item?.startDate) ||
        coerceString(item?.placement_date) ||
        ''

      const fallbackEnd =
        coerceString(item?.end_date) ||
        coerceString(item?.endDate) ||
        coerceString(item?.placement_date) ||
        fallbackStart

      const fallbackDeliverables = bestDeliverables(item)

      const bursts =
        burstsParsed.length > 0
          ? burstsParsed
          : [
              {
                startDate: fallbackStart,
                endDate: fallbackEnd,
                budget: totalMedia ?? 0,
                deliverablesAmount: totalMedia ?? 0,
                deliverables: fallbackDeliverables,
              },
            ]

      const normalisedItem: NormalisedLineItem = {
        lineItemId,
        mediaType,
        market,
        platform,
        network,
        station,
        site,
        publisher,
        title: coerceString(title),
        targeting: targeting || undefined,
        creative: creative || coerceString(item?.creative),
        buyType,
        buyingDemo,
        totalMedia: totalMedia ?? undefined,
        bursts: bursts.map((burst) => ({
          ...burst,
          startDate: burst.startDate || fallbackStart || '',
          endDate: burst.endDate || burst.startDate || fallbackEnd || fallbackStart || '',
          budget: toCurrencyNumber(burst.budget) ?? 0,
          deliverables: toCurrencyNumber(burst.deliverables) ?? 0,
          deliverablesAmount: toCurrencyNumber(burst.deliverablesAmount) ?? toCurrencyNumber(burst.budget) ?? 0,
        })),
      }

      if (DEBUG_NORMALISER && !normalisedItem.publisher && !normalisedItem.title) {
        console.warn('Normaliser missing publisher/title', {
          mediaType,
          lineItemId,
          original: item,
        })
      }

      if (DEBUG_MEDIA_PLAN) {
        console.log('[normalizeLineItem]', mediaType, item, normalisedItem)
      }

      return normalisedItem
    })

    output[mediaType] = normalised
  })

  return output
}

export function groupByLineItemId(items: any[], mediaType: string): NormalisedLineItem[] {
  if (!Array.isArray(items) || !items.length) return []

  const grouped = new Map<
    string,
    {
      base: NormalisedLineItem
      bursts: NormalisedBurst[]
    }
  >()

  items.forEach((rawItem, idx) => {
    const stableId =
      rawItem?.line_item_id ??
      rawItem?.lineItemId ??
      rawItem?.line_itemId ??
      rawItem?.line_item_id?.toString?.()

    const normalised = normaliseLineItemsByType({ [mediaType]: [rawItem] })[mediaType]?.[0]
    if (!normalised) return

    const key = String(stableId ?? normalised.lineItemId ?? idx)

    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, { base: normalised, bursts: [...normalised.bursts] })
      return
    }

    existing.bursts.push(...normalised.bursts)
  })

  const deduped: NormalisedLineItem[] = []

  grouped.forEach(({ base, bursts }) => {
    const seen = new Set<string>()
    const uniqueBursts = bursts.filter((burst) => {
      const burstKey = buildBurstKey(burst)
      if (seen.has(burstKey)) return false
      seen.add(burstKey)
      return true
    })

    const sortedBursts = sortBurstsAscending(uniqueBursts)

    deduped.push({
      ...base,
      bursts: sortedBursts,
    })
  })

  return deduped
}

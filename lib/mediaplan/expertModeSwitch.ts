import type {
  BvodExpertScheduleRow,
  DigiVideoExpertScheduleRow,
  DigitalAudioExpertScheduleRow,
  DigitalDisplayExpertScheduleRow,
  InfluencersExpertScheduleRow,
  IntegrationExpertScheduleRow,
  SearchExpertScheduleRow,
  SocialMediaExpertScheduleRow,
  OohExpertScheduleRow,
  RadioExpertScheduleRow,
  TelevisionExpertScheduleRow,
  NewspaperExpertScheduleRow,
  MagazinesExpertScheduleRow,
  ProgAudioExpertScheduleRow,
  ProgBvodExpertScheduleRow,
  ProgDisplayExpertScheduleRow,
  ProgVideoExpertScheduleRow,
  ProgOohExpertScheduleRow,
} from "./expertModeWeeklySchedule.js"
import type {
  StandardBvodFormLineItem,
  StandardDigiAudioFormLineItem,
  StandardDigiDisplayFormLineItem,
  StandardInfluencersFormLineItem,
  StandardIntegrationFormLineItem,
  StandardSearchFormLineItem,
  StandardSocialMediaFormLineItem,
  StandardDigiVideoFormLineItem,
  StandardOohFormLineItem,
  StandardRadioFormLineItem,
  StandardTelevisionFormLineItem,
  StandardNewspaperFormLineItem,
  StandardMagazineFormLineItem,
  StandardProgAudioFormLineItem,
  StandardProgBvodFormLineItem,
  StandardProgDisplayFormLineItem,
  StandardProgVideoFormLineItem,
  StandardProgOohFormLineItem,
} from "./expertOohRadioMappings.js"

function isoDate(d: Date | string | undefined): string {
  if (d === undefined) return ""
  const x = d instanceof Date ? d : new Date(d)
  return Number.isNaN(x.getTime()) ? "" : x.toISOString()
}

/** Stable key for matching standard line items across expert ↔ standard conversions. */
export function stableStandardLineItemKey(
  item: {
    line_item_id?: string
    lineItemId?: string
    line_item?: number | string
    lineItem?: number | string
  },
  indexFallback: number
): string {
  const raw = item.line_item_id ?? item.lineItemId
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    return String(raw).trim()
  }
  const n = item.line_item ?? item.lineItem
  if (n !== undefined && n !== null && String(n).trim() !== "") {
    return `line:${String(n).trim()}`
  }
  return `idx:${indexFallback}`
}

/**
 * After expert→standard generation, re-apply standard-only fields from the prior form state
 * by matching {@link stableStandardLineItemKey} (not array index).
 */
export function mergeOohStandardFromExpertWithPrevious(
  generated: StandardOohFormLineItem[],
  previous: StandardOohFormLineItem[]
): StandardOohFormLineItem[] {
  const prevByKey = new Map<string, StandardOohFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      noAdserving: prev.noAdserving,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeTelevisionStandardFromExpertWithPrevious(
  generated: StandardTelevisionFormLineItem[],
  previous: StandardTelevisionFormLineItem[]
): StandardTelevisionFormLineItem[] {
  const prevByKey = new Map<string, StandardTelevisionFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      fixedCostMedia: prev.fixedCostMedia,
      clientPaysForMedia: prev.clientPaysForMedia,
      // Keep expert-derived `budgetIncludesFees` on `li`.
      noadserving: prev.noadserving,
      bidStrategy: prev.bidStrategy ?? "",
      creativeTargeting: prev.creativeTargeting ?? "",
      creative: prev.creative ?? "",
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeRadioStandardFromExpertWithPrevious(
  generated: StandardRadioFormLineItem[],
  previous: StandardRadioFormLineItem[]
): StandardRadioFormLineItem[] {
  const prevByKey = new Map<string, StandardRadioFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      fixedCostMedia: prev.fixedCostMedia,
      clientPaysForMedia: prev.clientPaysForMedia,
      // Keep expert-derived `budgetIncludesFees` on `li` (do not restore from previous).
      noadserving: prev.noadserving,
      bidStrategy: prev.bidStrategy ?? "",
      platform: prev.platform ?? "",
      creativeTargeting: prev.creativeTargeting ?? "",
      creative: prev.creative ?? "",
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeNewspaperStandardFromExpertWithPrevious(
  generated: StandardNewspaperFormLineItem[],
  previous: StandardNewspaperFormLineItem[]
): StandardNewspaperFormLineItem[] {
  const prevByKey = new Map<string, StandardNewspaperFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      fixedCostMedia: prev.fixedCostMedia,
      clientPaysForMedia: prev.clientPaysForMedia,
      budgetIncludesFees: prev.budgetIncludesFees,
      noadserving: prev.noadserving,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeMagazineStandardFromExpertWithPrevious(
  generated: StandardMagazineFormLineItem[],
  previous: StandardMagazineFormLineItem[]
): StandardMagazineFormLineItem[] {
  const prevByKey = new Map<string, StandardMagazineFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      fixedCostMedia: prev.fixedCostMedia,
      clientPaysForMedia: prev.clientPaysForMedia,
      budgetIncludesFees: prev.budgetIncludesFees,
      noadserving: prev.noadserving,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeBvodStandardFromExpertWithPrevious(
  generated: StandardBvodFormLineItem[],
  previous: StandardBvodFormLineItem[]
): StandardBvodFormLineItem[] {
  const prevByKey = new Map<string, StandardBvodFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      noadserving: prev.noadserving,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeDigiVideoStandardFromExpertWithPrevious(
  generated: StandardDigiVideoFormLineItem[],
  previous: StandardDigiVideoFormLineItem[]
): StandardDigiVideoFormLineItem[] {
  const prevByKey = new Map<string, StandardDigiVideoFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      noadserving: prev.noadserving,
      targetingAttribute: prev.targetingAttribute ?? "",
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeDigiDisplayStandardFromExpertWithPrevious(
  generated: StandardDigiDisplayFormLineItem[],
  previous: StandardDigiDisplayFormLineItem[]
): StandardDigiDisplayFormLineItem[] {
  const prevByKey = new Map<string, StandardDigiDisplayFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      noadserving: prev.noadserving,
      targetingAttribute: prev.targetingAttribute ?? li.targetingAttribute ?? "",
      placement: prev.placement ?? li.placement ?? "",
      size: prev.size ?? li.size ?? "",
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeDigiAudioStandardFromExpertWithPrevious(
  generated: StandardDigiAudioFormLineItem[],
  previous: StandardDigiAudioFormLineItem[]
): StandardDigiAudioFormLineItem[] {
  const prevByKey = new Map<string, StandardDigiAudioFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      noadserving: prev.noadserving,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeSocialMediaStandardFromExpertWithPrevious(
  generated: StandardSocialMediaFormLineItem[],
  previous: StandardSocialMediaFormLineItem[]
): StandardSocialMediaFormLineItem[] {
  const prevByKey = new Map<string, StandardSocialMediaFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      noadserving: prev.noadserving,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeSearchStandardFromExpertWithPrevious(
  generated: StandardSearchFormLineItem[],
  previous: StandardSearchFormLineItem[]
): StandardSearchFormLineItem[] {
  const prevByKey = new Map<string, StandardSearchFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      noadserving: prev.noadserving,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeInfluencersStandardFromExpertWithPrevious(
  generated: StandardInfluencersFormLineItem[],
  previous: StandardInfluencersFormLineItem[]
): StandardInfluencersFormLineItem[] {
  const prevByKey = new Map<string, StandardInfluencersFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      noadserving: prev.noadserving,
      creative: prev.creative ?? li.creative,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeIntegrationStandardFromExpertWithPrevious(
  generated: StandardIntegrationFormLineItem[],
  previous: StandardIntegrationFormLineItem[]
): StandardIntegrationFormLineItem[] {
  const prevByKey = new Map<string, StandardIntegrationFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      noAdserving: prev.noAdserving,
      creative: prev.creative ?? li.creative,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function serializeOohStandardLineItemsBaseline(
  items: StandardOohFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      network: li.network,
      format: li.format,
      buyType: li.buyType,
      type: li.type,
      placement: li.placement,
      size: li.size,
      buyingDemo: li.buyingDemo,
      market: li.market,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noAdserving: li.noAdserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: (li.bursts ?? []).map((b) => ({
        budget: b.budget,
        buyAmount: b.buyAmount,
        startDate: isoDate(b.startDate),
        endDate: isoDate(b.endDate),
        calculatedValue: b.calculatedValue,
        fee: b.fee,
      })),
    }))
  )
}

export function serializeTelevisionStandardLineItemsBaseline(
  items: StandardTelevisionFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      market: li.market,
      network: li.network,
      station: li.station,
      daypart: li.daypart,
      placement: li.placement,
      buyType: li.buyType,
      buyingDemo: li.buyingDemo,
      bidStrategy: li.bidStrategy,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: (li.bursts ?? []).map((b) => ({
        budget: b.budget,
        buyAmount: b.buyAmount,
        startDate: isoDate(b.startDate),
        endDate: isoDate(b.endDate),
        calculatedValue: b.calculatedValue,
        fee: b.fee,
        size: (b as { size?: string }).size,
        tarps: (b as { tarps?: string }).tarps,
      })),
    }))
  )
}

export function serializeRadioStandardLineItemsBaseline(
  items: StandardRadioFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      network: li.network,
      station: li.station,
      buyType: li.buyType,
      bidStrategy: li.bidStrategy,
      placement: li.placement,
      format: li.format,
      duration: li.duration,
      buyingDemo: li.buyingDemo,
      market: li.market,
      platform: li.platform,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: (li.bursts ?? []).map((b) => ({
        budget: b.budget,
        buyAmount: b.buyAmount,
        startDate: isoDate(b.startDate),
        endDate: isoDate(b.endDate),
        calculatedValue: b.calculatedValue,
        fee: b.fee,
      })),
    }))
  )
}

export function serializeOohExpertRowsBaseline(rows: OohExpertScheduleRow[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      market: r.market,
      network: r.network,
      format: r.format,
      type: r.type,
      placement: r.placement,
      startDate: r.startDate,
      endDate: r.endDate,
      size: r.size,
      panels: r.panels,
      buyingDemo: r.buyingDemo,
      buyType: r.buyType,
      fixedCostMedia: r.fixedCostMedia,
      clientPaysForMedia: r.clientPaysForMedia,
      budgetIncludesFees: r.budgetIncludesFees,
      unitRate: r.unitRate,
      grossCost: r.grossCost,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeRadioExpertRowsBaseline(rows: RadioExpertScheduleRow[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      network: r.network,
      station: r.station,
      market: r.market,
      placement: r.placement,
      duration: r.duration,
      format: r.format,
      buyingDemo: r.buyingDemo,
      buyType: r.buyType,
      fixedCostMedia: r.fixedCostMedia,
      clientPaysForMedia: r.clientPaysForMedia,
      budgetIncludesFees: r.budgetIncludesFees,
      unitRate: r.unitRate,
      grossCost: r.grossCost,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeTelevisionExpertRowsBaseline(
  rows: TelevisionExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      market: r.market,
      network: r.network,
      station: r.station,
      daypart: r.daypart,
      placement: r.placement,
      buyType: r.buyType,
      buyingDemo: r.buyingDemo,
      size: r.size,
      tarps: r.tarps,
      fixedCostMedia: r.fixedCostMedia,
      clientPaysForMedia: r.clientPaysForMedia,
      budgetIncludesFees: r.budgetIncludesFees,
      startDate: r.startDate,
      endDate: r.endDate,
      unitRate: r.unitRate,
      grossCost: r.grossCost,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeBvodStandardLineItemsBaseline(
  items: StandardBvodFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      platform: li.platform,
      site: li.site,
      bidStrategy: li.bidStrategy,
      buyType: li.buyType,
      publisher: li.publisher,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      buyingDemo: li.buyingDemo,
      market: li.market,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: (li.bursts ?? []).map((b) => ({
        budget: b.budget,
        buyAmount: b.buyAmount,
        startDate: isoDate(b.startDate),
        endDate: isoDate(b.endDate),
        calculatedValue: b.calculatedValue,
        fee: b.fee,
      })),
    }))
  )
}

export function serializeBvodExpertRowsBaseline(rows: BvodExpertScheduleRow[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      platform: r.platform,
      publisher: r.publisher,
      site: r.site,
      bidStrategy: r.bidStrategy,
      buyType: r.buyType,
      creativeTargeting: r.creativeTargeting,
      creative: r.creative,
      buyingDemo: r.buyingDemo,
      market: r.market,
      fixedCostMedia: r.fixedCostMedia,
      clientPaysForMedia: r.clientPaysForMedia,
      budgetIncludesFees: r.budgetIncludesFees,
      unitRate: r.unitRate,
      grossCost: r.grossCost,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeDigiVideoStandardLineItemsBaseline(
  items: StandardDigiVideoFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      platform: li.platform,
      site: li.site,
      bidStrategy: li.bidStrategy,
      buyType: li.buyType,
      publisher: li.publisher,
      placement: li.placement,
      size: li.size,
      targetingAttribute: li.targetingAttribute,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      buyingDemo: li.buyingDemo,
      market: li.market,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: (li.bursts ?? []).map((b) => ({
        budget: b.budget,
        buyAmount: b.buyAmount,
        startDate: isoDate(b.startDate),
        endDate: isoDate(b.endDate),
        calculatedValue: b.calculatedValue,
        fee: b.fee,
      })),
    }))
  )
}

export function serializeDigiVideoExpertRowsBaseline(
  rows: DigiVideoExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      platform: r.platform,
      publisher: r.publisher,
      site: r.site,
      bidStrategy: r.bidStrategy,
      buyType: r.buyType,
      placement: r.placement,
      size: r.size,
      creativeTargeting: r.creativeTargeting,
      creative: r.creative,
      buyingDemo: r.buyingDemo,
      market: r.market,
      fixedCostMedia: r.fixedCostMedia,
      clientPaysForMedia: r.clientPaysForMedia,
      budgetIncludesFees: r.budgetIncludesFees,
      unitRate: r.unitRate,
      grossCost: r.grossCost,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeDigiDisplayStandardLineItemsBaseline(
  items: StandardDigiDisplayFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      platform: li.platform,
      site: li.site,
      buyType: li.buyType,
      publisher: li.publisher,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      buyingDemo: li.buyingDemo,
      market: li.market,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      placement: li.placement,
      size: li.size,
      targetingAttribute: li.targetingAttribute,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: (li.bursts ?? []).map((b) => ({
        budget: b.budget,
        buyAmount: b.buyAmount,
        startDate: isoDate(b.startDate),
        endDate: isoDate(b.endDate),
        calculatedValue: b.calculatedValue,
        fee: b.fee,
      })),
    }))
  )
}

export function serializeDigiDisplayExpertRowsBaseline(
  rows: DigitalDisplayExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      platform: r.platform,
      publisher: r.publisher,
      site: r.site,
      buyType: r.buyType,
      creativeTargeting: r.creativeTargeting,
      creative: r.creative,
      buyingDemo: r.buyingDemo,
      market: r.market,
      fixedCostMedia: r.fixedCostMedia,
      clientPaysForMedia: r.clientPaysForMedia,
      budgetIncludesFees: r.budgetIncludesFees,
      unitRate: r.unitRate,
      grossCost: r.grossCost,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeDigiAudioStandardLineItemsBaseline(
  items: StandardDigiAudioFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      platform: li.platform,
      site: li.site,
      bidStrategy: li.bidStrategy,
      buyType: li.buyType,
      publisher: li.publisher,
      targetingAttribute: li.targetingAttribute,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      buyingDemo: li.buyingDemo,
      market: li.market,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: (li.bursts ?? []).map((b) => ({
        budget: b.budget,
        buyAmount: b.buyAmount,
        startDate: isoDate(b.startDate),
        endDate: isoDate(b.endDate),
        calculatedValue: b.calculatedValue,
        fee: b.fee,
      })),
    }))
  )
}

export function serializeDigiAudioExpertRowsBaseline(
  rows: DigitalAudioExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      platform: r.platform,
      publisher: r.publisher,
      site: r.site,
      bidStrategy: r.bidStrategy,
      buyType: r.buyType,
      targetingAttribute: r.targetingAttribute,
      creativeTargeting: r.creativeTargeting,
      creative: r.creative,
      buyingDemo: r.buyingDemo,
      market: r.market,
      fixedCostMedia: r.fixedCostMedia,
      clientPaysForMedia: r.clientPaysForMedia,
      budgetIncludesFees: r.budgetIncludesFees,
      unitRate: r.unitRate,
      grossCost: r.grossCost,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeSocialMediaStandardLineItemsBaseline(
  items: StandardSocialMediaFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      platform: li.platform,
      bidStrategy: li.bidStrategy,
      buyType: li.buyType,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      buyingDemo: li.buyingDemo,
      market: li.market,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: (li.bursts ?? []).map((b) => ({
        budget: b.budget,
        buyAmount: b.buyAmount,
        startDate: isoDate(b.startDate),
        endDate: isoDate(b.endDate),
        calculatedValue: b.calculatedValue,
        fee: b.fee,
      })),
    }))
  )
}

export function serializeSocialMediaExpertRowsBaseline(
  rows: SocialMediaExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      platform: r.platform,
      bidStrategy: r.bidStrategy,
      buyType: r.buyType,
      creativeTargeting: r.creativeTargeting,
      creative: r.creative,
      buyingDemo: r.buyingDemo,
      market: r.market,
      fixedCostMedia: r.fixedCostMedia,
      clientPaysForMedia: r.clientPaysForMedia,
      budgetIncludesFees: r.budgetIncludesFees,
      unitRate: r.unitRate,
      grossCost: r.grossCost,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeSearchStandardLineItemsBaseline(
  items: StandardSearchFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      platform: li.platform,
      bidStrategy: li.bidStrategy,
      buyType: li.buyType,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      buyingDemo: li.buyingDemo,
      market: li.market,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: (li.bursts ?? []).map((b) => ({
        budget: b.budget,
        buyAmount: b.buyAmount,
        startDate: isoDate(b.startDate),
        endDate: isoDate(b.endDate),
        calculatedValue: b.calculatedValue,
        fee: b.fee,
      })),
    }))
  )
}

export function serializeSearchExpertRowsBaseline(
  rows: SearchExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      platform: r.platform,
      bidStrategy: r.bidStrategy,
      buyType: r.buyType,
      creativeTargeting: r.creativeTargeting,
      creative: r.creative,
      buyingDemo: r.buyingDemo,
      market: r.market,
      fixedCostMedia: r.fixedCostMedia,
      clientPaysForMedia: r.clientPaysForMedia,
      budgetIncludesFees: r.budgetIncludesFees,
      unitRate: r.unitRate,
      grossCost: r.grossCost,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeInfluencersStandardLineItemsBaseline(
  items: StandardInfluencersFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      platform: li.platform,
      objective: li.objective,
      campaign: li.campaign,
      bidStrategy: li.bidStrategy,
      buyType: li.buyType,
      targetingAttribute: li.targetingAttribute,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      buyingDemo: li.buyingDemo,
      market: li.market,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: (li.bursts ?? []).map((b) => ({
        budget: b.budget,
        buyAmount: b.buyAmount,
        startDate: isoDate(b.startDate),
        endDate: isoDate(b.endDate),
        calculatedValue: b.calculatedValue,
        fee: b.fee,
      })),
    }))
  )
}

export function serializeInfluencersExpertRowsBaseline(
  rows: InfluencersExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      platform: r.platform,
      objective: r.objective,
      campaign: r.campaign,
      bidStrategy: r.bidStrategy,
      buyType: r.buyType,
      targetingAttribute: r.targetingAttribute,
      creativeTargeting: r.creativeTargeting,
      creative: r.creative,
      buyingDemo: r.buyingDemo,
      market: r.market,
      fixedCostMedia: r.fixedCostMedia,
      clientPaysForMedia: r.clientPaysForMedia,
      budgetIncludesFees: r.budgetIncludesFees,
      unitRate: r.unitRate,
      grossCost: r.grossCost,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeIntegrationStandardLineItemsBaseline(
  items: StandardIntegrationFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      platform: li.platform,
      objective: li.objective,
      campaign: li.campaign,
      bidStrategy: li.bidStrategy,
      buyType: li.buyType,
      targetingAttribute: li.targetingAttribute,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      buyingDemo: li.buyingDemo,
      market: li.market,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noAdserving: li.noAdserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: (li.bursts ?? []).map((b) => ({
        budget: b.budget,
        buyAmount: b.buyAmount,
        startDate: isoDate(b.startDate),
        endDate: isoDate(b.endDate),
        calculatedValue: b.calculatedValue,
        fee: b.fee,
      })),
    }))
  )
}

export function serializeIntegrationExpertRowsBaseline(
  rows: IntegrationExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      platform: r.platform,
      objective: r.objective,
      campaign: r.campaign,
      bidStrategy: r.bidStrategy,
      buyType: r.buyType,
      targetingAttribute: r.targetingAttribute,
      creativeTargeting: r.creativeTargeting,
      creative: r.creative,
      buyingDemo: r.buyingDemo,
      market: r.market,
      fixedCostMedia: r.fixedCostMedia,
      clientPaysForMedia: r.clientPaysForMedia,
      budgetIncludesFees: r.budgetIncludesFees,
      unitRate: r.unitRate,
      grossCost: r.grossCost,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeNewspaperStandardLineItemsBaseline(
  items: StandardNewspaperFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      network: li.network,
      publisher: li.publisher,
      title: li.title,
      buyType: li.buyType,
      size: li.size,
      format: li.format,
      placement: li.placement,
      buyingDemo: li.buyingDemo,
      market: li.market,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: (li.bursts ?? []).map((b) => ({
        budget: b.budget,
        buyAmount: b.buyAmount,
        startDate: isoDate(b.startDate),
        endDate: isoDate(b.endDate),
        calculatedValue: b.calculatedValue,
        fee: b.fee,
      })),
    }))
  )
}

export function serializeNewspaperExpertRowsBaseline(
  rows: NewspaperExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      network: r.network,
      publisher: r.publisher,
      title: r.title,
      buyType: r.buyType,
      size: r.size,
      format: r.format,
      placement: r.placement,
      buyingDemo: r.buyingDemo,
      market: r.market,
      fixedCostMedia: r.fixedCostMedia,
      clientPaysForMedia: r.clientPaysForMedia,
      budgetIncludesFees: r.budgetIncludesFees,
      unitRate: r.unitRate,
      grossCost: r.grossCost,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeMagazineStandardLineItemsBaseline(
  items: StandardMagazineFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      network: li.network,
      title: li.title,
      buyType: li.buyType,
      size: li.size,
      publisher: li.publisher,
      placement: li.placement,
      buyingDemo: li.buyingDemo,
      market: li.market,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: (li.bursts ?? []).map((b) => ({
        budget: b.budget,
        buyAmount: b.buyAmount,
        startDate: isoDate(b.startDate),
        endDate: isoDate(b.endDate),
        calculatedValue: b.calculatedValue,
        fee: b.fee,
      })),
    }))
  )
}

export function serializeMagazinesExpertRowsBaseline(
  rows: MagazinesExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      network: r.network,
      title: r.title,
      buyType: r.buyType,
      size: r.size,
      publisher: r.publisher,
      placement: r.placement,
      buyingDemo: r.buyingDemo,
      market: r.market,
      fixedCostMedia: r.fixedCostMedia,
      clientPaysForMedia: r.clientPaysForMedia,
      budgetIncludesFees: r.budgetIncludesFees,
      unitRate: r.unitRate,
      grossCost: r.grossCost,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function mergeProgAudioStandardFromExpertWithPrevious(
  generated: StandardProgAudioFormLineItem[],
  previous: StandardProgAudioFormLineItem[]
): StandardProgAudioFormLineItem[] {
  const prevByKey = new Map<string, StandardProgAudioFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      site: prev.site ?? li.site,
      placement: prev.placement ?? li.placement,
      targetingAttribute: prev.targetingAttribute ?? li.targetingAttribute,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeProgBvodStandardFromExpertWithPrevious(
  generated: StandardProgBvodFormLineItem[],
  previous: StandardProgBvodFormLineItem[]
): StandardProgBvodFormLineItem[] {
  const prevByKey = new Map<string, StandardProgBvodFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeProgDisplayStandardFromExpertWithPrevious(
  generated: StandardProgDisplayFormLineItem[],
  previous: StandardProgDisplayFormLineItem[]
): StandardProgDisplayFormLineItem[] {
  const prevByKey = new Map<string, StandardProgDisplayFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      site: prev.site ?? li.site,
      placement: prev.placement ?? li.placement,
      size: prev.size ?? li.size,
      targetingAttribute: prev.targetingAttribute ?? li.targetingAttribute,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeProgVideoStandardFromExpertWithPrevious(
  generated: StandardProgVideoFormLineItem[],
  previous: StandardProgVideoFormLineItem[]
): StandardProgVideoFormLineItem[] {
  const prevByKey = new Map<string, StandardProgVideoFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      site: prev.site ?? li.site,
      placement: prev.placement ?? li.placement,
      size: prev.size ?? li.size,
      targetingAttribute: prev.targetingAttribute ?? li.targetingAttribute,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

export function mergeProgOohStandardFromExpertWithPrevious(
  generated: StandardProgOohFormLineItem[],
  previous: StandardProgOohFormLineItem[]
): StandardProgOohFormLineItem[] {
  const prevByKey = new Map<string, StandardProgOohFormLineItem>()
  for (let i = 0; i < previous.length; i++) {
    const p = previous[i]!
    prevByKey.set(stableStandardLineItemKey(p, i), p)
  }
  return generated.map((li, i) => {
    const k = stableStandardLineItemKey(li, i)
    const prev = prevByKey.get(k)
    if (!prev) return li
    return {
      ...li,
      environment: prev.environment ?? li.environment,
      format: prev.format ?? li.format,
      location: prev.location ?? li.location,
      placement: prev.placement ?? li.placement,
      size: prev.size ?? li.size,
      targetingAttribute: prev.targetingAttribute ?? li.targetingAttribute,
      line_item: prev.line_item ?? prev.lineItem ?? li.line_item,
      lineItem: prev.lineItem ?? prev.line_item ?? li.lineItem,
    }
  })
}

function serializeProgStandardBursts(
  bursts: StandardProgAudioFormLineItem["bursts"]
) {
  return (bursts ?? []).map((b) => ({
    budget: b.budget,
    buyAmount: b.buyAmount,
    startDate: isoDate(b.startDate),
    endDate: isoDate(b.endDate),
    calculatedValue: b.calculatedValue,
    fee: b.fee,
  }))
}

export function serializeProgAudioStandardLineItemsBaseline(
  items: StandardProgAudioFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      platform: li.platform,
      bidStrategy: li.bidStrategy,
      buyType: li.buyType,
      site: li.site,
      placement: li.placement,
      targetingAttribute: li.targetingAttribute,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      buyingDemo: li.buyingDemo,
      market: li.market,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: serializeProgStandardBursts(li.bursts),
    }))
  )
}

export function serializeProgAudioExpertRowsBaseline(
  rows: ProgAudioExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      ...r,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeProgBvodStandardLineItemsBaseline(
  items: StandardProgBvodFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      platform: li.platform,
      bidStrategy: li.bidStrategy,
      buyType: li.buyType,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      buyingDemo: li.buyingDemo,
      market: li.market,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: serializeProgStandardBursts(li.bursts),
    }))
  )
}

export function serializeProgBvodExpertRowsBaseline(
  rows: ProgBvodExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      ...r,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeProgDisplayStandardLineItemsBaseline(
  items: StandardProgDisplayFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      platform: li.platform,
      bidStrategy: li.bidStrategy,
      buyType: li.buyType,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      buyingDemo: li.buyingDemo,
      market: li.market,
      site: li.site,
      placement: li.placement,
      size: li.size,
      targetingAttribute: li.targetingAttribute,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: serializeProgStandardBursts(li.bursts),
    }))
  )
}

export function serializeProgDisplayExpertRowsBaseline(
  rows: ProgDisplayExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      ...r,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeProgVideoStandardLineItemsBaseline(
  items: StandardProgVideoFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      platform: li.platform,
      bidStrategy: li.bidStrategy,
      buyType: li.buyType,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      buyingDemo: li.buyingDemo,
      market: li.market,
      site: li.site,
      placement: li.placement,
      size: li.size,
      targetingAttribute: li.targetingAttribute,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: serializeProgStandardBursts(li.bursts),
    }))
  )
}

export function serializeProgVideoExpertRowsBaseline(
  rows: ProgVideoExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      ...r,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

export function serializeProgOohStandardLineItemsBaseline(
  items: StandardProgOohFormLineItem[] | undefined
): string {
  const list = items ?? []
  return JSON.stringify(
    list.map((li) => ({
      platform: li.platform,
      bidStrategy: li.bidStrategy,
      buyType: li.buyType,
      creativeTargeting: li.creativeTargeting,
      creative: li.creative,
      buyingDemo: li.buyingDemo,
      market: li.market,
      environment: li.environment,
      format: li.format,
      location: li.location,
      targetingAttribute: li.targetingAttribute,
      placement: li.placement,
      size: li.size,
      fixedCostMedia: li.fixedCostMedia,
      clientPaysForMedia: li.clientPaysForMedia,
      budgetIncludesFees: li.budgetIncludesFees,
      noadserving: li.noadserving,
      lineItemId: li.lineItemId,
      line_item_id: li.line_item_id,
      line_item: li.line_item,
      lineItem: li.lineItem,
      bursts: serializeProgStandardBursts(li.bursts),
    }))
  )
}

export function serializeProgOohExpertRowsBaseline(
  rows: ProgOohExpertScheduleRow[]
): string {
  return JSON.stringify(
    rows.map((r) => ({
      ...r,
      weeklyValues: r.weeklyValues,
      mergedWeekSpans: r.mergedWeekSpans,
    }))
  )
}

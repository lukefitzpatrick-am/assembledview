import { addGst } from "@/lib/finance/gst"
import { fromCents, parseMoney, toCents } from "@/lib/money"
import type { LineItem, MediaItems } from "@/lib/generateMediaPlan"
import type { Publisher } from "@/lib/types/publisher"
import {
  buildPublisherNameIndex,
  resolvePublisherName,
  type PublisherNameIndex,
} from "@/lib/publisher/resolvePublisherName"

/** Excel MBA block labels per `MediaItems` key — keep aligned with `KPI_MEDIA_LABELS` in `lib/generateMediaPlan.ts`. */
const MEDIA_ITEMS_EXCEL_LABELS: Record<keyof MediaItems, string> = {
  television: "Television",
  radio: "Radio",
  newspaper: "Newspaper",
  magazines: "Magazines",
  ooh: "OOH",
  cinema: "Cinema",
  digiDisplay: "Digital Display",
  digiAudio: "Digital Audio",
  digiVideo: "Digital Video",
  bvod: "BVOD",
  integration: "Integration",
  influencers: "Influencers",
  search: "Search",
  socialMedia: "Social Media",
  progDisplay: "Programmatic Display",
  progVideo: "Programmatic Video",
  progBvod: "Programmatic BVOD",
  progAudio: "Programmatic Audio",
  progOoh: "Programmatic OOH",
  production: "Production",
}

const MEDIA_ITEMS_ORDER: (keyof MediaItems)[] = [
  "television",
  "radio",
  "newspaper",
  "magazines",
  "ooh",
  "cinema",
  "digiDisplay",
  "digiAudio",
  "digiVideo",
  "bvod",
  "integration",
  "influencers",
  "search",
  "socialMedia",
  "progDisplay",
  "progVideo",
  "progBvod",
  "progAudio",
  "progOoh",
  "production",
]

export type AdvertisingAssociatesMbaData = {
  gross_media: { media_type: string; gross_amount: number }[]
  totals: {
    gross_media: number
    service_fee: number
    production: number
    adserving: number
    totals_ex_gst: number
    total_inc_gst: number
  }
}

/** Same filter as media plan Excel export (bonus lines or any monetary/deliverable signal). */
export function shouldIncludeMediaPlanLineItem(item: LineItem): boolean {
  const buyType = (item.buyType || "").toLowerCase()
  const budgetValue = parseMoney(item.deliverablesAmount) ?? 0
  const deliverablesValue = parseFloat(String(item.deliverables ?? "").replace(/[^0-9.]/g, "")) || 0
  const grossValue = parseMoney(item.grossMedia) ?? 0
  return buyType === "bonus" || budgetValue > 0 || deliverablesValue > 0 || grossValue > 0
}

export function isAdvertisingAssociatesPublisher(p: Publisher): boolean {
  const v = String(p.billingagency ?? "").trim().toLowerCase()
  return v === "advertising associates"
}

function publisherNameKeysFromLineItem(item: LineItem): string[] {
  const out: string[] = []
  for (const raw of [item.network, item.platform, item.site]) {
    const s = typeof raw === "string" ? raw.trim() : ""
    if (s) out.push(s)
  }
  return out
}

type PublisherIndex = PublisherNameIndex<Publisher>

/**
 * Shared resolver (`lib/publisher/resolvePublisherName.ts`): name first
 * (case-insensitive, trimmed, lowest `publishers.id` when shared), then the
 * read-time alias table ("SCA" -> Southern Cross Austereo, "NOVA" -> Nova),
 * then the publisher id. An id shared by two publishers never matches.
 * Publisher names and ids are unique (docs/brain/INVARIANTS.md).
 */
function buildPublisherNameMap(publishers: Publisher[]): PublisherIndex {
  return buildPublisherNameIndex(publishers)
}

function resolvePublisherByName(
  name: string,
  index: PublisherIndex,
): Publisher | undefined {
  return resolvePublisherName(name, index)
}

/** Publisher lookup by name or publisherid, for callers outside this module. */
export function publisherResolver(
  publishers: Publisher[],
): (name: string) => Publisher | undefined {
  const index = buildPublisherNameMap(publishers)
  return (name: string) => {
    const trimmed = String(name ?? "").trim()
    return trimmed ? resolvePublisherByName(trimmed, index) : undefined
  }
}

/**
 * True when any included line item's network/platform/site matches a Xano publisher
 * with billingagency "advertising associates".
 */
export function planHasAdvertisingAssociatesLineItem(
  mediaItems: MediaItems,
  publishers: Publisher[],
  shouldInclude: (item: LineItem) => boolean,
): boolean {
  const byName = buildPublisherNameMap(publishers)
  for (const items of Object.values(mediaItems)) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!shouldInclude(item)) continue
      for (const key of publisherNameKeysFromLineItem(item)) {
        const pub = resolvePublisherByName(key, byName)
        if (pub && isAdvertisingAssociatesPublisher(pub)) return true
      }
    }
  }
  return false
}

/** Gross media amount from a line item (currency-stripped). */
export function parseLineItemGrossMedia(item: LineItem): number {
  const raw = item.grossMedia ?? item.deliverablesAmount ?? 0
  return parseFloat(String(raw).replace(/[^0-9.-]/g, "")) || 0
}

/**
 * True when network/platform/site resolves to a publisher with
 * `billingagency === "advertising associates"`.
 */
export function lineItemBillsViaAdvertisingAssociates(item: LineItem, publishers: Publisher[]): boolean {
  const byName = buildPublisherNameMap(publishers)
  for (const key of publisherNameKeysFromLineItem(item)) {
    const pub = resolvePublisherByName(key, byName)
    if (pub && isAdvertisingAssociatesPublisher(pub)) return true
  }
  return false
}

/** Keep only line items billed via Advertising Associates publishers. */
export function filterMediaItemsForAdvertisingAssociates(
  mediaItems: MediaItems,
  publishers: Publisher[],
): MediaItems {
  const filterArr = (items: LineItem[]) =>
    items.filter((item) => lineItemBillsViaAdvertisingAssociates(item, publishers))

  return {
    search: filterArr(mediaItems.search),
    socialMedia: filterArr(mediaItems.socialMedia),
    digiAudio: filterArr(mediaItems.digiAudio),
    digiDisplay: filterArr(mediaItems.digiDisplay),
    digiVideo: filterArr(mediaItems.digiVideo),
    bvod: filterArr(mediaItems.bvod),
    progDisplay: filterArr(mediaItems.progDisplay),
    progVideo: filterArr(mediaItems.progVideo),
    progBvod: filterArr(mediaItems.progBvod),
    progOoh: filterArr(mediaItems.progOoh),
    progAudio: filterArr(mediaItems.progAudio),
    newspaper: filterArr(mediaItems.newspaper),
    magazines: filterArr(mediaItems.magazines),
    television: filterArr(mediaItems.television),
    radio: filterArr(mediaItems.radio),
    ooh: filterArr(mediaItems.ooh),
    cinema: filterArr(mediaItems.cinema),
    integration: filterArr(mediaItems.integration),
    influencers: filterArr(mediaItems.influencers),
    production: filterArr(mediaItems.production),
  }
}

function sumGrossForItems(items: LineItem[]): number {
  let sum = 0
  for (const item of items) sum += parseLineItemGrossMedia(item)
  return sum
}

/**
 * MBA-style totals for the AA Excel layout from already AA-filtered `MediaItems`.
 * `totals.gross_media` excludes the production bucket; production is reported separately (same as create-page AA math).
 */
export function buildAdvertisingAssociatesMbaDataFromMediaItems(
  filtered: MediaItems,
): AdvertisingAssociatesMbaData {
  const gross_media: { media_type: string; gross_amount: number }[] = []
  let mediaGrossTotal = 0
  let productionTotal = 0

  for (const key of MEDIA_ITEMS_ORDER) {
    const items = filtered[key]
    if (!Array.isArray(items) || items.length === 0) continue
    const channelSum = sumGrossForItems(items)
    if (channelSum <= 0) continue
    gross_media.push({
      media_type: MEDIA_ITEMS_EXCEL_LABELS[key],
      gross_amount: channelSum,
    })
    if (key === "production") productionTotal += channelSum
    else mediaGrossTotal += channelSum
  }

  const totals_ex_gst = mediaGrossTotal + productionTotal
  const total_inc_gst = addGst(fromCents(toCents(totals_ex_gst)))

  return {
    gross_media,
    totals: {
      gross_media: mediaGrossTotal,
      service_fee: 0,
      production: productionTotal,
      adserving: 0,
      totals_ex_gst,
      total_inc_gst,
    },
  }
}

/** True if any line item remains after AA publisher filter. */
export function advertisingAssociatesFilteredPlanHasLineItems(filtered: MediaItems): boolean {
  for (const key of MEDIA_ITEMS_ORDER) {
    const items = filtered[key]
    if (Array.isArray(items) && items.length > 0) return true
  }
  return false
}

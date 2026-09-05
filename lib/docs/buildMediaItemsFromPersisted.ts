/**
 * Rebuild generateMediaPlan inputs from a persisted published version.
 * Same hydrate + explode path the edit page uses, without a second bursts parser.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { format, parseISO } from "date-fns"

import { PersistedDocError } from "@/lib/docs/buildMbaFromPersisted"
import type { MbaGetMediaLineItems } from "@/lib/mediaplan/mbaGetAssemble"
import { MBA_GET_LINE_ITEM_KEYS } from "@/lib/mediaplan/mbaGetAssemble"
import {
  BVOD_CONTAINER_CONFIG,
  CINEMA_CONTAINER_CONFIG,
  DIGITALAUDIO_CONTAINER_CONFIG,
  DIGITALDISPLAY_CONTAINER_CONFIG,
  DIGITALVIDEO_CONTAINER_CONFIG,
  INFLUENCERS_CONTAINER_CONFIG,
  INTEGRATION_CONTAINER_CONFIG,
  MAGAZINES_CONTAINER_CONFIG,
  NEWSPAPER_CONTAINER_CONFIG,
  OOH_CONTAINER_CONFIG,
  PRODUCTION_CONTAINER_CONFIG,
  PROGAUDIO_CONTAINER_CONFIG,
  PROGBVOD_CONTAINER_CONFIG,
  PROGDISPLAY_CONTAINER_CONFIG,
  PROGOOH_CONTAINER_CONFIG,
  PROGVIDEO_CONTAINER_CONFIG,
  RADIO_CONTAINER_CONFIG,
  SEARCH_CONTAINER_CONFIG,
  SOCIALMEDIA_CONTAINER_CONFIG,
  TELEVISION_CONTAINER_CONFIG,
  mapHydrationToForm,
  type ContainerChannelConfig,
} from "@/lib/mediaplan/containerChannelConfig"
import { resolveLineItemBursts } from "@/lib/mediaplan/deriveBursts"
import { formatBurstDateLocal } from "@/lib/mediaplan/burstDate"
import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import {
  computeDeliverableFromMedia,
  type BuyType,
} from "@/lib/mediaplan/deliverableBudget"
import { formatAUD, parseMoneyInput, roundMoney2 } from "@/lib/format/money"
import {
  buildEditorLineItemInputs,
  buildFeeLoadingFromEditorFees,
  type EditorFeeState,
} from "@/lib/finance/buildEditorLineItemInputs"
import { computeCampaignFinancials } from "@/lib/finance/computeCampaignFinancials"
import { resolveFeePctFromFeeLoading } from "@/lib/finance/computeCampaignFinancials"
import { addGst } from "@/lib/finance/gst"
import {
  feeSnapshotHasRates,
  sumLegacyBillingTotals,
} from "@/lib/docs/legacyBillingTotals"
import type { SeedLineFeesMediaConfig } from "@/lib/billing/seedLineFees"
import { shouldIncludeMediaPlanLineItem } from "@/lib/mediaplan/advertisingAssociatesExcel"
import {
  buildMediaPlanWorkbookMbaData,
  MEDIA_PLAN_WORKBOOK_MEDIA_TYPES,
  type MediaPlanWorkbookMbaData,
} from "@/lib/mediaplan/buildMediaPlanWorkbookMbaData"
import type { LineItem, MediaItems, MediaPlanHeader } from "@/lib/generateMediaPlan"
import { isVersionPublished } from "@/lib/mediaplan/versionPublication"
import type { Publisher } from "@/lib/types/publisher"

type MbaGetKey = keyof MbaGetMediaLineItems
type MediaItemsKey = keyof MediaItems

const MBA_GET_TO_MEDIA_ITEMS: Record<MbaGetKey, MediaItemsKey> = {
  television: "television",
  radio: "radio",
  newspaper: "newspaper",
  magazines: "magazines",
  ooh: "ooh",
  cinema: "cinema",
  search: "search",
  socialMedia: "socialMedia",
  digitalDisplay: "digiDisplay",
  digitalAudio: "digiAudio",
  digitalVideo: "digiVideo",
  bvod: "bvod",
  integration: "integration",
  progDisplay: "progDisplay",
  progVideo: "progVideo",
  progBvod: "progBvod",
  progAudio: "progAudio",
  progOoh: "progOoh",
  influencers: "influencers",
  production: "production",
}

const CONTAINER_BY_MBA_GET: Record<MbaGetKey, ContainerChannelConfig> = {
  television: TELEVISION_CONTAINER_CONFIG,
  radio: RADIO_CONTAINER_CONFIG,
  newspaper: NEWSPAPER_CONTAINER_CONFIG,
  magazines: MAGAZINES_CONTAINER_CONFIG,
  ooh: OOH_CONTAINER_CONFIG,
  cinema: CINEMA_CONTAINER_CONFIG,
  search: SEARCH_CONTAINER_CONFIG,
  socialMedia: SOCIALMEDIA_CONTAINER_CONFIG,
  digitalDisplay: DIGITALDISPLAY_CONTAINER_CONFIG,
  digitalAudio: DIGITALAUDIO_CONTAINER_CONFIG,
  digitalVideo: DIGITALVIDEO_CONTAINER_CONFIG,
  bvod: BVOD_CONTAINER_CONFIG,
  integration: INTEGRATION_CONTAINER_CONFIG,
  progDisplay: PROGDISPLAY_CONTAINER_CONFIG,
  progVideo: PROGVIDEO_CONTAINER_CONFIG,
  progBvod: PROGBVOD_CONTAINER_CONFIG,
  progAudio: PROGAUDIO_CONTAINER_CONFIG,
  progOoh: PROGOOH_CONTAINER_CONFIG,
  influencers: INFLUENCERS_CONTAINER_CONFIG,
  production: PRODUCTION_CONTAINER_CONFIG,
}

export function emptyMediaItems(): MediaItems {
  return {
    search: [],
    socialMedia: [],
    digiAudio: [],
    digiDisplay: [],
    digiVideo: [],
    bvod: [],
    progDisplay: [],
    progVideo: [],
    progBvod: [],
    progOoh: [],
    progAudio: [],
    newspaper: [],
    magazines: [],
    television: [],
    radio: [],
    ooh: [],
    cinema: [],
    integration: [],
    influencers: [],
    production: [],
  }
}

function money(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  return parseMoneyInput(value as string | number | null | undefined) ?? 0
}

function formatDateDdMmYyyy(raw: unknown): string {
  if (raw == null || raw === "") return ""
  const s = String(raw).trim()
  try {
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return format(parseISO(s.slice(0, 10)), "dd/MM/yyyy")
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return format(d, "dd/MM/yyyy")
  } catch {
    /* fall through */
  }
  return s
}

function burstDateYmd(value: unknown): string {
  if (value == null || value === "") return ""
  if (value instanceof Date) return formatBurstDateLocal(value)
  return formatBurstDateLocal(String(value))
}

function hydrateFormLine(
  config: ContainerChannelConfig,
  apiItem: Record<string, unknown>,
  mediaItemsKey: MediaItemsKey,
): Record<string, unknown> {
  const form = mapHydrationToForm(config.fieldMap, apiItem) as Record<string, unknown>
  const bursts = resolveLineItemBursts(apiItem)
  const lineId = String(apiItem.line_item_id ?? apiItem.lineItemId ?? form.lineItemId ?? "")
  const lineNo = apiItem.line_item ?? apiItem.lineItem ?? form.line_item ?? form.lineItem
  const buyTypeRaw = String(
    apiItem.buy_type ?? apiItem.buyType ?? form.buyType ?? "",
  )
  const buyType =
    mediaItemsKey === "production" && !buyTypeRaw.trim() ? "production" : buyTypeRaw
  return {
    ...form,
    bursts,
    line_item_id: lineId,
    lineItemId: lineId,
    line_item: lineNo,
    lineItem: lineNo,
    buyType,
    clientPaysForMedia: Boolean(
      apiItem.client_pays_for_media ?? apiItem.clientPaysForMedia ?? form.clientPaysForMedia,
    ),
    budgetIncludesFees: Boolean(
      apiItem.budget_includes_fees ?? apiItem.budgetIncludesFees ?? form.budgetIncludesFees,
    ),
    noAdserving: Boolean(apiItem.no_adserving ?? apiItem.noAdserving ?? form.noAdserving),
  }
}

function explodeExcelLineItems(
  mediaItemsKey: MediaItemsKey,
  formLine: Record<string, unknown>,
  feePct: number,
  lineIndex: number,
): LineItem[] {
  const bursts = resolveLineItemBursts(formLine)
  if (bursts.length === 0) return []
  const lineId = String(formLine.line_item_id ?? formLine.lineItemId ?? "")
  const lineNumber = Number(formLine.line_item ?? formLine.lineItem ?? lineIndex + 1) || lineIndex + 1
  const buyType = String(formLine.buyType ?? "")
  const budgetIncludesFees = Boolean(formLine.budgetIncludesFees)
  const clientPaysForMedia = Boolean(formLine.clientPaysForMedia)

  return bursts.map((burst: Record<string, unknown>) => {
    if (mediaItemsKey === "production") {
      const cost = money(burst.cost)
      const amount = money(burst.amount)
      const mediaAmount = cost * amount
      return {
        market: String(formLine.market ?? ""),
        platform: "production",
        network: String(formLine.publisher ?? ""),
        creative: String(formLine.description ?? ""),
        startDate: burstDateYmd(burst.startDate ?? burst.start_date),
        endDate: burstDateYmd(burst.endDate ?? burst.end_date),
        deliverables: amount,
        buyType: "production",
        deliverablesAmount: String(cost),
        grossMedia: String(mediaAmount),
        line_item_id: lineId,
        lineItemId: lineId,
        line_item: lineNumber,
        clientPaysForMedia,
        budgetIncludesFees,
      } satisfies LineItem
    }

    const rawBudget = money(burst.budget)
    const buyAmount = money(burst.buyAmount ?? burst.buy_amount ?? burst.budget)
    const amounts = computeBurstAmounts({
      rawBudget,
      budgetIncludesFees,
      clientPaysForMedia,
      feePct,
      buyType,
    })
    const recomputed = computeDeliverableFromMedia({
      buyType: buyType as BuyType,
      rawBudget,
      buyAmount,
      budgetIncludesFees,
      feePct,
    })
    const deliverableForExcel = Number.isNaN(recomputed)
      ? money(burst.calculatedValue ?? burst.deliverables ?? burst.tarps)
      : recomputed

    const startDate = burstDateYmd(burst.startDate ?? burst.start_date)
    const endDate = burstDateYmd(burst.endDate ?? burst.end_date)
    const base: LineItem = {
      market: String(formLine.market ?? ""),
      startDate,
      endDate,
      deliverables:
        mediaItemsKey === "television"
          ? money(burst.tarps ?? burst.deliverables ?? burst.calculatedValue)
          : deliverableForExcel,
      buyType,
      deliverablesAmount: String(burst.budget ?? ""),
      grossMedia: String(amounts.mediaAmount),
      clientPaysForMedia,
      budgetIncludesFees,
      line_item_id: lineId,
      lineItemId: lineId,
      line_item: lineNumber,
      buyingDemo: String(formLine.buyingDemo ?? ""),
    }

    if (mediaItemsKey === "radio") {
      return {
        ...base,
        network: String(formLine.network ?? ""),
        station: String(formLine.station ?? ""),
        bidStrategy: String(formLine.bidStrategy ?? ""),
        placement: String(formLine.placement ?? ""),
        creative: String(formLine.format ?? ""),
        duration: String(formLine.duration ?? ""),
        lineItem: lineNumber,
      }
    }
    if (mediaItemsKey === "television") {
      return {
        ...base,
        network: String(formLine.network ?? ""),
        station: String(formLine.station ?? ""),
        daypart: String(formLine.daypart ?? ""),
        placement: String(formLine.placement ?? ""),
        bidStrategy: String(formLine.bidStrategy ?? ""),
        creative: String(formLine.creative ?? ""),
        size: String(burst.size ?? ""),
        lineItem: lineNumber,
      }
    }
    if (mediaItemsKey === "ooh") {
      return {
        ...base,
        network: String(formLine.network ?? ""),
        oohFormat: String(formLine.format ?? ""),
        oohType: String(formLine.type ?? ""),
        placement: String(formLine.placement ?? ""),
        size: String(formLine.size ?? ""),
      }
    }
    if (mediaItemsKey === "cinema") {
      return {
        ...base,
        network: String(formLine.network ?? ""),
        station: String(formLine.station ?? ""),
        bidStrategy: String(formLine.bidStrategy ?? ""),
        targeting: String(formLine.placement ?? ""),
        placement: String(formLine.placement ?? ""),
        creative: String(formLine.format ?? ""),
        duration: String(formLine.duration ?? ""),
      }
    }
    if (mediaItemsKey === "newspaper" || mediaItemsKey === "magazines") {
      return {
        ...base,
        network: String(formLine.network ?? ""),
        title: String(formLine.title ?? ""),
        size: String(formLine.size ?? ""),
        placement: String(formLine.placement ?? ""),
        fixedCostMedia: Boolean(formLine.fixedCostMedia),
        lineItem: lineNumber,
      }
    }

    return {
      ...base,
      platform: String(formLine.platform ?? ""),
      site: String(formLine.site ?? ""),
      network: String(formLine.network ?? formLine.publisher ?? ""),
      bidStrategy: String(formLine.bidStrategy ?? ""),
      targeting: String(formLine.creativeTargeting ?? formLine.targeting ?? ""),
      creative: String(formLine.creative ?? ""),
      buyAmount,
      objective: String(formLine.objective ?? ""),
      campaign: String(formLine.campaign ?? ""),
    }
  })
}

export type BuildMediaItemsFromPlanDetailArgs = {
  versionData: Record<string, unknown>
  clientName: string
  lineItems: MbaGetMediaLineItems
  feeSnapshot: EditorFeeState | Record<string, unknown>
  publishers: Publisher[]
  logoBase64: string
}

export type BuildMediaItemsFromPlanDetailResult = {
  header: MediaPlanHeader
  mediaItems: MediaItems
  mbaData: MediaPlanWorkbookMbaData
  publishers: Publisher[]
}

export function buildMediaItemsFromPlanDetail(
  args: BuildMediaItemsFromPlanDetailArgs,
): BuildMediaItemsFromPlanDetailResult {
  if (!isVersionPublished(args.versionData)) {
    throw new PersistedDocError(
      "NOT_APPROVED",
      "Document render requires a published version (published_at set)",
    )
  }

  const feeLoading = buildFeeLoadingFromEditorFees(args.feeSnapshot as EditorFeeState)
  const mediaItems = emptyMediaItems()
  const seedConfigs: SeedLineFeesMediaConfig[] = []

  for (const mbaKey of MBA_GET_LINE_ITEM_KEYS) {
    const apiRows = args.lineItems[mbaKey] ?? []
    if (!Array.isArray(apiRows) || apiRows.length === 0) continue
    const mediaItemsKey = MBA_GET_TO_MEDIA_ITEMS[mbaKey]
    const config = CONTAINER_BY_MBA_GET[mbaKey]
    const formLines = apiRows.map((raw) =>
      hydrateFormLine(config, (raw ?? {}) as Record<string, unknown>, mediaItemsKey),
    )
    const feePct = resolveFeePctFromFeeLoading(mediaItemsKey, feeLoading)
    const excelRows = formLines.flatMap((formLine, lineIndex) =>
      explodeExcelLineItems(mediaItemsKey, formLine, feePct, lineIndex),
    )
    mediaItems[mediaItemsKey] = excelRows.filter(shouldIncludeMediaPlanLineItem)
    seedConfigs.push({
      billingKey: mediaItemsKey,
      lineItems: formLines,
      containerBursts: [],
    })
  }

  const lineInputs = buildEditorLineItemInputs(seedConfigs)
  const campaignStartRaw =
    args.versionData.campaign_start_date ?? args.versionData.mp_campaigndates_start
  const campaignEndRaw =
    args.versionData.campaign_end_date ?? args.versionData.mp_campaigndates_end
  const campaignStart = campaignStartRaw
    ? new Date(String(campaignStartRaw).slice(0, 10) + "T00:00:00")
    : undefined
  const campaignEnd = campaignEndRaw
    ? new Date(String(campaignEndRaw).slice(0, 10) + "T00:00:00")
    : undefined
  const financials = computeCampaignFinancials(lineInputs, { feeLoading }, {
    campaignStart:
      campaignStart && !Number.isNaN(campaignStart.getTime()) ? campaignStart : undefined,
    campaignEnd: campaignEnd && !Number.isNaN(campaignEnd.getTime()) ? campaignEnd : undefined,
  })
  const mediaByKey: Record<string, number> = {}
  for (const line of financials.perLine) {
    if (line.flags.excluded) continue
    mediaByKey[line.mediaType] = (mediaByKey[line.mediaType] ?? 0) + line.media
  }

  let mbaData = buildMediaPlanWorkbookMbaData({
    mediaTypes: MEDIA_PLAN_WORKBOOK_MEDIA_TYPES,
    formFlags: args.versionData,
    campaignFinancialsMediaByKey: mediaByKey,
    mbaScopeTotals: financials.mbaScopeTotals,
  })

  // Historic published cuts often have no mba_fee_snapshots row. Explode still
  // uses burstAmounts (gross media). Totals fee/adserving come from the frozen
  // billing blob so regenerated Excel matches the Xano-era workbook.
  if (!feeSnapshotHasRates(args.feeSnapshot)) {
    const blob = sumLegacyBillingTotals(args.versionData.billingSchedule)
    if (blob.fee !== 0 || blob.adserving !== 0) {
      const exGst = roundMoney2(
        mbaData.totals.gross_media +
          blob.fee +
          mbaData.totals.production +
          blob.adserving,
      )
      mbaData = {
        ...mbaData,
        totals: {
          ...mbaData.totals,
          service_fee: blob.fee,
          adserving: blob.adserving,
          totals_ex_gst: exGst,
          total_inc_gst: addGst(exGst),
        },
      }
    }
  }

  const budgetRaw = args.versionData.mp_campaignbudget
  const header: MediaPlanHeader = {
    logoBase64: args.logoBase64,
    logoWidth: 457,
    logoHeight: 71,
    client: args.clientName,
    brand: String(args.versionData.brand ?? ""),
    campaignName: String(args.versionData.campaign_name ?? ""),
    mbaNumber: String(args.versionData.mba_number ?? args.versionData.mbaNumber ?? ""),
    clientContact: String(args.versionData.client_contact ?? ""),
    planVersion: String(args.versionData.version_number ?? args.versionData.versionNumber ?? ""),
    poNumber: String(args.versionData.po_number ?? ""),
    campaignBudget: formatAUD(budgetRaw as string | number | null | undefined),
    campaignStatus: String(args.versionData.campaign_status ?? ""),
    campaignStart: formatDateDdMmYyyy(campaignStartRaw),
    campaignEnd: formatDateDdMmYyyy(campaignEndRaw),
  }

  return {
    header,
    mediaItems,
    mbaData,
    publishers: args.publishers,
  }
}

function readAssembledLogoBase64(): string {
  return readFileSync(join(process.cwd(), "public/assembled-logo.png")).toString("base64")
}

export async function buildMediaItemsFromPersisted(args: {
  mbaNumber: string
  versionNumber: number
}): Promise<BuildMediaItemsFromPlanDetailResult> {
  const { readMbaPlanDetailFromPostgres } = await import("@/lib/data/readMbaPlanDetail")
  const { fetchPublishersFromPostgres } = await import("@/lib/data/readPublishers")
  const { getDb, schema } = await import("@/db")
  const { eq } = await import("drizzle-orm")

  const result = await readMbaPlanDetailFromPostgres({
    mbaNumber: args.mbaNumber,
    requestedVersionNumber: args.versionNumber,
    // Default assemble trims billing months to campaign dates. Overlay needs
    // the frozen blob in full (PENFOLD001 v16 December fee sits before start).
    billingScheduleFull: true,
  })
  if (!result.ok) {
    throw new PersistedDocError("NOT_FOUND", result.error)
  }
  const data = result.data
  if (!isVersionPublished(data)) {
    throw new PersistedDocError(
      "NOT_APPROVED",
      "Document render requires a published version (published_at set)",
    )
  }

  const versionId = Number(data.id)
  let feeSnapshot: Record<string, unknown> = {}
  if (Number.isFinite(versionId) && versionId > 0) {
    const db = getDb()
    const [snap] = await db
      .select({ fees: schema.mbaFeeSnapshots.fees })
      .from(schema.mbaFeeSnapshots)
      .where(eq(schema.mbaFeeSnapshots.versionId, versionId))
      .limit(1)
    if (snap?.fees && typeof snap.fees === "object") {
      feeSnapshot = snap.fees as Record<string, unknown>
    }
  }

  const publishers = (await fetchPublishersFromPostgres()) as unknown as Publisher[]
  const lineItems = (data.lineItems ?? {}) as MbaGetMediaLineItems
  const clientName = String(
    data.mp_client_name ?? data.mpClientName ?? "",
  )

  return buildMediaItemsFromPlanDetail({
    versionData: data,
    clientName,
    lineItems,
    feeSnapshot,
    publishers,
    logoBase64: readAssembledLogoBase64(),
  })
}

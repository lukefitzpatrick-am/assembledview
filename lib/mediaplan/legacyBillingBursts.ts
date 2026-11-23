import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { resolveBillingBurstLineItemId } from "@/lib/billing/resolveBillingBurstLineItemId"
import type { BillingBurst } from "@/lib/billing/types"
import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import type { UseFormReturn } from "react-hook-form"
import type { StandardDigiDisplayFormLineItem } from "@/lib/mediaplan/expertChannelMappings"

type LegacyFormBurst = {
  budget?: unknown
  calculatedValue?: unknown
  startDate: Date
  endDate: Date
}

type LegacyFormLine = {
  budgetIncludesFees?: boolean
  clientPaysForMedia?: boolean
  buyType?: string
  noAdserving?: boolean
  noadserving?: boolean
  bursts: LegacyFormBurst[]
}

type LegacyShape = {
  mediaType: string
  /**
   * "burst": the burst's parsed `calculatedValue`. "zero": always 0. "saved":
   * the burst's `calculatedValue` as it is (a typed bonus stays a string).
   */
  deliverables: "burst" | "zero" | "saved"
  /**
   * "line": the line's camel `noAdserving` (Integration, C-36). "lineLower":
   * the line's form box `noadserving`, as it is (site channels). Unset: false.
   */
  noAdserving?: "line" | "lineLower"
  /** Media code: write the burst's `lineItemId` (site channels). Unset: none. */
  lineItemId?: (typeof MEDIA_TYPE_ID_CODES)[keyof typeof MEDIA_TYPE_ID_CODES]
}

/**
 * Billing bursts in a channel's own legacy shape, moved unchanged from the old
 * bespoke containers (Social W5a; Influencers and Integration W5b) and wired
 * as each config's `billingBursts` (Digital Video W5c).
 *
 * The shape differs from the shared `getChannelBursts` on purpose, to keep
 * billing byte-identical: the old budget parser, and per channel line id,
 * deliverables and No Ad Serving (FB-6).
 * shortcut: one legacy shape per channel, upgrade when Luke rules the shared
 * shape is right for every channel (C-331, W5a question 1).
 */
function legacyBillingBursts(shape: LegacyShape) {
  return (
    form: Pick<UseFormReturn, "getValues">,
    feePct: number,
    mbaNumber?: string,
  ): BillingBurst[] => {
    const lineItems = (form.getValues("lineItems") || []) as LegacyFormLine[]

    return lineItems.flatMap((li, liIndex) =>
      li.bursts.map((burst) => {
        const rawBudget = parseFloat(String(burst.budget || "").replace(/[^0-9.]/g, "")) || 0

        const pct = feePct || 0

        const { mediaAmount, deliveryMediaAmount, feeAmount } = computeBurstAmounts({
          rawBudget,
          budgetIncludesFees: !!li.budgetIncludesFees,
          clientPaysForMedia: !!li.clientPaysForMedia,
          feePct: pct,
          buyType: li.buyType,
        })

        return {
          startDate: burst.startDate,
          endDate: burst.endDate,
          mediaAmount,
          deliveryMediaAmount,
          feeAmount,
          totalAmount: mediaAmount + feeAmount,
          mediaType: shape.mediaType,
          feePercentage: pct,
          clientPaysForMedia: li.clientPaysForMedia as boolean,
          budgetIncludesFees: li.budgetIncludesFees as boolean,
          noAdserving:
            shape.noAdserving === "line"
              ? li.noAdserving || false
              : shape.noAdserving === "lineLower"
                ? (li.noadserving as boolean)
                : false,
          deliverables:
            shape.deliverables === "burst"
              ? parseFloat(String(burst?.calculatedValue ?? "0")) || 0
              : shape.deliverables === "saved"
                ? ((burst.calculatedValue ?? 0) as number)
                : 0,
          buyType: li.buyType as string,
          ...(shape.lineItemId
            ? { lineItemId: resolveBillingBurstLineItemId(li, mbaNumber, shape.lineItemId, liIndex) }
            : {}),
        }
      }),
    )
  }
}

/** Social: deliverables from the burst, No Ad Serving always false. */
export const getSocialMediaBursts = legacyBillingBursts({ mediaType: "social", deliverables: "burst" })

/** Influencers: deliverables 0, No Ad Serving always false. */
export const getInfluencersBursts = legacyBillingBursts({ mediaType: "influencers", deliverables: "zero" })

/** Integration: deliverables 0, No Ad Serving from the line's camel `noAdserving` (C-36). */
export const getIntegrationBursts = legacyBillingBursts({
  mediaType: "integration",
  deliverables: "zero",
  noAdserving: "line",
})

/**
 * Digital Video: label "Digi Video" (it keys the video ad serving rate,
 * C-330), the line's id, its No Ad Serving box and the saved deliverables.
 */
export const getDigiVideoBursts = legacyBillingBursts({
  mediaType: "Digi Video",
  deliverables: "saved",
  noAdserving: "lineLower",
  lineItemId: MEDIA_TYPE_ID_CODES.digitalVideo,
})

/** Digital Audio: Digital Video's shape, label "digi audio" (the audio ad serving rate). */
export const getDigiAudioBursts = legacyBillingBursts({
  mediaType: "digi audio",
  deliverables: "saved",
  noAdserving: "lineLower",
  lineItemId: MEDIA_TYPE_ID_CODES.digitalAudio,
})

/** BVOD: Digital Video's shape, label "BVOD" (the video ad serving rate, C-330). */
export const getBvodBursts = legacyBillingBursts({
  mediaType: "BVOD",
  deliverables: "saved",
  noAdserving: "lineLower",
  lineItemId: MEDIA_TYPE_ID_CODES.bvod,
})

/**
 * Cinema: label "cinema", no line id, the line's No Ad Serving box (FB-6) and
 * the saved deliverables (W5f, moved from its container).
 */
export const getCinemaBursts = legacyBillingBursts({
  mediaType: "cinema",
  deliverables: "saved",
  noAdserving: "lineLower",
})

/** Radio: Cinema's shape, label "radio" (W5g, moved from its container). */
export const getRadioBursts = legacyBillingBursts({
  mediaType: "radio",
  deliverables: "saved",
  noAdserving: "lineLower",
})

/** Newspaper: Cinema's shape, label "newspapers" (W5i, moved from its container). */
export const getNewspapersBursts = legacyBillingBursts({
  mediaType: "newspapers",
  deliverables: "saved",
  noAdserving: "lineLower",
})

/** Digital Display's budget read (W5d, moved from its container): a number as it is, else the strip parser keeping a minus. Cinema's Excel rows read budget and rate with it. */
export function parseBudgetSafe(val: unknown): number {
  if (val == null) return 0
  if (typeof val === "number" && Number.isFinite(val)) return val
  return parseFloat(String(val).replace(/[^0-9.-]+/g, "")) || 0
}

type DigiDisplayFormLine = {
  platform: string
  site: string
  buyType: string
  publisher: string
  bursts: StandardDigiDisplayFormLineItem["bursts"]
  creativeTargeting?: string
  creative?: string
  buyingDemo?: string
  market?: string
  fixedCostMedia?: boolean
  fixedCostFrom?: string
  clientPaysForMedia?: boolean
  budgetIncludesFees?: boolean
  noadserving?: boolean
  lineItemId?: string
  line_item_id?: string
  line_item?: number | string
  lineItem?: number | string
  placement?: string
  size?: string
  targetingAttribute?: string
}

/** Digital Display form lines in the shape its expert mappings and billing read (W5d, moved from its container). */
export function asStandardDigiDisplayItems(
  items: ReadonlyArray<DigiDisplayFormLine> | null | undefined,
): StandardDigiDisplayFormLineItem[] {
  return (items ?? []).map((li) => ({
    platform: li.platform,
    site: li.site,
    buyType: li.buyType,
    publisher: li.publisher,
    creativeTargeting: li.creativeTargeting ?? "",
    creative: li.creative ?? "",
    buyingDemo: li.buyingDemo ?? "",
    market: li.market ?? "",
    fixedCostMedia: li.fixedCostMedia ?? false,
    // B23: carried only when the card has one, so Apply keeps the date.
    ...(li.fixedCostFrom !== undefined ? { fixedCostFrom: li.fixedCostFrom } : {}),
    clientPaysForMedia: li.clientPaysForMedia ?? false,
    budgetIncludesFees: li.budgetIncludesFees ?? false,
    noadserving: li.noadserving ?? false,
    bursts: li.bursts,
    lineItemId: li.lineItemId,
    line_item_id: li.line_item_id,
    line_item: li.line_item,
    lineItem: li.lineItem,
    placement: li.placement,
    size: li.size,
    targetingAttribute: li.targetingAttribute,
  }))
}

/**
 * Digital Display billing (W5d, moved unchanged from its container): label
 * "digi display" (the display ad serving rate, C-330), `parseBudgetSafe`,
 * the line's id, its No Ad Serving box and the saved deliverables.
 */
export function getDigiDisplayBursts(
  form: { getValues: (name: "lineItems") => unknown },
  feedigidisplay: number,
  mbaNumber?: string,
): BillingBurst[] {
  const lineItems = asStandardDigiDisplayItems(
    form.getValues("lineItems") as Parameters<typeof asStandardDigiDisplayItems>[0],
  )

  return lineItems.flatMap((li, liIndex) =>
    (li.bursts || []).map((burst) => {
      const rawBudget = parseBudgetSafe(burst?.budget)

      const pct = feedigidisplay || 0

      const { mediaAmount, deliveryMediaAmount, feeAmount } = computeBurstAmounts({
        rawBudget,
        budgetIncludesFees: !!li.budgetIncludesFees,
        clientPaysForMedia: !!li.clientPaysForMedia,
        feePct: pct,
        buyType: li.buyType,
      })

      return {
        startDate: burst.startDate,
        endDate: burst.endDate,
        mediaAmount,
        deliveryMediaAmount,
        feeAmount,
        totalAmount: mediaAmount + feeAmount,
        mediaType: "digi display",
        feePercentage: pct,
        clientPaysForMedia: li.clientPaysForMedia,
        budgetIncludesFees: li.budgetIncludesFees,
        noAdserving: li.noadserving,
        deliverables: burst.calculatedValue ?? 0,
        buyType: li.buyType,
        lineItemId: resolveBillingBurstLineItemId(li, mbaNumber, MEDIA_TYPE_ID_CODES.digitalDisplay, liIndex),
      }
    }),
  )
}

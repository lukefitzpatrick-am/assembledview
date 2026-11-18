import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import { resolveBillingBurstLineItemId } from "@/lib/billing/resolveBillingBurstLineItemId"
import type { BillingBurst } from "@/lib/billing/types"
import { MEDIA_TYPE_ID_CODES } from "@/lib/mediaplan/lineItemIds"
import type { UseFormReturn } from "react-hook-form"

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

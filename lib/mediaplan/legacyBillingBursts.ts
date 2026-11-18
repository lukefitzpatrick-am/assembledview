import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import type { BillingBurst } from "@/lib/billing/types"
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
  bursts: LegacyFormBurst[]
}

type LegacyShape = {
  mediaType: string
  /** "burst": the burst's parsed `calculatedValue`. "zero": always 0. */
  deliverables: "burst" | "zero"
  /** "line": the line's camel `noAdserving` (Integration, C-36). Unset: false. */
  noAdserving?: "line"
}

/**
 * Billing bursts in a channel's own legacy shape, moved unchanged from the old
 * bespoke containers (Social W5a; Integration W5b) and wired
 * as each config's `billingBursts`.
 *
 * The shape differs from the shared `getChannelBursts` on purpose, to keep
 * billing byte-identical: no `lineItemId`, the old budget parser, and per
 * channel deliverables and No Ad Serving (FB-6).
 * shortcut: one legacy shape per channel, upgrade when Luke rules the shared
 * shape is right for every channel (C-331, W5a question 1).
 */
function legacyBillingBursts(shape: LegacyShape) {
  return (form: Pick<UseFormReturn, "getValues">, feePct: number): BillingBurst[] => {
    const lineItems = (form.getValues("lineItems") || []) as LegacyFormLine[]

    return lineItems.flatMap((li) =>
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
          noAdserving: shape.noAdserving === "line" ? li.noAdserving || false : false,
          deliverables:
            shape.deliverables === "burst"
              ? parseFloat(String(burst?.calculatedValue ?? "0")) || 0
              : 0,
          buyType: li.buyType as string,
        }
      }),
    )
  }
}

/** Social: deliverables from the burst, No Ad Serving always false. */
export const getSocialMediaBursts = legacyBillingBursts({ mediaType: "social", deliverables: "burst" })

/** Integration: deliverables 0, No Ad Serving from the line's camel `noAdserving` (C-36). */
export const getIntegrationBursts = legacyBillingBursts({
  mediaType: "integration",
  deliverables: "zero",
  noAdserving: "line",
})

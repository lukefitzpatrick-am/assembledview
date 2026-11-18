import { computeBurstAmounts } from "@/lib/mediaplan/burstAmounts"
import type { BillingBurst } from "@/lib/billing/types"
import type { UseFormReturn } from "react-hook-form"

type SocialFormBurst = {
  budget?: unknown
  calculatedValue?: unknown
  startDate: Date
  endDate: Date
}

type SocialFormLine = {
  budgetIncludesFees?: boolean
  clientPaysForMedia?: boolean
  buyType?: string
  bursts: SocialFormBurst[]
}

/**
 * Social billing bursts. Moved unchanged from the old SocialMediaContainer
 * (W5a) and wired as `SOCIALMEDIA_CONTAINER_CONFIG.billingBursts`.
 *
 * The shape differs from the shared `getChannelBursts` on purpose, to keep
 * billing byte-identical: no `lineItemId`, `noAdserving` always false (social
 * is not ad-serving eligible, FB-6), deliverables parsed from the burst, the
 * old budget parser.
 * shortcut: one legacy shape per channel, upgrade when Luke rules the shared
 * shape is right for every channel (W5a question 1).
 */
export function getSocialMediaBursts(
  form: Pick<UseFormReturn, "getValues">,
  feesocial: number,
): BillingBurst[] {
  const lineItems = (form.getValues("lineItems") || []) as SocialFormLine[]

  return lineItems.flatMap((li) =>
    li.bursts.map((burst) => {
      const rawBudget = parseFloat(String(burst.budget || "").replace(/[^0-9.]/g, "")) || 0

      const pct = feesocial || 0

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
        mediaType: "social",
        feePercentage: pct,
        clientPaysForMedia: li.clientPaysForMedia as boolean,
        budgetIncludesFees: li.budgetIncludesFees as boolean,
        noAdserving: false,
        deliverables: parseFloat(String(burst?.calculatedValue ?? "0")) || 0,
        buyType: li.buyType as string,
      }
    }),
  )
}

import { formatMoney } from "@/lib/format/money"
import { displayLineTotals } from "@/lib/money/burst"
import { fromCents } from "@/lib/money/cents"

type CardTitleLine = {
  bursts?: ReadonlyArray<{ budget?: unknown; buyType?: string | null }>
  buyType?: string | null
  budgetIncludesFees?: boolean | null
  clientPaysForMedia?: boolean | null
}

/** Card header total from lineTotals, in cents, formatted at the edge. */
export function formatCardTitleFromLine(
  line: CardTitleLine | null | undefined,
  feePct: number,
): string {
  const shown = displayLineTotals(
    {
      buyType: line?.buyType ?? undefined,
      budgetIncludesFees: line?.budgetIncludesFees === true,
      clientPaysForMedia: line?.clientPaysForMedia === true,
      bursts: (line?.bursts ?? []).map((burst) => ({
        budget: burst.budget,
        buyType: burst.buyType ?? line?.buyType ?? undefined,
      })),
    },
    { feePct: feePct || 0 },
  )
  return formatMoney(fromCents(shown.totalCents), {
    locale: "en-AU",
    currency: "AUD",
  })
}

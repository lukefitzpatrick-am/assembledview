import type { BillingLineItem, BillingMonth } from "@/lib/billing/types"

export type BillingLineMode = NonNullable<BillingLineItem["billingMode"]>

type BillingLineModeCarrier = Pick<BillingLineItem, "billingMode">

export function shouldResyncBillingLineFromAuto(
  line: BillingLineModeCarrier,
  isManualBilling: boolean
): boolean {
  if (line.billingMode === "manual") return false
  if (line.billingMode === "auto") return true
  return !isManualBilling
}

export function billingMonthsHaveExplicitLineModes(months: BillingMonth[]): boolean {
  return months.some((month) =>
    Object.values(month.lineItems ?? {}).some((lines) =>
      lines?.some((line) => line.billingMode === "auto" || line.billingMode === "manual")
    )
  )
}

export function stampAllBillingLineModes(
  months: BillingMonth[],
  mode: BillingLineMode
): BillingMonth[] {
  return months.map((month) => {
    if (!month.lineItems) return month

    let changedMonth = false
    const nextLineItems: NonNullable<BillingMonth["lineItems"]> = { ...month.lineItems }

    for (const [mediaKey, lines] of Object.entries(month.lineItems)) {
      if (!lines?.length) continue
      const nextLines = lines.map((line) => {
        if (line.billingMode === mode) return line
        changedMonth = true
        return { ...line, billingMode: mode }
      })
      nextLineItems[mediaKey as keyof typeof nextLineItems] = nextLines as BillingLineItem[]
    }

    return changedMonth ? { ...month, lineItems: nextLineItems } : month
  })
}

export function applyBillingLineMode(
  months: BillingMonth[],
  lineItemId: string,
  mode: BillingLineMode
): BillingMonth[] {
  let foundTarget = false
  const shouldStampSiblings = mode === "manual"

  const next = months.map((month) => {
    if (!month.lineItems) return month

    let changedMonth = false
    const nextLineItems: NonNullable<BillingMonth["lineItems"]> = { ...month.lineItems }

    for (const [mediaKey, lines] of Object.entries(month.lineItems)) {
      if (!lines?.length) continue

      let changedGroup = false
      const nextLines = lines.map((line) => {
        if (line.id === lineItemId) {
          foundTarget = true
          if (line.billingMode === mode) return line
          changedGroup = true
          return { ...line, billingMode: mode }
        }

        if (shouldStampSiblings && line.billingMode === undefined) {
          changedGroup = true
          return { ...line, billingMode: "auto" as const }
        }

        return line
      })

      if (changedGroup) {
        nextLineItems[mediaKey as keyof typeof nextLineItems] = nextLines as BillingLineItem[]
        changedMonth = true
      }
    }

    return changedMonth ? { ...month, lineItems: nextLineItems } : month
  })

  return foundTarget ? next : months
}

import type { UseFormReturn } from "react-hook-form"
import { defaultMediaBurstStartDate, defaultMediaBurstEndDate } from "@/lib/date-picker-anchor"

const MAX_BURSTS = 12

export function newBurstReactKey(): string {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `burst-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

type BurstOpArgs = {
  form: UseFormReturn<any>
  fieldKey: string
  lineItemIndex: number
  campaignStartDate: Date | null | undefined
  campaignEndDate: Date | null | undefined
  onAfter: (lineItemIndex: number) => void
  toast: (opts: { title: string; description: string; variant?: string }) => void
}

/**
 * Seam 2a: shared burst append.
 * Default-date change: new bursts default to the CAMPAIGN WINDOW (was new Date()).
 * Prior-end-date advance behaviour is preserved exactly.
 */
export function appendBurst({
  form,
  fieldKey,
  lineItemIndex,
  campaignStartDate,
  campaignEndDate,
  onAfter,
  toast,
}: BurstOpArgs): void {
  const path = `${fieldKey}.${lineItemIndex}.bursts`
  const currentBursts = (form.getValues(path) as any[]) || []
  if (currentBursts.length >= MAX_BURSTS) {
    toast({
      title: "Maximum bursts reached",
      description: "Can't add more bursts. Each line item is limited to 12 bursts.",
      variant: "destructive",
    })
    return
  }

  // Default into the campaign window (Seam 2a correction)
  let startDate = defaultMediaBurstStartDate(campaignStartDate, campaignEndDate)
  let endDate = defaultMediaBurstEndDate(campaignStartDate, campaignEndDate)
  if (currentBursts.length > 0) {
    const lastBurst = currentBursts[currentBursts.length - 1]
    if (lastBurst?.endDate) {
      // Preserve existing advance-from-prior-end behaviour: next burst starts day after last end,
      // ends at month-end of that start.
      startDate = new Date(lastBurst.endDate)
      startDate.setDate(startDate.getDate() + 1)
      endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0)
    }
  }

  form.setValue(path, [
    ...currentBursts,
    { _reactKey: newBurstReactKey(), budget: "", buyAmount: "", startDate, endDate, calculatedValue: 0, fee: 0 },
  ])
  onAfter(lineItemIndex)
}

/**
 * Seam 2a: shared burst remove.
 * Floor-of-one correction: the last remaining burst cannot be removed.
 * Count-only - does NOT inspect burst content (empty last burst is allowed).
 */
export function removeBurst({
  form,
  fieldKey,
  lineItemIndex,
  burstIndex,
  onAfter,
  toast,
}: Omit<BurstOpArgs, "campaignStartDate" | "campaignEndDate"> & { burstIndex: number }): void {
  const path = `${fieldKey}.${lineItemIndex}.bursts`
  const currentBursts = (form.getValues(path) as any[]) || []
  if (currentBursts.length <= 1) {
    toast({
      title: "At least one burst required",
      description: "A line item must keep at least one burst. Clear its values instead of removing it.",
      variant: "destructive",
    })
    return
  }

  form.setValue(path, currentBursts.filter((_, index) => index !== burstIndex))
  onAfter(lineItemIndex)
}

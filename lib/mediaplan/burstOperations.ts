import type { UseFormReturn } from "react-hook-form"
import { defaultMediaBurstStartDate, defaultMediaBurstEndDate } from "@/lib/date-picker-anchor"

const MAX_BURSTS = 12

export function newBurstReactKey(): string {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `burst-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

type BurstDates = { startDate: Date; endDate: Date }

type ComputeDatesArgs = {
  currentBursts: any[]
  campaignStartDate: Date | null | undefined
  campaignEndDate: Date | null | undefined
}

function defaultComputeDates({
  currentBursts,
  campaignStartDate,
  campaignEndDate,
}: ComputeDatesArgs): BurstDates {
  let startDate = defaultMediaBurstStartDate(campaignStartDate, campaignEndDate)
  let endDate = defaultMediaBurstEndDate(campaignStartDate, campaignEndDate)
  if (currentBursts.length > 0) {
    const lastBurst = currentBursts[currentBursts.length - 1]
    if (lastBurst?.endDate) {
      startDate = new Date(lastBurst.endDate)
      startDate.setDate(startDate.getDate() + 1)
      endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0)
    }
  }
  return { startDate, endDate }
}

export type BurstFactory = (dates: BurstDates) => Record<string, unknown>

export const standardBurstDefaults: BurstFactory = ({ startDate, endDate }) => ({
  budget: "",
  buyAmount: "",
  startDate,
  endDate,
  calculatedValue: 0,
  fee: 0,
})

export const televisionBurstDefaults: BurstFactory = ({ startDate, endDate }) => ({
  budget: "",
  buyAmount: "",
  startDate,
  endDate,
  size: "30s",
  tarps: "",
  calculatedValue: 0,
  fee: 0,
})

export const productionBurstDefaults: BurstFactory = ({ startDate, endDate }) => ({
  cost: 0,
  amount: 0,
  startDate,
  endDate,
})

type BurstOpArgs = {
  form: UseFormReturn<any>
  fieldKey: string
  lineItemIndex: number
  campaignStartDate: Date | null | undefined
  campaignEndDate: Date | null | undefined
  onAfter: (lineItemIndex: number) => void
  toast: (opts: { title: string; description: string; variant?: string }) => void
  makeBurst?: BurstFactory
  computeDates?: (args: ComputeDatesArgs) => BurstDates
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
  makeBurst,
  computeDates,
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

  const { startDate, endDate } = (computeDates ?? defaultComputeDates)({
    currentBursts,
    campaignStartDate,
    campaignEndDate,
  })
  const base = (makeBurst ?? standardBurstDefaults)({ startDate, endDate })

  form.setValue(path, [...currentBursts, { ...base, _reactKey: newBurstReactKey() }])
  onAfter(lineItemIndex)
}

export function stampBurstReactKeys<T extends { bursts?: any[] }>(lineItems: T[]): T[] {
  return lineItems.map((li) => ({
    ...li,
    bursts: (li.bursts || []).map((b) => ({ ...b, _reactKey: newBurstReactKey() })),
  }))
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

"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { BillingMonth, BillingLineItem as BillingLineItemType } from "@/lib/billing/types"

const GRAND_TOTAL_TOLERANCE = 0.01

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-populated months. The component deep-clones internally; the caller's array is not mutated. */
  initialMonths: BillingMonth[]
  /** Display label, e.g. the MBA number. */
  title?: string
  /** When set, shows “Edit campaign” beside Save — closes without saving and opens MBA edit in a new tab. */
  mbaNumber?: string
  /** Called when the user saves a valid edit. Receives the modified months. */
  onSave: (months: BillingMonth[]) => void | Promise<void>
  /** When true, the Save button shows a spinner and is disabled. */
  isSaving?: boolean
}

const currencyFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function parseCurrency(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value !== "string") return 0
  const n = parseFloat(value.replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

function deepCloneMonths(months: BillingMonth[]): BillingMonth[] {
  return JSON.parse(JSON.stringify(months)) as BillingMonth[]
}

function computeGrandTotal(months: BillingMonth[]): number {
  return months.reduce((sum, m) => sum + parseCurrency(m.totalAmount), 0)
}

/**
 * Recalculates mediaCosts / mediaTotal / totalAmount for every month from its line items.
 * Production is kept separate from mediaTotal (matches edit-page behaviour).
 */
function recalculateMonths(months: BillingMonth[]): void {
  months.forEach((m) => {
    if (!m.mediaCosts) return
    let mediaTotalNum = 0
    Object.entries(m.lineItems || {}).forEach(([mediaKey, items]) => {
      const arr = items as BillingLineItemType[] | undefined
      if (!arr?.length) return
      const sum = arr.reduce((s, li) => s + (li.monthlyAmounts?.[m.monthYear] || 0), 0)
      if (mediaKey in m.mediaCosts!) {
        ;(m.mediaCosts as Record<string, string>)[mediaKey] = currencyFormatter.format(sum)
      }
      if (mediaKey !== "production") mediaTotalNum += sum
    })
    const fee = parseCurrency(m.feeTotal)
    const adserv = parseCurrency(m.adservingTechFees)
    const prod = parseCurrency(m.production)
    m.mediaTotal = currencyFormatter.format(mediaTotalNum)
    m.totalAmount = currencyFormatter.format(mediaTotalNum + fee + adserv + prod)
  })
}

function collectMediaKeys(months: BillingMonth[]): string[] {
  const keys = new Set<string>()
  months.forEach((m) => {
    Object.entries(m.lineItems || {}).forEach(([k, items]) => {
      if ((items as BillingLineItemType[] | undefined)?.length) keys.add(k)
    })
  })
  return Array.from(keys)
}

export function AlterBillingDialog({
  open,
  onOpenChange,
  initialMonths,
  title,
  mbaNumber,
  onSave,
  isSaving = false,
}: Props) {
  const [months, setMonths] = useState<BillingMonth[]>([])
  const [originalGrandTotal, setOriginalGrandTotal] = useState(0)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const cloned = deepCloneMonths(initialMonths)
    setMonths(cloned)
    setOriginalGrandTotal(computeGrandTotal(cloned))
    setValidationError(null)
  }, [open, initialMonths])

  const mediaKeys = useMemo(() => collectMediaKeys(months), [months])
  const currentGrandTotal = useMemo(() => computeGrandTotal(months), [months])
  const grandTotalDelta = currentGrandTotal - originalGrandTotal
  const isWithinTolerance = Math.abs(grandTotalDelta) <= GRAND_TOTAL_TOLERANCE

  const handleLineItemAmountChange = (
    mediaKey: string,
    lineItemId: string,
    monthYear: string,
    rawValue: string
  ) => {
    const numericValue = parseCurrency(rawValue)
    setMonths((prev) => {
      const copy = deepCloneMonths(prev)
      copy.forEach((m) => {
        const items = m.lineItems?.[mediaKey as keyof typeof m.lineItems] as
          | BillingLineItemType[]
          | undefined
        if (!items) return
        const li = items.find((x) => x.id === lineItemId)
        if (!li) return
        if (m.monthYear === monthYear) {
          li.monthlyAmounts[monthYear] = numericValue
        }
        li.totalAmount = Object.values(li.monthlyAmounts || {}).reduce(
          (s: number, v) => s + (Number(v) || 0),
          0
        )
      })
      recalculateMonths(copy)
      return copy
    })
    setValidationError(null)
  }

  const handleCostChange = (
    monthIndex: number,
    field: "feeTotal" | "adservingTechFees" | "production",
    rawValue: string
  ) => {
    const formatted = currencyFormatter.format(parseCurrency(rawValue))
    setMonths((prev) => {
      const copy = deepCloneMonths(prev)
      const m = copy[monthIndex]
      if (!m) return prev
      m[field] = formatted
      if (field === "production" && m.mediaCosts?.production !== undefined) {
        m.mediaCosts.production = formatted
      }
      recalculateMonths(copy)
      return copy
    })
    setValidationError(null)
  }

  const handleSaveClick = async () => {
    if (!isWithinTolerance) {
      setValidationError(
        `Grand total must match the original within ${currencyFormatter.format(
          GRAND_TOTAL_TOLERANCE
        )}. ` +
          `Current ${currencyFormatter.format(currentGrandTotal)} vs original ${currencyFormatter.format(
            originalGrandTotal
          )} (delta ${currencyFormatter.format(grandTotalDelta)}).`
      )
      return
    }
    await onSave(deepCloneMonths(months))
  }

  const handleEditCampaignClick = () => {
    if (!mbaNumber?.trim() || isSaving) return
    onOpenChange(false)
    window.open(
      `/mediaplans/mba/${encodeURIComponent(mbaNumber.trim())}/edit`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden p-0">
        <div className="h-1 shrink-0 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b px-6 py-4">
            <DialogHeader>
              <DialogTitle>Alter Billing Schedule{title ? ` — ${title}` : ""}</DialogTitle>
            </DialogHeader>
            <p className="mt-1 text-sm text-muted-foreground">
              Shift amounts between months and line items. The grand total must remain the same as the
              original (±{currencyFormatter.format(GRAND_TOTAL_TOLERANCE)}). Saving will patch this
              version's billing schedule in place — no new version will be created.
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
            <Accordion type="multiple" className="w-full">
              {mediaKeys
                .filter((k) => k !== "production")
                .map((mediaKey) => {
                  const firstMonth = months[0]
                  const items = firstMonth?.lineItems?.[mediaKey as keyof typeof firstMonth.lineItems] as
                    | BillingLineItemType[]
                    | undefined
                  if (!items || items.length === 0) return null

                  return (
                    <AccordionItem key={mediaKey} value={`alter-billing-${mediaKey}`}>
                      <AccordionTrigger className="text-left capitalize">{mediaKey}</AccordionTrigger>
                      <AccordionContent>
                        <div className="overflow-x-auto mt-4">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Line Item</TableHead>
                                {months.map((m) => (
                                  <TableHead key={m.monthYear} className="text-right whitespace-nowrap">
                                    {m.monthYear}
                                  </TableHead>
                                ))}
                                <TableHead className="text-right font-bold">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {items.map((lineItem) => (
                                <TableRow key={lineItem.id}>
                                  <TableCell className="font-medium">
                                    {lineItem.header1 || lineItem.header2 || lineItem.id}
                                  </TableCell>
                                  {months.map((month) => {
                                    const amount = lineItem.monthlyAmounts?.[month.monthYear] || 0
                                    return (
                                      <TableCell key={month.monthYear} align="right">
                                        <Input
                                          className="text-right w-28"
                                          defaultValue={currencyFormatter.format(amount)}
                                          onBlur={(e) =>
                                            handleLineItemAmountChange(
                                              mediaKey,
                                              lineItem.id,
                                              month.monthYear,
                                              e.target.value
                                            )
                                          }
                                        />
                                      </TableCell>
                                    )
                                  })}
                                  <TableCell className="text-right font-semibold">
                                    {currencyFormatter.format(lineItem.totalAmount || 0)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                            <TableFooter>
                              <TableRow className="font-bold border-t-2 bg-muted/30">
                                <TableCell>Subtotal</TableCell>
                                {months.map((m) => {
                                  const subtotal = items.reduce(
                                    (sum, li) => sum + (li.monthlyAmounts?.[m.monthYear] || 0),
                                    0
                                  )
                                  return (
                                    <TableCell key={m.monthYear} className="text-right">
                                      {currencyFormatter.format(subtotal)}
                                    </TableCell>
                                  )
                                })}
                                <TableCell className="text-right">
                                  {currencyFormatter.format(
                                    items.reduce((sum, li) => sum + (li.totalAmount || 0), 0)
                                  )}
                                </TableCell>
                              </TableRow>
                            </TableFooter>
                          </Table>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}

              <AccordionItem value="alter-billing-costs">
                <AccordionTrigger className="text-left">Fees, Ad Serving & Production</AccordionTrigger>
                <AccordionContent>
                  <div className="overflow-x-auto mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          {months.map((m) => (
                            <TableHead key={m.monthYear} className="text-right whitespace-nowrap">
                              {m.monthYear}
                            </TableHead>
                          ))}
                          <TableHead className="text-right font-bold">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(["feeTotal", "adservingTechFees", "production"] as const).map((field) => {
                          const label =
                            field === "feeTotal"
                              ? "Fees"
                              : field === "adservingTechFees"
                                ? "Ad Serving"
                                : "Production"
                          return (
                            <TableRow key={field}>
                              <TableCell className="font-medium">{label}</TableCell>
                              {months.map((m, monthIndex) => (
                                <TableCell key={m.monthYear} align="right">
                                  <Input
                                    className="text-right w-28"
                                    defaultValue={m[field] || "$0.00"}
                                    onBlur={(e) => handleCostChange(monthIndex, field, e.target.value)}
                                  />
                                </TableCell>
                              ))}
                              <TableCell className="text-right font-semibold">
                                {currencyFormatter.format(
                                  months.reduce((acc, m) => acc + parseCurrency(m[field]), 0)
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="space-y-2 text-right text-sm">
              <div>
                Original total:{" "}
                <span className="font-semibold">{currencyFormatter.format(originalGrandTotal)}</span>
              </div>
              <div>
                Current total:{" "}
                <span
                  className={`font-semibold ${
                    isWithinTolerance ? "text-foreground" : "text-destructive"
                  }`}
                >
                  {currencyFormatter.format(currentGrandTotal)}
                </span>
              </div>
              <div>
                Delta:{" "}
                <span className={isWithinTolerance ? "text-muted-foreground" : "text-destructive"}>
                  {currencyFormatter.format(grandTotalDelta)}
                </span>
              </div>
              {validationError && (
                <div className="mt-2 rounded border border-destructive/60 bg-destructive/10 p-3 text-left text-destructive">
                  {validationError}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t px-6 py-4">
            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <div className="flex flex-wrap justify-end gap-2 sm:justify-end">
                {mbaNumber?.trim() ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleEditCampaignClick}
                    disabled={isSaving}
                  >
                    Edit campaign
                  </Button>
                ) : null}
                <Button
                  type="button"
                  onClick={handleSaveClick}
                  disabled={isSaving || !isWithinTolerance}
                >
                  {isSaving ? "Saving…" : "Save Billing Changes"}
                </Button>
              </div>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

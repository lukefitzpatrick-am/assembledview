"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
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
import {
  applyScheduleLineAmountEdit,
  applyScheduleMonthCostEdit,
} from "@/lib/billing/applyScheduleLineAmountEdit"
import { formatBillingCurrency } from "@/lib/billing/recalculateBillingMonths"
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
    _mediaKey: string,
    lineItemId: string,
    monthYear: string,
    rawValue: string
  ) => {
    const numericValue = parseCurrency(rawValue)
    setMonths((prev) => {
      const next = applyScheduleLineAmountEdit(prev, {
        lineItemId,
        monthYear,
        amount: numericValue,
        stampManual: false,
      })
      return next ?? prev
    })
    setValidationError(null)
  }

  const handleCostChange = (
    monthIndex: number,
    field: "feeTotal" | "adservingTechFees" | "production",
    rawValue: string
  ) => {
    const month = months[monthIndex]
    if (!month) return
    const next = applyScheduleMonthCostEdit(months, {
      monthYear: month.monthYear,
      field,
      amount: parseCurrency(rawValue),
    })
    if (next) setMonths(next)
    setValidationError(null)
  }

  const handleSaveClick = async () => {
    if (!isWithinTolerance) {
      setValidationError(
        `Grand total must match the original within ${formatBillingCurrency(
          GRAND_TOTAL_TOLERANCE
        )}. ` +
          `Current ${formatBillingCurrency(currentGrandTotal)} vs original ${formatBillingCurrency(
            originalGrandTotal
          )} (delta ${formatBillingCurrency(grandTotalDelta)}).`
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
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              Shift amounts between months and line items. The grand total must remain the same as the
              original (±{formatBillingCurrency(GRAND_TOTAL_TOLERANCE)}). Saving will patch this
              version&apos;s billing schedule in place — no new version will be created.
            </DialogDescription>
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
                        <div className="mt-4 overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Line Item</TableHead>
                                {months.map((m) => (
                                  <TableHead key={m.monthYear} className="whitespace-nowrap text-right">
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
                                          className="w-28 text-right"
                                          defaultValue={formatBillingCurrency(amount)}
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
                                    {formatBillingCurrency(lineItem.totalAmount || 0)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                            <TableFooter>
                              <TableRow className="border-t-2 bg-muted/30 font-bold">
                                <TableCell>Subtotal</TableCell>
                                {months.map((m) => {
                                  const subtotal = items.reduce(
                                    (sum, li) => sum + (li.monthlyAmounts?.[m.monthYear] || 0),
                                    0
                                  )
                                  return (
                                    <TableCell key={m.monthYear} className="text-right">
                                      {formatBillingCurrency(subtotal)}
                                    </TableCell>
                                  )
                                })}
                                <TableCell className="text-right">
                                  {formatBillingCurrency(
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
                  <div className="mt-4 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          {months.map((m) => (
                            <TableHead key={m.monthYear} className="whitespace-nowrap text-right">
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
                                    className="w-28 text-right"
                                    defaultValue={m[field] || "$0.00"}
                                    onBlur={(e) => handleCostChange(monthIndex, field, e.target.value)}
                                  />
                                </TableCell>
                              ))}
                              <TableCell className="text-right font-semibold">
                                {formatBillingCurrency(
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
                <span className="font-semibold">{formatBillingCurrency(originalGrandTotal)}</span>
              </div>
              <div>
                Current total:{" "}
                <span
                  className={`font-semibold ${
                    isWithinTolerance ? "text-foreground" : "text-destructive"
                  }`}
                >
                  {formatBillingCurrency(currentGrandTotal)}
                </span>
              </div>
              <div>
                Delta:{" "}
                <span className={isWithinTolerance ? "text-muted-foreground" : "text-destructive"}>
                  {formatBillingCurrency(grandTotalDelta)}
                </span>
              </div>
              {validationError ? (
                <div className="mt-2 rounded border border-destructive/60 bg-destructive/10 p-3 text-left text-destructive">
                  {validationError}
                </div>
              ) : null}
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

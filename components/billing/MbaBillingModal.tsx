"use client"

import type { ReactNode } from "react"
import { Check, Download, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { CampaignFinancials } from "@/lib/finance/campaignFinancials.types"
import type { PanelIndicatorsFromCampaignFinancials } from "@/lib/finance/panelIndicatorsFromCampaignFinancials"
import {
  BillingEqualsMbaPill,
  BillingMonthStatusDot,
  BillingScheduleTitlePills,
  EditBillingOverrideDot,
} from "@/components/billing/BillingSchedulePanelIndicators"
import {
  MbaBillableEqualsPill,
  MbaFeeAdjustedPill,
  MbaMediaTypeRowPills,
  mbaMediaTypeRowClassName,
} from "@/components/billing/MbaDetailsPanelIndicators"

const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export type MbaBillingScopeLine = {
  lineItemId: string
  mediaType: string
  mediaLabel: string
  title: string
  subtitle?: string
  approved: boolean
  media: number
  fee: number
  flags: {
    excluded: boolean
    manualBilling: boolean
    manualFee: boolean
    clientPaysForMedia: boolean
  }
}

export type MbaBillingModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Display-only version ordinal (not override API id). */
  versionLabel: string
  financials: CampaignFinancials
  panelIndicators: PanelIndicatorsFromCampaignFinancials
  /** Per-line scope rows for approve/exclude. */
  scopeLines: MbaBillingScopeLine[]
  onToggleLineApproved: (lineItemId: string, mediaType: string, approved: boolean) => void
  onResetApprovalsToAllIn?: () => void
  onDownloadExcel?: () => void
  downloadDisabled?: boolean
  /** When true, show inline manual timing editor below the schedule. */
  showManualEditor?: boolean
  onToggleManualEditor?: () => void
  /** Parent-owned C2 editor (ManualBillingSpreadsheet etc.). */
  manualBillingEditor?: ReactNode
  footer?: ReactNode
}

function HeaderStrip({
  versionLabel,
  financials,
}: {
  versionLabel: string
  financials: CampaignFinancials
}) {
  const lines = financials.perLine
  const total = lines.length
  const approved = lines.filter((l) => !l.flags.excluded).length
  const manual = lines.filter((l) => l.flags.manualBilling && !l.flags.excluded).length
  const clientPays = lines.filter((l) => l.flags.clientPaysForMedia && !l.flags.excluded).length
  const billingNeDelivery = financials.deliveryVsBillingDelta.filter(
    (d) => Math.abs(d.media) > 0.005 || d.reasons.some((r) => r !== "rounding")
  ).length
  const billableEquals = financials.validation.billableEqualsMba

  const quiet = manual === 0 && clientPays === 0 && billingNeDelivery === 0

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-panel px-6 py-3">
      <Badge variant="secondary" size="sm" className="rounded-pill font-medium">
        MBA {versionLabel}
      </Badge>
      {total > 0 ? (
        <Badge variant="secondary" size="sm" className="rounded-pill font-medium">
          <span className="num">
            {approved} of {total}
          </span>{" "}
          approved
        </Badge>
      ) : null}
      {manual > 0 ? (
        <Badge variant="warning" size="sm" className="rounded-pill font-medium">
          <span className="num">{manual}</span> manual
        </Badge>
      ) : null}
      {clientPays > 0 ? (
        <Badge variant="secondary" size="sm" className="rounded-pill font-medium">
          client-pays: <span className="num">{clientPays}</span>
        </Badge>
      ) : null}
      {billingNeDelivery > 0 ? (
        <Badge variant="warning" size="sm" className="rounded-pill font-medium">
          billing≠delivery: <span className="num">{billingNeDelivery}</span>
        </Badge>
      ) : null}
      {billableEquals ? (
        <Badge
          variant="secondary"
          size="sm"
          className="rounded-pill font-medium text-status-on-track-fg"
          title="Billable totals match MBA"
        >
          <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
          billable = MBA
        </Badge>
      ) : null}
      {quiet && billableEquals && total > 0 ? (
        <span className="text-xs text-muted-foreground">Clean plan</span>
      ) : null}
    </div>
  )
}

/**
 * Single MBA & Billing split view. Displays core financials + panel indicators only —
 * no local totals math. Parent owns approval + C2/C3 callbacks.
 */
export function MbaBillingModal({
  open,
  onOpenChange,
  versionLabel,
  financials,
  panelIndicators,
  scopeLines,
  onToggleLineApproved,
  onResetApprovalsToAllIn,
  onDownloadExcel,
  downloadDisabled,
  showManualEditor,
  onToggleManualEditor,
  manualBillingEditor,
  footer,
}: MbaBillingModalProps) {
  const t = financials.mbaScopeTotals
  const schedule = financials.billingSchedule
  const byMedia = panelIndicators.mbaDetails.byMediaType

  const grandMedia = schedule.reduce(
    (acc, m) => acc + (parseFloat(String(m.mediaTotal).replace(/[^0-9.-]/g, "")) || 0),
    0
  )
  const grandFee = schedule.reduce(
    (acc, m) => acc + (parseFloat(String(m.feeTotal).replace(/[^0-9.-]/g, "")) || 0),
    0
  )
  const grandAd = schedule.reduce(
    (acc, m) =>
      acc + (parseFloat(String(m.adservingTechFees).replace(/[^0-9.-]/g, "")) || 0),
    0
  )
  const grandProd = schedule.reduce(
    (acc, m) =>
      acc + (parseFloat(String(m.production || "0").replace(/[^0-9.-]/g, "")) || 0),
    0
  )
  const grandTotal = schedule.reduce(
    (acc, m) => acc + (parseFloat(String(m.totalAmount).replace(/[^0-9.-]/g, "")) || 0),
    0
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(100vw-1.5rem,72rem)] max-w-6xl flex-col overflow-hidden p-0">
        <div className="h-1 shrink-0 bg-primary" />
        <div className="shrink-0 border-b border-border px-6 py-4">
          <DialogHeader>
            <DialogTitle>MBA &amp; billing</DialogTitle>
            <DialogDescription>
              Approve lines for MBA scope and review the billing schedule. Totals come from core
              financials.
            </DialogDescription>
          </DialogHeader>
        </div>

        <HeaderStrip versionLabel={versionLabel} financials={financials} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-0 xl:grid-cols-2 xl:divide-x xl:divide-border">
            {/* Left — MBA scope */}
            <section className="flex min-w-0 flex-col border-b border-border xl:border-b-0">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-5 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  MBA scope
                </h3>
                {onResetApprovalsToAllIn ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onResetApprovalsToAllIn}
                  >
                    All in
                  </Button>
                ) : null}
              </div>
              <div className="max-h-[min(50vh,28rem)] space-y-1 overflow-y-auto px-3 py-3 xl:max-h-none">
                {scopeLines.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No line items yet. Enable media and add flights first.
                  </p>
                ) : (
                  scopeLines.map((line) => {
                    const rowInd = byMedia[line.mediaType]
                    const muted = line.flags.excluded
                    return (
                      <div
                        key={`${line.mediaType}:${line.lineItemId}`}
                        className={cn(
                          "flex items-start gap-3 rounded-input border border-transparent px-2 py-2 transition-colors",
                          muted ? "opacity-60" : "hover:bg-table-row-hover",
                          mbaMediaTypeRowClassName(rowInd)
                        )}
                      >
                        <Switch
                          checked={line.approved}
                          onCheckedChange={(checked) =>
                            onToggleLineApproved(line.lineItemId, line.mediaType, checked)
                          }
                          aria-label={
                            line.approved
                              ? `Exclude ${line.title} from MBA`
                              : `Approve ${line.title} for MBA`
                          }
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-foreground">
                              {line.title}
                            </span>
                            <Badge
                              variant="outline"
                              size="sm"
                              className="rounded-pill font-normal text-muted-foreground"
                            >
                              {line.mediaLabel}
                            </Badge>
                            <MbaMediaTypeRowPills row={rowInd} />
                            {line.flags.clientPaysForMedia && !muted ? (
                              <Badge
                                variant="secondary"
                                size="sm"
                                className="rounded-pill font-normal"
                              >
                                Client pays media
                              </Badge>
                            ) : null}
                            {muted ? (
                              <Badge
                                variant="secondary"
                                size="sm"
                                className="rounded-pill font-normal text-muted-foreground"
                              >
                                Not in MBA — excluded
                              </Badge>
                            ) : null}
                          </div>
                          {line.subtitle ? (
                            <p className="truncate text-xs text-muted-foreground">{line.subtitle}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="num text-sm font-medium">{money.format(line.media)}</div>
                          {line.fee > 0.005 ? (
                            <div className="num text-xs text-muted-foreground">
                              fee {money.format(line.fee)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="mt-auto space-y-2 border-t border-border bg-muted/10 px-5 py-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gross Media</span>
                  <span className="num font-medium">{money.format(t.grossMedia)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center text-muted-foreground">
                    Assembled Fee
                    <MbaFeeAdjustedPill show={panelIndicators.mbaDetails.mbaFeeAdjusted} />
                  </span>
                  <span className="num font-medium">{money.format(t.fee)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ad Serving &amp; Tech</span>
                  <span className="num font-medium">{money.format(t.adServing)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Production</span>
                  <span className="num font-medium">{money.format(t.production)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
                  <span className="flex items-center">
                    Total ex GST
                    <MbaBillableEqualsPill show={panelIndicators.mbaDetails.billableEqualsMba} />
                  </span>
                  <span className="num text-primary">{money.format(t.nettExGst)}</span>
                </div>
              </div>
            </section>

            {/* Right — Billing schedule */}
            <section className="flex min-w-0 flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-5 py-3">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Billing schedule
                  </h3>
                  <BillingScheduleTitlePills pills={panelIndicators.billingSchedule.titlePills} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {onDownloadExcel ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={downloadDisabled}
                      onClick={onDownloadExcel}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Excel
                    </Button>
                  ) : null}
                  {onToggleManualEditor ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={showManualEditor ? "secondary" : "default"}
                      className="relative"
                      onClick={onToggleManualEditor}
                    >
                      {showManualEditor ? "Hide editor" : "Edit timing"}
                      <EditBillingOverrideDot
                        show={panelIndicators.billingSchedule.editBillingHasOverride}
                      />
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Manual billing available after save.
                    </p>
                  )}
                </div>
              </div>
              <div className="min-w-0 overflow-x-auto px-3 py-3">
                <Table className="min-w-[32rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Media</TableHead>
                      <TableHead className="text-right">Fees</TableHead>
                      <TableHead className="text-right">Ad Serving</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedule.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No billing schedule yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {schedule.map((m) => (
                          <TableRow key={m.monthYear}>
                            <TableCell>
                              <span className="inline-flex items-center">
                                {m.monthYear}
                                <BillingMonthStatusDot
                                  indicator={panelIndicators.billingSchedule.byMonth[m.monthYear]}
                                />
                              </span>
                            </TableCell>
                            <TableCell className="num text-right">{m.mediaTotal}</TableCell>
                            <TableCell className="num text-right">{m.feeTotal}</TableCell>
                            <TableCell className="num text-right">{m.adservingTechFees}</TableCell>
                            <TableCell className="num text-right font-semibold">
                              {m.totalAmount}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold">
                          <TableCell>
                            <span className="inline-flex items-center">
                              Grand Total
                              <BillingEqualsMbaPill
                                show={panelIndicators.billingSchedule.billableEqualsMba}
                              />
                            </span>
                          </TableCell>
                          <TableCell className="num text-right">{money.format(grandMedia)}</TableCell>
                          <TableCell className="num text-right">{money.format(grandFee)}</TableCell>
                          <TableCell className="num text-right">{money.format(grandAd)}</TableCell>
                          <TableCell className="num text-right">{money.format(grandTotal)}</TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
                {schedule.length > 0 && grandProd > 0.005 ? (
                  <p className="mt-2 px-2 text-xs text-muted-foreground">
                    Production in schedule: <span className="num">{money.format(grandProd)}</span>
                  </p>
                ) : null}
              </div>

              {showManualEditor && manualBillingEditor ? (
                <div className="border-t border-border px-3 py-4">{manualBillingEditor}</div>
              ) : null}
            </section>
          </div>
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-border px-6 py-3">{footer}</div>
        ) : (
          <div className="flex shrink-0 justify-end border-t border-border px-6 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

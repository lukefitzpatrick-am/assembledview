"use client"

import { Check } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  BillingEqualsMbaPill,
  BillingMonthStatusDot,
  BillingScheduleTitlePills,
} from "@/components/billing/BillingSchedulePanelIndicators"
import {
  MbaBillableEqualsPill,
  MbaFeeAdjustedPill,
  MbaPartialScopePill,
} from "@/components/billing/MbaDetailsPanelIndicators"
import type { CampaignFinancials } from "@/lib/finance/campaignFinancials.types"
import type { PanelIndicatorsFromCampaignFinancials } from "@/lib/finance/panelIndicatorsFromCampaignFinancials"

const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function parseScheduleMoney(value: string | undefined): number {
  return parseFloat(String(value ?? "0").replace(/[^0-9.-]/g, "")) || 0
}

export type MbaBillingAutoCalcSummaryProps = {
  financials: CampaignFinancials
  panelIndicators: PanelIndicatorsFromCampaignFinancials
}

/**
 * Read-only Step 03 auto-calc summary. Every number/flag comes from core
 * {@link CampaignFinancials} + {@link panelIndicatorsFromCampaignFinancials} —
 * no local totals math. Interactive approve/exclude and manual timing stay in
 * {@link MbaBillingModal}.
 */
export function MbaBillingAutoCalcSummary({
  financials,
  panelIndicators,
}: MbaBillingAutoCalcSummaryProps) {
  const t = financials.mbaScopeTotals
  const schedule = financials.billingSchedule

  const grandMedia = schedule.reduce((acc, m) => acc + parseScheduleMoney(m.mediaTotal), 0)
  const grandFee = schedule.reduce((acc, m) => acc + parseScheduleMoney(m.feeTotal), 0)
  const grandTotal = schedule.reduce((acc, m) => acc + parseScheduleMoney(m.totalAmount), 0)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
      {/* MBA scope totals */}
      <div className="flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface-panel shadow-e0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-[var(--fill-track)] px-5 pb-3 pt-4">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            MBA scope
            <MbaPartialScopePill label={panelIndicators.mbaDetails.partialLabel} />
          </h3>
          {panelIndicators.mbaDetails.billableEqualsMba ? (
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
        </div>
        <div className="space-y-2 px-5 py-4">
          <div className="flex items-center justify-between py-0.5">
            <span className="text-sm text-muted-foreground">Gross Media</span>
            <span className="num text-sm font-medium">{money.format(t.grossMedia)}</span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="flex items-center text-sm text-muted-foreground">
              Assembled Fee
              <MbaFeeAdjustedPill show={panelIndicators.mbaDetails.mbaFeeAdjusted} />
            </span>
            <span className="num text-sm font-medium">{money.format(t.fee)}</span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-sm text-muted-foreground">Ad Serving &amp; Tech</span>
            <span className="num text-sm font-medium">{money.format(t.adServing)}</span>
          </div>
          <div className="flex items-center justify-between py-0.5">
            <span className="text-sm text-muted-foreground">Production</span>
            <span className="num text-sm font-medium">{money.format(t.production)}</span>
          </div>
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center text-sm font-semibold text-foreground">
                Total Investment (ex GST)
                <MbaBillableEqualsPill show={panelIndicators.mbaDetails.billableEqualsMba} />
              </span>
              <span className="num text-sm font-semibold text-primary">
                {money.format(t.nettExGst)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Billing schedule */}
      <div className="flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-surface-panel shadow-e0">
        <div className="border-b border-border bg-[var(--fill-track)] px-5 pb-3 pt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Billing schedule
          </h3>
          <BillingScheduleTitlePills pills={panelIndicators.billingSchedule.titlePills} />
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto px-3 py-3">
          <Table className="min-w-[18rem]">
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Media</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedule.length === 0 ? null : (
                schedule.map((m) => (
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
                    <TableCell className="num text-right font-semibold">{m.totalAmount}</TableCell>
                  </TableRow>
                ))
              )}
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
                <TableCell className="num text-right">{money.format(grandTotal)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

"use client"

import { AlertTriangle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { toBillingOverrideLineItemId } from "@/lib/finance/manualBillingOverridesUi"
import { formatMoney } from "@/lib/format/money"
import type { PartialMbaGuardResult } from "@/lib/mediaplan/partialMbaBillingVsDelivery"
import { cn } from "@/lib/utils"

type Props = {
  result: PartialMbaGuardResult | null
  mediaLabelByKey?: Readonly<Record<string, string>>
  className?: string
}

/**
 * M8 (B21, switch `partial_mba_billing_guard`, decisions Q12 and Q13): the
 * selected months and approved lines where billing and delivery differ, and
 * lines of a channel added after an old partial MBA was set. Warn only.
 */
export function PartialMbaBillingGuardNotice({ result, mediaLabelByKey, className }: Props) {
  if (!result || (result.rows.length === 0 && result.laterAdded.length === 0)) return null
  const label = (mediaType: string) => mediaLabelByKey?.[mediaType] ?? mediaType
  return (
    <div
      role="status"
      data-partial-mba-billing-guard="1"
      className={cn(
        "rounded-card border border-status-attention-fg/20 bg-status-attention-bg px-4 py-3 text-status-attention-fg",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          {result.rows.length > 0 ? (
            <>
              <p className="text-sm font-semibold">Billing and delivery differ in the MBA months</p>
              <p className="text-sm opacity-90">
                The MBA bills the billing months. Check these lines before you publish. This doesn&apos;t stop a save.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-xs">
                  <thead>
                    <tr className="text-left opacity-80">
                      <th className="py-1 pr-2 font-medium">Month</th>
                      <th className="py-1 pr-2 font-medium">Line</th>
                      <th className="py-1 pr-2 text-right font-medium">Billing</th>
                      <th className="py-1 pr-2 text-right font-medium">Delivery</th>
                      <th className="py-1 text-right font-medium">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => (
                      <tr key={`${row.monthYear}:${row.lineItemId}`} className="border-t border-status-attention-fg/10">
                        <td className="py-1 pr-2 whitespace-nowrap">{row.monthYear}</td>
                        <td className="py-1 pr-2">
                          <span className="break-all">
                            {label(row.mediaType)} {toBillingOverrideLineItemId(row.lineItemId)}
                          </span>
                          {row.expected ? (
                            <Badge variant="secondary" className="ml-2 px-2 py-0 text-xs">
                              Expected: client pays
                            </Badge>
                          ) : null}
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">{formatMoney(row.billing)}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{formatMoney(row.delivery)}</td>
                        <td className="py-1 text-right tabular-nums">{formatMoney(row.difference)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          {result.laterAdded.length > 0 ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold">Added after the partial MBA was set</p>
              <p className="text-sm opacity-90">
                These channels weren&apos;t in the saved partial MBA, so their lines are in it. Untick them if the client
                hasn&apos;t approved them.
              </p>
              <ul className="space-y-0.5 text-xs">
                {result.laterAdded.map((line) => (
                  <li key={line.lineItemId} className="break-all">
                    {label(line.mediaType)} {toBillingOverrideLineItemId(line.lineItemId)}: billing{" "}
                    {formatMoney(line.billing)}, delivery {formatMoney(line.delivery)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

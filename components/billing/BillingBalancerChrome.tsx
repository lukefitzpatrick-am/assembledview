"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatAUD } from "@/lib/format/money"
import { cn } from "@/lib/utils"

type Props = {
  monthYears: string[]
  balancingMonth: string
  balancingAmount: number
  negativeBalancer: boolean
  footerLabel: string
  clientPaysForMedia?: boolean
  onReassign: (monthYear: string) => void
  onDistributeEvenly: () => void
  onResetToAuto: () => void
  className?: string
}

/** PC4 balancer chrome — shown when NEXT_PUBLIC_BILLING_BALANCER=on. */
export function BillingBalancerChrome({
  monthYears,
  balancingMonth,
  balancingAmount,
  negativeBalancer,
  footerLabel,
  clientPaysForMedia = false,
  onReassign,
  onDistributeEvenly,
  onResetToAuto,
  className,
}: Props) {
  return (
    <div className={cn("space-y-2", className)}>
      {clientPaysForMedia ? (
        <p className="text-[11px] text-muted-foreground">
          Client-pays line: media billed is $0 by law. Only fee timing is editable; media cells stay
          locked.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="good" size="sm" className="rounded-pill font-medium">
            {footerLabel}
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            ⚖ {balancingMonth}{" "}
            <span
              className={cn(
                "num font-medium",
                negativeBalancer ? "text-status-critical-fg" : "text-foreground"
              )}
            >
              {formatAUD(balancingAmount)}
            </span>
          </span>
          {negativeBalancer ? (
            <Badge variant="blocking" size="sm" className="rounded-pill font-medium">
              negative month — usually wrong
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Select value={balancingMonth} onValueChange={onReassign}>
            <SelectTrigger className="h-7 w-[9.5rem] text-xs" aria-label="Reassign balancer">
              <SelectValue placeholder="Balancer month" />
            </SelectTrigger>
            <SelectContent>
              {monthYears.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  ⚖ {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={onDistributeEvenly}>
            Distribute evenly
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7" onClick={onResetToAuto}>
            Reset to auto
          </Button>
        </div>
      </div>
    </div>
  )
}

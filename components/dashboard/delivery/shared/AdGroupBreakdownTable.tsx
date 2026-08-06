"use client"

/**
 * Delivered-only ad-group table inside a search plan-line block.
 * Planned / variance stay on the parent — never shown here.
 */
import { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { formatMoney } from "@/lib/format/money"
import { stripPlanCodeSuffix } from "@/lib/delivery/lineItemDisplayName"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

export type AdGroupBreakdownRow = {
  /** Raw LINE_ITEM_NAME (AD_GROUP_NAME), including plan-code suffix when present. */
  name: string
  spend: number
  clicks: number
  impressions: number
}

export type AdGroupBreakdownTableProps = {
  rows: AdGroupBreakdownRow[]
  /** Campaign search plan line ids — used to strip safe suffixes for display. */
  knownPlanLineIds: string[]
  className?: string
}

/** Same presentation as searchAdapter.formatCurrency. */
function formatCurrency(value: number | null | undefined) {
  return formatMoney(Number(value ?? 0))
}

/** Same presentation as searchAdapter.formatWholeNumber. */
function formatWholeNumber(value: number | null | undefined) {
  return Math.round(Number(value ?? 0)).toLocaleString("en-AU")
}

/** Same presentation as searchAdapter.formatPercentAuto. */
function formatPercentAuto(value: number | null | undefined, digits: number = 2) {
  if (value === null || value === undefined) return "—"
  const n = Number(value)
  if (!Number.isFinite(n)) return "—"
  const pct = n <= 1 ? n * 100 : n
  return `${pct.toFixed(digits)}%`
}

function formatCpc(spend: number, clicks: number): string {
  if (!(clicks > 0) || !Number.isFinite(spend)) return "—"
  return formatCurrency(spend / clicks)
}

function formatCtr(clicks: number, impressions: number): string {
  if (!(impressions > 0) || !Number.isFinite(clicks)) return "—"
  return formatPercentAuto(clicks / impressions)
}

export function AdGroupBreakdownTable({
  rows,
  knownPlanLineIds,
  className,
}: AdGroupBreakdownTableProps) {
  const [open, setOpen] = useState(false)

  const sorted = useMemo(
    () =>
      [...rows]
        .filter((r) => String(r.name ?? "").trim())
        .sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name)),
    [rows],
  )

  if (sorted.length === 0) return null

  const n = sorted.length
  const triggerLabel = open ? `Hide ${n} ad groups` : `Show ${n} ad groups`

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("w-full", className)}>
      <CollapsibleTrigger
        type="button"
        className="interactive-tint flex w-full items-center justify-between gap-2 rounded-input border border-border/60 bg-background/60 px-3 py-2 text-left text-xs font-medium text-foreground"
      >
        <span>{triggerLabel}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-180" : "",
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 overflow-x-auto rounded-input border border-border/50">
          <Table>
            <TableCaption className="sr-only">
              Ad group delivery actuals for this search line item. Spend, clicks, impressions,
              CPC and CTR only — planned amounts are on the parent line item.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[8rem]">Ad group</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">CPC</TableHead>
                <TableHead className="text-right">CTR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                const raw = String(row.name)
                const display = stripPlanCodeSuffix(raw, knownPlanLineIds)
                return (
                  <TableRow key={raw}>
                    <TableCell className="max-w-[14rem] truncate font-medium" title={raw}>
                      {display}
                    </TableCell>
                    <TableCell className="text-right tabular-nums num">
                      {formatCurrency(row.spend)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums num">
                      {formatWholeNumber(row.clicks)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums num">
                      {formatWholeNumber(row.impressions)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums num">
                      {formatCpc(row.spend, row.clicks)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums num">
                      {formatCtr(row.clicks, row.impressions)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

"use client"

/**
 * Delivered-only entity table inside a plan-line block (search ad groups,
 * Direct Booked Digital placements). Planned / variance stay on the parent.
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

export type EntityBreakdownRow = {
  /** Raw entity name (ad group / placement), including plan-code suffix when present. */
  name: string
  /** Optional stable identity (placement entityId). Falls back to name for React keys. */
  id?: string
  spend?: number
  clicks?: number
  impressions?: number
  videoCompletes?: number
}

export type EntityBreakdownNoun = { singular: string; plural: string }

export type EntityBreakdownTableProps = {
  rows: EntityBreakdownRow[]
  /** Campaign plan line ids — used to strip safe suffixes for display. */
  knownPlanLineIds: string[]
  entityNoun: EntityBreakdownNoun
  /** spend = search's 6 cols; delivery = CM360 6 cols (ZERO-$ LAW: no Spend/CPC). */
  columns: "spend" | "delivery"
  className?: string
  /** Tests expand the table; production stays collapsed. */
  defaultOpen?: boolean
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

function formatCompletionRate(videoCompletes: number, impressions: number): string {
  if (!(impressions > 0) || !Number.isFinite(videoCompletes)) return "—"
  return formatPercentAuto(videoCompletes / impressions)
}

function titleCaseFirst(singular: string): string {
  if (!singular) return singular
  return singular.charAt(0).toUpperCase() + singular.slice(1)
}

export function EntityBreakdownTable({
  rows,
  knownPlanLineIds,
  entityNoun,
  columns,
  className,
  defaultOpen = false,
}: EntityBreakdownTableProps) {
  const [open, setOpen] = useState(defaultOpen)
  const showSpend = columns === "spend"
  const nameHeader = titleCaseFirst(entityNoun.singular)

  const sorted = useMemo(
    () =>
      [...rows]
        .filter((r) => String(r.name ?? "").trim())
        .sort((a, b) => {
          if (showSpend) {
            return (b.spend ?? 0) - (a.spend ?? 0) || a.name.localeCompare(b.name)
          }
          return (b.impressions ?? 0) - (a.impressions ?? 0) || a.name.localeCompare(b.name)
        }),
    [rows, showSpend],
  )

  if (sorted.length === 0) return null

  const n = sorted.length
  const triggerLabel = open ? `Hide ${n} ${entityNoun.plural}` : `Show ${n} ${entityNoun.plural}`
  const caption = showSpend
    ? "Ad group delivery actuals for this search line item. Spend, clicks, impressions, CPC and CTR only — planned amounts are on the parent line item."
    : `${nameHeader} delivery actuals for this line item. Impressions, clicks, CTR, video completions and completion rate only — planned amounts are on the parent line item.`

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
            <TableCaption className="sr-only">{caption}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[8rem]">{nameHeader}</TableHead>
                {showSpend ? <TableHead className="text-right">Spend</TableHead> : null}
                {showSpend ? (
                  <>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Video completions</TableHead>
                    <TableHead className="text-right">Completion rate</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                const raw = String(row.name)
                const display = stripPlanCodeSuffix(raw, knownPlanLineIds)
                const clicks = Number(row.clicks ?? 0)
                const impressions = Number(row.impressions ?? 0)
                const spend = Number(row.spend ?? 0)
                return (
                  <TableRow key={row.id ?? raw}>
                    <TableCell className="max-w-[14rem] truncate font-medium" title={raw}>
                      {display}
                    </TableCell>
                    {showSpend ? (
                      <TableCell className="text-right tabular-nums num">
                        {formatCurrency(spend)}
                      </TableCell>
                    ) : null}
                    {showSpend ? (
                      <>
                        <TableCell className="text-right tabular-nums num">
                          {formatWholeNumber(clicks)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums num">
                          {formatWholeNumber(impressions)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums num">
                          {formatCpc(spend, clicks)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums num">
                          {formatCtr(clicks, impressions)}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-right tabular-nums num">
                          {formatWholeNumber(impressions)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums num">
                          {formatWholeNumber(clicks)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums num">
                          {formatCtr(clicks, impressions)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums num">
                          {formatWholeNumber(row.videoCompletes)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums num">
                          {formatCompletionRate(Number(row.videoCompletes ?? 0), impressions)}
                        </TableCell>
                      </>
                    )}
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

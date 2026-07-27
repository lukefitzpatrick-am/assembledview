"use client"

import { UNMAPPED_MP_KEY, type CreateTargetRow } from "@/lib/planning/mapEngineSplitToCreateTargets"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"

const MP_LABELS: Record<string, string> = {
  mp_television: "Television",
  mp_radio: "Radio",
  mp_newspaper: "Newspaper",
  mp_magazines: "Magazines",
  mp_ooh: "OOH",
  mp_cinema: "Cinema",
  mp_digidisplay: "Digital Display",
  mp_digiaudio: "Digital Audio",
  mp_digivideo: "Digital Video",
  mp_bvod: "BVOD",
  mp_integration: "Integration",
  mp_search: "Search",
  mp_socialmedia: "Social Media",
  mp_progdisplay: "Prog Display",
  mp_progvideo: "Prog Video",
  mp_progbvod: "Prog BVOD",
  mp_progaudio: "Prog Audio",
  mp_progooh: "Prog OOH",
  mp_influencers: "Influencers",
}

function labelForMpKey(mpKey: string): string {
  if (mpKey === UNMAPPED_MP_KEY) return "Unmapped from planner"
  return MP_LABELS[mpKey] ?? mpKey
}

export type PlannerCreateTargetsStripProps = {
  rows: CreateTargetRow[]
  className?: string
}

export function PlannerCreateTargetsStrip({
  rows,
  className,
}: PlannerCreateTargetsStripProps) {
  if (rows.length === 0) return null

  return (
    <div
      className={cn(
        "rounded-card border border-border bg-card p-4 shadow-e1",
        className
      )}
    >
      <h3 className="text-sm font-medium text-foreground">From planner</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Media toggles and campaign budget prefilled from the frozen planner split.
        No line items were created.
      </p>
      <ul className="mt-3 space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.mp_key}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="text-foreground">{labelForMpKey(row.mp_key)}</span>
            <span className="num tabular-nums text-muted-foreground">
              {formatMoney(row.dollars)}{" "}
              <span className="text-xs">({Math.round(row.pct)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

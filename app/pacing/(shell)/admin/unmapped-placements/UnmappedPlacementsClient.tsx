"use client"

import { useCallback, useEffect, useState } from "react"
import { format, parseISO } from "date-fns"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import type { UnmappedPlacement } from "@/lib/pacing/admin/unmappedPlacements"

const numberFmt = new Intl.NumberFormat("en-AU")

function formatDateRange(firstDate: string, lastDate: string): string {
  const first = firstDate ? format(parseISO(firstDate), "d MMM") : "—"
  const last = lastDate ? format(parseISO(lastDate), "d MMM") : "—"
  if (first === last) return first
  return `${first} – ${last}`
}

export function UnmappedPlacementsClient() {
  const [placements, setPlacements] = useState<UnmappedPlacement[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setPlacements(null)
    try {
      const r = await fetch("/api/admin/unmapped-placements", { credentials: "include" })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { placements: UnmappedPlacement[] }
      setPlacements(json.placements)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <ErrorState
        title="Unmapped placements failed to load"
        message={error}
        onRetry={() => void load()}
      />
    )
  }

  if (!placements) {
    return <LoadingState rows={5} />
  }

  if (placements.length === 0) {
    return (
      <EmptyState
        title="No unmapped CM360 placements"
        message="Every Ad Serving - CM360 placement in the last 60 days already attaches to a published line or a LABEL_MAP override."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Unmapped CM360 placements</h1>
        <p className="text-xs text-muted-foreground">
          {placements.length} placements in the last 60 days with no published line suffix and
          no LINE_ITEM_LABEL_MAP override. Read-only.
        </p>
      </div>

      <div className="overflow-auto rounded-card border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-2">Placement</th>
              <th className="p-2">Campaign</th>
              <th className="p-2">Date range</th>
              <th className="p-2 text-right">Impressions</th>
              <th className="p-2">Suggested MBA</th>
            </tr>
          </thead>
          <tbody>
            {placements.map((row) => (
              <tr
                key={`${row.placementName}|${row.campaignName}`}
                className="border-t border-border"
              >
                <td className="p-2 font-mono">{row.placementName}</td>
                <td className="p-2">{row.campaignName}</td>
                <td className="p-2">{formatDateRange(row.firstDate, row.lastDate)}</td>
                <td className="num p-2 text-right">{numberFmt.format(row.impressions)}</td>
                <td className="p-2">{row.suggestedMba ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

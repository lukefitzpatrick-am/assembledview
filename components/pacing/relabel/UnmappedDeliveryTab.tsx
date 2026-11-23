"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import { HelpTip } from "@/components/help/Help"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { copyToClipboard } from "@/lib/copyToClipboard"
import { getMelbourneTodayISO } from "@/lib/dates/melbourne"
import { clientFeatureOn } from "@/lib/features/client"
import { formatMoney } from "@/lib/format/money"
import {
  daysUnmatched,
  filterUnmappedDeliveryByStem,
  supplierNoteDraft,
  summariseUnmappedDelivery,
  type UnmappedChannelSummary,
  type UnmappedDeliveryRow,
  type UnmappedSuggestionKind,
} from "@/lib/pacing/admin/unmappedDelivery"
import { relabelsHref } from "@/lib/pacing/relabel/shared/relabelPageUrl"

const numberFmt = new Intl.NumberFormat("en-AU")

const KIND_LABEL: Record<UnmappedSuggestionKind, string> = {
  relabel: "Relabel",
  match: "Check on Match",
  add_line: "Not on plan",
  rename: "No line id",
}

function kindVariant(kind: UnmappedSuggestionKind): "success" | "warning" | "secondary" {
  if (kind === "relabel") return "success"
  if (kind === "add_line" || kind === "match") return "warning"
  return "secondary"
}

function formatDateRange(firstDate: string, lastDate: string): string {
  const first = firstDate ? format(parseISO(firstDate), "d MMM") : "-"
  const last = lastDate ? format(parseISO(lastDate), "d MMM") : "-"
  return first === last ? first : `${first} to ${last}`
}

/**
 * Relabels > Unmapped when the "unmapped_delivery" switch is on: every
 * warehouse channel, last 30 days, with what to do about each entity.
 * Relabel pre-fills New relabel with the channel, entity and suggested line.
 */
export function UnmappedDeliveryTab({
  mbaFilter,
  onRelabel,
}: {
  mbaFilter: string
  onRelabel: (row: UnmappedDeliveryRow) => void
}) {
  const [rows, setRows] = useState<UnmappedDeliveryRow[] | null>(null)
  const [windowDays, setWindowDays] = useState(30)
  const [error, setError] = useState<string | null>(null)
  const [channel, setChannel] = useState<string>("")
  const [copied, setCopied] = useState<string>("")
  // The note to select by hand when the clipboard refuses.
  const [uncopied, setUncopied] = useState<{ name: string; note: string } | null>(null)
  const queue = clientFeatureOn("unmatched_delivery_queue")
  const today = useMemo(() => getMelbourneTodayISO(), [])

  const copyNote = async (row: UnmappedDeliveryRow, note: string) => {
    setCopied("") // so a second copy of the same row is announced again
    const ok = await copyToClipboard(note)
    setUncopied(ok ? null : { name: row.name, note })
    setCopied(ok ? `Supplier note for ${row.name} copied.` : `Could not copy. The note for ${row.name} is below the table; select it and copy.`)
  }


  const load = useCallback(async () => {
    setError(null)
    setRows(null)
    try {
      const r = await fetch("/api/admin/unmapped-delivery", { credentials: "include" })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const json = (await r.json()) as { windowDays: number; rows: UnmappedDeliveryRow[] }
      setWindowDays(json.windowDays)
      setRows(json.rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setRows([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const forStem = useMemo(() => filterUnmappedDeliveryByStem(rows ?? [], mbaFilter), [rows, mbaFilter])
  const summary: UnmappedChannelSummary[] = useMemo(() => summariseUnmappedDelivery(forStem), [forStem])
  const visible = useMemo(() => (channel ? forStem.filter((r) => r.channel === channel) : forStem), [forStem, channel])

  if (error) {
    return <ErrorState title="Unmapped delivery failed to load" message={error} onRetry={() => void load()} />
  }
  if (rows == null) return <LoadingState rows={5} />
  if (forStem.length === 0) {
    return (
      <EmptyState
        title="No unmapped delivery"
        message={`Every platform entity with delivery in the last ${windowDays} days attaches to a published line or a relabel.${mbaFilter ? ` Filtered to ${mbaFilter}.` : ""}`}
      />
    )
  }

  return (
    <div className="space-y-3" data-unmapped-delivery="">
      <p className="text-xs text-muted-foreground">
        {forStem.length} platform entities with delivery in the last {windowDays} days and no published line or relabel.
        {mbaFilter ? ` Filtered to ${mbaFilter}.` : ""} Fix it at the source where you can: put the line id in the platform name.
        Relabel pre-fills New relabel.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={channel === "" ? "default" : "outline"} onClick={() => setChannel("")}>
          All
        </Button>
        {summary.map((s) => (
          <Button
            key={s.channel}
            type="button"
            size="sm"
            variant={channel === s.channel ? "default" : "outline"}
            onClick={() => setChannel(s.channel)}
          >
            {s.channel}: {s.entities} · {formatMoney(s.spend)}
          </Button>
        ))}
      </div>
      <div className="overflow-auto rounded-card border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-2">Channel</th>
              <th className="p-2">Name</th>
              <th className="p-2">Campaign</th>
              <th className="p-2">Dates</th>
              {queue ? (
                <th className="p-2 whitespace-nowrap">
                  Days unmatched
                  <HelpTip id="unmatchedDays" label="Days unmatched" />
                </th>
              ) : null}
              <th className="p-2 text-right">Spend</th>
              <th className="p-2 text-right">Impressions</th>
              <th className="p-2">Line id now</th>
              <th className="p-2">What to do</th>
              <th className="p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const note = queue ? supplierNoteDraft(row, today) : null
              const action =
                row.suggestion.kind === "match" ? (
                  <a
                    href={relabelsHref({ mba: row.suggestion.mba })}
                    aria-label={`Open Match for ${row.suggestion.mba}`}
                    className={buttonVariants({ size: "sm", variant: "outline" })}
                  >
                    Open Match
                  </a>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => onRelabel(row)}>
                    Relabel
                  </Button>
                )
              return (
                <tr key={`${row.channel}|${row.platformEntityId}`} className="border-t border-border align-top">
                  <td className="p-2">{row.channel}</td>
                  <td className="p-2 font-mono">{row.name}</td>
                  <td className="p-2">
                    {row.campaignName}
                    {row.account ? <div className="text-muted-foreground">Account {row.account}</div> : null}
                  </td>
                  <td className="p-2 whitespace-nowrap">{formatDateRange(row.firstDate, row.lastDate)}</td>
                  {queue ? <td className="num p-2 text-right">{daysUnmatched(row, today)}</td> : null}
                  <td className="num p-2 text-right">{formatMoney(row.spend)}</td>
                  <td className="num p-2 text-right">{numberFmt.format(row.impressions)}</td>
                  <td className="p-2 font-mono">{row.currentLineItemId ?? "-"}</td>
                  <td className="p-2">
                    <Badge variant={kindVariant(row.suggestion.kind)}>{KIND_LABEL[row.suggestion.kind]}</Badge>
                    <div className="mt-1 text-muted-foreground">{row.suggestion.action}</div>
                  </td>
                  <td className="p-2">
                    {note ? (
                      <div className="flex flex-col gap-1">
                        {action}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Copy supplier note for ${row.name}`}
                          title={note}
                          onClick={() => void copyNote(row, note)}
                        >
                          Copy supplier note
                        </Button>
                      </div>
                    ) : (
                      action
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {queue ? (
        <p role="status" aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
          {copied}
        </p>
      ) : null}
      {queue && uncopied ? (
        <label className="block space-y-1 text-xs">
          <span>Supplier note for {uncopied.name}</span>
          <textarea readOnly rows={12} value={uncopied.note} className="w-full rounded-card border border-border bg-background p-2 font-mono" />
        </label>
      ) : null}
    </div>
  )
}

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Target } from "lucide-react"

import { StatusPill } from "@/components/dashboard/delivery/shared/StatusPill"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  copyToAll,
  draftFromTargets,
  forwardMonths,
  increaseEachMonth,
  previousMonths,
  targetsFromDraft,
  type KpiEditorRow,
  type TargetDraft,
} from "@/lib/webReport/kpis/editor"
import { monthLabel } from "@/lib/webReport/kpis/report"
import {
  GA4_KPI_METRICS,
  GSC_KPI_METRICS,
  WEB_KPI_SOURCES,
  type WebKpiMetric,
  type WebKpiSource,
} from "@/lib/webReport/kpis/types"

const NUMBER = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 })

const SOURCE_LABEL: Record<WebKpiSource, string> = {
  ga4_event: "GA4 events",
  ga4_metric: "GA4 metric",
  gsc_metric: "Search Console metric",
}

const METRIC_LABEL: Record<WebKpiMetric, string> = {
  sessions: "Sessions",
  engaged_sessions: "Engaged sessions",
  key_events: "Key events",
  page_views: "Page views",
  clicks: "Clicks",
  impressions: "Impressions",
}

const FIELD_CLASS =
  "h-11 w-full rounded-input border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

const EVENT_LIST_LIMIT = 60

type EditorData = {
  today: string
  migrationApplied: boolean
  rows: KpiEditorRow[]
  eventNames: { name: string; count: number }[]
}

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: EditorData }

export type KpiFormValue = {
  label: string
  source: WebKpiSource
  eventNames: string[]
  metric: WebKpiMetric | null
  draft: TargetDraft
}

function metricsFor(source: WebKpiSource): readonly WebKpiMetric[] {
  if (source === "ga4_metric") return GA4_KPI_METRICS
  if (source === "gsc_metric") return GSC_KPI_METRICS
  return []
}

function detailOf(row: KpiEditorRow): string {
  if (row.source === "ga4_event") return (row.eventNames ?? []).join(", ")
  return row.metric ? METRIC_LABEL[row.metric] : "—"
}

function formatNumber(value: number | null): string {
  return value == null ? "—" : NUMBER.format(value)
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  return (await response.json().catch(() => null)) as Record<string, unknown> | null
}

function errorOf(payload: Record<string, unknown> | null, fallback: string): string {
  return typeof payload?.error === "string" ? payload.error : fallback
}

export function KpiEditor({ slug, onChanged }: { slug: string; onChanged?: () => void }) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" })
  const [editing, setEditing] = useState<{ row: KpiEditorRow | null } | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/dashboard/${slug}/web-kpis`, { cache: "no-store" })
      const payload = await readJson(response)
      if (!response.ok || !payload) {
        setLoad({ status: "error", message: errorOf(payload, "KPIs could not be loaded") })
        return
      }
      setLoad({ status: "ready", data: payload as unknown as EditorData })
    } catch {
      setLoad({ status: "error", message: "KPIs could not be loaded" })
    }
  }, [slug])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function post(body: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(`/api/dashboard/${slug}/web-kpis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const payload = await readJson(response)
    if (!response.ok) throw new Error(errorOf(payload, "The KPI could not be saved"))
    return payload ?? {}
  }

  async function onSave(value: KpiFormValue) {
    const targets = targetsFromDraft(value.draft)
    if (!targets.ok) {
      setActionError(targets.error)
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      const saved = await post({
        action: "upsert",
        kpi: {
          id: editing?.row?.id,
          label: value.label,
          source: value.source,
          eventNames: value.source === "ga4_event" ? value.eventNames : null,
          metric: value.source === "ga4_event" ? null : value.metric,
          sortOrder: editing?.row?.sortOrder,
        },
      })
      const kpiId = (saved.kpi as { id?: string } | undefined)?.id
      if (kpiId && targets.targets.length > 0) {
        await post({ action: "targets", kpiId, targets: targets.targets })
      }
      setEditing(null)
      await refresh()
      onChanged?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The KPI could not be saved")
    } finally {
      setBusy(false)
    }
  }

  async function onDeactivate(kpiId: string) {
    setBusy(true)
    setActionError(null)
    try {
      await post({ action: "deactivate", kpiId })
      setConfirming(null)
      await refresh()
      onChanged?.()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "The KPI could not be deactivated")
    } finally {
      setBusy(false)
    }
  }

  if (load.status === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-10 w-48 rounded-input" />
        <Skeleton className="h-48 w-full rounded-card" />
      </div>
    )
  }

  if (load.status === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-border bg-pacing-critical-bg p-4">
        <p className="text-sm text-status-critical-fg">{load.message}</p>
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    )
  }

  const { data } = load
  if (!data.migrationApplied) {
    return (
      <p className="rounded-card border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Web KPIs need migration 0101.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">KPIs</h2>
          <p className="text-sm text-muted-foreground">
            Monthly targets for saved KPIs. Clients see them in KPI tiles and the KPI tracker.
          </p>
        </div>
        {editing ? null : (
          <Button type="button" className="min-h-11" onClick={() => setEditing({ row: null })}>
            Add KPI
          </Button>
        )}
      </div>

      {actionError ? (
        <p role="alert" className="rounded-card border border-border bg-pacing-critical-bg px-4 py-3 text-sm text-status-critical-fg">
          {actionError}
        </p>
      ) : null}

      {editing ? (
        <KpiForm
          key={editing.row?.id ?? "new"}
          initial={editing.row}
          today={data.today}
          eventNames={data.eventNames}
          busy={busy}
          onCancel={() => {
            setEditing(null)
            setActionError(null)
          }}
          onSave={(value) => void onSave(value)}
        />
      ) : null}

      {data.rows.length === 0 ? (
        editing ? null : (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-card px-4 py-10 text-center">
            <Target className="h-6 w-6 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            <p className="text-sm text-muted-foreground">No KPIs yet for this client.</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditing({ row: null })}>
              Add the first KPI
            </Button>
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-card shadow-e1">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Events or metric</TableHead>
                <TableHead className="text-right">Target this month</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.id} className={row.active ? undefined : "text-muted-foreground"}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell>{SOURCE_LABEL[row.source]}</TableCell>
                  <TableCell className="max-w-[280px] truncate">{detailOf(row)}</TableCell>
                  <TableCell className="num text-right">{formatNumber(row.monthTarget)}</TableCell>
                  <TableCell className="num text-right">{row.active ? formatNumber(row.monthActual) : "—"}</TableCell>
                  <TableCell>
                    {row.active ? (
                      row.monthTarget == null ? (
                        <span className="text-sm text-muted-foreground">No target</span>
                      ) : (
                        <StatusPill status={row.monthStatus} />
                      )
                    ) : (
                      <Badge variant="neutral" size="sm">Deactivated</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.active ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-11"
                          disabled={busy}
                          onClick={() => {
                            setConfirming(null)
                            setEditing({ row })
                          }}
                        >
                          Edit
                        </Button>
                        {confirming === row.id ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="min-h-11"
                            disabled={busy}
                            onClick={() => void onDeactivate(row.id)}
                          >
                            Confirm deactivate
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="min-h-11"
                            disabled={busy}
                            onClick={() => setConfirming(row.id)}
                          >
                            Deactivate
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Deactivated KPIs are hidden from reports. Their targets are kept.
          </p>
        </div>
      )}
    </div>
  )
}

export function KpiForm({
  initial,
  today,
  eventNames,
  busy,
  onCancel,
  onSave,
}: {
  initial: KpiEditorRow | null
  today: string
  eventNames: { name: string; count: number }[]
  busy: boolean
  onCancel: () => void
  onSave: (value: KpiFormValue) => void
}) {
  const [label, setLabel] = useState(initial?.label ?? "")
  const [source, setSource] = useState<WebKpiSource>(initial?.source ?? "ga4_event")
  const [selected, setSelected] = useState<string[]>(initial?.eventNames ?? [])
  const [metric, setMetric] = useState<WebKpiMetric | null>(initial?.metric ?? null)
  const [search, setSearch] = useState("")
  const [draft, setDraft] = useState<TargetDraft>(() => draftFromTargets(initial?.targets ?? []))
  const [showPrevious, setShowPrevious] = useState(false)
  const [increasePct, setIncreasePct] = useState("")

  const forward = useMemo(() => forwardMonths(today), [today])
  const previous = useMemo(() => previousMonths(today), [today])
  const months = showPrevious ? [...previous, ...forward] : forward

  const filteredEvents = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const list = needle ? eventNames.filter((item) => item.name.toLowerCase().includes(needle)) : eventNames
    return list.slice(0, EVENT_LIST_LIMIT)
  }, [eventNames, search])

  const metricOptions = metricsFor(source)
  const activeMetric = metric && metricOptions.includes(metric) ? metric : null
  const canSave =
    !busy && label.trim().length > 0 && (source === "ga4_event" ? selected.length > 0 : activeMetric != null)

  function toggleEvent(name: string) {
    setSelected((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]))
  }

  const pct = Number(increasePct)
  const canIncrease = increasePct.trim() !== "" && Number.isFinite(pct) && Boolean(draft[forward[0] ?? ""]?.trim())

  return (
    <form
      aria-label={initial ? `Edit ${initial.label}` : "Add KPI"}
      className="flex flex-col gap-5 rounded-card border border-border bg-card p-4 shadow-e1"
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSave) return
        onSave({ label: label.trim(), source, eventNames: selected, metric: activeMetric, draft })
      }}
    >
      <h3 className="text-sm font-semibold text-foreground">{initial ? `Edit ${initial.label}` : "Add KPI"}</h3>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-foreground">
          <span>Label</span>
          <Input className="h-11" maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-foreground">
          <span>Source</span>
          <select
            className={FIELD_CLASS}
            value={source}
            onChange={(event) => setSource(event.target.value as WebKpiSource)}
          >
            {WEB_KPI_SOURCES.map((option) => (
              <option key={option} value={option}>
                {SOURCE_LABEL[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {source === "ga4_event" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm text-foreground">Events</legend>
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selected.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="interactive-tint rounded-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${name}`}
                  onClick={() => toggleEvent(name)}
                >
                  <Badge variant="outline" size="sm">
                    {name} ×
                  </Badge>
                </button>
              ))}
            </div>
          ) : null}
          <Input
            className="h-11"
            aria-label="Search events"
            placeholder="Search events"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {eventNames.length === 0 ? (
            <p className="text-sm text-muted-foreground">No GA4 events in the last 90 days for this property.</p>
          ) : filteredEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events match.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-input border border-border">
              {filteredEvents.map((item) => (
                <label
                  key={item.name}
                  className="interactive-row flex min-h-11 cursor-pointer items-center justify-between gap-3 border-b border-border px-3 text-sm last:border-b-0"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selected.includes(item.name)}
                      onChange={() => toggleEvent(item.name)}
                    />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="num text-xs text-muted-foreground">{NUMBER.format(item.count)} in 90 days</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ) : (
        <label className="flex flex-col gap-1 text-sm text-foreground md:max-w-sm">
          <span>Metric</span>
          <select
            className={FIELD_CLASS}
            value={activeMetric ?? ""}
            onChange={(event) => setMetric((event.target.value || null) as WebKpiMetric | null)}
          >
            <option value="">Choose a metric</option>
            {metricOptions.map((option) => (
              <option key={option} value={option}>
                {METRIC_LABEL[option]}
              </option>
            ))}
          </select>
        </label>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">Monthly targets</legend>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={!draft[forward[0] ?? ""]?.trim()}
            onClick={() => setDraft((current) => copyToAll(current, forward))}
          >
            Copy to all months
          </Button>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <span>Increase each month by</span>
            <Input
              className="num h-11 w-20"
              type="number"
              step="any"
              aria-label="Increase each month by percent"
              value={increasePct}
              onChange={(event) => setIncreasePct(event.target.value)}
            />
            <span>%</span>
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={!canIncrease}
            onClick={() => setDraft((current) => increaseEachMonth(current, forward, pct))}
          >
            Apply
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            aria-pressed={showPrevious}
            onClick={() => setShowPrevious((current) => !current)}
          >
            {showPrevious ? "Hide previous 12 months" : "Show previous 12 months"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Copy and increase start from {monthLabel(forward[0] ?? today)}. Blank months keep any saved target.
        </p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {months.map((month) => (
            <label key={month} className="flex flex-col gap-1 text-xs text-muted-foreground">
              <span>{monthLabel(month)}</span>
              <Input
                className="num h-11"
                type="number"
                min={0}
                step="any"
                value={draft[month] ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, [month]: event.target.value }))}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button type="submit" className="min-h-11" disabled={!canSave}>
          {busy ? "Saving…" : "Save KPI"}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

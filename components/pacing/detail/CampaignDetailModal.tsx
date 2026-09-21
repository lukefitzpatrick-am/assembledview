"use client"

import { useMemo, useState } from "react"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { openAvaChat, setAssistantContext } from "@/lib/assistantBridge"
import { formatMoney, formatPercent } from "@/lib/format/money"
import { formatCount, formatRateMoney } from "@/lib/pacing/channel/lineCardFormat"
import type { LineCardModel, LineCardPace } from "@/lib/pacing/channel/lineCardTypes"
import { suggestedNextStep } from "@/lib/pacing/detail/suggestedNextStep"
import { KPI_NOT_TRACKED_FOR_SOURCE } from "@/lib/pacing/detail/kpisFromLines"
import {
  lineDetailDescription,
  visibleLineDetailColumns,
  type LineDetailColumnKey,
} from "@/lib/pacing/detail/lineDetailColumns"
import type { CampaignDetailMetric, CampaignDetailPayload } from "@/lib/pacing/detail/types"
import {
  campaignDisplayBand,
  campaignPaceLabel,
  displayBandBadgeVariant,
  displayBandFillClass,
  displayBandTextClass,
} from "@/lib/pacing/portfolio/portfolioPresentation"
import { cn } from "@/lib/utils"
import { useScenarioPlanner } from "@/components/pacing/scenario/ScenarioPlannerContext"
import { CampaignAskHelpDialog } from "./CampaignAskHelpDialog"

type TabKey = "overview" | "lines" | "kpis" | "bursts" | "daily" | "notes"

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "lines", label: "Lines" },
  { key: "kpis", label: "KPIs" },
  { key: "bursts", label: "Bursts" },
  { key: "daily", label: "Daily" },
  { key: "notes", label: "Notes & actions" },
]

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return formatMoney(value, { decimals: 0 })
}

function paceLabel(pace: LineCardPace): string {
  if (pace === "on_track") return "On track"
  if (pace === "over_pacing") return "Over"
  if (pace === "no_data") return "No data"
  return pace.replace("_", " ")
}

function lineCell(line: LineCardModel, key: LineDetailColumnKey): string {
  switch (key) {
    case "line":
      return line.lineItemId
    case "channel":
      return `${line.channel} · ${line.platform}`
    case "status":
      return paceLabel(line.pace)
    case "kpiStatus":
      return line.kpiStatus === "kpi-pending" ? "KPI pending" : line.kpiStatus ?? "—"
    case "spendPace":
      return formatPercent(line.linePct, { decimals: 0 })
    case "burstPace":
      return line.burstPct == null ? "—" : formatPercent(line.burstPct, { decimals: 0 })
    case "spend":
      return line.verificationOnly ? "—" : money(line.spend)
    case "budget":
      return line.verificationOnly ? "—" : money(line.budget)
    case "burstSpend":
      return line.burstSpend == null ? "—" : money(line.burstSpend)
    case "burstBudget":
      return line.burstBudget == null ? "—" : money(line.burstBudget)
    case "remainingLine":
      return money(line.remainingLine)
    case "perDayLeft":
      return line.perDayLeft == null ? "—" : money(line.perDayLeft)
    case "yesterday":
      return money(line.yesterday)
    case "impressions":
      return line.impressions == null ? "—" : formatCount(line.impressions)
    case "clicks":
      return line.clicks == null ? "—" : formatCount(line.clicks)
    case "ctr":
      return line.ctr == null ? "—" : formatPercent(line.ctr * 100, { decimals: 2 })
    case "cpc":
      return line.cpc == null ? "—" : formatRateMoney(line.cpc)
    case "cpm":
      return line.cpm == null ? "—" : formatRateMoney(line.cpm)
    case "conversions":
      return line.conversions == null ? "—" : formatCount(line.conversions)
    case "views":
      return line.views == null ? "—" : formatCount(line.views)
    case "bursts":
      return line.bursts.index != null
        ? `${line.bursts.index + 1} of ${line.bursts.total}`
        : `${line.bursts.total}`
    case "lineStart":
      return line.lineStart ?? "—"
    case "lineEnd":
      return line.lineEnd ?? "—"
    case "targeting":
      return line.targeting || "—"
    case "buyType":
      return line.buyType || "—"
    case "fixedCost":
      return line.fixedCost ? "yes" : "no"
    default:
      return "—"
  }
}

function openAva(mba: string, message: string, campaignName?: string) {
  setAssistantContext({
    pageContext: {
      entities: { mbaNumber: mba, campaignName },
      route: { mbaSlug: mba },
    },
  })
  openAvaChat({ message })
}

export function CampaignDetailModal({
  mba,
  asOf,
  payload,
  loading,
  error,
  onClose,
  onReload,
}: {
  mba: string
  asOf: string
  payload: CampaignDetailPayload | null
  loading: boolean
  error: string | null
  onClose: () => void
  onReload: () => void
}) {
  const planner = useScenarioPlanner()
  const [tab, setTab] = useState<TabKey>("overview")
  const [metric, setMetric] = useState<CampaignDetailMetric>("spend")
  const [combined, setCombined] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const [note, setNote] = useState("")
  const [savingNote, setSavingNote] = useState(false)

  const row = payload?.row
  const columns = useMemo(
    () => visibleLineDetailColumns(payload?.lines ?? []),
    [payload?.lines],
  )
  const nextStep = row ? suggestedNextStep(row) : ""
  const band = row ? campaignDisplayBand(row) : "no-data"
  const dashboardHref = row
    ? `/dashboard/${encodeURIComponent(row.clientSlug)}/${encodeURIComponent(row.mbaNumber)}`
    : "#"

  const dailySeries = useMemo(() => {
    const series = payload?.daily.byMetric[metric] ?? payload?.daily.series ?? []
    if (combined) return series.filter((item) => item.key === "combined")
    return series.filter((item) => item.key !== "combined")
  }, [payload, combined, metric])

  async function addNote() {
    const body = note.trim()
    if (!body) return
    setSavingNote(true)
    try {
      const res = await fetch(`/api/pacing/campaign/${encodeURIComponent(mba)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) throw new Error("Could not add note")
      setNote("")
      onReload()
    } finally {
      setSavingNote(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={row ? `${row.campaignName} detail` : "Campaign detail"}
      className="fixed inset-0 z-modal flex items-start justify-center overflow-y-auto bg-background/80 p-4 pt-10"
    >
      <div className="flex w-full min-w-0 max-w-6xl flex-col rounded-frame border border-border bg-card shadow-e2">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {row?.clientName ?? "…"}
            </p>
            <h2 className="text-lg font-semibold text-foreground">
              {row?.campaignName ?? mba}{" "}
              <span className="font-mono text-sm font-normal text-muted-foreground">{mba}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {row ? (
                <Badge variant={displayBandBadgeVariant(band)} size="sm" dot>
                  {campaignPaceLabel(row)}
                </Badge>
              ) : null}
              <span>{row?.status ?? "—"}</span>
              <span>v{row?.versionNumber ?? "—"}</span>
              <span>
                {row?.startDate ?? "—"} – {row?.endDate ?? "—"}
              </span>
              <span className="num">{money(row?.budget)}</span>
              <span className="num">{formatPercent(row?.timePct ?? 0, { decimals: 0 })} elapsed</span>
              <span className="num">{row?.daysLeft ?? "—"} days left</span>
              <time dateTime={asOf}>Updated {asOf}</time>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => planner?.open(mba)}
            >
              Plan a scenario
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openAva(mba, "Write commentary", row?.campaignName)}
            >
              Write commentary
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openAva(mba, `Ask AVA about ${mba}`, row?.campaignName)}
            >
              Ask AVA
            </Button>
            <Button type="button" variant="secondary" size="sm" asChild>
              <a href={dashboardHref}>Open client dashboard →</a>
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <nav className="flex flex-wrap gap-1 border-b border-border px-5 pt-3">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cn(
                "rounded-t-input px-3 py-2 text-sm",
                tab === item.key
                  ? "bg-surface-panel font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 max-h-[70vh] overflow-y-auto px-5 py-4">
          {loading ? <Skeleton className="h-40 w-full" /> : null}
          {error ? <p className="text-sm text-status-critical-fg">{error}</p> : null}
          {payload && tab === "overview" ? (
            <div className="space-y-4">
              <div className="grid gap-3 min-[800px]:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Where we are</p>
                  <div className="space-y-2">
                    <Bar label="Time elapsed" fill={payload.row.timePct} className="bg-pacing-on-track" />
                    <Bar
                      label="Spend delivered"
                      fill={payload.row.spendPct}
                      className={displayBandFillClass(band)}
                    />
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Stat label="Daily rate" value={money(payload.row.dailyRateActual)} />
                  <Stat label="Money at risk" value={money(payload.row.moneyAtRisk)} />
                  <Stat
                    label="KPIs tracked"
                    value={
                      payload.row.kpi
                        ? `${payload.row.kpi.tracked} of ${payload.row.kpi.total}`
                        : "—"
                    }
                  />
                  <Stat label="Sources" value={`${payload.row.channels.length}`} />
                </dl>
              </div>
              <p className="rounded-r-input border-l-[3px] border-border bg-surface-panel px-3 py-2 text-sm">
                {payload.row.why}
              </p>
              <p className="text-sm text-foreground">
                <span className="font-semibold">Suggested next step. </span>
                {nextStep}
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Channel</th>
                    <th className="py-2">Pace</th>
                    <th className="num py-2 text-right">Spend</th>
                    <th className="num py-2 text-right">Budget</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.row.channels.map((channel) => (
                    <tr key={channel.channelKey} className="border-t border-border">
                      <td className="py-2">{channel.label}</td>
                      <td className="py-2">
                        <span className={displayBandTextClass(band)}>{formatPercent(channel.spendPct, { decimals: 0 })}</span>
                      </td>
                      <td className="num py-2 text-right">{money(channel.spendToDate)}</td>
                      <td className="num py-2 text-right">{money(channel.budget)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {payload && tab === "lines" ? (
            <div className="min-w-0 max-h-[60vh] overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        className={cn(
                          "sticky top-0 z-20 bg-card px-2 py-2 text-xs font-medium uppercase text-muted-foreground",
                          column.numeric && "num text-right",
                          column.key === "line" && "left-0 z-30 min-w-[14rem] max-w-[18rem]",
                        )}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payload.lines.map((line) => (
                    <tr key={line.lineItemId} className="border-t border-border">
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            "px-2 py-2",
                            column.numeric && "num text-right",
                            column.key === "line" &&
                              "sticky left-0 z-10 min-w-[14rem] max-w-[18rem] bg-card",
                          )}
                        >
                          {column.key === "line" ? (
                            <LineIdentityCell line={line} />
                          ) : (
                            lineCell(line, column.key)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {payload && tab === "kpis" ? (
            <div className="grid gap-4 min-[800px]:grid-cols-2">
              {payload.kpis.map((group) => (
                <section
                  key={group.key}
                  data-kpi-line={group.lineItemId}
                  className="rounded-card border border-border p-3"
                >
                  <header className="mb-2 space-y-0.5">
                    <h3 className="font-mono text-xs text-foreground">{group.lineItemId}</h3>
                    <p className="text-sm text-muted-foreground">
                      {[
                        group.name,
                        group.channelPlatform,
                        group.buyType,
                        group.budget && Number.isFinite(group.budget)
                          ? money(group.budget)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </header>
                  {group.untracked ? (
                    <p className="text-sm text-muted-foreground">{KPI_NOT_TRACKED_FOR_SOURCE}</p>
                  ) : group.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No targets set.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-muted-foreground">
                          <th className="py-1">KPI</th>
                          <th className="num py-1 text-right">Target</th>
                          <th className="num py-1 text-right">Delivered</th>
                          <th className="py-1">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((kpi) => (
                          <tr key={`${group.key}:${kpi.label}`} className="border-t border-border">
                            <td className="py-1.5">{kpi.label}</td>
                            <td className="num py-1.5 text-right">
                              {kpi.targetDisplay}{" "}
                              {kpi.targetCaption ? (
                                <small className="text-muted-foreground">{kpi.targetCaption}</small>
                              ) : null}
                            </td>
                            <td className="num py-1.5 text-right">{kpi.deliveredDisplay}</td>
                            <td className="py-1.5">{kpi.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              ))}
            </div>
          ) : null}

          {payload && tab === "bursts" ? (
            <div className="space-y-4">
              <div className="space-y-3">
                {payload.lines.map((line) => (
                  <div key={line.lineItemId} className="grid grid-cols-[160px_1fr] items-center gap-3">
                    <span className="truncate text-xs text-muted-foreground">
                      {line.lineItemId} · {line.platform}
                    </span>
                    <div className="relative h-3 rounded-pill bg-fill-track">
                      {line.bursts.states.map((state, index) => (
                        <i
                          key={`${line.lineItemId}:${index}`}
                          className={cn(
                            "absolute top-0 h-full rounded-pill",
                            state === "now" && "bg-foreground",
                            state === "done" && "bg-muted-foreground/50",
                            state === "future" && "bg-border",
                          )}
                          style={{
                            left: `${(index / Math.max(line.bursts.total, 1)) * 100}%`,
                            width: `${100 / Math.max(line.bursts.total, 1) - 1}%`,
                          }}
                        />
                      ))}
                      <span
                        className="absolute top-[-4px] h-5 w-px bg-foreground"
                        style={{ left: `${Math.min(100, line.timePct)}%` }}
                        aria-label="Today"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Line</th>
                    <th className="py-2">Burst</th>
                    <th className="py-2">Start</th>
                    <th className="py-2">End</th>
                    <th className="num py-2 text-right">Days</th>
                    <th className="num py-2 text-right">Budget</th>
                    <th className="num py-2 text-right">Spend</th>
                    <th className="num py-2 text-right">Pace</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.bursts.map((burst) => (
                    <tr key={`${burst.lineItemId}:${burst.index}`} className="border-t border-border">
                      <td className="py-2">{burst.lineItemId}</td>
                      <td className="py-2">{burst.index + 1}</td>
                      <td className="py-2">{burst.start}</td>
                      <td className="py-2">{burst.end}</td>
                      <td className="num py-2 text-right">{burst.days}</td>
                      <td className="num py-2 text-right">{money(burst.budget)}</td>
                      <td className="num py-2 text-right">{money(burst.spend)}</td>
                      <td className="num py-2 text-right">{formatPercent(burst.pct, { decimals: 0 })}</td>
                      <td className="py-2">{paceLabel(burst.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {payload && tab === "daily" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(["spend", "impressions", "clicks", "views"] as const).map((key) => (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={metric === key ? "default" : "outline"}
                    onClick={() => setMetric(key)}
                  >
                    {key}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant={combined ? "default" : "outline"}
                  onClick={() => setCombined((value) => !value)}
                >
                  {combined ? "Combined" : "Per channel"}
                </Button>
              </div>
              <DailyBars series={dailySeries} metric={metric} />
            </div>
          ) : null}

          {payload && tab === "notes" ? (
            <div className="grid gap-4 min-[800px]:grid-cols-2">
              <section className="rounded-card border border-border p-3">
                <h3 className="mb-2 text-sm font-semibold">
                  Campaign read
                  {payload.read?.publishedAt
                    ? ` (published ${payload.read.publishedAt.slice(0, 10)})`
                    : ""}
                </h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {payload.read?.bodyMarkdown || "No published campaign read yet."}
                </p>
              </section>
              <section className="rounded-card border border-border p-3">
                <h3 className="mb-2 text-sm font-semibold">Recent notes</h3>
                <div className="grid gap-2 text-sm">
                  {payload.notes.length === 0 ? (
                    <p className="text-muted-foreground">No notes yet.</p>
                  ) : (
                    payload.notes.map((item) => (
                      <div key={item.id}>
                        <b>
                          {item.at.slice(0, 10)} · {item.author}
                        </b>{" "}
                        · {item.body}
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add a note"
                  />
                  <Button type="button" size="sm" onClick={() => void addNote()} disabled={savingNote || !note.trim()}>
                    Add note
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setHelpOpen(true)}>
                    Ask for help
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openAva(mba, "Write commentary", row?.campaignName)}
                  >
                    Write commentary
                  </Button>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
      <CampaignAskHelpDialog mba={mba} open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}

function LineIdentityCell({ line }: { line: LineCardModel }) {
  const description = lineDetailDescription(line)
  return (
    <div className="min-w-0">
      <p className="font-mono text-xs text-foreground">{line.lineItemId}</p>
      <p className="truncate text-xs text-muted-foreground" title={description}>
        {description}
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num font-semibold">{value}</dd>
    </div>
  )
}

function Bar({ label, fill, className }: { label: string; fill: number; className: string }) {
  const width = Math.max(0, Math.min(100, fill))
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="h-2 rounded-pill bg-fill-track">
        <div className={cn("h-full rounded-pill", className)} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function DailyBars({
  series,
  metric,
}: {
  series: CampaignDetailPayload["daily"]["series"]
  metric: CampaignDetailMetric
}) {
  const first = series[0]
  if (!first || first.points.length === 0) {
    return <p className="text-sm text-muted-foreground">No daily {metric} yet.</p>
  }
  const max = Math.max(
    1,
    ...series.flatMap((item) => item.points.flatMap((point) => [point.actual, point.plan])),
  )
  return (
    <div className="space-y-3">
      {series.map((item) => (
        <div key={item.key}>
          <p className="mb-1 text-xs text-muted-foreground">{item.label}</p>
          <div className="flex h-24 items-end gap-px">
            {item.points.map((point) => (
              <div key={`${item.key}:${point.date}`} className="flex flex-1 items-end gap-px">
                <span
                  className="w-1/2 bg-pacing-on-track"
                  style={{ height: `${(point.actual / max) * 100}%` }}
                />
                <span
                  className="w-1/2 bg-fill-track"
                  style={{ height: `${(point.plan / max) * 100}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MetricCard } from "@/components/ui/MetricCard"
import { formatMoney } from "@/lib/format/money"
import { formatCount } from "@/lib/pacing/channel/lineCardFormat"
import { applyScenario } from "@/lib/pacing/scenario/applyScenario"
import { backOnTrackPlan } from "@/lib/pacing/scenario/backOnTrackPlan"
import {
  buildCodexTaskDraft,
  buildDraftChangeNote,
  type DraftChangeNotePayload,
} from "@/lib/pacing/scenario/draftChangeNote"
import { leversFromInputs } from "@/lib/pacing/scenario/emptyLevers"
import { kpiGoalPerDay } from "@/lib/pacing/scenario/kpiGoalPerDay"
import { narrate } from "@/lib/pacing/scenario/narrate"
import {
  compareSavedToLive,
  type SavedScenario,
} from "@/lib/pacing/scenario/savedScenarios"
import type { ScenarioLevers, ScenarioLine, ScenarioResult } from "@/lib/pacing/scenario/types"
import { cn } from "@/lib/utils"

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return formatMoney(value, { decimals: 0 })
}

function paceLabel(pace: string): string {
  if (pace === "on-track") return "On plan"
  if (pace === "no-data") return "No data"
  return pace.replace("-", " ")
}

function rateCaption(line: ScenarioLine): string {
  if (!line.rate) return "—"
  const kind = line.rate.kind.toUpperCase()
  return `${money(line.rate.value)} ${kind}`
}

function feasibilityTone(value: string): "success" | "warning" | "destructive" | "secondary" {
  if (value === "yes") return "success"
  if (value === "stretch") return "warning"
  if (value === "unlikely") return "destructive"
  return "secondary"
}

export type ScenarioPlannerSaveInput = {
  name: string
  levers: ScenarioLevers
  result: ScenarioResult
}

export type ScenarioPlannerPanelProps = {
  mba: string
  campaignName: string
  versionNumber: number
  asOf: string
  lines: ScenarioLine[]
  campaigns?: { mba: string; name: string }[]
  saved?: SavedScenario[]
  onRequestCampaign?: (mba: string) => void
  onSave?: (input: ScenarioPlannerSaveInput) => Promise<SavedScenario | void>
  onDraftNote?: (payload: DraftChangeNotePayload) => void
  onCreateTask?: (draft: ReturnType<typeof buildCodexTaskDraft>) => Promise<void>
}

export function ScenarioPlannerPanel({
  mba,
  campaignName,
  versionNumber,
  asOf,
  lines,
  campaigns,
  saved = [],
  onRequestCampaign,
  onSave,
  onDraftNote,
  onCreateTask,
}: ScenarioPlannerPanelProps) {
  const first = lines[0]
  const second = lines[1] ?? lines[0]
  const firstBurst = first?.bursts[0]
  const [fromId, setFromId] = useState(first?.lineItemId ?? "")
  const [toId, setToId] = useState(second?.lineItemId ?? "")
  const [moveAmount, setMoveAmount] = useState(0)
  const [capLineId, setCapLineId] = useState(first?.lineItemId ?? "")
  const [dailyCap, setDailyCap] = useState(0)
  const [extendDays, setExtendDays] = useState(0)
  const [pauses, setPauses] = useState<string[]>([])
  const [burstLineId, setBurstLineId] = useState(firstBurst ? first?.lineItemId ?? "" : "")
  const [burstIndex, setBurstIndex] = useState(firstBurst?.index ?? 0)
  const [burstStart, setBurstStart] = useState(firstBurst?.start ?? "")
  const [burstEnd, setBurstEnd] = useState(firstBurst?.end ?? "")
  const [goalLineId, setGoalLineId] = useState(first?.lineItemId ?? "")
  const [goalValue, setGoalValue] = useState(
    first?.deliverable?.planned != null ? String(Math.round(first.deliverable.planned)) : "",
  )
  const [trackLineId, setTrackLineId] = useState(second?.lineItemId ?? first?.lineItemId ?? "")
  const [withinDays, setWithinDays] = useState(14)
  const [scenarioName, setScenarioName] = useState("")
  const [localSaved, setLocalSaved] = useState<SavedScenario[]>(saved)
  const [compareId, setCompareId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const levers = useMemo(
    () =>
      leversFromInputs({
        fromId,
        toId,
        moveAmount,
        capLineId,
        dailyCap,
        extendDays,
        pauses,
        burstLineId,
        burstIndex,
        burstStart,
        burstEnd,
      }),
    [
      fromId,
      toId,
      moveAmount,
      capLineId,
      dailyCap,
      extendDays,
      pauses,
      burstLineId,
      burstIndex,
      burstStart,
      burstEnd,
    ],
  )

  const result = useMemo(() => applyScenario(lines, levers, asOf), [lines, levers, asOf])
  const live = useMemo(
    () =>
      applyScenario(
        lines,
        { moves: [], caps: [], pauses: [], extendDays: 0, burstDateChanges: [] },
        asOf,
      ),
    [lines, asOf],
  )
  const story = useMemo(() => narrate(result), [result])
  const goalLine = lines.find((line) => line.lineItemId === goalLineId) ?? first
  const goalNumber = Number(goalValue)
  const goal = useMemo(
    () => (goalLine ? kpiGoalPerDay(goalLine, Number.isFinite(goalNumber) ? goalNumber : undefined) : null),
    [goalLine, goalNumber],
  )
  const trackLine = lines.find((line) => line.lineItemId === trackLineId) ?? first
  const track = useMemo(
    () => (trackLine ? backOnTrackPlan(trackLine, withinDays) : null),
    [trackLine, withinDays],
  )
  const compared = localSaved.find((row) => row.id === compareId)
  const compare = compared ? compareSavedToLive(compared.result, live) : null
  const burst = result.lines.find((line) => line.burst)?.burst

  function togglePause(id: string) {
    setPauses((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  return (
    <section aria-label="Scenario planner" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Scenario planner</p>
          <h2 className="text-lg font-semibold text-foreground">{campaignName}</h2>
          <p className="text-xs text-muted-foreground">
            {mba} · v{versionNumber} · as of {asOf}
          </p>
        </div>
        {campaigns && campaigns.length > 0 ? (
          <label className="text-sm text-muted-foreground">
            Campaign
            <select
              className="ml-2 rounded-input border border-border bg-background px-2 py-1 text-foreground"
              value={mba}
              onChange={(event) => onRequestCampaign?.(event.currentTarget.value)}
            >
              {campaigns.map((item) => (
                <option key={item.mba} value={item.mba}>
                  {item.name} ({item.mba})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Scenario inputs</h3>
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-panel text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Line</th>
                  <th className="px-3 py-2 text-right">Budget</th>
                  <th className="px-3 py-2 text-right">Spent</th>
                  <th className="px-3 py-2 text-right">Remaining</th>
                  <th className="px-3 py-2 text-right">Days left</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.lineItemId} className="border-t border-border">
                    <td className="px-3 py-2">
                      {line.platform} · {line.lineItemId}
                    </td>
                    <td className="num px-3 py-2 text-right">{money(line.budget)}</td>
                    <td className="num px-3 py-2 text-right">{money(line.spent)}</td>
                    <td className="num px-3 py-2 text-right">{money(line.budget - line.spent)}</td>
                    <td className="num px-3 py-2 text-right">{line.daysLeft}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="num">{rateCaption(line)}</span>
                      {line.rate ? (
                        <span className="block text-[11px] text-muted-foreground">{line.rate.basis}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 text-sm">
            <label>
              Move budget from
              <select
                className="mx-2 rounded-input border border-border bg-background px-2 py-1"
                value={fromId}
                onChange={(event) => setFromId(event.currentTarget.value)}
              >
                {lines.map((line) => (
                  <option key={line.lineItemId} value={line.lineItemId}>
                    {line.platform}
                  </option>
                ))}
              </select>
              to
              <select
                className="mx-2 rounded-input border border-border bg-background px-2 py-1"
                value={toId}
                onChange={(event) => setToId(event.currentTarget.value)}
              >
                {lines.map((line) => (
                  <option key={line.lineItemId} value={line.lineItemId}>
                    {line.platform}
                  </option>
                ))}
              </select>
              <Input
                name="move-amount"
                type="number"
                min={0}
                step={500}
                defaultValue={0}
                className="ml-2 inline-flex w-28"
                onChange={(event) => setMoveAmount(Number(event.currentTarget.value))}
                onInput={(event) => setMoveAmount(Number(event.currentTarget.value))}
              />
              <input
                type="range"
                min={0}
                max={30000}
                step={500}
                value={moveAmount}
                onChange={(event) => setMoveAmount(Number(event.currentTarget.value))}
                className="mt-1 w-full"
                aria-label="Move amount"
              />
            </label>
            <label>
              Daily cap on
              <select
                className="mx-2 rounded-input border border-border bg-background px-2 py-1"
                value={capLineId}
                onChange={(event) => setCapLineId(event.currentTarget.value)}
              >
                {lines.map((line) => (
                  <option key={line.lineItemId} value={line.lineItemId}>
                    {line.platform}
                  </option>
                ))}
              </select>
              <Input
                name="daily-cap"
                type="number"
                min={0}
                step={2}
                defaultValue={0}
                className="ml-2 inline-flex w-24"
                onChange={(event) => setDailyCap(Number(event.currentTarget.value))}
                onInput={(event) => setDailyCap(Number(event.currentTarget.value))}
              />
              <input
                type="range"
                min={0}
                max={500}
                step={2}
                value={dailyCap}
                onChange={(event) => setDailyCap(Number(event.currentTarget.value))}
                className="mt-1 w-full"
                aria-label="Daily cap"
              />
            </label>
            <label>
              Extend end by <b>{extendDays} days</b>
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                value={extendDays}
                onChange={(event) => setExtendDays(Number(event.currentTarget.value))}
                className="mt-1 w-full"
              />
            </label>
            <div className="space-y-1">
              <p className="text-muted-foreground">Pause line</p>
              {lines.map((line) => (
                <label key={line.lineItemId} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pauses.includes(line.lineItemId)}
                    onChange={() => togglePause(line.lineItemId)}
                  />
                  Pause {line.platform} ({line.lineItemId})
                </label>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label>
                Burst line
                <select
                  className="mt-1 w-full rounded-input border border-border bg-background px-2 py-1"
                  value={burstLineId}
                  onChange={(event) => setBurstLineId(event.currentTarget.value)}
                >
                  <option value="">None</option>
                  {lines.map((line) => (
                    <option key={line.lineItemId} value={line.lineItemId}>
                      {line.platform}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Burst index
                <Input
                  type="number"
                  value={burstIndex}
                  onChange={(event) => setBurstIndex(Number(event.currentTarget.value))}
                />
              </label>
              <label>
                Burst start
                <Input type="date" value={burstStart} onChange={(event) => setBurstStart(event.currentTarget.value)} />
              </label>
              <label>
                Burst end
                <Input type="date" value={burstEnd} onChange={(event) => setBurstEnd(event.currentTarget.value)} />
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground">What changes</h3>
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-panel text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Line</th>
                  <th className="px-3 py-2 text-right">Remaining</th>
                  <th className="px-3 py-2 text-right">Per-day needed</th>
                  <th className="px-3 py-2 text-right">Projected finish</th>
                  <th className="px-3 py-2">Pace at finish</th>
                  <th className="px-3 py-2 text-right">Projected deliverable</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((line) => (
                  <tr key={line.lineItemId} className="border-t border-border">
                    <td className="px-3 py-2">{line.lineItemId}</td>
                    <td className="num px-3 py-2 text-right">{money(line.remaining)}</td>
                    <td className="num px-3 py-2 text-right">{money(line.perDayNeeded)}</td>
                    <td className="num px-3 py-2 text-right">{money(line.projectedFinish)}</td>
                    <td className="px-3 py-2">
                      <Badge size="sm">{paceLabel(line.paceAtFinish)}</Badge>
                    </td>
                    <td className="num px-3 py-2 text-right">
                      {line.projectedDeliverable == null ? "—" : formatCount(line.projectedDeliverable)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Campaign finish" value={money(result.campaign.projectedFinish)} size="sm" />
            <MetricCard label="vs budget" value={money(result.campaign.delta)} size="sm" />
            <MetricCard
              label="Current burst"
              value={burst ? `${money(burst.spend)} ${Math.round(burst.pct)}%` : "—"}
              size="sm"
            />
          </div>
          <div className="rounded-card border border-border bg-surface-panel px-3 py-3 text-sm text-foreground">
            {story}
          </div>
          {result.warnings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-status-behind-fg">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => onDraftNote?.(buildDraftChangeNote({ mba, campaignName, lines, levers, result }))}>
              Draft change note
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void onCreateTask?.(
                  buildCodexTaskDraft({ mba, campaignName, lines, levers, result }),
                )
              }
            >
              Create Codex task
            </Button>
            <Input
              name="scenario-name"
              placeholder="Scenario name"
              defaultValue=""
              className="w-40"
              onChange={(event) => setScenarioName(event.currentTarget.value)}
              onInput={(event) => setScenarioName(event.currentTarget.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={async () => {
                const typed =
                  scenarioName.trim() ||
                  (
                    document.querySelector(
                      'input[name="scenario-name"]',
                    ) as HTMLInputElement | null
                  )?.value.trim() ||
                  ""
                if (!onSave || !typed) return
                setSaving(true)
                try {
                  const savedRow = await onSave({ name: typed, levers, result })
                  if (savedRow) setLocalSaved((current) => [savedRow, ...current])
                } finally {
                  setSaving(false)
                }
              }}
            >
              Save scenario
            </Button>
          </div>
          {localSaved.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs uppercase text-muted-foreground">Saved scenarios</p>
              <ul className="space-y-1 text-sm">
                {localSaved.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={cn(
                        "interactive-tint rounded-input px-2 py-1",
                        compareId === row.id && "bg-surface-panel font-semibold",
                      )}
                      onClick={() => setCompareId(row.id)}
                    >
                      {row.name}
                    </button>
                  </li>
                ))}
              </ul>
              {compare ? (
                <p className="text-sm text-muted-foreground">
                  Compare to plan: saved finish {money(compare.savedFinish)} vs live {money(compare.liveFinish)} (
                  {money(compare.delta)}).
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Select a saved scenario to compare to plan.</p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">Calculator A · what every day needs to deliver</h3>
          <label className="mt-3 block text-sm">
            Line
            <select
              className="mt-1 w-full rounded-input border border-border bg-background px-2 py-1"
              value={goalLineId}
              onChange={(event) => {
                const next = event.currentTarget.value
                setGoalLineId(next)
                const line = lines.find((item) => item.lineItemId === next)
                if (line?.deliverable?.planned != null) {
                  setGoalValue(String(Math.round(line.deliverable.planned)))
                }
              }}
            >
              {lines.map((line) => (
                <option key={line.lineItemId} value={line.lineItemId}>
                  {line.platform} · {line.deliverable?.unit ?? "units"}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 block text-sm">
            Goal
            <Input value={goalValue} onChange={(event) => setGoalValue(event.currentTarget.value)} />
          </label>
          {goal ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <MetricCard label="Needed per day" value={formatCount(goal.perDay)} size="sm" />
              <MetricCard label="Current run rate" value={formatCount(goal.runRate)} size="sm" />
              <MetricCard label="Implied daily spend" value={money(goal.impliedDailySpend)} size="sm" />
            </div>
          ) : null}
          {goal ? <p className="mt-3 text-sm text-foreground">{goal.text}</p> : null}
        </div>
        <div className="rounded-card border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">Calculator B · back on track within X days</h3>
          <label className="mt-3 block text-sm">
            Line
            <select
              className="mt-1 w-full rounded-input border border-border bg-background px-2 py-1"
              value={trackLineId}
              onChange={(event) => setTrackLineId(event.currentTarget.value)}
            >
              {lines.map((line) => (
                <option key={line.lineItemId} value={line.lineItemId}>
                  {line.platform}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 block text-sm">
            Back on track within <b>{withinDays}</b> days
            <input
              type="range"
              min={3}
              max={60}
              value={withinDays}
              onChange={(event) => setWithinDays(Number(event.currentTarget.value))}
              className="mt-1 w-full"
            />
          </label>
          {track ? (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <MetricCard label="Gap to expected" value={money(track.gap)} size="sm" />
                <MetricCard label={`Daily spend for ${withinDays} days`} value={money(track.dailyForPeriod)} size="sm" />
                <MetricCard label="Then plan rate" value={money(track.thenPlanDaily)} size="sm" />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Feasible?</span>
                <Badge variant={feasibilityTone(track.feasibility)} size="sm">
                  {track.feasibility === "yes" ? "Yes" : track.feasibility === "stretch" ? "Stretch" : "Unlikely"}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-foreground">{track.text}</p>
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}

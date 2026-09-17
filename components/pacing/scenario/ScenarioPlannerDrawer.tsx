"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import type { CampaignDetailPayload } from "@/lib/pacing/detail/types"
import { scenarioLinesFromDetail } from "@/lib/pacing/scenario/fromLineCard"
import type { SavedScenario } from "@/lib/pacing/scenario/savedScenarios"
import type { ScenarioLine } from "@/lib/pacing/scenario/types"
import { ScenarioPlannerPanel } from "./ScenarioPlannerPanel"

function melbourneDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date())
}

function linesFromPayload(payload: CampaignDetailPayload, asOf: string): ScenarioLine[] {
  if (payload.scenarioLines?.length) return payload.scenarioLines
  return scenarioLinesFromDetail({
    lines: payload.lines,
    asOf,
    expectedToDate: payload.row.expectedToDate,
  })
}

export function ScenarioPlannerDrawer({
  mba,
  asOf,
  onDraftNote,
}: {
  mba?: string
  asOf?: string
  onDraftNote?: (message: string) => void
}) {
  const [mbaInput, setMbaInput] = useState(mba ?? "")
  const [activeMba, setActiveMba] = useState(mba ?? "")
  const resolvedAsOf = asOf ?? melbourneDate()
  const [payload, setPayload] = useState<CampaignDetailPayload | null>(null)
  const [saved, setSaved] = useState<SavedScenario[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mba) {
      setMbaInput(mba)
      setActiveMba(mba)
    }
  }, [mba])

  useEffect(() => {
    if (!activeMba) {
      setPayload(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams({ asOfDate: resolvedAsOf })
    Promise.all([
      fetch(`/api/pacing/campaign/${encodeURIComponent(activeMba)}?${qs}`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/pacing/scenarios?mba=${encodeURIComponent(activeMba)}`, {
        credentials: "include",
        cache: "no-store",
      }),
    ])
      .then(async ([campaignRes, savedRes]) => {
        if (!campaignRes.ok) throw new Error(`HTTP ${campaignRes.status}`)
        const campaign = (await campaignRes.json()) as CampaignDetailPayload
        const savedJson = savedRes.ok
          ? ((await savedRes.json()) as { scenarios?: SavedScenario[] })
          : { scenarios: [] }
        if (!cancelled) {
          setPayload(campaign)
          setSaved(savedJson.scenarios ?? [])
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message || err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeMba, resolvedAsOf])

  if (!activeMba) {
    return (
      <div className="border-b border-border bg-surface-panel px-4 py-3">
        <p className="text-sm text-muted-foreground">Open a campaign to plan a scenario, or enter an MBA.</p>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setActiveMba(mbaInput.trim())
          }}
        >
          <Input
            value={mbaInput}
            onChange={(event) => setMbaInput(event.currentTarget.value)}
            placeholder="MBA number"
          />
        </form>
      </div>
    )
  }

  if (loading && !payload) {
    return (
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (error && !payload) {
    return <p className="border-b border-border px-4 py-3 text-sm text-status-critical-fg">{error}</p>
  }

  if (!payload) return null

  return (
    <div className="max-h-[50vh] overflow-y-auto border-b border-border px-4 py-3">
      <ScenarioPlannerPanel
        mba={activeMba}
        campaignName={payload.row.campaignName}
        versionNumber={payload.row.versionNumber}
        asOf={resolvedAsOf}
        lines={linesFromPayload(payload, resolvedAsOf)}
        saved={saved}
        onRequestCampaign={setActiveMba}
        onDraftNote={(draft) => onDraftNote?.(draft.message)}
        onCreateTask={async (draft) => {
          if (!payload.clientId) return
          const teamRes = await fetch("/api/codex/team", { credentials: "include" })
          const team = teamRes.ok ? ((await teamRes.json()) as { meEmail?: string }) : {}
          await fetch("/api/codex/tasks", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: draft.title,
              description: draft.description,
              mba_number: draft.mba_number,
              assignee_email: team.meEmail ?? draft.assignee_email,
              client_id: payload.clientId,
              category: draft.category,
            }),
          })
        }}
        onSave={async (input) => {
          const res = await fetch("/api/pacing/scenarios", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mbaNumber: activeMba,
              versionNumber: payload.row.versionNumber,
              name: input.name,
              levers: input.levers,
              result: input.result,
            }),
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const json = (await res.json()) as { scenario: SavedScenario }
          setSaved((current) => [json.scenario, ...current])
          return json.scenario
        }}
      />
    </div>
  )
}

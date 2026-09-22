"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { openAvaChat, setAssistantContext } from "@/lib/assistantBridge"
import type { CampaignDetailPayload } from "@/lib/pacing/detail/types"
import { scenarioLinesFromDetail } from "@/lib/pacing/scenario/fromLineCard"
import type { SavedScenario } from "@/lib/pacing/scenario/savedScenarios"
import type { ScenarioLine } from "@/lib/pacing/scenario/types"
import { usePacingFilterStore } from "@/lib/pacing/usePacingFilterStore"
import { ScenarioPlannerPanel } from "./ScenarioPlannerPanel"

export type ScenarioPlannerOpenOptions = {
  lineItemId?: string
  date_from?: string
  date_to?: string
}

type ScenarioPlannerContextValue = {
  open: (mba: string, opts?: ScenarioPlannerOpenOptions) => void
  close: () => void
  mba: string | null
}

const ScenarioPlannerContext = createContext<ScenarioPlannerContextValue | null>(null)

export function useScenarioPlanner(): ScenarioPlannerContextValue | null {
  return useContext(ScenarioPlannerContext)
}

export function ScenarioPlannerTrigger({
  mba,
  className,
  children,
}: {
  mba: string
  className?: string
  children: ReactNode
}) {
  const planner = useScenarioPlanner()
  return (
    <button
      type="button"
      className={className}
      onClick={() => planner?.open(mba)}
    >
      {children}
    </button>
  )
}

function linesFromPayload(payload: CampaignDetailPayload, asOf: string): ScenarioLine[] {
  if (payload.scenarioLines?.length) return payload.scenarioLines
  return scenarioLinesFromDetail({
    lines: payload.lines,
    asOf,
    expectedToDate: payload.row.expectedToDate,
  })
}

export function ScenarioPlannerProvider({ children }: { children: ReactNode }) {
  const asOf = usePacingFilterStore((s) => s.filters.as_of_date)
  const [mba, setMba] = useState<string | null>(null)
  const [payload, setPayload] = useState<CampaignDetailPayload | null>(null)
  const [saved, setSaved] = useState<SavedScenario[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<ScenarioPlannerOpenOptions | null>(null)

  const close = useCallback(() => {
    setMba(null)
    setPayload(null)
    setSaved([])
    setError(null)
    setPreset(null)
  }, [])

  const open = useCallback((nextMba: string, opts?: ScenarioPlannerOpenOptions) => {
    const mbaNumber = nextMba.trim()
    if (!mbaNumber) return
    setPreset(opts ?? null)
    setMba(mbaNumber)
  }, [])

  const load = useCallback(
    async (mbaNumber: string) => {
      setLoading(true)
      setError(null)
      const qs = new URLSearchParams({ asOfDate: asOf })
      try {
        const [campaignRes, savedRes] = await Promise.all([
          fetch(`/api/pacing/campaign/${encodeURIComponent(mbaNumber)}?${qs}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/pacing/scenarios?mba=${encodeURIComponent(mbaNumber)}`, {
            credentials: "include",
            cache: "no-store",
          }),
        ])
        if (!campaignRes.ok) throw new Error(`HTTP ${campaignRes.status}`)
        const campaign = (await campaignRes.json()) as CampaignDetailPayload
        setPayload(campaign)
        if (savedRes.ok) {
          const json = (await savedRes.json()) as { scenarios?: SavedScenario[] }
          setSaved(json.scenarios ?? [])
        } else {
          setSaved([])
        }
      } catch (err) {
        setError(String((err as Error)?.message || err))
      } finally {
        setLoading(false)
      }
    },
    [asOf],
  )

  useEffect(() => {
    if (!mba) return
    void load(mba)
  }, [mba, load])

  useEffect(() => {
    if (!mba) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mba, close])

  const value = useMemo(() => ({ open, close, mba }), [open, close, mba])

  return (
    <ScenarioPlannerContext.Provider value={value}>
      {children}
      {mba ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scenario planner"
          className="fixed inset-0 z-nested flex items-start justify-center overflow-y-auto bg-background/80 p-4 pt-10"
        >
          <div className="relative w-full max-w-6xl rounded-frame border border-border bg-card p-5 shadow-e2">
            <div className="absolute right-3 top-3">
              <Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {loading && !payload ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : error && !payload ? (
              <p className="text-sm text-status-critical-fg">{error}</p>
            ) : payload ? (
              <ScenarioPlannerPanel
                key={`${mba}:${preset?.lineItemId ?? ""}:${preset?.date_from ?? ""}:${preset?.date_to ?? ""}`}
                mba={mba}
                campaignName={payload.row.campaignName}
                versionNumber={payload.row.versionNumber}
                asOf={asOf}
                lines={linesFromPayload(payload, asOf)}
                initialLineItemId={preset?.lineItemId}
                initialBurstStart={preset?.date_from}
                initialBurstEnd={preset?.date_to}
                saved={saved}
                onRequestCampaign={(next) => setMba(next)}
                onDraftNote={(draft) => {
                  setAssistantContext({
                    pageContext: {
                      entities: { mbaNumber: mba, campaignName: payload.row.campaignName },
                    },
                  })
                  openAvaChat({ message: draft.message })
                }}
                onCreateTask={async (draft) => {
                  if (!payload.clientId) {
                    throw new Error("client_id missing for this campaign")
                  }
                  const teamRes = await fetch("/api/codex/team", { credentials: "include" })
                  const team = teamRes.ok
                    ? ((await teamRes.json()) as { meEmail?: string })
                    : {}
                  const res = await fetch("/api/codex/tasks", {
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
                  if (!res.ok) throw new Error(`HTTP ${res.status}`)
                }}
                onSave={async (input) => {
                  const res = await fetch("/api/pacing/scenarios", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      mbaNumber: mba,
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
            ) : null}
          </div>
        </div>
      ) : null}
    </ScenarioPlannerContext.Provider>
  )
}

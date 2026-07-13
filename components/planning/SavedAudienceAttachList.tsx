"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import type { PlanningAudienceRow } from "@/lib/planning/audienceTypes"
import { formatAudienceWc } from "./robustness"

const PRIORITY_STATUSES = new Set(["live", "booked", "approved"])
const DETACH_VALUE = "__detach__"

type MediaPlanRow = {
  mba_number?: string
  mp_client_name?: string
  mp_campaignname?: string
  campaign_name?: string
  campaign_status?: string
  campaign_start_date?: string
}

function normalizeName(value: string | undefined | null): string {
  return String(value ?? "").trim().toLowerCase()
}

function sortCampaigns(a: MediaPlanRow, b: MediaPlanRow): number {
  const aPriority = PRIORITY_STATUSES.has(String(a.campaign_status ?? "").toLowerCase())
    ? 0
    : 1
  const bPriority = PRIORITY_STATUSES.has(String(b.campaign_status ?? "").toLowerCase())
    ? 0
    : 1
  if (aPriority !== bPriority) return aPriority - bPriority
  const aMs = a.campaign_start_date ? new Date(a.campaign_start_date).getTime() : 0
  const bMs = b.campaign_start_date ? new Date(b.campaign_start_date).getTime() : 0
  return (Number.isNaN(bMs) ? 0 : bMs) - (Number.isNaN(aMs) ? 0 : aMs)
}

type SavedAudienceAttachListProps = {
  clientId: number | null
  clientName: string
  savedAudiences: PlanningAudienceRow[]
  savedLoading: boolean
  onLoadSaved: (row: PlanningAudienceRow) => void
  onAudiencePatched: () => void
}

export function SavedAudienceAttachList({
  clientId,
  clientName,
  savedAudiences,
  savedLoading,
  onLoadSaved,
  onAudiencePatched,
}: SavedAudienceAttachListProps) {
  const { toast } = useToast()
  const [plans, setPlans] = useState<MediaPlanRow[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => {
    if (!clientId) {
      setPlans([])
      return
    }
    let cancelled = false
    setPlansLoading(true)
    void (async () => {
      try {
        const res = await fetch("/api/mediaplans")
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        const data = (await res.json()) as MediaPlanRow[]
        if (!cancelled) setPlans(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setPlans([])
      } finally {
        if (!cancelled) setPlansLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [clientId])

  const clientPlans = useMemo(() => {
    const needle = normalizeName(clientName)
    if (!needle) return []
    return plans
      .filter((p) => normalizeName(p.mp_client_name) === needle && p.mba_number)
      .toSorted(sortCampaigns)
  }, [plans, clientName])

  async function patchAudience(
    id: number,
    body: { mba_number?: string | null; client_visible?: boolean }
  ) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/planning/audiences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(err?.error ?? `Update failed (${res.status})`)
      }
      onAudiencePatched()
      return true
    } catch (err) {
      toast({
        title: "Could not update audience",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
      return false
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-e1">
      <h3 className="text-sm font-medium">Saved audiences</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Load a saved definition, attach it to a campaign, or show it on the client dashboard.
      </p>
      {!clientId ? (
        <p className="mt-3 text-xs text-muted-foreground">Select a client in Stage A.</p>
      ) : savedLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading saved audiences…</p>
      ) : savedAudiences.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No saved audiences for this client yet.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {savedAudiences.map((row) => {
            const attached = Boolean(row.mba_number && String(row.mba_number).trim())
            const busy = busyId === row.id
            return (
              <li
                key={row.id}
                className="space-y-2 rounded-input border border-border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    {row.name}{" "}
                    <span className="num text-xs text-muted-foreground">
                      ({formatAudienceWc(Number(row.composed_wc))} &apos;000s)
                    </span>
                    {attached ? (
                      <Badge variant="outline" size="sm" className="ml-2 font-normal">
                        {row.mba_number}
                      </Badge>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onLoadSaved(row)}
                  >
                    Load
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Attach to campaign</Label>
                  <Select
                    disabled={busy || plansLoading}
                    value={attached ? String(row.mba_number) : undefined}
                    onValueChange={(value) => {
                      if (value === DETACH_VALUE) {
                        void patchAudience(row.id, { mba_number: null })
                        return
                      }
                      void patchAudience(row.id, { mba_number: value })
                    }}
                  >
                    <SelectTrigger className="h-9 w-full max-w-md">
                      <SelectValue
                        placeholder={
                          plansLoading
                            ? "Loading campaigns…"
                            : clientPlans.length === 0
                              ? "No campaigns for this client"
                              : "Select campaign…"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {attached ? (
                        <SelectItem value={DETACH_VALUE}>Detach from campaign</SelectItem>
                      ) : null}
                      {clientPlans.map((p) => {
                        const mba = String(p.mba_number)
                        const label = String(
                          p.mp_campaignname || p.campaign_name || "Untitled"
                        ).trim()
                        const status = String(p.campaign_status ?? "").trim()
                        return (
                          <SelectItem key={mba} value={mba}>
                            {label} · {mba}
                            {status ? ` (${status})` : ""}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label
                      htmlFor={`visible-${row.id}`}
                      className="text-xs font-medium"
                    >
                      Visible to client
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      Shows on the client&apos;s campaign dashboard
                    </p>
                  </div>
                  <Switch
                    id={`visible-${row.id}`}
                    checked={Boolean(row.client_visible)}
                    disabled={!attached || busy}
                    onCheckedChange={(checked) => {
                      void patchAudience(row.id, { client_visible: checked })
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

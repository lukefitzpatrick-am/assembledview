"use client"

import { useEffect, useState } from "react"
import { OutcomeCharts } from "@/components/planning/OutcomeCharts"
import { AUDIENCE_ACCENTS } from "@/components/planning/constants"
import { formatAudienceWc } from "@/components/planning/robustness"
import { Badge } from "@/components/ui/badge"
import { useAuthContext } from "@/contexts/AuthContext"
import type { ClientSafePlannedAudience } from "@/lib/planning/audienceTypes"
import { cn } from "@/lib/utils"

type PlannedAudienceSectionProps = {
  mbaNumber: string
}

export function PlannedAudienceSection({ mbaNumber }: PlannedAudienceSectionProps) {
  const { isClient } = useAuthContext()
  const [audiences, setAudiences] = useState<ClientSafePlannedAudience[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setAudiences(null)
    setError(null)
    void (async () => {
      try {
        const res = await fetch(
          `/api/planning/audiences/by-mba?mba_number=${encodeURIComponent(mbaNumber)}`
        )
        if (res.status === 403 || res.status === 401) {
          if (!cancelled) setAudiences([])
          return
        }
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        const body = (await res.json()) as { audiences?: ClientSafePlannedAudience[] }
        if (!cancelled) setAudiences(Array.isArray(body.audiences) ? body.audiences : [])
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load")
          setAudiences([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mbaNumber])

  if (audiences == null) return null
  if (audiences.length === 0) return null
  if (error) return null

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-medium">Planned audience</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Audience definitions attached to this campaign from the Demand-Flow planner.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-1">
        {audiences.map((a, i) => {
          const accent = AUDIENCE_ACCENTS[i % AUDIENCE_ACCENTS.length]!
          const hidden = !isClient && !a.client_visible
          return (
            <div
              key={a.id}
              className="overflow-hidden rounded-card border border-border bg-card shadow-e1"
            >
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-primary-foreground",
                  accent.bg
                )}
              >
                <span>{a.name}</span>
                {hidden ? (
                  <Badge variant="outline" size="sm" className="border-primary-foreground/40 bg-transparent font-normal text-primary-foreground">
                    (hidden from client)
                  </Badge>
                ) : null}
              </div>
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Size{" "}
                    <span className="num text-foreground">
                      {formatAudienceWc(a.composed_wc)}
                    </span>
                    &apos;000s
                  </span>
                  <span>{a.wave_label}</span>
                </div>
                <p className="text-sm text-foreground">{a.definition_line}</p>
                <OutcomeCharts
                  clientSafe
                  reachIndexPreset={a.reach_index}
                  audienceLabel={a.name}
                  accentColor={accent.cssVar}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

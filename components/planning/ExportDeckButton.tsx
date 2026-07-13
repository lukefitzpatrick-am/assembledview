"use client"

import { useState } from "react"
import { createRoot } from "react-dom/client"
import { Loader2 } from "lucide-react"

import { captureNodePng } from "@/components/charts/system"
import { OutcomeCharts, topDfiiLabel } from "@/components/planning/OutcomeCharts"
import { RecommendedSplitBlock } from "@/components/planning/RecommendedSplitBlock"
import { formatAudienceWc, robustnessFromN } from "@/components/planning/robustness"
import type { AudienceCompareBundle } from "@/components/planning/StageCompare"
import type {
  BriefState,
  DiagnosisState,
  AudienceDraft,
} from "@/components/planning/store"
import {
  effectiveSegmentId,
  isBaseSegmentLens,
} from "@/components/planning/store"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import type { PlanningSegment } from "@/lib/planning/types"

type ExportDeckButtonProps = {
  brief: BriefState
  diagnosis: DiagnosisState
  waveLabel: string
  reachBasis: string
  bundles: AudienceCompareBundle[]
  excludedChannelIds: string[]
  channelNamesById: Record<string, string>
  insightByAudienceId: Record<string, string | null>
  segments: PlanningSegment[]
  showDollars: boolean
}

function waitFrames(n = 2) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve()
      else requestAnimationFrame(() => step(left - 1))
    }
    step(n)
  })
}

function definitionLine(draft: AudienceDraft, segments: PlanningSegment[]) {
  const lens = isBaseSegmentLens(draft.segmentId)
    ? "All People"
    : segments.find((s) => s.segment_id === draft.segmentId)?.name ?? draft.segmentId
  const states = draft.states.join("+")
  const ages = draft.ageBands.join(", ")
  return `${states} · ${draft.gender} · ${ages} · ${draft.reachBasis} · ${lens}`
}

function statsLine(bundle: AudienceCompareBundle) {
  const a = bundle.adapted
  if (!a) return "No live composition"
  const rob = robustnessFromN(a.unweightedN)
  const pct =
    a.universeWc > 0 ? ((a.audienceWc / a.universeWc) * 100).toFixed(1) : "—"
  return `Size ${formatAudienceWc(a.audienceWc)} '000s · ${pct}% of 14+ · n ${a.unweightedN} · ${rob.label}`
}

function topMixLine(bundle: AudienceCompareBundle) {
  return bundle.allocated
    .slice(0, 5)
    .map((a) => `${a.ch.name} ${Math.round(a.pct)}%`)
    .join(" · ")
}

function topAffinityFallback(bundle: AudienceCompareBundle) {
  const seg = effectiveSegmentId(bundle.draft.segmentId)
  return [...(bundle.adapted?.channels ?? [])]
    .map((ch) => ({
      name: ch.name,
      aff: ch.aff[seg] ?? 100,
      reach: Math.round(ch.reachPct * 100),
    }))
    .sort((a, b) => b.aff - a.aff)
    .slice(0, 5)
    .map((c) => `${c.name} ${Math.round(c.aff)} (reach ${c.reach}%)`)
    .join(" · ")
}

async function mountAndCapture(
  node: React.ReactNode,
  selectors: string[]
): Promise<Record<string, string | null>> {
  const host = document.createElement("div")
  host.setAttribute("aria-hidden", "true")
  host.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1200px;pointer-events:none;opacity:1;z-index:-1;background:#fff;"
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(node)
  await waitFrames(2)
  await new Promise((r) => setTimeout(r, 400))

  const out: Record<string, string | null> = {}
  for (const sel of selectors) {
    const el = host.querySelector(sel) as HTMLElement | null
    try {
      out[sel] = await captureNodePng(el)
    } catch {
      out[sel] = null
    }
  }

  root.unmount()
  host.remove()
  return out
}

export function ExportDeckButton({
  brief,
  diagnosis,
  waveLabel,
  reachBasis,
  bundles,
  excludedChannelIds,
  channelNamesById,
  insightByAudienceId,
  segments,
  showDollars,
}: ExportDeckButtonProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const ready = bundles.every((b) => b.adapted && b.scored.length > 0)

  async function handleExport() {
    if (!ready || busy) return
    setBusy(true)
    try {
      const audiencesPayload: Array<{
        name: string
        definition: string
        stats: string
        insight: string | null
        topMix: string
        topDfii: string
        charts: {
          reachIndexPng: string | null
          quadrantPng: string | null
          dfiiPng: string | null
        }
      }> = []

      for (let i = 0; i < bundles.length; i++) {
        const b = bundles[i]!
        const captured = await mountAndCapture(
          <OutcomeCharts bundles={[b]} />,
          [
            '[data-export="reach-index"]',
            '[data-export="reach-index-quadrant"]',
            '[data-export="dfii-ranked"]',
          ]
        )
        audiencesPayload.push({
          name: b.draft.name,
          definition: definitionLine(b.draft, segments),
          stats: statsLine(b),
          insight: insightByAudienceId[b.draft.id] ?? null,
          topMix: topMixLine(b) || topAffinityFallback(b),
          topDfii: topDfiiLabel(b.scored) ?? "—",
          charts: {
            reachIndexPng: captured['[data-export="reach-index"]'] ?? null,
            quadrantPng:
              i === 0 ? captured['[data-export="reach-index-quadrant"]'] ?? null : null,
            dfiiPng: i === 0 ? captured['[data-export="dfii-ranked"]'] ?? null : null,
          },
        })
      }

      const splitCap = await mountAndCapture(
        <RecommendedSplitBlock bundles={bundles} showDollars={showDollars} />,
        ['[data-export="recommended-split"]']
      )

      const includedCount = Object.keys(channelNamesById).filter(
        (id) => !excludedChannelIds.includes(id)
      ).length
      const excludedNames = excludedChannelIds
        .map((id) => channelNamesById[id] || id)
        .filter(Boolean)

      const res = await fetch("/api/planning/export-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: {
            clientName: brief.clientName || undefined,
            campaignName: brief.brandOverride || brief.clientName || undefined,
            category: brief.category || undefined,
            market: "Australia",
            objectiveKind: brief.objectiveKind || undefined,
            budget: brief.budget || undefined,
            startDate: brief.startDate,
            endDate: brief.endDate,
          },
          diagnosis: {
            penetrationPct: diagnosis.penetration,
            targetPct: diagnosis.target,
            salience: diagnosis.salience,
            createCapture: diagnosis.createCapture,
          },
          constraintsSummary: { includedCount, excludedNames },
          waveLabel,
          reachBasis,
          audiences: audiencesPayload,
          splitTablePng: splitCap['[data-export="recommended-split"]'],
          generatedAtLabel: new Date().toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
        }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          message?: string
          error?: string
        } | null
        throw new Error(data?.message || data?.error || `Export failed (${res.status})`)
      }

      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition") || ""
      const match = /filename="([^"]+)"/.exec(cd)
      const filename = match?.[1] || "demand-flow-plan.pptx"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      toast({ title: "Deck exported", description: filename })
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={!ready || busy}
      onClick={() => void handleExport()}
    >
      {busy ? (
        <>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          Exporting…
        </>
      ) : (
        "Export deck (.pptx)"
      )}
    </Button>
  )
}
